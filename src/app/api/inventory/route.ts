import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventorySnapshots, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = today();

  const rows = await db
    .select({
      sku: inventorySnapshots.sku,
      amazonQty: inventorySnapshots.amazonQty,
      warehouseQty: inventorySnapshots.warehouseQty,
      productName: products.productName,
      brand: products.brand,
      asin: products.asin,
    })
    .from(inventorySnapshots)
    .leftJoin(products, eq(inventorySnapshots.sku, products.sku))
    .where(eq(inventorySnapshots.date, date))
    .orderBy(inventorySnapshots.sku);

  const result = rows.map((r) => ({
    sku: r.sku,
    productName: r.productName,
    brand: r.brand,
    asin: r.asin,
    amazonQty: r.amazonQty ?? 0,
    warehouseQty: r.warehouseQty ?? 0,
    totalQty: (r.amazonQty ?? 0) + (r.warehouseQty ?? 0),
  }));

  return NextResponse.json({ date, items: result });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { sku, amazonQty, warehouseQty } = body as {
    sku: string;
    amazonQty?: number;
    warehouseQty?: number;
  };

  if (!sku) {
    return NextResponse.json({ error: "sku required" }, { status: 400 });
  }

  const date = today();

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (amazonQty !== undefined) set.amazonQty = amazonQty;
  if (warehouseQty !== undefined) set.warehouseQty = warehouseQty;

  await db
    .insert(inventorySnapshots)
    .values({
      sku,
      date,
      amazonQty: amazonQty ?? 0,
      warehouseQty: warehouseQty ?? 0,
    })
    .onConflictDoUpdate({
      target: [inventorySnapshots.sku, inventorySnapshots.date],
      set,
    });

  return NextResponse.json({ success: true, sku, date, amazonQty, warehouseQty });
}
