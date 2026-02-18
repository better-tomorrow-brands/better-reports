import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { facebookAds } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

/**
 * GET /api/reports/facebook-ad-creatives?from=&to=&campaign=&adset=
 * Returns all individual ads (creatives) under a given campaign + adset, aggregated over the date range.
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const campaign = url.searchParams.get("campaign");
    const adset = url.searchParams.get("adset");

    if (!from || !to || !campaign || !adset) {
      return NextResponse.json(
        { error: "from, to, campaign, and adset query params are required" },
        { status: 400 }
      );
    }

    const rows = await db
      .select({
        adId: sql<string>`MIN(${facebookAds.adId})`.as("ad_id"),
        ad: facebookAds.ad,
        spend: sum(facebookAds.spend).as("spend"),
        impressions: sum(facebookAds.impressions).as("impressions"),
        clicks: sum(facebookAds.clicks).as("clicks"),
        purchases: sum(facebookAds.purchases).as("purchases"),
        purchaseValue: sum(facebookAds.purchaseValue).as("purchase_value"),
        reach: sum(facebookAds.reach).as("reach"),
      })
      .from(facebookAds)
      .where(
        and(
          eq(facebookAds.orgId, orgId),
          eq(facebookAds.campaign, campaign),
          eq(facebookAds.adset, adset),
          gte(facebookAds.date, from),
          lte(facebookAds.date, to)
        )
      )
      .groupBy(facebookAds.ad)
      .orderBy(sql`SUM(${facebookAds.spend}) DESC`);

    const result = rows.map((r) => {
      const spend = Number(r.spend) || 0;
      const purchaseValue = Number(r.purchaseValue) || 0;
      const purchases = Number(r.purchases) || 0;
      const clicks = Number(r.clicks) || 0;
      const impressions = Number(r.impressions) || 0;
      const adId = r.adId || "";
      return {
        adId,
        ad: r.ad,
        spend: Math.round(spend * 100) / 100,
        impressions,
        clicks,
        purchases,
        purchaseValue: Math.round(purchaseValue * 100) / 100,
        roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
        cpm: impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0,
        costPerPurchase: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
        reach: Number(r.reach) || 0,
        // Thumbnail URL pattern: Meta's CDN link can be constructed from ad_id
        // Use the Graph API endpoint: GET /{ad-id}?fields=creative{thumbnail_url}
        // We expose adId so the frontend can request thumbnails if needed
      };
    });

    return NextResponse.json({ campaign, adset, from, to, rows: result });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("facebook-ad-creatives GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ad creative data" },
      { status: 500 }
    );
  }
}
