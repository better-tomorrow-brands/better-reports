import { createHmac } from "crypto";
import { eq, and, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { orders, campaignsFcb, customers } from "./db/schema";
import { getShopifySettings } from "./settings";

// ── Types ──────────────────────────────────────────────

interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface ShopifyCustomer {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface ShopifyLineItem {
  sku?: string;
  title?: string;
  quantity: number;
}

interface ShopifyDiscountCode {
  code: string;
}

interface ShopifyFulfillment {
  tracking_number?: string;
}

interface ShopifyMoneySet {
  shop_money?: { amount?: string };
}

export interface ShopifyOrderPayload {
  id: number;
  order_number?: number;
  email?: string;
  customer?: ShopifyCustomer;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  created_at?: string;
  fulfillment_status?: string;
  fulfilled_at?: string;
  subtotal_price?: string;
  total_shipping_price_set?: ShopifyMoneySet;
  total_tax?: string;
  total_price?: string;
  discount_codes?: ShopifyDiscountCode[];
  line_items?: ShopifyLineItem[];
  fulfillments?: ShopifyFulfillment[];
  tags?: string;
}

interface UTMParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

interface AttributionResult {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}

// ── HMAC Verification ──────────────────────────────────

export function verifyShopifyHmac(body: string, hmacHeader: string, secret: string): boolean {
  const hash = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return hash === hmacHeader;
}

// ── Customer Journey (UTM from Shopify) ────────────────

export async function getCustomerJourney(orderId: number): Promise<UTMParams> {
  const settings = await getShopifySettings();
  if (!settings?.store_domain || !settings?.access_token) {
    return {};
  }

  const query = `{
    order(id: "gid://shopify/Order/${orderId}") {
      customerJourneySummary {
        firstVisit {
          utmParameters {
            source
            medium
            campaign
            content
            term
          }
        }
      }
    }
  }`;

  try {
    const response = await fetch(
      `https://${settings.store_domain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": settings.access_token,
        },
        body: JSON.stringify({ query }),
      }
    );

    const data = await response.json();
    return data?.data?.order?.customerJourneySummary?.firstVisit?.utmParameters || {};
  } catch (error) {
    console.error("Error fetching customer journey:", error);
    return {};
  }
}

// ── Campaigns Lookup (Fallback Attribution) ────────────

export async function getAttributionFromCampaigns(
  discountCode: string,
  skus: string
): Promise<AttributionResult | null> {
  // First: match by discount code
  if (discountCode) {
    const byDiscount = await db
      .select()
      .from(campaignsFcb)
      .where(sql`LOWER(${campaignsFcb.discountCode}) = LOWER(${discountCode})`)
      .limit(1);

    if (byDiscount.length > 0) {
      const row = byDiscount[0];
      return {
        source: row.utmSource || "",
        medium: row.utmMedium || "",
        campaign: row.utmCampaign || "",
        content: "",
        term: row.utmTerm || "",
      };
    }
  }

  // Second: match by SKU
  if (skus) {
    const orderSkuArray = skus.toLowerCase().split(",").map((s) => s.trim());

    const allCampaigns = await db
      .select()
      .from(campaignsFcb)
      .where(sql`${campaignsFcb.skus} IS NOT NULL AND ${campaignsFcb.skus} != ''`);

    for (const camp of allCampaigns) {
      const campaignSkuArray = (camp.skus || "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim());

      for (const orderSku of orderSkuArray) {
        if (campaignSkuArray.includes(orderSku)) {
          return {
            source: camp.utmSource || "",
            medium: camp.utmMedium || "",
            campaign: camp.utmCampaign || "",
            content: "",
            term: camp.utmTerm || "",
          };
        }
      }
    }
  }

  return null;
}

// ── Helpers ────────────────────────────────────────────

export function getCustomerName(data: ShopifyOrderPayload): string {
  if (data.customer?.first_name || data.customer?.last_name) {
    return `${data.customer?.first_name || ""} ${data.customer?.last_name || ""}`.trim();
  }
  if (data.shipping_address?.first_name || data.shipping_address?.last_name) {
    return `${data.shipping_address?.first_name || ""} ${data.shipping_address?.last_name || ""}`.trim();
  }
  return "";
}

export function getPhone(data: ShopifyOrderPayload): string {
  return (
    data.customer?.phone ||
    data.shipping_address?.phone ||
    data.billing_address?.phone ||
    ""
  );
}

export function getDiscountCodes(data: ShopifyOrderPayload): string {
  if (!data.discount_codes || data.discount_codes.length === 0) return "";
  return data.discount_codes.map((d) => d.code).join(", ");
}

export function getLineItemSkus(data: ShopifyOrderPayload): string {
  if (!data.line_items || data.line_items.length === 0) return "";
  return data.line_items.map((item) => item.sku || item.title).join(", ");
}

export function getLineItemQuantity(data: ShopifyOrderPayload): number {
  if (!data.line_items || data.line_items.length === 0) return 0;
  return data.line_items.reduce((total, item) => total + item.quantity, 0);
}

export function getTrackingNumber(data: ShopifyOrderPayload): string {
  if (!data.fulfillments || data.fulfillments.length === 0) return "";
  return data.fulfillments
    .map((f) => f.tracking_number)
    .filter((t) => t)
    .join(", ");
}

function formatDate(dateString?: string): Date | null {
  if (!dateString) return null;
  return new Date(dateString);
}

// ── Main Upsert ────────────────────────────────────────

export async function upsertOrder(data: ShopifyOrderPayload): Promise<void> {
  const shopifyId = data.id.toString();

  // Get UTM from Shopify API
  const utmParams = await getCustomerJourney(data.id);
  const hasConversionData = !!(utmParams.source || utmParams.campaign || utmParams.medium);

  let finalUtm: AttributionResult = {
    source: utmParams.source || "",
    campaign: utmParams.campaign || "",
    medium: utmParams.medium || "",
    content: utmParams.content || "",
    term: utmParams.term || "",
  };

  // If no conversion data, try lookup
  if (!hasConversionData) {
    const discountCode = getDiscountCodes(data);
    const skus = getLineItemSkus(data);
    const lookupResult = await getAttributionFromCampaigns(discountCode, skus);
    if (lookupResult) {
      finalUtm = lookupResult;
    }
  }

  // Check if this is a repeat customer (has previous orders before this order date)
  const customerEmail = data.customer?.email || data.email || null;
  const orderDate = formatDate(data.created_at);
  let isRepeatCustomer = false;

  if (customerEmail && orderDate) {
    const previousOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.email, customerEmail),
          lt(orders.createdAt, orderDate)
        )
      )
      .limit(1);

    isRepeatCustomer = previousOrders.length > 0;
  }

  const orderData = {
    shopifyId,
    orderNumber: data.order_number?.toString() || null,
    email: customerEmail,
    customerName: getCustomerName(data) || null,
    phone: getPhone(data) || null,
    createdAt: orderDate,
    fulfillmentStatus: data.fulfillment_status || "unfulfilled",
    fulfilledAt: formatDate(data.fulfilled_at),
    subtotal: data.subtotal_price || null,
    shipping: data.total_shipping_price_set?.shop_money?.amount || null,
    tax: data.total_tax || null,
    total: data.total_price || null,
    discountCodes: getDiscountCodes(data) || null,
    skus: getLineItemSkus(data) || null,
    quantity: getLineItemQuantity(data),
    utmSource: finalUtm.source || null,
    utmCampaign: finalUtm.campaign || null,
    utmMedium: finalUtm.medium || null,
    utmContent: finalUtm.content || null,
    utmTerm: finalUtm.term || null,
    trackingNumber: getTrackingNumber(data) || null,
    tags: data.tags || null,
    hasConversionData,
    isRepeatCustomer,
  };

  // On update, exclude utmSource/utmMedium/utmCampaign to preserve manual edits
  const { utmSource, utmMedium, utmCampaign, ...updateData } = orderData;

  await db
    .insert(orders)
    .values(orderData)
    .onConflictDoUpdate({
      target: orders.shopifyId,
      set: updateData,
    });
}
