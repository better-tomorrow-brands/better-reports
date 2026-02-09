import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { posthogAnalytics } from "@/lib/db/schema";
import { sql, gte, lte, and, sum, avg } from "drizzle-orm";

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

    const truncUnit = groupBy === "week" ? "week" : groupBy === "month" ? "month" : "day";
    const unit = sql.raw(`'${truncUnit}'`);

    const dateTrunc = sql`date_trunc(${unit}, ${posthogAnalytics.date}::timestamp)::date`;

    const rows = await db
      .select({
        date: sql<string>`${dateTrunc}`.as("date"),
        totalSessions: sum(posthogAnalytics.totalSessions).as("total_sessions"),
        uniqueVisitors: sum(posthogAnalytics.uniqueVisitors).as("unique_visitors"),
        pageviews: sum(posthogAnalytics.pageviews).as("pageviews"),
        bounceRate: avg(posthogAnalytics.bounceRate).as("bounce_rate"),
        avgSessionDuration: avg(posthogAnalytics.avgSessionDuration).as("avg_session_duration"),
        mobileSessions: sum(posthogAnalytics.mobileSessions).as("mobile_sessions"),
        desktopSessions: sum(posthogAnalytics.desktopSessions).as("desktop_sessions"),
        directSessions: sum(posthogAnalytics.directSessions).as("direct_sessions"),
        organicSessions: sum(posthogAnalytics.organicSessions).as("organic_sessions"),
        paidSessions: sum(posthogAnalytics.paidSessions).as("paid_sessions"),
        socialSessions: sum(posthogAnalytics.socialSessions).as("social_sessions"),
      })
      .from(posthogAnalytics)
      .where(
        and(
          gte(posthogAnalytics.date, from),
          lte(posthogAnalytics.date, to)
        )
      )
      .groupBy(dateTrunc)
      .orderBy(dateTrunc);

    const data = rows.map((row) => ({
      date: row.date,
      totalSessions: Number(row.totalSessions) || 0,
      uniqueVisitors: Number(row.uniqueVisitors) || 0,
      pageviews: Number(row.pageviews) || 0,
      bounceRate: Math.round((Number(row.bounceRate) || 0) * 100) / 100,
      avgSessionDuration: Math.round((Number(row.avgSessionDuration) || 0) * 100) / 100,
      mobileSessions: Number(row.mobileSessions) || 0,
      desktopSessions: Number(row.desktopSessions) || 0,
      directSessions: Number(row.directSessions) || 0,
      organicSessions: Number(row.organicSessions) || 0,
      paidSessions: Number(row.paidSessions) || 0,
      socialSessions: Number(row.socialSessions) || 0,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Reports sessions GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
