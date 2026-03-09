import { NextResponse } from "next/server";
import crypto from "crypto";

const CLICKUP_AUTH_URL = "https://app.clickup.com/api";

export async function GET() {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  const redirectUri = process.env.CLICKUP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "ClickUp OAuth not configured" },
      { status: 500 }
    );
  }

  // Generate a state value for CSRF protection
  const state = crypto.randomUUID();

  const url = new URL(CLICKUP_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  // Persist state in a cookie for verification in callback
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("clickup_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  return res;
}
