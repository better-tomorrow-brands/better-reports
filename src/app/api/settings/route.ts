import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getMetaSettings, saveMetaSettings, getShopifySettings, saveShopifySettings, getAmazonSettings, saveAmazonSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function requireAdmin(userId: string) {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.role === "admin" || user?.role === "super_admin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await requireAdmin(userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const meta = await getMetaSettings();
    const shopify = await getShopifySettings();
    const amazon = await getAmazonSettings();

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

  if (!(await requireAdmin(userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    if (body.amazon) {
      // If secrets look masked, keep the existing ones
      if (body.amazon.client_secret?.includes("...")) {
        const existing = await getAmazonSettings();
        if (existing) {
          body.amazon.client_secret = existing.client_secret;
        }
      }
      if (body.amazon.refresh_token?.includes("...")) {
        const existing = await getAmazonSettings();
        if (existing) {
          body.amazon.refresh_token = existing.refresh_token;
        }
      }
      await saveAmazonSettings(body.amazon);
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
