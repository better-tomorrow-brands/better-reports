import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { getLifecycleSettings } from "@/lib/settings";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const [lifecycleSettings, aggregates] = await Promise.all([
      getLifecycleSettings(orgId),
      db
        .select({
          total: sql<number>`count(*)`,
          purchased: sql<number>`count(*) filter (where ${customers.ordersCount} > 0)`,
          emailSubscribers: sql<number>`count(*) filter (where ${customers.emailMarketingConsent} = true)`,
          activeSubscribers: sql<number>`count(*) filter (where ${customers.tags} ilike '%active subscriber%')`,
          avgTotalSpent: sql<string>`round(avg(${customers.totalSpent}) filter (where ${customers.ordersCount} > 0), 2)`,
          avgOrdersCount: sql<string>`round(avg(${customers.ordersCount}) filter (where ${customers.ordersCount} > 0), 1)`,
          avgLapseDays: sql<string>`round(avg(extract(epoch from (now() - ${customers.lastOrderAt})) / 86400) filter (where ${customers.lastOrderAt} is not null and ${customers.ordersCount} > 0), 0)`,
        })
        .from(customers)
        .where(eq(customers.orgId, orgId)),
    ]);

    const row = aggregates[0];
    const total = Number(row.total) || 0;
    const purchased = Number(row.purchased) || 0;
    const prospects = total - purchased;

    // Lifecycle breakdown using configurable thresholds
    const { newMaxDays, reorderMaxDays, lapsedMaxDays } = lifecycleSettings;

    const lifecycleAgg = await db
      .select({
        newCount: sql<number>`count(*) filter (
          where ${customers.ordersCount} > 0
          and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400 <= ${newMaxDays}
        )`,
        reorderCount: sql<number>`count(*) filter (
          where ${customers.ordersCount} > 0
          and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400 > ${newMaxDays}
          and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400 <= ${reorderMaxDays}
        )`,
        lapsedCount: sql<number>`count(*) filter (
          where ${customers.ordersCount} > 0
          and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400 > ${reorderMaxDays}
          and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400 <= ${lapsedMaxDays}
        )`,
        lostCount: sql<number>`count(*) filter (
          where ${customers.ordersCount} > 0
          and extract(epoch from (now() - ${customers.lastOrderAt})) / 86400 > ${lapsedMaxDays}
        )`,
      })
      .from(customers)
      .where(eq(customers.orgId, orgId));

    const lc = lifecycleAgg[0];

    return NextResponse.json({
      total,
      purchased,
      prospects,
      emailSubscribers: Number(row.emailSubscribers) || 0,
      activeSubscribers: Number(row.activeSubscribers) || 0,
      avgTotalSpent: row.avgTotalSpent ? parseFloat(row.avgTotalSpent) : null,
      avgOrdersCount: row.avgOrdersCount ? parseFloat(row.avgOrdersCount) : null,
      avgLapseDays: row.avgLapseDays ? parseInt(row.avgLapseDays) : null,
      lifecycle: {
        new: Number(lc.newCount) || 0,
        reorder: Number(lc.reorderCount) || 0,
        lapsed: Number(lc.lapsedCount) || 0,
        lost: Number(lc.lostCount) || 0,
      },
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch customer stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
