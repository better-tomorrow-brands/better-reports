import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, userOrganizations } from "@/lib/db/schema";

async function requireSuperAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const userRows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows.length || userRows[0].role !== "super_admin") {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  return userId;
}

function handleAuthError(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status === 401 || e.status === 403) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}

// GET /api/organizations/[id]/members — list members of an org
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    if (isNaN(orgId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const members = await db
      .select({
        userId: userOrganizations.userId,
        role: userOrganizations.role,
        email: users.email,
        name: users.name,
        platformRole: users.role,
      })
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(eq(userOrganizations.orgId, orgId))
      .orderBy(users.email);

    return NextResponse.json({ members });
  } catch (error) {
    return handleAuthError(error) ?? NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

// POST /api/organizations/[id]/members — add a user by email
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    if (isNaN(orgId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json();
    const { email, role = "user" } = body as { email: string; role?: string };

    if (!email?.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });
    if (!["admin", "user"].includes(role)) {
      return NextResponse.json({ error: "role must be admin or user" }, { status: 400 });
    }

    // Look up user by email
    const userRows = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);

    if (!userRows.length) {
      return NextResponse.json(
        { error: "No user found with that email. They must sign in at least once first." },
        { status: 404 }
      );
    }

    const user = userRows[0];

    await db
      .insert(userOrganizations)
      .values({ userId: user.id, orgId, role })
      .onConflictDoUpdate({
        target: [userOrganizations.userId, userOrganizations.orgId],
        set: { role },
      });

    return NextResponse.json({ success: true, userId: user.id, email: user.email });
  } catch (error) {
    return handleAuthError(error) ?? NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// PATCH /api/organizations/[id]/members — change a member's role
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    if (isNaN(orgId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json();
    const { userId, role } = body as { userId: string; role: string };

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (!["admin", "user"].includes(role)) {
      return NextResponse.json({ error: "role must be admin or user" }, { status: 400 });
    }

    const [updated] = await db
      .update(userOrganizations)
      .set({ role })
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.orgId, orgId)
        )
      )
      .returning();

    if (!updated) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error) ?? NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

// DELETE /api/organizations/[id]/members?userId=... — remove a member
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    if (isNaN(orgId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId query param required" }, { status: 400 });

    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.orgId, orgId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error) ?? NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
