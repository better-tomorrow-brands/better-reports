import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsFcb } from "@/lib/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select()
      .from(campaignsFcb)
      .orderBy(desc(campaignsFcb.createdAt));

    return NextResponse.json({ campaigns: rows });
  } catch (error) {
    console.error("Campaigns GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const newCampaign = await db
      .insert(campaignsFcb)
      .values({
        campaign: body.campaign || null,
        adGroup: body.adGroup || null,
        ad: body.ad || null,
        productName: body.productName || null,
        productUrl: body.productUrl || null,
        skuSuffix: body.skuSuffix || null,
        skus: body.skus || null,
        discountCode: body.discountCode || null,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
        utmTerm: body.utmTerm || null,
        productTemplate: body.productTemplate || null,
        status: body.status || "active",
      })
      .returning();

    return NextResponse.json({ campaign: newCampaign[0] });
  } catch (error) {
    console.error("Campaigns POST error:", error);
    return NextResponse.json(
      { error: "Failed to create campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const updated = await db
      .update(campaignsFcb)
      .set({
        campaign: data.campaign || null,
        adGroup: data.adGroup || null,
        ad: data.ad || null,
        productName: data.productName || null,
        productUrl: data.productUrl || null,
        skuSuffix: data.skuSuffix || null,
        skus: data.skus || null,
        discountCode: data.discountCode || null,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        utmTerm: data.utmTerm || null,
        productTemplate: data.productTemplate || null,
        status: data.status || "active",
        updatedAt: new Date(),
      })
      .where(eq(campaignsFcb.id, id))
      .returning();

    return NextResponse.json({ campaign: updated[0] });
  } catch (error) {
    console.error("Campaigns PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    await db.delete(campaignsFcb).where(eq(campaignsFcb.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Campaigns DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
