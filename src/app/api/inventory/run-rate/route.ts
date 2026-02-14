import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, amazonSalesTraffic, products } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to query params required" }, { status: 400 });
    }

    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T23:59:59Z");

    // ── Shopify: aggregate from orders table ──
    const shopifyRows = await db
      .select({
        skus: orders.skus,
        quantity: orders.quantity,
      })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, orgId),
          gte(orders.createdAt, fromDate),
          lte(orders.createdAt, toDate)
        )
      );

    const shopifyUnits: Record<string, number> = {};
    for (const row of shopifyRows) {
      if (!row.skus) continue;
      const skuList = row.skus.split(",").map((s) => s.trim()).filter(Boolean);
      const qty = row.quantity ?? 0;
      if (skuList.length === 1) {
        shopifyUnits[skuList[0]] = (shopifyUnits[skuList[0]] ?? 0) + qty;
      } else if (skuList.length > 1) {
        const perSku = Math.round(qty / skuList.length);
        for (const sku of skuList) {
          shopifyUnits[sku] = (shopifyUnits[sku] ?? 0) + perSku;
        }
      }
    }

    // ── Amazon: aggregate from amazon_sales_traffic, map ASIN → SKU via products ──
    const amazonRows = await db
      .select({
        childAsin: amazonSalesTraffic.childAsin,
        totalUnits: sql<number>`sum(${amazonSalesTraffic.unitsOrdered})`.as("total_units"),
      })
      .from(amazonSalesTraffic)
      .where(
        and(
          eq(amazonSalesTraffic.orgId, orgId),
          gte(amazonSalesTraffic.date, from),
          lte(amazonSalesTraffic.date, to)
        )
      )
      .groupBy(amazonSalesTraffic.childAsin);

    // Build ASIN → SKU map from products table
    const productRows = await db
      .select({ sku: products.sku, asin: products.asin })
      .from(products)
      .where(eq(products.orgId, orgId));

    const asinToSku: Record<string, string> = {};
    for (const p of productRows) {
      if (p.asin) asinToSku[p.asin] = p.sku;
    }

    const amazonUnits: Record<string, number> = {};
    for (const row of amazonRows) {
      const sku = asinToSku[row.childAsin];
      if (sku) {
        amazonUnits[sku] = (amazonUnits[sku] ?? 0) + Number(row.totalUnits);
      }
    }

    return NextResponse.json({ shopifyUnits, amazonUnits });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Run rate GET error:", error);
    return NextResponse.json({ error: "Failed to fetch run rate data" }, { status: 500 });
  }
}
