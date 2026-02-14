# Shopify Orders Migration Plan

Migrate the Google Apps Script orders webhook to Better Reports.

## Overview

**Current flow:** Shopify webhook → Google Apps Script → Google Sheets
**New flow:** Shopify webhook → Better Reports API → Neon DB (+ optional Sheets sync)

## Phase 1: Database Schema

Add an `orders` table to store incoming Shopify orders:

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  shopify_id TEXT NOT NULL UNIQUE,
  order_number TEXT,
  email TEXT,
  customer_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  fulfillment_status TEXT,
  fulfilled_at TIMESTAMPTZ,
  subtotal DECIMAL(10, 2),
  shipping DECIMAL(10, 2),
  tax DECIMAL(10, 2),
  total DECIMAL(10, 2),
  discount_codes TEXT,
  skus TEXT,
  quantity INTEGER,
  utm_source TEXT,
  utm_campaign TEXT,
  utm_medium TEXT,
  utm_content TEXT,
  utm_term TEXT,
  tracking_number TEXT,
  tags TEXT,
  has_conversion_data BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files to modify:**
- `src/lib/db/schema.ts` — add orders table

**Commands:**
- `pnpm db:generate` — generate migration
- `pnpm db:migrate` — apply to dev DB

---

## Phase 2: Settings Page Update

Add Shopify credentials section to Settings page (alongside existing Meta section):

**Fields:**
- Store domain (e.g. `doogoodhq.myshopify.com`)
- Access token (from existing custom app)
- Webhook secret (for HMAC verification)

**Files to modify:**
- `src/lib/settings.ts` — add `ShopifySettings` interface + get/save functions
- `src/app/settings/page.tsx` — add Shopify section to UI
- `src/app/api/settings/route.ts` — handle Shopify settings in GET/POST

---

## Phase 3: Webhook Endpoint

Create `/api/webhooks/shopify/orders` to receive order webhooks.

**Webhook handler will:**
1. Verify HMAC signature (using webhook secret)
2. Parse order payload
3. Fetch UTM data from Shopify Customer Journey API (if available)
4. Fall back to Campaigns lookup (discount code → SKU matching)
5. Upsert order row in Neon

**Files to create:**
- `src/app/api/webhooks/shopify/orders/route.ts` — webhook handler
- `src/lib/shopify-orders.ts` — helper functions (UTM fetch, campaigns lookup, data mapping)

**Make route public:**
- Update `src/proxy.ts` to include `/api/webhooks/shopify/(.*)`

---

## Phase 4: Campaigns Table & Lookup

Create a `campaigns` table in Neon to store attribution rules. When an order has no UTM data from Shopify, we look up attribution by discount code or SKU.

**Schema:**

```sql
CREATE TABLE ad_campaigns (
  id SERIAL PRIMARY KEY,
  campaign TEXT,
  ad_group TEXT,
  ad TEXT,
  product_name TEXT,
  product_url TEXT,
  sku_suffix TEXT,
  skus TEXT,
  discount_code TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  product_template TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Lookup logic (same as existing script):**
1. First: match by `discount_code` (exact, case-insensitive)
2. Second: match by `skus` (comma-separated list, any SKU match)
3. Return: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`

**Files to modify:**
- `src/lib/db/schema.ts` — add `adCampaigns` table
- `src/lib/shopify-orders.ts` — add `getAttributionFromCampaigns()` function

**Future:** Add a Campaigns management UI to create/edit/import campaign rows. For now, we can seed data via SQL or Drizzle Studio.

---

## Phase 5: Shopify Webhook Registration

User manually creates webhook in Shopify Admin:

1. Go to Shopify Admin → Settings → Notifications → Webhooks
2. Add webhook:
   - Event: `Order creation`
   - URL: `https://app.better-tomorrow.co/api/webhooks/shopify/orders`
   - Format: JSON
3. Add another webhook:
   - Event: `Order update`
   - Same URL
4. Copy the webhook signing secret
5. Add to Better Reports Settings page

**Display in Settings page:** Show the webhook URL for easy copying.

---

## Phase 6: Orders UI (Optional)

Add a basic Orders page to view incoming orders.

**Features:**
- Table with key columns (order #, customer, total, UTM, status)
- Filter by date range
- Search by customer/order number
- Pagination

**Files to create:**
- `src/app/orders/page.tsx` — orders list UI

---

## Implementation Order

1. **Schema** — Add orders table, run migration
2. **Settings** — Add Shopify section to Settings page
3. **Webhook** — Build `/api/webhooks/shopify/orders` endpoint
4. **Lookup** — Add campaigns attribution lookup
5. **Test** — Register webhook in Shopify, place test order
6. **UI** — Build Orders page (can do later)

---

## Environment Variables

No new env vars needed — Shopify credentials stored in Settings (encrypted in DB).

---

## Files Summary

| File | Action |
|------|--------|
| `src/lib/db/schema.ts` | Add orders + adCampaigns tables |
| `src/lib/settings.ts` | Add ShopifySettings |
| `src/lib/shopify-orders.ts` | New: order processing helpers + campaigns lookup |
| `src/app/settings/page.tsx` | Add Shopify section |
| `src/app/api/settings/route.ts` | Handle Shopify settings |
| `src/app/api/webhooks/shopify/orders/route.ts` | New: webhook handler |
| `src/proxy.ts` | Make Shopify webhooks public |
| `src/app/orders/page.tsx` | New: orders list UI (optional) |

---

## Rollout

1. Deploy to production
2. Add Shopify credentials to Settings (production)
3. Register webhooks in Shopify pointing to `app.better-tomorrow.co`
4. Keep Google Apps Script running in parallel initially
5. Once verified, disable Google Apps Script webhook
