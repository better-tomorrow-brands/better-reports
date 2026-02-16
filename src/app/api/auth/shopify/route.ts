import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { requireOrgAccess } from "@/lib/org-auth";

const SCOPES =
  "read_products,read_analytics,write_customers,write_orders,write_discounts,write_price_rules";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SHOPIFY_CLIENT_ID not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");
  const orgIdStr = searchParams.get("orgId");
  const orgId = orgIdStr ? Number(orgIdStr) : NaN;

  if (!shop || isNaN(orgId)) {
    return NextResponse.json(
      { error: "Missing required params: shop, orgId" },
      { status: 400 }
    );
  }

  // Verify user has access to this org
  try {
    await requireOrgAccess(orgId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nonce = randomBytes(16).toString("hex");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.better-tomorrow.co";
  const redirectUri = `${appUrl}/api/auth/shopify/callback`;

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  oauthUrl.searchParams.set("client_id", clientId);
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
