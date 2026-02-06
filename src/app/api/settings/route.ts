import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMetaSettings, saveMetaSettings, getShopifySettings, saveShopifySettings } from "@/lib/settings";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const meta = await getMetaSettings();
    const shopify = await getShopifySettings();

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

    return NextResponse.json({ meta: maskedMeta, shopify: maskedShopify });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "Failed to load settings", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body.meta) {
      // If access_token looks masked (contains ...), keep the existing one
      if (body.meta.access_token?.includes("...")) {
        const existing = await getMetaSettings();
        if (existing) {
          body.meta.access_token = existing.access_token;
        }
      }
      await saveMetaSettings(body.meta);
    }

    if (body.shopify) {
      // If tokens look masked, keep the existing ones
      if (body.shopify.access_token?.includes("...")) {
        const existing = await getShopifySettings();
        if (existing) {
          body.shopify.access_token = existing.access_token;
        }
      }
      if (body.shopify.webhook_secret?.includes("...")) {
        const existing = await getShopifySettings();
        if (existing) {
          body.shopify.webhook_secret = existing.webhook_secret;
        }
      }
      await saveShopifySettings(body.shopify);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json(
      { error: "Failed to save settings", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
