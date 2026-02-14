import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { posthogAnalytics } from "@/lib/db/schema";
import { sql, gte, lte, and, eq, sum } from "drizzle-orm";
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

    const orgFilter = and(
      eq(posthogAnalytics.orgId, orgId),
      gte(posthogAnalytics.date, from),
      lte(posthogAnalytics.date, to)
    );

    const [[totals], daily] = await Promise.all([
      db
        .select({
          totalSessions: sum(posthogAnalytics.totalSessions).as("total_sessions"),
          productViews: sum(posthogAnalytics.productViews).as("product_views"),
          addToCart: sum(posthogAnalytics.addToCart).as("add_to_cart"),
          checkoutStarted: sum(posthogAnalytics.checkoutStarted).as("checkout_started"),
          purchases: sum(posthogAnalytics.purchases).as("purchases"),
        })
        .from(posthogAnalytics)
        .where(orgFilter),
      db
        .select({
          date: posthogAnalytics.date,
          totalSessions: posthogAnalytics.totalSessions,
          productViews: posthogAnalytics.productViews,
          addToCart: posthogAnalytics.addToCart,
          checkoutStarted: posthogAnalytics.checkoutStarted,
          purchases: posthogAnalytics.purchases,
        })
        .from(posthogAnalytics)
        .where(orgFilter)
        .orderBy(posthogAnalytics.date),
    ]);

    return NextResponse.json({
      funnel: {
        totalSessions: Number(totals?.totalSessions) || 0,
        productViews: Number(totals?.productViews) || 0,
        addToCart: Number(totals?.addToCart) || 0,
        checkoutStarted: Number(totals?.checkoutStarted) || 0,
        purchases: Number(totals?.purchases) || 0,
      },
      daily,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Reports ecommerce GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
