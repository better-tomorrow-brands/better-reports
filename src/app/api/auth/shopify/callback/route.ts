import { NextResponse, type NextRequest } from "next/server";
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.better-tomorrow.co";

  console.log(`[shopify/callback] shop=${shop} state=${state} code=${!!code}`);

  if (!code || !shop || !state) {
    console.error("[shopify/callback] Missing params");
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_params`);
  }

  // Read and validate the state cookie
  const rawCookie = request.cookies.get("shopify_oauth_state")?.value;
  console.log(`[shopify/callback] cookie present=${!!rawCookie}`);

  if (!rawCookie) {
    console.error("[shopify/callback] Missing state cookie");
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_state`);
  }

  let cookieState: { nonce: string; orgId: number; shop: string };
  try {
    cookieState = JSON.parse(rawCookie);
  } catch {
    console.error("[shopify/callback] Failed to parse state cookie");
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=invalid_state`);
  }

  if (state !== cookieState.nonce || shop !== cookieState.shop) {
    console.error(`[shopify/callback] State mismatch: url=${state} cookie=${cookieState.nonce}`);
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=state_mismatch`);
  }

  const { orgId } = cookieState;

  const shopifySettings = await getShopifySettings(orgId);
  if (!shopifySettings?.client_id || !shopifySettings?.client_secret) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_credentials`);
  }

  const { client_id: clientId, client_secret: clientSecret } = shopifySettings;

  // Verify Shopify's HMAC on the callback params
  if (!verifyShopifyHmac(searchParams, clientSecret)) {
    console.error("[shopify/callback] HMAC verification failed");
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=invalid_hmac`);
  }

  console.log("[shopify/callback] HMAC verified, exchanging code for token");

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
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

  console.log(`[shopify/callback] Token exchanged, saving settings for org=${orgId}`);

  // Save access token + store domain to org settings
  // webhook_secret is NOT client_secret — it's a separate signing secret from
  // Partner Dashboard → Webhooks → Client secret. Preserve whatever the user has set.
  await saveShopifySettings(orgId, {
    ...shopifySettings,
    store_domain: shop,
    access_token: accessToken,
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
