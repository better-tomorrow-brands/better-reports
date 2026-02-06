import { NextResponse } from "next/server";
import { getShopifySettings } from "@/lib/settings";
import {
  verifyShopifyHmac,
  upsertOrder,
  ShopifyOrderPayload,
} from "@/lib/shopify-orders";

export async function POST(request: Request) {
  const settings = await getShopifySettings();
  if (!settings?.webhook_secret) {
    console.error("Shopify webhook secret not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!hmacHeader) {
    console.error("Missing HMAC header");
    return NextResponse.json({ error: "Missing HMAC header" }, { status: 401 });
  }

  if (!verifyShopifyHmac(body, hmacHeader, settings.webhook_secret)) {
    console.error("Invalid HMAC signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const data: ShopifyOrderPayload = JSON.parse(body);

    console.log(`Processing Shopify order: ${data.id} (#${data.order_number})`);

    await upsertOrder(data);

    console.log(`Order ${data.id} upserted successfully`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing Shopify webhook:", error);
    return NextResponse.json(
      {
        error: "Failed to process order",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
