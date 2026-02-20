import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, organizations, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/subscriptions/all
 * Super admin only: Get all organizations with their subscriptions
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super_admin
    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows.length || userRows[0].role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: super_admin only" }, { status: 403 });
    }

    // Fetch all organizations with their subscriptions
    const orgs = await db
      .select({
        orgId: organizations.id,
        orgName: organizations.name,
        tier: subscriptions.tier,
        status: subscriptions.status,
        maxUsers: subscriptions.maxUsers,
        maxDataSources: subscriptions.maxDataSources,
        maxAccounts: subscriptions.maxAccounts,
        dataRefreshInterval: subscriptions.dataRefreshInterval,
      })
      .from(organizations)
      .leftJoin(subscriptions, eq(organizations.id, subscriptions.orgId))
      .orderBy(organizations.name);

    return NextResponse.json({ subscriptions: orgs });
  } catch (error) {
    console.error("subscriptions/all GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}
