import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

/**
 * GET /api/meta/image-proxy?url=<encoded-meta-cdn-url>
 * Proxies a Meta CDN image server-side to avoid 403s from the browser.
 */
export async function GET(request: Request) {
  try {
    await requireOrgFromRequest(request);

    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Only allow Meta CDN domains
    const allowed = ["fbcdn.net", "facebook.com", "fbsbx.com"];
    const hostname = new URL(imageUrl).hostname;
    if (!allowed.some((d) => hostname.endsWith(d))) {
      return NextResponse.json({ error: "Disallowed domain" }, { status: 403 });
    }

    const res = await fetch(imageUrl, {
      headers: {
        // Mimic a browser request so Meta CDN doesn't block us
        "User-Agent": "Mozilla/5.0 (compatible; better-reports/1.0)",
        "Referer": "https://www.facebook.com/",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}
