import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, facebookAds } from "@/lib/db/schema";
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

    const fbByDate = new Map(fbRows.map((r) => [r.date, Number(r.fbSpend) || 0]));

    const data = orderRows.map((row) => {
      const revenue = Number(row.revenue) || 0;
      const orderCount = Number(row.orders) || 0;
      const fbSpend = fbByDate.get(row.date) || 0;
      const shopifyFees = revenue * 0.02;
      const fulfilmentFees = orderCount * 4.93;
      const netCashIn = revenue - shopifyFees - fulfilmentFees - fbSpend;

      return {
        date: row.date,
        revenue: Math.round(revenue * 100) / 100,
        orders: orderCount,
        fbSpend: Math.round(fbSpend * 100) / 100,
        netCashIn: Math.round(netCashIn * 100) / 100,
      };
    });

    for (const [date, spend] of fbByDate) {
      if (!data.find((d) => d.date === date)) {
        data.push({
          date,
          revenue: 0,
          orders: 0,
          fbSpend: Math.round(spend * 100) / 100,
          netCashIn: Math.round(-spend * 100) / 100,
        });
      }
    }

    data.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reports shopify GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
