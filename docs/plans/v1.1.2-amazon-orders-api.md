# Plan: Real-Time Amazon Orders via SP-API Orders API

## Context

The current Amazon integration uses the **Reports API** (`GET_SALES_AND_TRAFFIC_REPORT`), which has a 24-48 hour delay from Amazon's side. This means today's sales never appear in the dashboard until tomorrow or the day after.

To compete with real-time tools like Sellerboard, we need to pull order data as it happens. The SP-API **Orders API** (`/orders/v0/orders`) provides individual order data within ~2 minutes of creation.

The Reports API remains in place for historical traffic metrics (sessions, page views, buy box %) that the Orders API doesn't provide. The Orders API supplements it with real-time revenue and units data.

## Step 1: New DB table (`src/lib/db/schema.ts`)

**Table: `amazon_orders`** — one row per order-item (denormalized for easy aggregation in reports):

| Column | Type | Notes |
|--------|------|-------|
| orgId | integer | FK → organizations |
| amazonOrderId | text | Amazon's order ID (e.g. `203-1234567-8901234`) |
| orderItemId | text | Unique item ID within the order |
| purchaseDate | timestamp(tz) | When order was placed |
| lastUpdateDate | timestamp(tz) | Last modified by Amazon |
| orderStatus | text | Pending, Unshipped, Shipped, Canceled, etc. |
| fulfillmentChannel | text | `AFN` (FBA) or `MFN` (merchant fulfilled) |
| asin | text | Product ASIN |
| sellerSku | text | Seller's SKU |
| title | text | Product title |
| quantityOrdered | integer | |
| quantityShipped | integer | |
| itemPrice | decimal(10,2) | Item price (excl. shipping/tax) |
| itemCurrency | text | e.g. `GBP` |
| isPrime | boolean | |
| isBusinessOrder | boolean | |
| createdAt | timestamp(tz) | Row creation time |

**Unique index:** `(orgId, amazonOrderId, orderItemId)` — upsert target for order updates.

Run `pnpm db:generate` then `pnpm db:migrate` after adding the table.

## Step 2: Orders API functions (`src/lib/amazon.ts`)

Add four new exported functions using the existing `spApiRequest` helper (which handles auth tokens, rate limit retries, and the EU endpoint):

### `fetchOrders(settings, lastUpdatedAfter)`
- `GET /orders/v0/orders?LastUpdatedAfter={iso}&MarketplaceIds={marketplace_id}&OrderStatuses=Unshipped,Shipped,PartiallyShipped`
- Paginates using `NextToken` from response
- Returns array of raw order objects

### `fetchOrderItems(settings, orderId)`
- `GET /orders/v0/orders/{orderId}/orderItems`
- Returns array of items for a single order
- Includes: ASIN, SellerSKU, Title, QuantityOrdered, QuantityShipped, ItemPrice

### `syncRecentOrders(settings, orgId, lastUpdatedAfter)`
- Orchestrator function:
  1. Fetch orders via `fetchOrders`
  2. For each order, fetch items via `fetchOrderItems`
  3. Flatten into order-item rows
  4. Upsert via `upsertAmazonOrders`
- Returns `{ ordersFound, itemsUpserted }`
- Note: **Pending** orders don't include item pricing — skip or store with price=0

### `upsertAmazonOrders(rows, orgId)`
- Batch insert with `onConflictDoUpdate` on `(orgId, amazonOrderId, orderItemId)`
- Updates: status, quantities, prices, lastUpdateDate on conflict

### Rate limit considerations
- Orders API: burst of 20 requests, then ~1 request per 3 minutes
- `getOrders` returns up to 100 orders per page — typically 1-2 pages per hourly sync
- `getOrderItems` is 1 call per order — with <20 orders/hour, stays within burst
- Existing `spApiRequest` exponential backoff (2s→4s→8s→16s→32s) handles 429s

## Step 3: Cron job (`src/app/api/cron/amazon/route.ts` + `vercel.json`)

Add `orders` as a new case in the existing job switch:

```typescript
case "orders": {
  const lastUpdatedAfter = new Date(Date.now() - 2 * 3600000).toISOString(); // 2h overlap
  const result = await syncRecentOrders(settings, orgId, lastUpdatedAfter);
  // log to syncLogs
}
```

Add to `vercel.json`:
```json
{ "path": "/api/cron/amazon?job=orders", "schedule": "0 * * * *" }
```

Uses 2-hour lookback window (overlap) to catch order status updates.

## Step 4: Supplement Amazon reports (`src/app/api/reports/amazon/route.ts`)

After the existing `amazon_sales_traffic` query, run a second query against `amazon_orders`:
- Group by `date_trunc(purchaseDate)`, sum `itemPrice` as revenue, sum `quantityOrdered` as units
- Only include dates that are **NOT already in** the sales-traffic results
- Exclude canceled orders (`orderStatus != 'Canceled'`)
- Merge into the response — sessions = 0 for order-sourced dates

This means:
- Historical dates → full data from Reports API (revenue + sessions + units)
- Today / yesterday → revenue + units from Orders API, sessions = 0 until the report catches up
- Once the report arrives, it overwrites the order-based data (sales-traffic takes priority)

## Step 5: Sync All button (`src/app/api/reports/sync/route.ts`)

Inside `syncAmazonSales`, after the sales-traffic backfill loop, add:

```typescript
// Also sync recent orders for real-time data
try {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const orderResult = await syncRecentOrders(settings, orgId, since);
  // include in result
} catch (err) {
  errors.push(`orders: ${err.message}`);
}
```

## Files Modified

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `amazonOrders` table definition |
| `src/lib/amazon.ts` | Add `fetchOrders`, `fetchOrderItems`, `syncRecentOrders`, `upsertAmazonOrders` |
| `src/app/api/cron/amazon/route.ts` | Add `orders` case to job switch |
| `src/app/api/reports/amazon/route.ts` | Supplement missing dates with order data |
| `src/app/api/reports/sync/route.ts` | Call `syncRecentOrders` in `syncAmazonSales` |
| `vercel.json` | Add hourly cron entry for `?job=orders` |
| `drizzle/migrations/` | Auto-generated migration for new table |

## SP-API Permissions Required

The Orders API requires the **Direct-to-Consumer Shipping** role in Seller Central for full order data. Basic order info (ID, status, totals) should work with standard permissions. Check in Seller Central → Apps & Services → Develop Apps → your app → App roles.

## Verification

1. `pnpm db:generate && pnpm db:migrate` — migration succeeds
2. `pnpm dev` → Settings → Amazon credentials load correctly
3. Reports → click **Sync All** → orders fetched, toast shows count
4. Reports → Amazon tab → today's revenue appears (from order data)
5. Check DB: `amazon_orders` table has rows with correct ASIN/price/quantity
6. Run sync again → only updated orders re-fetched (incremental)
7. `pnpm build` — no type errors
