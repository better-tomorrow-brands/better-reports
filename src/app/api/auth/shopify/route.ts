import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { requireOrgAccess } from "@/lib/org-auth";
import { getShopifySettings } from "@/lib/settings";

// read_all_orders is a protected scope automatically granted to admin-created custom apps.
// It is not shown in the standard scope picker but is valid and required to access
// orders older than 60 days. Must be used alongside read_orders or write_orders.
const SCOPES =
  "read_orders,read_all_orders,read_products,read_analytics,write_customers,write_orders,write_discounts,write_price_rules";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.better-tomorrow.co";

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=unauthorized`);
  }

  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");
  const orgIdStr = searchParams.get("orgId");
  const orgId = orgIdStr ? Number(orgIdStr) : NaN;

  if (!shop || isNaN(orgId)) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_params`);
  }

  // Verify user has access to this org
  try {
    await requireOrgAccess(orgId);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=forbidden`);
  }

  const shopifySettings = await getShopifySettings(orgId);
  if (!shopifySettings?.client_id || !shopifySettings?.client_secret) {
    return NextResponse.redirect(`${appUrl}/settings?shopify=error&reason=missing_app_credentials`);
  }

  const nonce = randomBytes(16).toString("hex");

  const redirectUri = `${appUrl}/api/auth/shopify/callback`;

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  oauthUrl.searchParams.set("client_id", shopifySettings.client_id);
  oauthUrl.searchParams.set("scope", SCOPES);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("state", nonce);

  const response = NextResponse.redirect(oauthUrl.toString());

  // Store nonce + orgId + shop in a short-lived httpOnly cookie
  const cookieValue = JSON.stringify({ nonce, orgId, shop });
  response.cookies.set("shopify_oauth_state", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  return response;
}
