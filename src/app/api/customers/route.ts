import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  try {
    const [customerList, countResult] = await Promise.all([
      db
        .select()
        .from(customers)
        .orderBy(desc(customers.createdAt))
        .limit(limit)
        .offset(offset),
      db.select().from(customers),
    ]);

    // Calculate lapse (days since last order) for each customer
    const customersWithLapse = customerList.map((customer) => {
      let lapse: number | null = null;
      if (customer.lastOrderAt) {
        const now = new Date();
        const lastOrder = new Date(customer.lastOrderAt);
        lapse = Math.floor((now.getTime() - lastOrder.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        ...customer,
        lapse,
      };
    });

    return NextResponse.json({
      customers: customersWithLapse,
      total: countResult.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
