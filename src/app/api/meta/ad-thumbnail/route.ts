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
    graphUrl.searchParams.set("fields", "creative{thumbnail_url,image_url,image_hash,video_id}");
    graphUrl.searchParams.set("access_token", settings.access_token);

    const res = await fetch(graphUrl.toString());
    if (!res.ok) {
      return NextResponse.json({ thumbnailUrl: null, fullUrl: null, videoId: null, videoSourceUrl: null });
    }

    const data = await res.json();
    const creative = data?.creative;
    const thumbnailUrl = creative?.thumbnail_url || creative?.image_url || null;
    const videoId = creative?.video_id || null;
    const imageHash = creative?.image_hash || null;

    let fullUrl: string | null = creative?.image_url || creative?.thumbnail_url || null;
    let videoSourceUrl: string | null = null;

    if (videoId) {
      // Video ad — fetch direct MP4 source and poster
      try {
        const videoUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${videoId}`);
        videoUrl.searchParams.set("fields", "source,picture");
        videoUrl.searchParams.set("access_token", settings.access_token);
        const vRes = await fetch(videoUrl.toString());
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData?.source) videoSourceUrl = vData.source;
          if (vData?.picture) fullUrl = vData.picture;
        }
      } catch { /* fall through */ }
    } else if (imageHash) {
      // Image ad — fetch full-res URL via ad account images API
      try {
        const imgUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${settings.ad_account_id}/adimages`);
        imgUrl.searchParams.set("hashes[]", imageHash);
        imgUrl.searchParams.set("fields", "url,url_128,width,height");
        imgUrl.searchParams.set("access_token", settings.access_token);
        const iRes = await fetch(imgUrl.toString());
        if (iRes.ok) {
          const iData = await iRes.json();
          const imgEntry = iData?.data?.[0];
          // url_128 is larger than thumbnail; url is the original upload
          if (imgEntry?.url) fullUrl = imgEntry.url;
          else if (imgEntry?.url_128) fullUrl = imgEntry.url_128;
        }
      } catch { /* fall through */ }
    }

    // Strip the stp size hint from the CDN URL — Meta CDN often serves original resolution without it
    if (fullUrl) {
      try {
        const u = new URL(fullUrl);
        u.searchParams.delete("stp");
        fullUrl = u.toString();
      } catch { /* keep original */ }
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
