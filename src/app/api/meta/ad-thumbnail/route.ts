import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { getFacebookAdsSettings } from "@/lib/settings";

const API_VERSION = "v21.0";

/**
 * GET /api/meta/ad-thumbnail?adId=
 * Fetches the thumbnail URL for a given Meta ad creative via the Graph API.
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const url = new URL(request.url);
    const adId = url.searchParams.get("adId");

    if (!adId) {
      return NextResponse.json({ error: "adId is required" }, { status: 400 });
    }

    const settings = await getFacebookAdsSettings(orgId);
    if (!settings?.access_token) {
      return NextResponse.json({ error: "Facebook Ads not configured" }, { status: 400 });
    }

    const graphUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${adId}`);
    graphUrl.searchParams.set("fields", "creative{thumbnail_url,image_url}");
    graphUrl.searchParams.set("access_token", settings.access_token);

    const res = await fetch(graphUrl.toString());
    if (!res.ok) {
      return NextResponse.json({ thumbnailUrl: null });
    }

    const data = await res.json();
    const thumbnailUrl = data?.creative?.thumbnail_url || data?.creative?.image_url || null;

    return NextResponse.json({ thumbnailUrl });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Meta ad-thumbnail error:", error);
    return NextResponse.json({ thumbnailUrl: null });
  }
}
