import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa, campaignsWaCustomers } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

async function verifyCampaignOwnership(campaignId: number, orgId: number): Promise<boolean> {
  const campaign = await db.query.campaignsWa.findFirst({
    where: and(eq(campaignsWa.id, campaignId), eq(campaignsWa.orgId, orgId)),
    columns: { id: true },
  });
  return !!campaign;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { id } = await params;
    const campaignId = parseInt(id);
    const body = await request.json();

    if (!body.customers || !Array.isArray(body.customers)) {
      return NextResponse.json({ error: "Customers array required" }, { status: 400 });
    }

    if (!await verifyCampaignOwnership(campaignId, orgId)) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const customerRecords = body.customers.map((c: { id: number; phone: string; firstName: string }) => ({
      campaignId,
      customerId: c.id,
      phone: c.phone,
      firstName: c.firstName,
      status: "pending",
    }));

    if (customerRecords.length > 0) {
      await db.insert(campaignsWaCustomers).values(customerRecords);
    }

    return NextResponse.json({ success: true, added: customerRecords.length });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Add customers to campaign error:", error);
    return NextResponse.json(
      { error: "Failed to add customers", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// PUT replaces all customers for the campaign
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { id } = await params;
    const campaignId = parseInt(id);
    const body = await request.json();

    if (!body.customers || !Array.isArray(body.customers)) {
      return NextResponse.json({ error: "Customers array required" }, { status: 400 });
    }

    if (!await verifyCampaignOwnership(campaignId, orgId)) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Delete existing customers for this campaign
    await db.delete(campaignsWaCustomers).where(eq(campaignsWaCustomers.campaignId, campaignId));

    // Insert new customers
    const customerRecords = body.customers.map((c: { id: number; phone: string; firstName: string }) => ({
      campaignId,
      customerId: c.id,
      phone: c.phone,
      firstName: c.firstName,
      status: "pending",
    }));

    if (customerRecords.length > 0) {
      await db.insert(campaignsWaCustomers).values(customerRecords);
    }

    return NextResponse.json({ success: true, count: customerRecords.length });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Update campaign customers error:", error);
    return NextResponse.json(
      { error: "Failed to update customers", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
