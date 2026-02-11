import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { id } = await params;
    const campaignId = parseInt(id);

    const campaign = await db.query.campaignsWa.findFirst({
      where: and(eq(campaignsWa.id, campaignId), eq(campaignsWa.orgId, orgId)),
      with: {
        campaignsWaCustomers: {
          with: {
            customer: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Campaign-WA GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
