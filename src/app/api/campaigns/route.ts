import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsFcb } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const rows = await db
      .select()
      .from(campaignsFcb)
      .where(eq(campaignsFcb.orgId, orgId))
      .orderBy(desc(campaignsFcb.createdAt));

    return NextResponse.json({ campaigns: rows });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const body = await request.json();

    const newCampaign = await db
      .insert(campaignsFcb)
      .values({
        orgId,
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
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns POST error:", error);
    return NextResponse.json(
      { error: "Failed to create campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
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
      .where(and(eq(campaignsFcb.id, id), eq(campaignsFcb.orgId, orgId)))
      .returning();

    return NextResponse.json({ campaign: updated[0] });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    await db
      .delete(campaignsFcb)
      .where(and(eq(campaignsFcb.id, parseInt(id)), eq(campaignsFcb.orgId, orgId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
