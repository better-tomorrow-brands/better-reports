import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventorySnapshots, products, syncLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { getShopifySettings } from "@/lib/settings";
import { fetchShopifyInventory, upsertShopifyInventory } from "@/lib/shopify";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const date = today();

    const rows = await db
      .select({
        sku: inventorySnapshots.sku,
        amazonQty: inventorySnapshots.amazonQty,
        warehouseQty: inventorySnapshots.warehouseQty,
        shopifyQty: inventorySnapshots.shopifyQty,
        productName: products.productName,
        brand: products.brand,
        asin: products.asin,
      })
      .from(inventorySnapshots)
      .leftJoin(
        products,
        and(
          eq(inventorySnapshots.sku, products.sku),
          eq(products.orgId, orgId)
        )
      )
      .where(
        and(
          eq(inventorySnapshots.orgId, orgId),
          eq(inventorySnapshots.date, date)
        )
      )
      .orderBy(inventorySnapshots.sku);

    const result = rows.map((r) => ({
      sku: r.sku,
      productName: r.productName,
      brand: r.brand,
      asin: r.asin,
      amazonQty: r.amazonQty ?? 0,
      warehouseQty: r.warehouseQty ?? 0,
      shopifyQty: r.shopifyQty ?? 0,
      totalQty: (r.amazonQty ?? 0) + (r.warehouseQty ?? 0) + (r.shopifyQty ?? 0),
    }));

    return NextResponse.json({ date, items: result });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Inventory GET error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const body = await request.json();
    const { sku, amazonQty, warehouseQty, shopifyQty } = body as {
      sku: string;
      amazonQty?: number;
      warehouseQty?: number;
      shopifyQty?: number;
    };

    if (!sku) {
      return NextResponse.json({ error: "sku required" }, { status: 400 });
    }

    const date = today();

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (amazonQty !== undefined) set.amazonQty = amazonQty;
    if (warehouseQty !== undefined) set.warehouseQty = warehouseQty;
    if (shopifyQty !== undefined) set.shopifyQty = shopifyQty;

    await db
      .insert(inventorySnapshots)
      .values({
        orgId,
        sku,
        date,
        amazonQty: amazonQty ?? 0,
        warehouseQty: warehouseQty ?? 0,
        shopifyQty: shopifyQty ?? 0,
      })
      .onConflictDoUpdate({
        target: [inventorySnapshots.orgId, inventorySnapshots.sku, inventorySnapshots.date],
        set,
      });

    return NextResponse.json({ success: true, sku, date, amazonQty, warehouseQty, shopifyQty });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Inventory PUT error:", error);
    return NextResponse.json({ error: "Failed to update inventory" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const body = await request.json();
    const { action } = body as { action: string };

    if (action !== "sync-shopify") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const settings = await getShopifySettings(orgId);
    if (!settings) {
      return NextResponse.json({ error: "Shopify settings not configured" }, { status: 400 });
    }

    const timestamp = new Date();
    const items = await fetchShopifyInventory(settings);
    const snapshotDate = today();
    const upserted = await upsertShopifyInventory(items, snapshotDate, orgId);

    await db.insert(syncLogs).values({
      orgId,
      source: "shopify-inventory",
      status: "success",
      syncedAt: timestamp,
      details: JSON.stringify({ items: items.length, upserted, snapshotDate, manual: true }),
    });

    return NextResponse.json({ success: true, items: items.length, upserted, snapshotDate });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Inventory sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync inventory" },
      { status: 500 }
    );
  }
}
