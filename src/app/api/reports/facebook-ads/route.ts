import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, facebookAds, campaignsFcb } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum, count, inArray } from "drizzle-orm";
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

    const campaignsParam = url.searchParams.get("campaigns");
    const campaignList = campaignsParam ? campaignsParam.split(",").filter(Boolean) : [];

    const truncUnit = groupBy === "week" ? "week" : groupBy === "month" ? "month" : "day";
    const unit = sql.raw(`'${truncUnit}'`);

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
          eq(orders.orgId, orgId),
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

    const dateTruncFb = sql`date_trunc(${unit}, ${facebookAds.date}::timestamp)::date`;
    const fbRows = await db
      .select({
        date: sql<string>`${dateTruncFb}`.as("date"),
        adSpend: sum(facebookAds.spend).as("ad_spend"),
      })
      .from(facebookAds)
      .where(
        and(
          eq(facebookAds.orgId, orgId),
          gte(facebookAds.date, from),
          lte(facebookAds.date, to),
          ...(campaignList.length > 0
            ? [inArray(facebookAds.utmCampaign, campaignList)]
            : [])
        )
      )
      .groupBy(dateTruncFb)
      .orderBy(dateTruncFb);

    const [availableCampaigns, campaignNameRows] = await Promise.all([
      db
        .select({
          utmCampaign: facebookAds.utmCampaign,
          adset: sql<string>`MIN(${facebookAds.adset})`.as("adset"),
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
          utmCampaign: campaignsFcb.utmCampaign,
          adGroup: campaignsFcb.adGroup,
        })
        .from(campaignsFcb)
        .where(eq(campaignsFcb.orgId, orgId)),
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
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reports facebook-ads GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
