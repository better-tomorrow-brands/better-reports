import { NextResponse } from "next/server";
import { getAmazonAdsSettings } from "@/lib/settings";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { getAmazonAdsAccessToken } from "@/lib/amazon-ads";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const settings = await getAmazonAdsSettings(orgId);
    if (!settings) {
      return NextResponse.json({ success: false, message: "Amazon Ads settings not configured" });
    }

    const token = await getAmazonAdsAccessToken(settings);
    return NextResponse.json({
      success: true,
      message: `Connected — access token obtained (expires in ${token.expires_in}s)`,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
