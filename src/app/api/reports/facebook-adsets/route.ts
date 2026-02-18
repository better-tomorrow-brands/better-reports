import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { facebookAds } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

/**
 * GET /api/reports/facebook-adsets?from=&to=&campaign=
 * Returns all ad sets under a given campaign name, aggregated over the date range.
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const campaign = url.searchParams.get("campaign");

    if (!from || !to || !campaign) {
      return NextResponse.json(
        { error: "from, to, and campaign query params are required" },
        { status: 400 }
      );
    }

    const rows = await db
      .select({
        adsetId: sql<string>`MIN(${facebookAds.adsetId})`.as("adset_id"),
        adset: facebookAds.adset,
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
      const impressions = Number(r.impressions) || 0;
      return {
        adsetId: r.adsetId || "",
        adset: r.adset,
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
      };
    });

    return NextResponse.json({ campaign, from, to, rows: result });
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
