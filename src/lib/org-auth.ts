import { auth } from "@clerk/nextjs/server";
import { db } from "./db";
import { users, userOrganizations } from "./db/schema";
import { and, eq } from "drizzle-orm";

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
