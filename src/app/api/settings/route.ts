import { NextResponse } from "next/server";
import {
  getMetaSettings, saveMetaSettings,
  getShopifySettings, saveShopifySettings,
  getAmazonSettings, saveAmazonSettings,
  getAmazonAdsSettings, saveAmazonAdsSettings,
  getFacebookAdsSettings, saveFacebookAdsSettings,
  getPosthogSettings, savePosthogSettings,
  getPreferencesSettings, savePreferencesSettings,
  getShipBobSettings, saveShipBobSettings,
} from "@/lib/settings";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const [meta, shopify, amazon, amazonAds, facebookAds, posthog, preferences, shipbob] = await Promise.all([
      getMetaSettings(orgId),
      getShopifySettings(orgId),
      getAmazonSettings(orgId),
      getAmazonAdsSettings(orgId),
      getFacebookAdsSettings(orgId),
      getPosthogSettings(orgId),
      getPreferencesSettings(orgId),
      getShipBobSettings(orgId),
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

    const maskedAmazonAds = amazonAds
      ? {
          ...amazonAds,
          client_secret: amazonAds.client_secret
            ? `${amazonAds.client_secret.slice(0, 6)}...`
            : "",
          refresh_token: amazonAds.refresh_token
            ? `${amazonAds.refresh_token.slice(0, 10)}...${amazonAds.refresh_token.slice(-4)}`
            : "",
        }
      : null;

    const maskedPosthog = posthog
      ? {
          ...posthog,
          api_key: posthog.api_key
            ? `${posthog.api_key.slice(0, 10)}...${posthog.api_key.slice(-4)}`
            : "",
        }
      : null;

    const maskedFacebookAds = facebookAds
      ? {
          ...facebookAds,
          access_token: facebookAds.access_token
            ? `${facebookAds.access_token.slice(0, 10)}...${facebookAds.access_token.slice(-4)}`
            : "",
        }
      : null;

    const maskedShipBob = shipbob
      ? {
          ...shipbob,
          pat: shipbob.pat
            ? `${shipbob.pat.slice(0, 10)}...${shipbob.pat.slice(-4)}`
            : "",
        }
      : null;

    return NextResponse.json({ meta: maskedMeta, shopify: maskedShopify, amazon: maskedAmazon, amazon_ads: maskedAmazonAds, facebook_ads: maskedFacebookAds, posthog: maskedPosthog, preferences: preferences ?? { displayCurrency: "USD" }, shipbob: maskedShipBob });
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

    if (body.amazon_ads) {
      if (body.amazon_ads.client_secret?.includes("...")) {
        const existing = await getAmazonAdsSettings(orgId);
        if (existing) body.amazon_ads.client_secret = existing.client_secret;
      }
      if (body.amazon_ads.refresh_token?.includes("...")) {
        const existing = await getAmazonAdsSettings(orgId);
        if (existing) body.amazon_ads.refresh_token = existing.refresh_token;
      }
      await saveAmazonAdsSettings(orgId, body.amazon_ads);
    }

    if (body.facebook_ads) {
      if (body.facebook_ads.access_token?.includes("...")) {
        const existing = await getFacebookAdsSettings(orgId);
        if (existing) body.facebook_ads.access_token = existing.access_token;
      }
      await saveFacebookAdsSettings(orgId, body.facebook_ads);
    }

    if (body.posthog) {
      if (body.posthog.api_key?.includes("...")) {
        const existing = await getPosthogSettings(orgId);
        if (existing) body.posthog.api_key = existing.api_key;
      }
      await savePosthogSettings(orgId, body.posthog);
    }

    if (body.shipbob) {
      if (body.shipbob.pat?.includes("...")) {
        const existing = await getShipBobSettings(orgId);
        if (existing) body.shipbob.pat = existing.pat;
      }
      await saveShipBobSettings(orgId, body.shipbob);
    }

    if (body.preferences) {
      await savePreferencesSettings(orgId, body.preferences);
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
