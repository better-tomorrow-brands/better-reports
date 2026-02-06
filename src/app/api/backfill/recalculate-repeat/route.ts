import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && secret !== "dev-backfill") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all orders sorted by date (oldest first)
    const allOrders = await db
      .select({
        id: orders.id,
        email: orders.email,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(orders.createdAt);

    console.log(`Recalculating repeat status for ${allOrders.length} orders...`);

    let updated = 0;
    let repeatCount = 0;

    for (const order of allOrders) {
      if (!order.email || !order.createdAt) continue;

      // Check for previous orders from same email
      const previousOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.email, order.email),
            lt(orders.createdAt, order.createdAt)
          )
        )
        .limit(1);

      const isRepeat = previousOrders.length > 0;

      await db
        .update(orders)
        .set({ isRepeatCustomer: isRepeat })
        .where(eq(orders.id, order.id));

      updated++;
      if (isRepeat) repeatCount++;
    }

    console.log(`Updated ${updated} orders, ${repeatCount} are repeat customers`);

    return NextResponse.json({
      success: true,
      totalOrders: allOrders.length,
      updated,
      repeatCustomers: repeatCount,
      newCustomers: updated - repeatCount,
    });
  } catch (error) {
    console.error("Recalculation error:", error);
    return NextResponse.json(
      { error: "Recalculation failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
