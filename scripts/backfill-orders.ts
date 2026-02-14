/**
 * Standalone Amazon Orders backfill script.
 * Run with: npx tsx scripts/backfill-orders.ts --since=2025-01-01
 *
 * Fetches all orders from SP-API Orders endpoint and upserts into amazon_orders table.
 * Skips orders already in the database (by amazon_order_id).
 * Can be interrupted and re-run safely (upserts + skip logic).
 *
 * Options:
 *   --since=YYYY-MM-DD   Start date (default: 2025-01-01)
 *   --org=N              Org ID (default: 1)
 *
 * Test on dev first (uses DATABASE_URL from .env.local):
 *   npx tsx scripts/backfill-orders.ts --since=2025-01-01
 *
 * Production (override DATABASE_URL inline):
 *   DATABASE_URL="postgres://...prod..." npx tsx scripts/backfill-orders.ts --since=2025-01-01
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";

// ── Config ───────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  acc[key] = val;
  return acc;
}, {} as Record<string, string>);

const SINCE = args.since || "2025-01-01";
const ORG_ID = parseInt(args.org || "1");
const ITEM_DELAY_MS = 2000; // 2s between getOrderItems calls

// ── DB Setup ─────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL!;
const sql = neon(dbUrl);
const db = drizzle(sql, { schema });

// ── Settings (read directly from DB) ─────────────────────
import { decrypt } from "../src/lib/crypto";

async function getSettings() {
  const rows = await sql`SELECT value FROM settings WHERE key = 'amazon'`;
  if (!rows.length) throw new Error("Amazon settings not found in DB");
  const decrypted = decrypt(rows[0].value as string);
  return JSON.parse(decrypted) as {
    client_id: string;
    client_secret: string;
    refresh_token: string;
    marketplace_id: string;
  };
}

// ── Auth ─────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(settings: Awaited<ReturnType<typeof getSettings>>) {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.refresh_token,
      client_id: settings.client_id,
      client_secret: settings.client_secret,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

// ── SP-API Request with retry ────────────────────────────
const EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";

async function spApi(path: string, settings: Awaited<ReturnType<typeof getSettings>>, init: RequestInit = {}) {
  const token = await getAccessToken(settings);
  const url = path.startsWith("http") ? path : `${EU_ENDPOINT}${path}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { "x-amz-access-token": token, "Content-Type": "application/json", ...init.headers },
    });

    if (res.status === 429) {
      const backoff = Math.min(2000 * Math.pow(2, attempt), 32000);
      console.log(`  ⏳ Rate limited, waiting ${backoff / 1000}s...`);
      await sleep(backoff);
      continue;
    }

    return res;
  }

  throw new Error("Rate limit retries exhausted");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Fetch all orders with pagination ─────────────────────

interface OrderSummary {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: string;
  FulfillmentChannel: string;
  IsPrime: boolean;
  IsBusinessOrder: boolean;
}

async function fetchAllOrders(settings: Awaited<ReturnType<typeof getSettings>>, since: string): Promise<OrderSummary[]> {
  const orders: OrderSummary[] = [];
  let nextToken: string | null = null;
  let page = 0;

  do {
    const params = new URLSearchParams({
      MarketplaceIds: settings.marketplace_id,
      CreatedAfter: `${since}T00:00:00Z`,
      OrderStatuses: "Pending,Unshipped,PartiallyShipped,Shipped,InvoiceUnconfirmed,Canceled",
    });
    if (nextToken) params.set("NextToken", nextToken);

    const res = await spApi(`/orders/v0/orders?${params.toString()}`, settings);
    if (!res!.ok) {
      const text = await res!.text();
      throw new Error(`Orders API error (${res!.status}): ${text}`);
    }

    const data = await res!.json();
    const payload = data.payload || data;
    const list = payload.Orders || [];

    for (const o of list) {
      orders.push({
        AmazonOrderId: o.AmazonOrderId,
        PurchaseDate: o.PurchaseDate,
        LastUpdateDate: o.LastUpdateDate,
        OrderStatus: o.OrderStatus,
        FulfillmentChannel: o.FulfillmentChannel || "",
        IsPrime: o.IsPrime === true,
        IsBusinessOrder: o.IsBusinessOrder === true,
      });
    }

    nextToken = payload.NextToken || null;
    page++;
    console.log(`  📦 Fetched page ${page} — ${list.length} orders (${orders.length} total so far)`);

    // Small delay between pagination calls
    if (nextToken) await sleep(500);
  } while (nextToken);

  return orders;
}

// ── Fetch order items ────────────────────────────────────

interface OrderItem {
  OrderItemId: string;
  ASIN: string;
  SellerSKU: string;
  Title: string;
  QuantityOrdered: number;
  QuantityShipped: number;
  ItemPrice?: { Amount: string; CurrencyCode: string };
}

async function fetchOrderItems(settings: Awaited<ReturnType<typeof getSettings>>, orderId: string): Promise<OrderItem[]> {
  const items: OrderItem[] = [];
  let nextToken: string | null = null;

  do {
    const path = nextToken
      ? `/orders/v0/orders/${orderId}/orderItems?NextToken=${encodeURIComponent(nextToken)}`
      : `/orders/v0/orders/${orderId}/orderItems`;

    const res = await spApi(path, settings);
    if (!res!.ok) {
      const text = await res!.text();
      throw new Error(`OrderItems API error (${res!.status}): ${text}`);
    }

    const data = await res!.json();
    const payload = data.payload || data;
    const list = payload.OrderItems || [];

    for (const item of list) {
      items.push({
        OrderItemId: item.OrderItemId,
        ASIN: item.ASIN || "",
        SellerSKU: item.SellerSKU || "",
        Title: item.Title || "",
        QuantityOrdered: Number(item.QuantityOrdered ?? 0),
        QuantityShipped: Number(item.QuantityShipped ?? 0),
        ItemPrice: item.ItemPrice
          ? { Amount: String(item.ItemPrice.Amount ?? "0"), CurrencyCode: item.ItemPrice.CurrencyCode || "GBP" }
          : undefined,
      });
    }

    nextToken = payload.NextToken || null;
  } while (nextToken);

  return items;
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  // Show DB host (masked) so user can confirm dev vs prod
  const dbHost = dbUrl.match(/@([^/]+)\//)?.[1] || "unknown";
  const maskedHost = dbHost.length > 10 ? dbHost.slice(0, 8) + "..." + dbHost.slice(-6) : dbHost;

  console.log(`\n🚀 Amazon Orders Backfill`);
  console.log(`   DB host: ${maskedHost}`);
  console.log(`   Since: ${SINCE}`);
  console.log(`   Org: ${ORG_ID}\n`);

  const settings = await getSettings();

  // Step 1: Fetch existing order IDs from DB to skip
  console.log(`📋 Checking existing orders in DB...`);
  const existingRows = await sql`SELECT DISTINCT amazon_order_id FROM amazon_orders WHERE org_id = ${ORG_ID}`;
  const existingOrderIds = new Set(existingRows.map((r) => r.amazon_order_id as string));
  console.log(`   Found ${existingOrderIds.size} existing orders in DB\n`);

  // Step 2: Fetch all orders from SP-API
  console.log(`📦 Fetching orders from SP-API (since ${SINCE})...`);
  const allOrders = await fetchAllOrders(settings, SINCE);
  console.log(`   Total orders from API: ${allOrders.length}\n`);

  // Step 3: Sort newest first, filter out existing
  allOrders.sort((a, b) => new Date(b.PurchaseDate).getTime() - new Date(a.PurchaseDate).getTime());
  const toProcess = allOrders.filter((o) => !existingOrderIds.has(o.AmazonOrderId));

  console.log(`   To process: ${toProcess.length} (skipping ${allOrders.length - toProcess.length} already in DB)\n`);

  if (toProcess.length === 0) {
    console.log(`✨ Nothing to do — all orders already in DB!\n`);
    return;
  }

  // Step 4: Process each order — fetch items and upsert
  let success = 0;
  let errors = 0;
  let totalItems = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const order = toProcess[i];
    const pct = ((i / toProcess.length) * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const avgPerOrder = i > 0 ? elapsed / i : ITEM_DELAY_MS / 1000;
    const eta = Math.round(((toProcess.length - i) * avgPerOrder) / 60);

    try {
      const items = await fetchOrderItems(settings, order.AmazonOrderId);

      // Build rows matching the schema
      const rows = items.map((item) => ({
        orgId: ORG_ID,
        amazonOrderId: order.AmazonOrderId,
        orderItemId: item.OrderItemId,
        purchaseDate: new Date(order.PurchaseDate),
        lastUpdateDate: order.LastUpdateDate ? new Date(order.LastUpdateDate) : null,
        orderStatus: order.OrderStatus,
        fulfillmentChannel: order.FulfillmentChannel,
        asin: item.ASIN,
        sellerSku: item.SellerSKU,
        title: item.Title,
        quantityOrdered: item.QuantityOrdered,
        quantityShipped: item.QuantityShipped,
        itemPrice: item.ItemPrice?.Amount ?? "0",
        itemCurrency: item.ItemPrice?.CurrencyCode ?? "GBP",
        isPrime: order.IsPrime,
        isBusinessOrder: order.IsBusinessOrder,
      }));

      // Upsert each item
      for (const row of rows) {
        await db
          .insert(schema.amazonOrders)
          .values(row)
          .onConflictDoUpdate({
            target: [schema.amazonOrders.orgId, schema.amazonOrders.amazonOrderId, schema.amazonOrders.orderItemId],
            set: {
              orderStatus: row.orderStatus,
              lastUpdateDate: row.lastUpdateDate,
              quantityOrdered: row.quantityOrdered,
              quantityShipped: row.quantityShipped,
              itemPrice: row.itemPrice,
              itemCurrency: row.itemCurrency,
            },
          });
      }

      totalItems += rows.length;
      success++;
      console.log(
        `✅ ${order.AmazonOrderId} (${order.PurchaseDate.split("T")[0]}) — ${rows.length} items  ` +
        `[${i + 1}/${toProcess.length} ${pct}% | ETA: ${eta}min | ✅${success} ❌${errors}]`
      );
    } catch (err) {
      errors++;
      console.error(
        `❌ ${order.AmazonOrderId} — ${err instanceof Error ? err.message : err}  ` +
        `[${i + 1}/${toProcess.length}]`
      );
    }

    // Delay between order item fetches (skip on last)
    if (i < toProcess.length - 1) {
      await sleep(ITEM_DELAY_MS);
    }
  }

  const totalElapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `\n✨ Done! ${success} orders (${totalItems} items) succeeded, ${errors} failed ` +
    `out of ${toProcess.length} orders in ${totalElapsed}s\n`
  );
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
