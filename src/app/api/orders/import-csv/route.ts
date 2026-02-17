import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { getAttributionFromCampaigns } from "@/lib/shopify-orders";

export const runtime = "nodejs";
export const maxDuration = 300;

// Shopify orders CSV export has one row per line item.
// We group rows by the "Id" column to reconstruct each order.

function parseAmount(val: string | undefined): string | null {
  if (!val || val.trim() === "") return null;
  // Strip currency symbols, commas, spaces
  const cleaned = val.replace(/[^0-9.\-]/g, "");
  return cleaned || null;
}

function parseDate(val: string | undefined): Date | null {
  if (!val || val.trim() === "") return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();

    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch (parseErr) {
      return NextResponse.json(
        { error: "Failed to parse CSV", details: parseErr instanceof Error ? parseErr.message : String(parseErr) },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Group rows by order Id (one row per line item in Shopify CSV export)
    const orderMap = new Map<string, Record<string, string>[]>();
    for (const row of records) {
      const id = row["Id"] || row["id"] || row["ID"];
      if (!id || !id.trim()) continue;
      const key = id.trim();
      if (!orderMap.has(key)) orderMap.set(key, []);
      orderMap.get(key)!.push(row);
    }

    if (orderMap.size === 0) {
      return NextResponse.json(
        { error: "No valid order rows found. Make sure the CSV has an 'Id' column." },
        { status: 400 }
      );
    }

    // Sort by created_at ascending so repeat-customer detection works correctly
    const sortedOrders = Array.from(orderMap.entries()).sort(([, a], [, b]) => {
      const dateA = parseDate(a[0]["Created at"])?.getTime() ?? 0;
      const dateB = parseDate(b[0]["Created at"])?.getTime() ?? 0;
      return dateA - dateB;
    });

    let imported = 0;
    let failed = 0;

    for (const [shopifyId, rows] of sortedOrders) {
      try {
        const first = rows[0];

        const email = first["Email"]?.trim() || null;
        const customerName =
          first["Billing Name"]?.trim() || first["Shipping Name"]?.trim() || null;
        const phone =
          first["Phone"]?.trim() ||
          first["Billing Phone"]?.trim() ||
          first["Shipping Phone"]?.trim() ||
          null;
        const createdAt = parseDate(first["Created at"]);
        const orderNumber = first["Name"]?.replace("#", "").trim() || null;
        const fulfillmentStatus =
          (first["Fulfillment Status"]?.trim() || "unfulfilled").toLowerCase();
        const fulfilledAt = parseDate(first["Fulfilled at"]);
        const subtotal = parseAmount(first["Subtotal"]);
        const shipping = parseAmount(first["Shipping"]);
        const tax = parseAmount(first["Taxes"]);
        const total = parseAmount(first["Total"]);
        const discountCodes = first["Discount Code"]?.trim() || null;
        const tags = first["Tags"]?.trim() || null;
        const currency = first["Currency"]?.trim() || "GBP";

        // Aggregate line items across rows for this order
        const skuParts: string[] = [];
        let quantity = 0;
        for (const row of rows) {
          const sku = (row["Lineitem sku"] || row["Lineitem name"] || "").trim();
          const qty = parseInt(row["Lineitem quantity"] || "0", 10);
          if (sku) skuParts.push(sku);
          if (!isNaN(qty)) quantity += qty;
        }
        const skus = skuParts.length > 0 ? [...new Set(skuParts)].join(", ") : null;

        // Attribution via discount code lookup
        let utmSource: string | null = null;
        let utmMedium: string | null = null;
        let utmCampaign: string | null = null;
        let utmContent: string | null = null;
        let utmTerm: string | null = null;

        if (discountCodes) {
          const firstCode = discountCodes.split(/[,;]/)[0].trim();
          if (firstCode) {
            const attribution = await getAttributionFromCampaigns(firstCode, orgId);
            if (attribution) {
              utmSource = attribution.source || null;
              utmMedium = attribution.medium || null;
              utmCampaign = attribution.campaign || null;
              utmContent = attribution.content || null;
              utmTerm = attribution.term || null;
            }
          }
        }

        const hasConversionData = !!(utmSource || utmMedium || utmCampaign);

        // Check repeat customer (earlier order with same email already in DB)
        let isRepeatCustomer = false;
        if (email && createdAt) {
          const prev = await db
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(
                eq(orders.orgId, orgId),
                eq(orders.email, email),
                lt(orders.createdAt, createdAt)
              )
            )
            .limit(1);
          isRepeatCustomer = prev.length > 0;
        }

        const insertData = {
          orgId,
          shopifyId,
          orderNumber,
          email,
          customerName,
          phone,
          createdAt,
          fulfillmentStatus,
          fulfilledAt,
          subtotal,
          shipping,
          tax,
          total,
          discountCodes,
          skus,
          quantity,
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          utmTerm,
          trackingNumber: null,
          tags,
          currency,
          hasConversionData,
          isRepeatCustomer,
        };

        // On conflict: update everything except UTM (preserve any manual/API attribution)
        const { utmSource: _us, utmMedium: _um, utmCampaign: _uc, ...updateData } = insertData;

        await db
          .insert(orders)
          .values(insertData)
          .onConflictDoUpdate({
            target: [orders.orgId, orders.shopifyId],
            set: updateData,
          });

        imported++;
      } catch (err) {
        console.error(`CSV import: failed to upsert order ${shopifyId}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      failed,
      total: orderMap.size,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("CSV import error:", error);
    return NextResponse.json(
      {
        error: "Import failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
