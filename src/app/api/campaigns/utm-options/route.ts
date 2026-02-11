import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignsFcb } from "@/lib/db/schema";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const rows = await db
      .select({ utmCampaign: campaignsFcb.utmCampaign })
      .from(campaignsFcb)
      .where(eq(campaignsFcb.orgId, orgId));

    const uniqueValues = [
      ...new Set(
        rows
          .map((r) => r.utmCampaign)
          .filter((v): v is string => !!v)
      ),
    ].sort();

    return NextResponse.json({ utmCampaigns: uniqueValues });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("UTM options error:", error);
    return NextResponse.json(
      { error: "Failed to fetch UTM options" },
      { status: 500 }
    );
  }
}
