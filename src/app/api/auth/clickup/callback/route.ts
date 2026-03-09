import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const revalidate = 0; // never cache OAuth callbacks

interface ClickUpTokenResponse {
  access_token: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const origin = req.nextUrl.origin;

    if (!code) {
      console.error("ClickUp callback missing `code` param");
      return NextResponse.json(
        { error: "Missing `code` in callback URL" },
        { status: 400 }
      );
    }

    // Read the state from cookies
    const cookieStore = await cookies();
    const stateCookie = cookieStore.get("clickup_oauth_state")?.value;

    if (stateCookie && state && state !== stateCookie) {
      console.error("ClickUp OAuth state mismatch", { state, stateCookie });
      return NextResponse.json(
        { error: "Invalid OAuth state" },
        { status: 400 }
      );
    }

    const clientId = process.env.CLICKUP_CLIENT_ID;
    const clientSecret = process.env.CLICKUP_CLIENT_SECRET;
    const redirectUri = process.env.CLICKUP_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing CLICKUP_CLIENT_ID, CLICKUP_CLIENT_SECRET, or CLICKUP_REDIRECT_URI env");
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }

    const tokenRes = await fetch("https://api.clickup.com/api/v2/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("ClickUp token exchange failed:", tokenRes.status, text);
      return NextResponse.json(
        { error: "Failed to exchange code for token" },
        { status: 502 }
      );
    }

    const data = (await tokenRes.json()) as ClickUpTokenResponse;
    const accessToken = data.access_token;

    if (!accessToken) {
      console.error("No access_token in ClickUp token response:", data);
      return NextResponse.json(
        { error: "No access_token returned from ClickUp" },
        { status: 502 }
      );
    }

    // Log token for manual addition to env
    console.log("CLICKUP ACCESS TOKEN:", accessToken);

    // Clear state cookie and redirect to settings
    const redirectUrl = new URL("/settings?clickup=connected", origin);
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("clickup_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (err) {
    console.error("ClickUp OAuth callback crashed:", err);
    return NextResponse.json(
      { error: "Internal error in ClickUp callback" },
      { status: 500 }
    );
  }
}
