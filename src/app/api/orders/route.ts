import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const orderRows = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: orders.id })
      .from(orders);

    return NextResponse.json({
      orders: orderRows,
      total: countResult.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    await db.update(orders).set(updateData).where(eq(orders.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Orders PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update order", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
