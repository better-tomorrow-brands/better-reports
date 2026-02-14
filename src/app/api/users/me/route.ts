import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, userOrganizations, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/org-auth";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userRows = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Auto-create user row on first access (webhook may not have fired yet)
    if (!userRows.length) {
      const clerkUser = await currentUser();
      const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
      const name = clerkUser?.fullName ?? null;
      await ensureUser(userId, email, name);

      userRows = await db
        .select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    }

    const user = userRows;

    // Also return the user's org memberships
    const memberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: userOrganizations.role,
      })
      .from(userOrganizations)
      .innerJoin(organizations, eq(userOrganizations.orgId, organizations.id))
      .where(eq(userOrganizations.userId, userId))
      .orderBy(organizations.name);

    return NextResponse.json({ ...user[0], orgs: memberships });
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
