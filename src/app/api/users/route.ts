import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, userOrganizations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

// GET /api/users — list all members of the current org
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const members = await db
      .select({
        userId: userOrganizations.userId,
        orgRole: userOrganizations.role,
        email: users.email,
        name: users.name,
        platformRole: users.role,
        createdAt: userOrganizations.createdAt,
      })
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(eq(userOrganizations.orgId, orgId))
      .orderBy(users.email);

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// PATCH /api/users — update a member's org role
export async function PATCH(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { userId: actorId } = await auth();

    // Check actor has admin rights in this org
    const actorMembership = await db
      .select({ role: userOrganizations.role })
      .from(userOrganizations)
      .where(and(eq(userOrganizations.orgId, orgId), eq(userOrganizations.userId, actorId!)))
      .limit(1);

    if (!actorMembership.length || actorMembership[0].role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json() as { userId: string; role: string };
    const { userId, role } = body;

    if (!userId || !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid userId or role" }, { status: 400 });
    }

    await db
      .update(userOrganizations)
      .set({ role })
      .where(and(eq(userOrganizations.orgId, orgId), eq(userOrganizations.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/users error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// DELETE /api/users?userId=... — remove a member from the org
export async function DELETE(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { userId: actorId } = await auth();

    // Check actor has admin rights
    const actorMembership = await db
      .select({ role: userOrganizations.role })
      .from(userOrganizations)
      .where(and(eq(userOrganizations.orgId, orgId), eq(userOrganizations.userId, actorId!)))
      .limit(1);

    if (!actorMembership.length || actorMembership[0].role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId query param required" }, { status: 400 });
    }

    // Prevent removing yourself
    if (userId === actorId) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    await db
      .delete(userOrganizations)
      .where(and(eq(userOrganizations.orgId, orgId), eq(userOrganizations.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/users error:", error);
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }
}
