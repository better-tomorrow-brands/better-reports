import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { facebookAds } from "@/lib/db/schema";
import { sql, gte, lte, and, or, eq, sum } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

/**
 * GET /api/reports/facebook-adsets?from=&to=&campaignId=
 * Returns all ad sets under a given campaign, aggregated over the date range.
 * Filters by campaignId (preferred) or falls back to utmCampaign.
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const campaignId = url.searchParams.get("campaignId");
    const utmCampaign = url.searchParams.get("utmCampaign");

    if (!from || !to || (!campaignId && !utmCampaign)) {
      return NextResponse.json(
        { error: "from, to, and campaignId (or utmCampaign) query params are required" },
        { status: 400 }
      );
    }

    // OR both filters when both are provided so either match works
    const campaignFilter =
      campaignId && campaignId !== "" && utmCampaign && utmCampaign !== ""
        ? or(eq(facebookAds.campaignId, campaignId), eq(facebookAds.utmCampaign, utmCampaign))!
        : campaignId && campaignId !== ""
        ? eq(facebookAds.campaignId, campaignId)
        : eq(facebookAds.utmCampaign, utmCampaign!);

    const rows = await db
      .select({
        adsetId: sql<string>`MIN(${facebookAds.adsetId})`.as("adset_id"),
        adset: facebookAds.adset,
        spend: sum(facebookAds.spend).as("spend"),
        impressions: sum(facebookAds.impressions).as("impressions"),
        reach: sum(facebookAds.reach).as("reach"),
        clicks: sum(facebookAds.clicks).as("clicks"),
        linkClicks: sum(facebookAds.linkClicks).as("link_clicks"),
        shopClicks: sum(facebookAds.shopClicks).as("shop_clicks"),
        landingPageViews: sum(facebookAds.landingPageViews).as("landing_page_views"),
        purchases: sum(facebookAds.purchases).as("purchases"),
        purchaseValue: sum(facebookAds.purchaseValue).as("purchase_value"),
        frequencyNum: sql<string>`SUM(${facebookAds.frequency} * ${facebookAds.impressions})`.as("frequency_num"),
      })
      .from(facebookAds)
      .where(
        and(
          eq(facebookAds.orgId, orgId),
          campaignFilter,
          gte(facebookAds.date, from),
          lte(facebookAds.date, to)
        )
      )
      .groupBy(facebookAds.adset)
      .orderBy(sql`SUM(${facebookAds.spend}) DESC`);

    const result = rows.map((r) => {
      const spend = Number(r.spend) || 0;
      const purchaseValue = Number(r.purchaseValue) || 0;
      const purchases = Number(r.purchases) || 0;
      const clicks = Number(r.clicks) || 0;
      const linkClicks = Number(r.linkClicks) || 0;
      const shopClicks = Number(r.shopClicks) || 0;
      const landingPageViews = Number(r.landingPageViews) || 0;
      const impressions = Number(r.impressions) || 0;
      const reach = Number(r.reach) || 0;
      const frequency = impressions > 0
        ? Math.round((Number(r.frequencyNum) / impressions) * 100) / 100
        : 0;
      return {
        adsetId: r.adsetId || "",
        adset: r.adset,
        spend: Math.round(spend * 100) / 100,
        impressions,
        reach,
        frequency,
        clicks,
        linkClicks,
        shopClicks,
        landingPageViews,
        purchases,
        purchaseValue: Math.round(purchaseValue * 100) / 100,
        roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
        cpm: impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0,
        costPerResult: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
        costPerLandingPageView: landingPageViews > 0 ? Math.round((spend / landingPageViews) * 100) / 100 : 0,
      };
    });

    return NextResponse.json({ campaignId, utmCampaign, from, to, rows: result });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("facebook-adsets GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ad set data" },
      { status: 500 }
    );
  }
}
