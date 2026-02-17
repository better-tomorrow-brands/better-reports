import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// One-shot migration endpoint — delete after use.
// Only callable by super_admin users.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRows = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows.length || userRows[0].role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  const results: string[] = [];

  // Migration 0017: add currency column to orders
  try {
    await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'USD'`;
    results.push("OK: ALTER TABLE orders ADD COLUMN currency");
  } catch (err) {
    results.push(`ERR: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ results });
}
