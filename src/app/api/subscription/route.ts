import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError, getOrgSubscription } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { PLANS } from "@/lib/plans";

/**
 * GET /api/subscription
 * Returns the subscription for the current org
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const subscription = await getOrgSubscription(orgId);

    return NextResponse.json({ subscription });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("subscription GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}

/**
 * PUT /api/subscription
 * Super admin only: Update an org's tier
 */
export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super_admin
    const userRows = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows.length || userRows[0].role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: super_admin only" }, { status: 403 });
    }

    const body = await request.json();
    const { orgId, tier } = body;

    if (!orgId || !tier) {
      return NextResponse.json({ error: "orgId and tier required" }, { status: 400 });
    }

    const plan = PLANS[tier as keyof typeof PLANS];
    if (!plan) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    // Upsert subscription
    await db
      .insert(subscriptions)
      .values({
        orgId: Number(orgId),
        tier,
        status: "active",
        maxUsers: plan.maxUsers,
        maxDataSources: plan.maxDataSources,
        maxAccounts: plan.maxAccounts,
        dataRefreshInterval: plan.dataRefreshInterval,
      })
      .onConflictDoUpdate({
        target: subscriptions.orgId,
        set: {
          tier,
          maxUsers: plan.maxUsers,
          maxDataSources: plan.maxDataSources,
          maxAccounts: plan.maxAccounts,
          dataRefreshInterval: plan.dataRefreshInterval,
          updatedAt: new Date(),
        },
      });

    const subscription = await getOrgSubscription(Number(orgId));
    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("subscription PUT error:", error);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}
