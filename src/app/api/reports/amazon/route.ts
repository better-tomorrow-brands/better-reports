import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSalesTraffic, amazonSpAds, products } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum } from "drizzle-orm";
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

    const dateTrunc = sql`date_trunc(${unit}, ${amazonSalesTraffic.date}::timestamp)::date`;

    // 1. Revenue / traffic + calculated fees (JOIN with products on ASIN)
    const rows = await db
      .select({
        date: sql<string>`${dateTrunc}`.as("date"),
        revenue: sum(amazonSalesTraffic.orderedProductSales).as("revenue"),
        unitsOrdered: sum(amazonSalesTraffic.unitsOrdered).as("units_ordered"),
        sessions: sum(amazonSalesTraffic.sessions).as("sessions"),
        fbaFees: sql<string>`SUM(${amazonSalesTraffic.unitsOrdered} * COALESCE(${products.fbaFee}, 0))`.as("fba_fees"),
        referralFees: sql<string>`SUM(${amazonSalesTraffic.orderedProductSales} * COALESCE(${products.referralPercent}, 0) / 100)`.as("referral_fees"),
      })
      .from(amazonSalesTraffic)
      .leftJoin(
        products,
        and(
          eq(products.orgId, amazonSalesTraffic.orgId),
          eq(products.asin, amazonSalesTraffic.childAsin),
        ),
      )
      .where(
        and(
          eq(amazonSalesTraffic.orgId, orgId),
          gte(amazonSalesTraffic.date, from),
          lte(amazonSalesTraffic.date, to)
        )
      )
      .groupBy(dateTrunc)
      .orderBy(dateTrunc);

    // 2. Ad spend from amazon_sp_ads
    const adsTrunc = sql`date_trunc(${unit}, ${amazonSpAds.date}::timestamp)::date`;
    const adsRows = await db
      .select({
        date: sql<string>`${adsTrunc}`.as("date"),
        adSpend: sum(amazonSpAds.cost).as("ad_spend"),
        adRevenue: sum(amazonSpAds.sales14d).as("ad_revenue"),
      })
      .from(amazonSpAds)
      .where(
        and(
          eq(amazonSpAds.orgId, orgId),
          gte(amazonSpAds.date, from),
          lte(amazonSpAds.date, to)
        )
      )
      .groupBy(adsTrunc)
      .orderBy(adsTrunc);

    const adSpendMap = new Map(adsRows.map((r) => [r.date, {
      adSpend: Math.round((Number(r.adSpend) || 0) * 100) / 100,
      adRevenue: Math.round((Number(r.adRevenue) || 0) * 100) / 100,
    }]));

    const data = rows.map((row) => {
      const ads = adSpendMap.get(row.date) || { adSpend: 0, adRevenue: 0 };
      const revenue = Math.round((Number(row.revenue) || 0) * 100) / 100;
      const fbaFees = Math.round((Number(row.fbaFees) || 0) * 100) / 100;
      const referralFees = Math.round((Number(row.referralFees) || 0) * 100) / 100;
      const estimatedPayout = Math.round((revenue - ads.adSpend - fbaFees - referralFees) * 100) / 100;
      return {
        date: row.date,
        revenue,
        unitsOrdered: Number(row.unitsOrdered) || 0,
        sessions: Number(row.sessions) || 0,
        adSpend: ads.adSpend,
        adRevenue: ads.adRevenue,
        fbaFees,
        referralFees,
        estimatedPayout,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reports amazon GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
