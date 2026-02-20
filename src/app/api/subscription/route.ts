import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError, getOrgSubscription } from "@/lib/org-auth";

/**
 * GET /api/subscription
 * Returns the subscription for the current org
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const subscription = await getOrgSubscription(orgId);

    return NextResponse.json({ subscription });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("subscription GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}
