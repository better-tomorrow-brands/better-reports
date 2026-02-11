import { NextResponse } from "next/server";
import {
  getMetaSettings, saveMetaSettings,
  getShopifySettings, saveShopifySettings,
  getAmazonSettings, saveAmazonSettings,
} from "@/lib/settings";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const [meta, shopify, amazon] = await Promise.all([
      getMetaSettings(orgId),
      getShopifySettings(orgId),
      getAmazonSettings(orgId),
    ]);

    // Mask tokens for display
    const maskedMeta = meta
      ? {
          ...meta,
          access_token: meta.access_token
            ? `${meta.access_token.slice(0, 10)}...${meta.access_token.slice(-4)}`
            : "",
        }
      : null;

    const maskedShopify = shopify
      ? {
          ...shopify,
          access_token: shopify.access_token
            ? `${shopify.access_token.slice(0, 10)}...${shopify.access_token.slice(-4)}`
            : "",
          webhook_secret: shopify.webhook_secret
            ? `${shopify.webhook_secret.slice(0, 6)}...`
            : "",
        }
      : null;

    const maskedAmazon = amazon
      ? {
          ...amazon,
          client_secret: amazon.client_secret
            ? `${amazon.client_secret.slice(0, 6)}...`
            : "",
          refresh_token: amazon.refresh_token
            ? `${amazon.refresh_token.slice(0, 10)}...${amazon.refresh_token.slice(-4)}`
            : "",
        }
      : null;

    return NextResponse.json({ meta: maskedMeta, shopify: maskedShopify, amazon: maskedAmazon });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "Failed to load settings", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const body = await request.json();

    if (body.meta) {
      if (body.meta.access_token?.includes("...")) {
        const existing = await getMetaSettings(orgId);
        if (existing) body.meta.access_token = existing.access_token;
      }
      await saveMetaSettings(orgId, body.meta);
    }

    if (body.shopify) {
      if (body.shopify.access_token?.includes("...")) {
        const existing = await getShopifySettings(orgId);
        if (existing) body.shopify.access_token = existing.access_token;
      }
      if (body.shopify.webhook_secret?.includes("...")) {
        const existing = await getShopifySettings(orgId);
        if (existing) body.shopify.webhook_secret = existing.webhook_secret;
      }
      await saveShopifySettings(orgId, body.shopify);
    }

    if (body.amazon) {
      if (body.amazon.client_secret?.includes("...")) {
        const existing = await getAmazonSettings(orgId);
        if (existing) body.amazon.client_secret = existing.client_secret;
      }
      if (body.amazon.refresh_token?.includes("...")) {
        const existing = await getAmazonSettings(orgId);
        if (existing) body.amazon.refresh_token = existing.refresh_token;
      }
      await saveAmazonSettings(orgId, body.amazon);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Settings POST error:", error);
    return NextResponse.json(
      { error: "Failed to save settings", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
