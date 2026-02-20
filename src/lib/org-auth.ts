import { auth } from "@clerk/nextjs/server";
import { db } from "./db";
import { users, userOrganizations, subscriptions } from "./db/schema";
import { and, eq } from "drizzle-orm";
import type { Subscription } from "./plans";

export class OrgAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 403
  ) {
    super(message);
    this.name = "OrgAuthError";
  }
}

/**
 * Verifies the authenticated user has access to the given org.
 * - super_admin bypasses the check (platform-level access)
 * - admin / user must have a row in user_organizations for this org
 *
 * Returns the userId on success, throws OrgAuthError on failure.
 */
export async function requireOrgAccess(orgId: number): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new OrgAuthError("Unauthorized", 401);

  // Look up the user's platform role
  const userRows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows.length) throw new OrgAuthError("Unauthorized", 401);

  // super_admin has platform-wide access
  if (userRows[0].role === "super_admin") return userId;

  // Everyone else must be a member of the org
  const membership = await db
    .select({ id: userOrganizations.id })
    .from(userOrganizations)
    .where(
      and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.orgId, orgId)
      )
    )
    .limit(1);

  if (!membership.length) throw new OrgAuthError("Forbidden: not a member of this organization");

  return userId;
}

/**
 * Reads the X-Org-Id header from a Request and validates access.
 * Throws OrgAuthError if missing, invalid, or unauthorized.
 */
export async function requireOrgFromRequest(request: Request): Promise<{ userId: string; orgId: number }> {
  const orgIdStr = request.headers.get("X-Org-Id");
  const orgId = orgIdStr ? Number(orgIdStr) : NaN;

  if (!orgId || isNaN(orgId)) {
    throw new OrgAuthError("Missing or invalid X-Org-Id header", 403);
  }

  const userId = await requireOrgAccess(orgId);
  return { userId, orgId };
}

/**
 * Fetch the subscription for a given org
 */
export async function getOrgSubscription(orgId: number): Promise<Subscription | null> {
  const rows = await db
    .select({
      tier: subscriptions.tier,
      status: subscriptions.status,
      maxUsers: subscriptions.maxUsers,
      maxDataSources: subscriptions.maxDataSources,
      maxAccounts: subscriptions.maxAccounts,
      dataRefreshInterval: subscriptions.dataRefreshInterval,
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .limit(1);

  if (!rows.length) return null;

  return {
    tier: rows[0].tier as Subscription["tier"],
    status: rows[0].status as Subscription["status"],
    maxUsers: rows[0].maxUsers,
    maxDataSources: rows[0].maxDataSources,
    maxAccounts: rows[0].maxAccounts,
    dataRefreshInterval: rows[0].dataRefreshInterval || "weekly",
    stripeCustomerId: rows[0].stripeCustomerId,
  };
}

/**
 * Ensures a user row exists for the given Clerk user ID and email.
 * If a row already exists with the same email but a different Clerk ID
 * (e.g. after account recreation), migrates the old row's role and org
 * memberships to the new ID — preventing duplicates and preserving access.
 */
export async function ensureUser(
  userId: string,
  email: string,
  name: string | null
): Promise<void> {
  // Check if this Clerk ID already exists — nothing to do
  const byId = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (byId.length) return;

  // Check if email exists under a different Clerk ID
  const byEmail = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (byEmail.length && byEmail[0].id !== userId) {
    const oldId = byEmail[0].id;
    const oldRole = byEmail[0].role;

    // Create new user row preserving existing role
    await db.insert(users)
      .values({ id: userId, email, name, role: oldRole })
      .onConflictDoNothing();

    // Migrate org memberships from old Clerk ID to new one
    await db.update(userOrganizations)
      .set({ userId })
      .where(eq(userOrganizations.userId, oldId));

    // Remove the stale row
    await db.delete(users).where(eq(users.id, oldId));
    return;
  }

  // Brand new user — insert with default role
  await db.insert(users)
    .values({ id: userId, email, name, role: "user" })
    .onConflictDoNothing();

  // Assign to default org if configured
  const defaultOrgId = process.env.DEFAULT_ORG_ID ? Number(process.env.DEFAULT_ORG_ID) : null;
  if (defaultOrgId && !isNaN(defaultOrgId)) {
    await db.insert(userOrganizations)
      .values({ userId, orgId: defaultOrgId, role: "user" })
      .onConflictDoNothing();
  }
}
