import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsWa } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const { id } = await params;
    const campaignId = parseInt(id);
    const body = await request.json();
    const { status } = body;

    if (!status || !["draft", "sending", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updates: { status: string; sentAt?: Date } = { status };
    if (status === "completed") {
      updates.sentAt = new Date();
    }

    await db
      .update(campaignsWa)
      .set(updates)
      .where(and(eq(campaignsWa.id, campaignId), eq(campaignsWa.orgId, orgId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Update campaign status error:", error);
    return NextResponse.json(
      { error: "Failed to update status", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
