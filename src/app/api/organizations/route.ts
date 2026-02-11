import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations, userOrganizations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/organizations — list orgs the current user belongs to
// super_admin sees all orgs
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check platform role, auto-creating user if needed
    let userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows.length) {
      const clerkUser = await currentUser();
      const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
      const name = clerkUser?.fullName ?? null;
      await db
        .insert(users)
        .values({ id: userId, email, name, role: "user" })
        .onConflictDoNothing();

      const defaultOrgId = process.env.DEFAULT_ORG_ID ? Number(process.env.DEFAULT_ORG_ID) : null;
      if (defaultOrgId && !isNaN(defaultOrgId)) {
        await db
          .insert(userOrganizations)
          .values({ userId, orgId: defaultOrgId, role: "user" })
          .onConflictDoNothing();
      }

      userRows = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    }

    const isSuperAdmin = userRows[0]?.role === "super_admin";

    if (isSuperAdmin) {
      // super_admin sees all orgs (with synthetic 'admin' role)
      const allOrgs = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        })
        .from(organizations)
        .orderBy(organizations.name);

      return NextResponse.json({
        orgs: allOrgs.map((o) => ({ ...o, role: "admin" })),
      });
    }

    // Regular users — only their memberships
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

    return NextResponse.json({ orgs: memberships });
  } catch (error) {
    console.error("GET /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
  }
}

// POST /api/organizations — create a new org (super_admin only)
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows.length || userRows[0].role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, slug } = body as { name: string; slug: string };

    if (!name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }

    const slugNormalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const [newOrg] = await db
      .insert(organizations)
      .values({ name: name.trim(), slug: slugNormalized })
      .returning();

    return NextResponse.json({ org: newOrg }, { status: 201 });
  } catch (error: unknown) {
    // Unique constraint violation on slug
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }
    console.error("POST /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}
