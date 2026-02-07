import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, facebookAds, campaignsFcb } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum, count, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    const campaignsParam = url.searchParams.get("campaigns");
    const campaignList = campaignsParam ? campaignsParam.split(",").filter(Boolean) : [];

    const truncUnit = groupBy === "week" ? "week" : groupBy === "month" ? "month" : "day";
    const unit = sql.raw(`'${truncUnit}'`);

    // Orders where utm_source = 'facebook': group by truncated created_at
    const dateTruncOrders = sql`date_trunc(${unit}, ${orders.createdAt})::date`;
    const orderRows = await db
      .select({
        date: sql<string>`${dateTruncOrders}`.as("date"),
        adRevenue: sum(orders.total).as("ad_revenue"),
        fbOrders: count().as("fb_orders"),
      })
      .from(orders)
      .where(
        and(
          eq(orders.utmSource, "facebook"),
          gte(orders.createdAt, new Date(from)),
          lte(orders.createdAt, new Date(to + "T23:59:59.999Z")),
          ...(campaignList.length > 0
            ? [inArray(orders.utmCampaign, campaignList)]
            : [])
        )
      )
      .groupBy(dateTruncOrders)
      .orderBy(dateTruncOrders);

    // Facebook Ads: group by truncated date
    const dateTruncFb = sql`date_trunc(${unit}, ${facebookAds.date}::timestamp)::date`;
    const fbRows = await db
      .select({
        date: sql<string>`${dateTruncFb}`.as("date"),
        adSpend: sum(facebookAds.spend).as("ad_spend"),
      })
      .from(facebookAds)
      .where(
        and(
          gte(facebookAds.date, from),
          lte(facebookAds.date, to),
          ...(campaignList.length > 0
            ? [inArray(facebookAds.utmCampaign, campaignList)]
            : [])
        )
      )
      .groupBy(dateTruncFb)
      .orderBy(dateTruncFb);

    // Available campaigns for the date range + friendly names
    const [availableCampaigns, campaignNameRows] = await Promise.all([
      db
        .select({
          utmCampaign: facebookAds.utmCampaign,
          adset: sql<string>`MIN(${facebookAds.adset})`.as("adset"),
        })
        .from(facebookAds)
        .where(and(gte(facebookAds.date, from), lte(facebookAds.date, to)))
        .groupBy(facebookAds.utmCampaign),
      db
        .select({
          utmCampaign: campaignsFcb.utmCampaign,
          adGroup: campaignsFcb.adGroup,
        })
        .from(campaignsFcb),
    ]);

    const campaignNameMap = new Map(
      campaignNameRows.map((r) => [r.utmCampaign || "", r.adGroup || ""])
    );
    const campaigns = availableCampaigns.map((c) => {
      const utm = c.utmCampaign || "";
      return {
        utmCampaign: utm,
        label: campaignNameMap.get(utm) || c.adset || utm,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    // Merge by date
    const fbByDate = new Map(fbRows.map((r) => [r.date, Number(r.adSpend) || 0]));
    const orderByDate = new Map(
      orderRows.map((r) => [
        r.date,
        { adRevenue: Number(r.adRevenue) || 0, fbOrders: Number(r.fbOrders) || 0 },
      ])
    );

    const allDates = new Set([...orderByDate.keys(), ...fbByDate.keys()]);
    const data = Array.from(allDates).map((date) => {
      const adRevenue = orderByDate.get(date)?.adRevenue ?? 0;
      const fbOrders = orderByDate.get(date)?.fbOrders ?? 0;
      const adSpend = fbByDate.get(date) ?? 0;
      const roas = adSpend > 0 ? Math.round((adRevenue / adSpend) * 100) / 100 : 0;

      return {
        date,
        adRevenue: Math.round(adRevenue * 100) / 100,
        adSpend: Math.round(adSpend * 100) / 100,
        fbOrders,
        roas,
      };
    });

    data.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ data, campaigns });
  } catch (error) {
    console.error("Reports facebook-ads GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
