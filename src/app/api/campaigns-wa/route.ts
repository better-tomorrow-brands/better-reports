import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa, campaignsWaCustomers } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const rows = await db.query.campaignsWa.findMany({
      where: eq(campaignsWa.orgId, orgId),
      orderBy: [desc(campaignsWa.createdAt)],
      with: {
        campaignsWaCustomers: {
          columns: {
            id: true,
            status: true,
          },
        },
      },
    });

    // Add computed counts from junction table
    const campaigns = rows.map((row) => ({
      ...row,
      customerCount: row.campaignsWaCustomers.length,
      successCount: row.campaignsWaCustomers.filter((c) => c.status === "sent").length,
      errorCount: row.campaignsWaCustomers.filter((c) => c.status === "failed").length,
    }));

    return NextResponse.json({ campaigns });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns-WA GET error:", error);
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

    const [newCampaign] = await db
      .insert(campaignsWa)
      .values({
        orgId,
        name: body.name,
        templateName: body.templateName,
        status: "draft",
      })
      .returning();

    // If customers are provided, add them to the junction table
    if (body.customers && body.customers.length > 0) {
      await db.insert(campaignsWaCustomers).values(
        body.customers.map((c: { id: number; phone: string; firstName: string }) => ({
          campaignId: newCampaign.id,
          customerId: c.id,
          phone: c.phone,
          firstName: c.firstName,
          status: "pending",
        }))
      );
    }

    return NextResponse.json({ campaign: newCampaign });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns-WA POST error:", error);
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

    const [updated] = await db
      .update(campaignsWa)
      .set({
        name: data.name,
        templateName: data.templateName,
        status: data.status,
        sentAt: data.sentAt ? new Date(data.sentAt) : undefined,
      })
      .where(and(eq(campaignsWa.id, id), eq(campaignsWa.orgId, orgId)))
      .returning();

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns-WA PUT error:", error);
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

    await db.delete(campaignsWa).where(and(eq(campaignsWa.id, parseInt(id)), eq(campaignsWa.orgId, orgId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaigns-WA DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
