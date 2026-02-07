import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, facebookAds, campaignsFcb } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum, count } from "drizzle-orm";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params are required" },
        { status: 400 }
      );
    }

    const [campaignRows, fbRows, orderRows] = await Promise.all([
      // Campaign name lookup from campaigns_fcb
      db
        .select({
          utmCampaign: campaignsFcb.utmCampaign,
          adGroup: campaignsFcb.adGroup,
        })
        .from(campaignsFcb),

      // Facebook ads spend grouped by utm_campaign
      db
        .select({
          utmCampaign: facebookAds.utmCampaign,
          adset: sql<string>`MIN(${facebookAds.adset})`.as("adset"),
          adSpend: sum(facebookAds.spend).as("ad_spend"),
        })
        .from(facebookAds)
        .where(and(gte(facebookAds.date, from), lte(facebookAds.date, to)))
        .groupBy(facebookAds.utmCampaign),

      // Orders grouped by utm_campaign
      db
        .select({
          utmCampaign: orders.utmCampaign,
          orderCount: count().as("order_count"),
          revenue: sum(orders.total).as("revenue"),
        })
        .from(orders)
        .where(
          and(
            eq(orders.utmSource, "facebook"),
            gte(orders.createdAt, new Date(from)),
            lte(orders.createdAt, new Date(to + "T23:59:59.999Z"))
          )
        )
        .groupBy(orders.utmCampaign),
    ]);

    // Build lookup maps
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

    // Process facebook ads rows
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

    // Add remaining orders without facebook ads data
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

    // Sort by ad spend descending
    rows.sort((a, b) => b.adSpend - a.adSpend);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Reports facebook-campaigns GET error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch report data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
