import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getShopifySettings } from "@/lib/settings";
import { verifyShopifyHmac } from "@/lib/shopify-orders";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";

interface ShopifyCustomerPayload {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_marketing_consent: {
    state: string;
  } | null;
  orders_count: number;
  total_spent: string;
  tags: string;
  created_at: string;
}

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
    const data: ShopifyCustomerPayload = JSON.parse(body);

    console.log(`Processing Shopify customer: ${data.id} (${data.email || "no email"})`);

    const customerData = {
      shopifyCustomerId: data.id.toString(),
      firstName: data.first_name || undefined,
      lastName: data.last_name || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      emailMarketingConsent: data.email_marketing_consent?.state === "subscribed",
      ordersCount: data.orders_count || 0,
      totalSpent: data.total_spent || "0",
      tags: data.tags || undefined,
      createdAt: new Date(data.created_at),
    };

    // Upsert by email (if exists) or shopifyCustomerId
    if (customerData.email) {
      const existing = await db
        .select()
        .from(customers)
        .where(eq(customers.email, customerData.email))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(customers)
          .set(customerData)
          .where(eq(customers.email, customerData.email));
      } else {
        await db.insert(customers).values(customerData);
      }
    } else {
      const existing = await db
        .select()
        .from(customers)
        .where(eq(customers.shopifyCustomerId, data.id.toString()))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(customers)
          .set(customerData)
          .where(eq(customers.shopifyCustomerId, data.id.toString()));
      } else {
        await db.insert(customers).values(customerData);
      }
    }

    console.log(`Customer ${data.id} upserted successfully`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing Shopify customer webhook:", error);
    return NextResponse.json(
      {
        error: "Failed to process customer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
