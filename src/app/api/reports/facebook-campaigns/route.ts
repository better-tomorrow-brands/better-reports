import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { facebookAds } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

/**
 * GET /api/reports/facebook-campaigns
 *   ?from=&to=&campaignId=&groupBy=day   → daily time-series for a campaign
 *   ?from=&to=&campaignId=               → aggregated totals for a campaign
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const campaignId = url.searchParams.get("campaignId");
    const utmCampaign = url.searchParams.get("utmCampaign");
    const groupBy = url.searchParams.get("groupBy");

    if (!from || !to || (!campaignId && !utmCampaign)) {
      return NextResponse.json(
        { error: "from, to, and campaignId (or utmCampaign) are required" },
        { status: 400 }
      );
    }

    const campaignFilter =
      campaignId && campaignId !== ""
        ? eq(facebookAds.campaignId, campaignId)
        : eq(facebookAds.utmCampaign, utmCampaign!);

    const baseConditions = [
      eq(facebookAds.orgId, orgId),
      campaignFilter,
      gte(facebookAds.date, from),
      lte(facebookAds.date, to),
    ];

    function mapRow(r: Record<string, unknown>) {
      const spend = Number(r.spend) || 0;
      const purchaseValue = Number(r.purchaseValue) || 0;
      const purchases = Number(r.purchases) || 0;
      const clicks = Number(r.clicks) || 0;
      const impressions = Number(r.impressions) || 0;
      const reach = Number(r.reach) || 0;
      const landingPageViews = Number(r.landingPageViews) || 0;
      const frequency =
        impressions > 0 ? Number(r.frequencyNum) / impressions : 0;
      return {
        ...(r.date !== undefined ? { date: r.date as string } : {}),
        spend: Math.round(spend * 100) / 100,
        impressions,
        reach,
        frequency: Math.round(frequency * 100) / 100,
        clicks,
        linkClicks: Number(r.linkClicks) || 0,
        shopClicks: Number(r.shopClicks) || 0,
        landingPageViews,
        purchases,
        purchaseValue: Math.round(purchaseValue * 100) / 100,
        ctr:
          impressions > 0
            ? Math.round((clicks / impressions) * 10000) / 100
            : 0,
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
        cpm:
          impressions > 0
            ? Math.round((spend / impressions) * 1000 * 100) / 100
            : 0,
        costPerResult:
          purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
        costPerLandingPageView:
          landingPageViews > 0
            ? Math.round((spend / landingPageViews) * 100) / 100
            : 0,
        roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
      };
    }

    const selectFields = {
      spend: sum(facebookAds.spend).as("spend"),
      impressions: sum(facebookAds.impressions).as("impressions"),
      reach: sum(facebookAds.reach).as("reach"),
      clicks: sum(facebookAds.clicks).as("clicks"),
      linkClicks: sum(facebookAds.linkClicks).as("link_clicks"),
      shopClicks: sum(facebookAds.shopClicks).as("shop_clicks"),
      landingPageViews: sum(facebookAds.landingPageViews).as("landing_page_views"),
      purchases: sum(facebookAds.purchases).as("purchases"),
      purchaseValue: sum(facebookAds.purchaseValue).as("purchase_value"),
      frequencyNum:
        sql<string>`SUM(${facebookAds.frequency} * ${facebookAds.impressions})`.as(
          "frequency_num"
        ),
    };

    if (groupBy === "day") {
      const rows = await db
        .select({ date: facebookAds.date, ...selectFields })
        .from(facebookAds)
        .where(and(...baseConditions))
        .groupBy(facebookAds.date)
        .orderBy(facebookAds.date);

      return NextResponse.json({
        campaignId,
        utmCampaign,
        from,
        to,
        rows: rows.map((r) => mapRow(r as Record<string, unknown>)),
      });
    }

    // Aggregated totals
    const rows = await db
      .select(selectFields)
      .from(facebookAds)
      .where(and(...baseConditions));

    const totals = rows[0]
      ? mapRow(rows[0] as Record<string, unknown>)
      : null;
    return NextResponse.json({ campaignId, utmCampaign, from, to, totals });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("facebook-campaigns GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign data" },
      { status: 500 }
    );
  }
}
