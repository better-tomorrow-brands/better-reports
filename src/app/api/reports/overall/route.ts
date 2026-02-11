import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, facebookAds, amazonSalesTraffic } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum, count } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const groupBy = url.searchParams.get("groupBy") || "day";

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params are required" },
        { status: 400 }
      );
    }

    const truncUnit = groupBy === "week" ? "week" : groupBy === "month" ? "month" : "day";
    const unit = sql.raw(`'${truncUnit}'`);

    // Shopify orders
    const dateTruncOrders = sql`date_trunc(${unit}, ${orders.createdAt})::date`;
    const orderRows = await db
      .select({
        date: sql<string>`${dateTruncOrders}`.as("date"),
        revenue: sum(orders.total).as("revenue"),
        orders: count().as("orders"),
      })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, orgId),
          gte(orders.createdAt, new Date(from)),
          lte(orders.createdAt, new Date(to + "T23:59:59.999Z"))
        )
      )
      .groupBy(dateTruncOrders)
      .orderBy(dateTruncOrders);

    // Amazon sales
    const dateTruncAmazon = sql`date_trunc(${unit}, ${amazonSalesTraffic.date}::timestamp)::date`;
    const amazonRows = await db
      .select({
        date: sql<string>`${dateTruncAmazon}`.as("date"),
        revenue: sum(amazonSalesTraffic.orderedProductSales).as("revenue"),
      })
      .from(amazonSalesTraffic)
      .where(
        and(
          eq(amazonSalesTraffic.orgId, orgId),
          gte(amazonSalesTraffic.date, from),
          lte(amazonSalesTraffic.date, to)
        )
      )
      .groupBy(dateTruncAmazon)
      .orderBy(dateTruncAmazon);

    // Facebook ad spend
    const dateTruncFb = sql`date_trunc(${unit}, ${facebookAds.date}::timestamp)::date`;
    const fbRows = await db
      .select({
        date: sql<string>`${dateTruncFb}`.as("date"),
        fbSpend: sum(facebookAds.spend).as("fb_spend"),
      })
      .from(facebookAds)
      .where(
        and(
          eq(facebookAds.orgId, orgId),
          gte(facebookAds.date, from),
          lte(facebookAds.date, to)
        )
      )
      .groupBy(dateTruncFb)
      .orderBy(dateTruncFb);

    // Merge by date
    const amazonByDate = new Map(amazonRows.map((r) => [r.date, Number(r.revenue) || 0]));
    const fbByDate = new Map(fbRows.map((r) => [r.date, Number(r.fbSpend) || 0]));

    const allDates = new Set<string>();
    orderRows.forEach((r) => allDates.add(r.date));
    amazonRows.forEach((r) => allDates.add(r.date));
    fbRows.forEach((r) => allDates.add(r.date));

    const data = Array.from(allDates)
      .sort()
      .map((date) => {
        const shopifyRow = orderRows.find((r) => r.date === date);
        const shopifyRevenue = Number(shopifyRow?.revenue) || 0;
        const orderCount = Number(shopifyRow?.orders) || 0;
        const amazonRevenue = amazonByDate.get(date) || 0;
        const fbSpend = fbByDate.get(date) || 0;

        const shopifyFees = shopifyRevenue * 0.02;
        const fulfillmentFees = orderCount * 4.93;
        const shopifyNet = shopifyRevenue - shopifyFees - fulfillmentFees - fbSpend;
        const netCashIn = shopifyNet + amazonRevenue;

        return {
          date,
          shopifyRevenue: Math.round(shopifyRevenue * 100) / 100,
          amazonRevenue: Math.round(amazonRevenue * 100) / 100,
          netCashIn: Math.round(netCashIn * 100) / 100,
        };
      });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reports overall GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
