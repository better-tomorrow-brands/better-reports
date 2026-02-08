import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.select().from(products).orderBy(products.sku);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const [product] = await db
    .insert(products)
    .values({
      sku: body.sku,
      productName: body.productName || null,
      brand: body.brand || null,
      unitBarcode: body.unitBarcode || null,
      asin: body.asin || null,
      parentAsin: body.parentAsin || null,
      shippoSku: body.shippoSku || null,
      piecesPerPack: body.piecesPerPack || null,
      packWeightKg: body.packWeightKg || null,
      packLengthCm: body.packLengthCm || null,
      packWidthCm: body.packWidthCm || null,
      packHeightCm: body.packHeightCm || null,
      unitCbm: body.unitCbm || null,
      dimensionalWeight: body.dimensionalWeight || null,
      unitPriceUsd: body.unitPriceUsd || null,
      unitPriceGbp: body.unitPriceGbp || null,
      packCostGbp: body.packCostGbp || null,
      landedCost: body.landedCost || null,
      unitLcogs: body.unitLcogs || null,
      dtcRrp: body.dtcRrp || null,
      ppUnit: body.ppUnit || null,
      dtcRrpExVat: body.dtcRrpExVat || null,
      amazonRrp: body.amazonRrp || null,
      fbaFee: body.fbaFee || null,
      referralPercent: body.referralPercent || null,
      dtcFulfillmentFee: body.dtcFulfillmentFee || null,
      dtcCourier: body.dtcCourier || null,
      cartonBarcode: body.cartonBarcode || null,
      unitsPerMasterCarton: body.unitsPerMasterCarton || null,
      piecesPerMasterCarton: body.piecesPerMasterCarton || null,
      grossWeightKg: body.grossWeightKg || null,
      cartonWidthCm: body.cartonWidthCm || null,
      cartonLengthCm: body.cartonLengthCm || null,
      cartonHeightCm: body.cartonHeightCm || null,
      cartonCbm: body.cartonCbm || null,
      active: body.active ?? true,
    })
    .returning();

  return NextResponse.json(product, { status: 201 });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  // Only update fields that are present in the body
  const fields = [
    "sku", "productName", "brand", "unitBarcode", "asin", "parentAsin",
    "shippoSku", "piecesPerPack", "packWeightKg", "packLengthCm",
    "packWidthCm", "packHeightCm", "unitCbm", "dimensionalWeight",
    "unitPriceUsd", "unitPriceGbp", "packCostGbp", "landedCost",
    "unitLcogs", "dtcRrp", "ppUnit", "dtcRrpExVat",
    "amazonRrp", "fbaFee", "referralPercent",
    "dtcFulfillmentFee", "dtcCourier", "cartonBarcode",
    "unitsPerMasterCarton", "piecesPerMasterCarton", "grossWeightKg",
    "cartonWidthCm", "cartonLengthCm", "cartonHeightCm", "cartonCbm",
    "active",
  ];

  for (const field of fields) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, body.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  await db.delete(products).where(eq(products.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
