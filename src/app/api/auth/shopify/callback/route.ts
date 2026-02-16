import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getShopifySettings, saveShopifySettings } from "@/lib/settings";

function verifyShopifyHmac(
  params: URLSearchParams,
  clientSecret: string
): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  // Build the message: all params except hmac, sorted, joined with &
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hmac") {
      pairs.push(`${key}=${value}`);
    }
  });
  pairs.sort();
  const message = pairs.join("&");

  const digest = createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  // Constant-time comparison
  return digest.length === hmac.length && digest === hmac;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.better-tomorrow.co";

  if (!code || !shop || !state) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_params`);
  }

  // Read and validate the state cookie
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieMatch = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("shopify_oauth_state="));

  if (!cookieMatch) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_state`);
  }

  let cookieState: { nonce: string; orgId: number; shop: string };
  try {
    cookieState = JSON.parse(
      decodeURIComponent(cookieMatch.split("=").slice(1).join("="))
    );
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=invalid_state`);
  }

  if (
    state !== cookieState.nonce ||
    shop !== cookieState.shop
  ) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=state_mismatch`);
  }

  const { orgId } = cookieState;

  // Load client credentials from settings
  const shopifySettings = await getShopifySettings(orgId);
  if (!shopifySettings?.client_id || !shopifySettings?.client_secret) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_credentials`);
  }

  // Verify Shopify's HMAC on the callback params
  if (!verifyShopifyHmac(searchParams, shopifySettings.client_secret)) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=invalid_hmac`);
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: shopifySettings.client_id,
          client_secret: shopifySettings.client_secret,
          code,
        }),
      }
    );

    if (!tokenRes.ok) {
      console.error("Shopify token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=no_token`);
    }
  } catch (err) {
    console.error("Shopify token exchange error:", err);
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=token_exchange`);
  }

  // Save access token + store domain back to settings
  // webhook_secret = client_secret (Shopify uses this for HMAC on partner app webhooks)
  await saveShopifySettings(orgId, {
    ...shopifySettings,
    store_domain: shop,
    access_token: accessToken,
    webhook_secret: shopifySettings.client_secret,
  });

  // Clear the state cookie and redirect to settings
  const response = NextResponse.redirect(`${appUrl}/settings?shopify=connected`);
  response.cookies.set("shopify_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
