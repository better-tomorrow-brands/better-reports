import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";

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

// GET /api/organizations/[id] — fetch single org
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    if (isNaN(orgId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    return NextResponse.json({ org });
  } catch (error: unknown) {
    const e = error as { message?: string; status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/organizations/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch org" }, { status: 500 });
  }
}

// PATCH /api/organizations/[id] — rename org
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
    const { name } = body as { name: string };
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const [updated] = await db
      .update(organizations)
      .set({ name: name.trim(), slug })
      .where(eq(organizations.id, orgId))
      .returning();

    if (!updated) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    return NextResponse.json({ org: updated });
  } catch (error: unknown) {
    const e = error as { message?: string; status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }
    console.error("PATCH /api/organizations/[id] error:", error);
    return NextResponse.json({ error: "Failed to update org" }, { status: 500 });
  }
}

// DELETE /api/organizations/[id] — delete org
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    if (isNaN(orgId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await db.delete(organizations).where(eq(organizations.id, orgId));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const e = error as { message?: string; status?: number };
    if (e.status === 401 || e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/organizations/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete org" }, { status: 500 });
  }
}
