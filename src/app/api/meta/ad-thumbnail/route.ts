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
    graphUrl.searchParams.set("fields", "creative{thumbnail_url,image_url,video_id,asset_feed_spec{images}}");
    graphUrl.searchParams.set("access_token", settings.access_token);

    const res = await fetch(graphUrl.toString());
    if (!res.ok) {
      return NextResponse.json({ thumbnailUrl: null, fullUrl: null, videoId: null, videoSourceUrl: null });
    }

    const data = await res.json();
    const creative = data?.creative;
    const thumbnailUrl = creative?.thumbnail_url || creative?.image_url || null;
    const videoId = creative?.video_id || null;
    const creativeId = creative?.id || null;

    let fullUrl: string | null = null;
    let videoSourceUrl: string | null = null;

    // Try asset_feed_spec images first — these are the raw uploaded variants
    const feedImages: Array<{ hash: string }> = creative?.asset_feed_spec?.images ?? [];
    if (feedImages.length > 0 && settings.ad_account_id) {
      try {
        const hashes = feedImages.map((i) => i.hash);
        const imgUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${settings.ad_account_id}/adimages`);
        imgUrl.searchParams.set("hashes", JSON.stringify(hashes));
        imgUrl.searchParams.set("fields", "url,width,height,url_128");
        imgUrl.searchParams.set("access_token", settings.access_token);
        const iRes = await fetch(imgUrl.toString());
        if (iRes.ok) {
          const iData = await iRes.json();
          const images: Array<{ url: string; width: number; height: number }> = Object.values(iData.data ?? iData ?? {});
          if (images.length > 0) {
            // Pick the image whose aspect ratio is closest to 1:1 (square)
            const scored = images
              .filter((img) => img.url && img.width && img.height)
              .map((img) => ({ ...img, ratio: Math.min(img.width, img.height) / Math.max(img.width, img.height) }))
              .sort((a, b) => b.ratio - a.ratio); // highest ratio = most square
            if (scored.length > 0) fullUrl = scored[0].url;
          }
        }
      } catch { /* fall through */ }
    }

    // Fall back to fetching a large thumbnail from the creative endpoint
    if (!fullUrl && creativeId) {
      try {
        const fullThumbUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${creativeId}`);
        fullThumbUrl.searchParams.set("fields", "thumbnail_url");
        fullThumbUrl.searchParams.set("thumbnail_width", "1080");
        fullThumbUrl.searchParams.set("thumbnail_height", "1080");
        fullThumbUrl.searchParams.set("access_token", settings.access_token);
        const tRes = await fetch(fullThumbUrl.toString());
        if (tRes.ok) {
          const tData = await tRes.json();
          if (tData?.thumbnail_url) fullUrl = tData.thumbnail_url;
        }
      } catch { /* fall through */ }
    }

    if (!fullUrl) fullUrl = thumbnailUrl;

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
