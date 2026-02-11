import { NextResponse } from "next/server";
import { desc, eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const [orderRows, countResult] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(eq(orders.orgId, orgId))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(orders)
        .where(eq(orders.orgId, orgId)),
    ]);

    return NextResponse.json({
      orders: orderRows,
      total: countResult[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Orders GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const body = await request.json();
    const { id, utmSource, utmCampaign, utmMedium, utmContent, utmTerm } = body;

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const updateData: Record<string, string | null> = {};
    if (utmSource !== undefined) updateData.utmSource = utmSource || null;
    if (utmCampaign !== undefined) updateData.utmCampaign = utmCampaign || null;
    if (utmMedium !== undefined) updateData.utmMedium = utmMedium || null;
    if (utmContent !== undefined) updateData.utmContent = utmContent || null;
    if (utmTerm !== undefined) updateData.utmTerm = utmTerm || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Ensure we only update orders belonging to this org
    await db
      .update(orders)
      .set(updateData)
      .where(and(eq(orders.id, id), eq(orders.orgId, orgId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Orders PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update order", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
