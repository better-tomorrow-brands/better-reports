import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, facebookAds, campaignsFcb, posthogAnalytics, amazonSalesTraffic } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum, count } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params are required" },
        { status: 400 }
      );
    }

    const [campaignRows, fbRows, orderRows, allOrdersRow, sessionsRow, amazonRow] = await Promise.all([
      db
        .select({
          utmCampaign: campaignsFcb.utmCampaign,
          adGroup: campaignsFcb.adGroup,
        })
        .from(campaignsFcb)
        .where(eq(campaignsFcb.orgId, orgId)),

      db
        .select({
          utmCampaign: facebookAds.utmCampaign,
          adset: sql<string>`MIN(${facebookAds.adset})`.as("adset"),
          adSpend: sum(facebookAds.spend).as("ad_spend"),
        })
        .from(facebookAds)
        .where(
          and(
            eq(facebookAds.orgId, orgId),
            gte(facebookAds.date, from),
            lte(facebookAds.date, to)
          )
        )
        .groupBy(facebookAds.utmCampaign),

      db
        .select({
          utmCampaign: orders.utmCampaign,
          orderCount: count().as("order_count"),
          revenue: sum(orders.total).as("revenue"),
        })
        .from(orders)
        .where(
          and(
            eq(orders.orgId, orgId),
            eq(orders.utmSource, "facebook"),
            gte(orders.createdAt, new Date(from)),
            lte(orders.createdAt, new Date(to + "T23:59:59.999Z"))
          )
        )
        .groupBy(orders.utmCampaign),

      db
        .select({
          orderCount: count().as("order_count"),
          revenue: sum(orders.total).as("revenue"),
        })
        .from(orders)
        .where(
          and(
            eq(orders.orgId, orgId),
            gte(orders.createdAt, new Date(from)),
            lte(orders.createdAt, new Date(to + "T23:59:59.999Z"))
          )
        ),

      db
        .select({
          sessions: sum(posthogAnalytics.totalSessions).as("sessions"),
        })
        .from(posthogAnalytics)
        .where(
          and(
            eq(posthogAnalytics.orgId, orgId),
            gte(posthogAnalytics.date, from),
            lte(posthogAnalytics.date, to)
          )
        ),

      db
        .select({
          revenue: sum(amazonSalesTraffic.orderedProductSales).as("revenue"),
          orders: sum(amazonSalesTraffic.unitsOrdered).as("orders"),
        })
        .from(amazonSalesTraffic)
        .where(
          and(
            eq(amazonSalesTraffic.orgId, orgId),
            gte(amazonSalesTraffic.date, from),
            lte(amazonSalesTraffic.date, to)
          )
        ),
    ]);

    const campaignNameMap = new Map(
      campaignRows.map((r) => [r.utmCampaign || "", r.adGroup || ""])
    );
    const orderMap = new Map(
      orderRows.map((r) => [
        r.utmCampaign || "",
        { orders: Number(r.orderCount), revenue: Number(r.revenue) || 0 },
      ])
    );

    const rows = [];

    for (const fb of fbRows) {
      const utm = fb.utmCampaign || "";
      const o = orderMap.get(utm);
      const adSpend = Number(fb.adSpend) || 0;
      const orderCount = o?.orders ?? 0;
      const revenue = o?.revenue ?? 0;

      rows.push({
        campaign: campaignNameMap.get(utm) || fb.adset || "",
        utmCampaign: utm,
        adSpend: Math.round(adSpend * 100) / 100,
        orders: orderCount,
        revenue: Math.round(revenue * 100) / 100,
        roas: adSpend > 0 ? Math.round((revenue / adSpend) * 100) / 100 : 0,
        costPerResult:
          orderCount > 0 ? Math.round((adSpend / orderCount) * 100) / 100 : 0,
      });

      orderMap.delete(utm);
    }

    for (const [utm, o] of orderMap) {
      rows.push({
        campaign: campaignNameMap.get(utm) || "",
        utmCampaign: utm,
        adSpend: 0,
        orders: o.orders,
        revenue: Math.round(o.revenue * 100) / 100,
        roas: 0,
        costPerResult: 0,
      });
    }

    rows.sort((a, b) => b.adSpend - a.adSpend);

    const shopifyRevenue = Math.round((Number(allOrdersRow[0]?.revenue) || 0) * 100) / 100;
    const shopifyOrders = Number(allOrdersRow[0]?.orderCount) || 0;
    const amazonRevenue = Math.round((Number(amazonRow[0]?.revenue) || 0) * 100) / 100;
    const amazonOrders = Number(amazonRow[0]?.orders) || 0;
    const totalSessions = Number(sessionsRow[0]?.sessions) || 0;
    const totalAdSpend = rows.reduce((s, r) => s + r.adSpend, 0);

    return NextResponse.json({
      rows,
      totals: {
        shopifyRevenue,
        shopifyOrders,
        amazonRevenue,
        amazonOrders,
        sessions: totalSessions,
        adSpend: Math.round(totalAdSpend * 100) / 100,
      },
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reports facebook-campaigns GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
