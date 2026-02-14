import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSalesTraffic, amazonOrders, orders, products } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, ne, notInArray, sum } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

const SKU_PATTERNS: [string, string][] = [
  ["14641003", "48 Rolls"],
  ["14641002", "24 Rolls"],
  ["14641001", "8 Rolls"],
];

const GROUP_TO_FILTER: Record<string, string> = {
  "8 Rolls": "8-rolls",
  "24 Rolls": "24-rolls",
  "48 Rolls": "48-rolls",
};

function skuToGroup(sku: string): string | null {
  for (const [pattern, group] of SKU_PATTERNS) {
    if (sku.includes(pattern)) return group;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const groupBy = url.searchParams.get("groupBy") || "day";
    const channel = url.searchParams.get("channel") || "total";
    const skuFilter = url.searchParams.get("skuFilter") || "all";

    if (!from || !to) {
      return NextResponse.json({ error: "from and to query params are required" }, { status: 400 });
    }

    // Build ASIN → SKU map
    const productRows = await db
      .select({ sku: products.sku, asin: products.asin })
      .from(products)
      .where(eq(products.orgId, orgId));

    const asinToSku: Record<string, string> = {};
    for (const p of productRows) {
      if (p.asin) asinToSku[p.asin] = p.sku;
    }

    const truncUnit = groupBy === "week" ? "week" : groupBy === "month" ? "month" : "day";
    const unit = sql.raw(`'${truncUnit}'`);

    // Collect per-date, per-group unit counts
    // Map<date, Map<group, units>>
    const dateGroupMap = new Map<string, Map<string, number>>();

    function addUnits(date: string, sku: string, units: number) {
      const group = skuToGroup(sku);
      if (!group) return; // skip unmapped SKUs
      if (!dateGroupMap.has(date)) dateGroupMap.set(date, new Map());
      const groupMap = dateGroupMap.get(date)!;
      groupMap.set(group, (groupMap.get(group) ?? 0) + units);
    }

    // ── Amazon: Sales Traffic (primary) ──
    if (channel === "total" || channel === "amazon") {
      const dateTrunc = sql`date_trunc(${unit}, ${amazonSalesTraffic.date}::timestamp)::date`;

      const amazonRows = await db
        .select({
          date: sql<string>`${dateTrunc}`.as("date"),
          childAsin: amazonSalesTraffic.childAsin,
          units: sum(amazonSalesTraffic.unitsOrdered).as("units"),
        })
        .from(amazonSalesTraffic)
        .where(
          and(
            eq(amazonSalesTraffic.orgId, orgId),
            gte(amazonSalesTraffic.date, from),
            lte(amazonSalesTraffic.date, to)
          )
        )
        .groupBy(dateTrunc, amazonSalesTraffic.childAsin)
        .orderBy(dateTrunc);

      // Track which dates are covered by sales-traffic reports
      const reportDates = new Set<string>();
      for (const row of amazonRows) {
        reportDates.add(row.date);
        const sku = asinToSku[row.childAsin];
        if (sku) {
          addUnits(row.date, sku, Number(row.units) || 0);
        }
      }

      // Supplement with amazonOrders for dates not in sales-traffic
      const orderDateTrunc = sql`date_trunc(${unit}, ${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`;

      const orderConditions = [
        eq(amazonOrders.orgId, orgId),
        gte(sql`(${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`, sql`${from}::date`),
        lte(sql`(${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`, sql`${to}::date`),
        ne(amazonOrders.orderStatus, "Canceled"),
      ];

      if (reportDates.size > 0) {
        orderConditions.push(
          notInArray(
            sql`date_trunc(${unit}, ${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`,
            Array.from(reportDates).map((d) => sql`${d}::date`)
          )
        );
      }

      const orderRows = await db
        .select({
          date: sql<string>`${orderDateTrunc}`.as("date"),
          asin: amazonOrders.asin,
          units: sum(amazonOrders.quantityOrdered).as("units"),
        })
        .from(amazonOrders)
        .where(and(...orderConditions))
        .groupBy(orderDateTrunc, amazonOrders.asin)
        .orderBy(orderDateTrunc);

      for (const row of orderRows) {
        const sku = row.asin ? asinToSku[row.asin] : null;
        if (sku) {
          addUnits(row.date, sku, Number(row.units) || 0);
        }
      }
    }

    // ── Shopify: from orders table ──
    if (channel === "total" || channel === "shopify") {
      const orderDateTrunc = sql`date_trunc(${unit}, ${orders.createdAt} AT TIME ZONE 'Europe/London')::date`;

      const fromDate = new Date(from + "T00:00:00Z");
      const toDate = new Date(to + "T23:59:59Z");

      const shopifyRows = await db
        .select({
          date: sql<string>`${orderDateTrunc}`.as("date"),
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

      for (const row of shopifyRows) {
        if (!row.skus || !row.date) continue;
        const skuList = row.skus.split(",").map((s) => s.trim()).filter(Boolean);
        const qty = row.quantity ?? 0;
        if (skuList.length === 1) {
          addUnits(row.date, skuList[0], qty);
        } else if (skuList.length > 1) {
          const perSku = Math.round(qty / skuList.length);
          for (const sku of skuList) {
            addUnits(row.date, sku, perSku);
          }
        }
      }
    }

    // Collect all groups and apply filter
    const allGroups = new Set<string>();
    for (const groupMap of dateGroupMap.values()) {
      for (const group of groupMap.keys()) allGroups.add(group);
    }

    const filteredGroups = skuFilter === "all"
      ? Array.from(allGroups).sort()
      : Array.from(allGroups).filter((g) => GROUP_TO_FILTER[g] === skuFilter).sort();

    // Build response
    const dates = Array.from(dateGroupMap.keys()).sort();
    const data: Record<string, number | string>[] = [];

    for (const date of dates) {
      const point: Record<string, number | string> = { date };
      const groupMap = dateGroupMap.get(date)!;
      for (const group of filteredGroups) {
        point[group] = groupMap.get(group) ?? 0;
      }
      data.push(point);
    }

    return NextResponse.json({ data, skus: filteredGroups });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Unit sales GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch unit sales data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
