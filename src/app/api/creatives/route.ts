import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { creatives } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/creatives
 * Fetch all generated creatives for the current org
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const rows = await db
      .select()
      .from(creatives)
      .where(eq(creatives.orgId, orgId))
      .orderBy(desc(creatives.createdAt))
      .limit(100);

    return NextResponse.json({
      creatives: rows.map((row) => ({
        id: row.id.toString(),
        imageUrl: row.imageUrl,
        prompt: row.prompt,
        campaignGoal: row.campaignGoal,
        targetCta: row.targetCta,
        adAngle: row.adAngle,
        customPrompt: row.customPrompt,
        brandGuidelines: row.brandGuidelines,
        productId: row.productId,
        headline: row.headline,
        primaryText: row.primaryText,
        description: row.description,
        callToAction: row.callToAction,
        createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("creatives GET error:", error);
    return NextResponse.json({ error: "Failed to fetch creatives" }, { status: 500 });
  }
}
