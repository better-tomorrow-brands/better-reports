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
    graphUrl.searchParams.set("fields", "creative{thumbnail_url,image_url,video_id,object_story_spec}");
    graphUrl.searchParams.set("access_token", settings.access_token);

    const res = await fetch(graphUrl.toString());
    if (!res.ok) {
      return NextResponse.json({ thumbnailUrl: null, fullUrl: null, videoId: null, videoSourceUrl: null });
    }

    const data = await res.json();
    const creative = data?.creative;
    const thumbnailUrl = creative?.thumbnail_url || creative?.image_url || null;
    const videoId = creative?.video_id || null;
    const spec = creative?.object_story_spec;

    let fullUrl: string | null = creative?.image_url || creative?.thumbnail_url || null;
    let videoSourceUrl: string | null = null;

    // Try to pull full-res image from object_story_spec first
    if (spec) {
      const specImageUrl =
        spec?.link_data?.image_url ||
        spec?.link_data?.picture ||
        spec?.photo_data?.url ||
        spec?.video_data?.image_url ||
        null;
      if (specImageUrl) fullUrl = specImageUrl;
    }

    if (videoId) {
      // Video ad — fetch direct MP4 source
      try {
        const videoUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${videoId}`);
        videoUrl.searchParams.set("fields", "source,picture");
        videoUrl.searchParams.set("access_token", settings.access_token);
        const vRes = await fetch(videoUrl.toString());
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData?.source) videoSourceUrl = vData.source;
          if (vData?.picture && !fullUrl) fullUrl = vData.picture;
        }
      } catch { /* fall through */ }
    }

    return NextResponse.json({ thumbnailUrl, fullUrl, videoId, videoSourceUrl });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Meta ad-thumbnail error:", error);
    return NextResponse.json({ thumbnailUrl: null });
  }
}
