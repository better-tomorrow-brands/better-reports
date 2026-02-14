import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSalesTraffic, amazonSpAds, amazonOrders, products } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, ne, sum, notInArray } from "drizzle-orm";
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

    // Build report-sourced data points
    const reportDates = new Set(rows.map((r) => r.date));

    const data: {
      date: string;
      revenue: number;
      unitsOrdered: number;
      sessions: number;
      adSpend: number;
      adRevenue: number;
      fbaFees: number;
      referralFees: number;
      estimatedPayout: number;
      source: "report" | "orders";
    }[] = [];

    for (const row of rows) {
      const ads = adSpendMap.get(row.date) || { adSpend: 0, adRevenue: 0 };
      const revenue = Math.round((Number(row.revenue) || 0) * 100) / 100;
      const fbaFees = Math.round((Number(row.fbaFees) || 0) * 100) / 100;
      const referralFees = Math.round((Number(row.referralFees) || 0) * 100) / 100;
      const estimatedPayout = Math.round((revenue - ads.adSpend - fbaFees - referralFees) * 100) / 100;
      data.push({
        date: row.date,
        revenue,
        unitsOrdered: Number(row.unitsOrdered) || 0,
        sessions: Number(row.sessions) || 0,
        adSpend: ads.adSpend,
        adRevenue: ads.adRevenue,
        fbaFees,
        referralFees,
        estimatedPayout,
        source: "report",
      });
    }

    // Supplement with orders data for dates NOT covered by reports
    const orderDateTrunc = sql`date_trunc('day', ${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`;

    const orderConditions = [
      eq(amazonOrders.orgId, orgId),
      gte(sql`(${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`, sql`${from}::date`),
      lte(sql`(${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`, sql`${to}::date`),
      ne(amazonOrders.orderStatus, "Canceled"),
    ];

    if (reportDates.size > 0) {
      const reportDatesArr = Array.from(reportDates);
      orderConditions.push(
        notInArray(
          sql`(${amazonOrders.purchaseDate} AT TIME ZONE 'Europe/London')::date`,
          reportDatesArr.map((d) => sql`${d}::date`)
        )
      );
    }

    const orderRows = await db
      .select({
        date: sql<string>`${orderDateTrunc}`.as("date"),
        revenue: sql<string>`SUM(COALESCE(NULLIF(${amazonOrders.itemPrice}, 0), ${products.amazonRrp}, 0) * ${amazonOrders.quantityOrdered})`.as("revenue"),
        unitsOrdered: sum(amazonOrders.quantityOrdered).as("units_ordered"),
        fbaFees: sql<string>`SUM(${amazonOrders.quantityOrdered} * COALESCE(${products.fbaFee}, 0))`.as("fba_fees"),
        referralFees: sql<string>`SUM(COALESCE(NULLIF(${amazonOrders.itemPrice}, 0), ${products.amazonRrp}, 0) * ${amazonOrders.quantityOrdered} * COALESCE(${products.referralPercent}, 0) / 100)`.as("referral_fees"),
      })
      .from(amazonOrders)
      .leftJoin(
        products,
        and(
          eq(products.orgId, amazonOrders.orgId),
          eq(products.asin, amazonOrders.asin),
        ),
      )
      .where(and(...orderConditions))
      .groupBy(orderDateTrunc)
      .orderBy(orderDateTrunc);

    for (const row of orderRows) {
      const ads = adSpendMap.get(row.date) || { adSpend: 0, adRevenue: 0 };
      const revenue = Math.round((Number(row.revenue) || 0) * 100) / 100;
      const fbaFees = Math.round((Number(row.fbaFees) || 0) * 100) / 100;
      const referralFees = Math.round((Number(row.referralFees) || 0) * 100) / 100;
      const estimatedPayout = Math.round((revenue - ads.adSpend - fbaFees - referralFees) * 100) / 100;
      data.push({
        date: row.date,
        revenue,
        unitsOrdered: Number(row.unitsOrdered) || 0,
        sessions: 0,
        adSpend: ads.adSpend,
        adRevenue: ads.adRevenue,
        fbaFees,
        referralFees,
        estimatedPayout,
        source: "orders",
      });
    }

    // Sort by date
    data.sort((a, b) => a.date.localeCompare(b.date));

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
