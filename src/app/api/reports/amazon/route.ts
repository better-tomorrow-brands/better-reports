import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSalesTraffic } from "@/lib/db/schema";
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

    const rows = await db
      .select({
        date: sql<string>`${dateTrunc}`.as("date"),
        revenue: sum(amazonSalesTraffic.orderedProductSales).as("revenue"),
        unitsOrdered: sum(amazonSalesTraffic.unitsOrdered).as("units_ordered"),
        sessions: sum(amazonSalesTraffic.sessions).as("sessions"),
      })
      .from(amazonSalesTraffic)
      .where(
        and(
          eq(amazonSalesTraffic.orgId, orgId),
          gte(amazonSalesTraffic.date, from),
          lte(amazonSalesTraffic.date, to)
        )
      )
      .groupBy(dateTrunc)
      .orderBy(dateTrunc);

    const data = rows.map((row) => ({
      date: row.date,
      revenue: Math.round((Number(row.revenue) || 0) * 100) / 100,
      unitsOrdered: Number(row.unitsOrdered) || 0,
      sessions: Number(row.sessions) || 0,
    }));

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
