import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productImages } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const productsData = await db
      .select()
      .from(products)
      .where(eq(products.orgId, orgId))
      .orderBy(products.sku);

    // Fetch images for all products
    const productsWithImages = await Promise.all(
      productsData.map(async (product) => {
        const images = await db
          .select()
          .from(productImages)
          .where(eq(productImages.productId, product.id))
          .orderBy(productImages.displayOrder);

        return {
          ...product,
          images: images.map(img => ({
            id: img.id,
            imageUrl: img.imageUrl,
            displayOrder: img.displayOrder,
            isPrimary: img.isPrimary,
          })),
        };
      })
    );

    return NextResponse.json(productsWithImages);
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const body = await request.json();

    const [product] = await db
      .insert(products)
      .values({
        orgId,
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
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

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
      .where(and(eq(products.id, body.id), eq(products.orgId, orgId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query param required" }, { status: 400 });
    }

    await db
      .delete(products)
      .where(and(eq(products.id, parseInt(id)), eq(products.orgId, orgId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
