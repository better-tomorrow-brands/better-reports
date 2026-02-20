import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

/**
 * POST /api/webhooks/shopify/products
 *
 * Shopify webhook for products/create and products/update
 *
 * Setup in Shopify:
 * 1. Go to Settings > Notifications > Webhooks
 * 2. Create webhook for "Product creation" and "Product update"
 * 3. Format: JSON
 * 4. URL: https://your-domain.com/api/webhooks/shopify/products
 * 5. API version: Latest
 *
 * Webhook will update product imageUrl when products are created/updated in Shopify
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;

    if (shopifySecret && hmacHeader) {
      const hash = crypto
        .createHmac("sha256", shopifySecret)
        .update(rawBody, "utf8")
        .digest("base64");

      if (hash !== hmacHeader) {
        console.error("Shopify webhook signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);

    // Extract product data from Shopify webhook
    const sku = payload.variants?.[0]?.sku; // Assuming first variant SKU
    const productName = payload.title;
    const brand = payload.vendor;
    const imageUrl = payload.image?.src || payload.images?.[0]?.src || null;

    if (!sku) {
      console.warn("Shopify webhook: No SKU found in product", payload.id);
      return NextResponse.json({ message: "No SKU found" }, { status: 200 });
    }

    // Find the product by SKU across all orgs
    // Note: This assumes SKUs are unique or you need to add org-specific logic
    const existingProducts = await db
      .select()
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);

    if (existingProducts.length > 0) {
      // Update existing product with image URL
      await db
        .update(products)
        .set({
          imageUrl,
          productName: productName || existingProducts[0].productName,
          brand: brand || existingProducts[0].brand,
          updatedAt: new Date(),
        })
        .where(eq(products.id, existingProducts[0].id));

      console.log(`Updated product ${sku} with image URL: ${imageUrl}`);
    } else {
      console.log(`Product ${sku} not found in database, skipping`);
    }

    return NextResponse.json({
      success: true,
      message: "Product webhook processed",
      sku,
      imageUrl
    });

  } catch (error) {
    console.error("Shopify product webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}
