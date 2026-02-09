import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { posthogAnalytics } from "@/lib/db/schema";
import { sql, gte, lte, and, sum } from "drizzle-orm";

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

    const [totals] = await db
      .select({
        totalSessions: sum(posthogAnalytics.totalSessions).as("total_sessions"),
        productViews: sum(posthogAnalytics.productViews).as("product_views"),
        addToCart: sum(posthogAnalytics.addToCart).as("add_to_cart"),
        checkoutStarted: sum(posthogAnalytics.checkoutStarted).as("checkout_started"),
        purchases: sum(posthogAnalytics.purchases).as("purchases"),
      })
      .from(posthogAnalytics)
      .where(
        and(
          gte(posthogAnalytics.date, from),
          lte(posthogAnalytics.date, to)
        )
      );

    // Daily breakdown for trend chart
    const daily = await db
      .select({
        date: posthogAnalytics.date,
        totalSessions: posthogAnalytics.totalSessions,
        productViews: posthogAnalytics.productViews,
        addToCart: posthogAnalytics.addToCart,
        checkoutStarted: posthogAnalytics.checkoutStarted,
        purchases: posthogAnalytics.purchases,
      })
      .from(posthogAnalytics)
      .where(
        and(
          gte(posthogAnalytics.date, from),
          lte(posthogAnalytics.date, to)
        )
      )
      .orderBy(posthogAnalytics.date);

    return NextResponse.json({
      funnel: {
        totalSessions: Number(totals.totalSessions) || 0,
        productViews: Number(totals.productViews) || 0,
        addToCart: Number(totals.addToCart) || 0,
        checkoutStarted: Number(totals.checkoutStarted) || 0,
        purchases: Number(totals.purchases) || 0,
      },
      daily,
    });
  } catch (error) {
    console.error("Reports ecommerce GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
