# PostHog Analytics Cron

Automated hourly sync of daily website analytics from PostHog to Google Sheets and Neon (dual-write).

## How It Works

1. Vercel cron triggers the `/api/cron/posthog-analytics` endpoint on a schedule
2. The endpoint runs 6 HogQL queries against the PostHog API to collect daily metrics
3. Data is written to the "PostHog" tab in Google Sheets (upsert by date)
4. Data is upserted into the `posthog_analytics` Neon table (upsert by date)

Both writes happen on every run. The Sheets write creates the tab and headers automatically if missing.

## Cron Schedules

| Schedule | Endpoint | Purpose |
|---|---|---|
| `5 0 * * *` (daily 00:05 UTC) | `/api/cron/posthog-analytics` | Yesterday's final data |
| `0 * * * *` (hourly) | `/api/cron/posthog-analytics?date=today` | Today's running data |

The daily cron fetches yesterday's complete data. The hourly cron overwrites today's row each time with the latest numbers.

## Data Flow

```
PostHog HogQL API
    │
    ├── Traffic query      → unique_visitors, total_sessions, pageviews
    ├── Session query      → bounce_rate, avg_session_duration
    ├── Device query       → mobile_sessions, desktop_sessions
    ├── Country query      → top_country
    ├── Referrer query     → direct/organic/paid/social sessions
    └── Funnel query       → product_views, add_to_cart, checkout_started, purchases
            │
            ▼
     DailyAnalytics object
            │
            ├──▶ appendDailyAnalytics()         [Google Sheets path]
            │       │
            │       ├── Ensure "PostHog" tab exists (create + headers if not)
            │       ├── Find existing row for date
            │       └── Update existing row OR append new row
            │
            └──▶ upsertPosthogAnalytics()       [Neon path]
                    │
                    └── INSERT ... ON CONFLICT (date) UPDATE
```

## Metrics Collected

### Traffic

| Metric | HogQL Source |
|---|---|
| `unique_visitors` | `COUNT(DISTINCT person_id)` |
| `total_sessions` | `COUNT(DISTINCT properties.$session_id)` |
| `pageviews` | `COUNT WHERE event = '$pageview'` |

### Session Quality

| Metric | HogQL Source |
|---|---|
| `bounce_rate` | % of sessions with exactly 1 pageview |
| `avg_session_duration` | Avg seconds between first and last event per session |

### Device Breakdown

| Metric | HogQL Source |
|---|---|
| `mobile_sessions` | Sessions where device_type = mobile or tablet |
| `desktop_sessions` | Sessions where device_type = desktop |
| `top_country` | Country with most distinct visitors (from GeoIP) |

### Traffic Sources

| Metric | HogQL Source |
|---|---|
| `direct_sessions` | No referring domain or `$direct` |
| `organic_sessions` | Referring domain matches Google, Bing, DuckDuckGo, Yahoo |
| `paid_sessions` | Has `gclid`, `fbclid`, `ttclid`, or `msclkid` parameter |
| `social_sessions` | Referring domain matches Facebook, Instagram, Twitter, TikTok, Pinterest, LinkedIn |

### Purchase Funnel

| Metric | HogQL Source |
|---|---|
| `product_views` | `product_viewed` / `Product Viewed` events, or pageviews to `/products/*` |
| `add_to_cart` | `add_to_cart` / `Add to Cart` / `Added to Cart` events |
| `checkout_started` | `checkout_started` / `Checkout Started` / `begin_checkout` events, or pageviews to `/checkout*` |
| `purchases` | `purchase` / `Purchase` / `Order Completed` events, or pageviews to `/thank*` |
| `conversion_rate` | `purchases / unique_visitors * 100` |

Funnel events are matched broadly to handle different Shopify/PostHog naming conventions.

## Database Schema

### `posthog_analytics` table

| Column | Type | Details |
|---|---|---|
| `id` | serial | Primary key |
| `date` | date | Unique — one row per day |
| `unique_visitors` | integer | Distinct visitors |
| `total_sessions` | integer | Distinct sessions |
| `pageviews` | integer | Total pageview events |
| `bounce_rate` | real | Percentage (0-100) |
| `avg_session_duration` | real | Seconds |
| `mobile_sessions` | integer | Mobile + tablet sessions |
| `desktop_sessions` | integer | Desktop sessions |
| `top_country` | text | Country name |
| `direct_sessions` | integer | Direct traffic sessions |
| `organic_sessions` | integer | Organic search sessions |
| `paid_sessions` | integer | Paid traffic sessions |
| `social_sessions` | integer | Social media sessions |
| `product_views` | integer | Product page views |
| `add_to_cart` | integer | Add to cart events |
| `checkout_started` | integer | Checkout starts |
| `purchases` | integer | Purchase completions |
| `conversion_rate` | real | Percentage (0-100) |

**Unique constraint:** `date` column — upsert overwrites existing row for the same date.

## Google Sheets Tab

The "PostHog" tab is created automatically on first run with 18 columns (A-R):

| Column | Field |
|---|---|
| A | date |
| B | unique_visitors |
| C | total_sessions |
| D | pageviews |
| E | bounce_rate |
| F | avg_session_duration |
| G | mobile_sessions |
| H | desktop_sessions |
| I | top_country |
| J | direct_sessions |
| K | organic_sessions |
| L | paid_sessions |
| M | social_sessions |
| N | product_views |
| O | add_to_cart |
| P | checkout_started |
| Q | purchases |
| R | conversion_rate |

Existing rows for the same date are updated in place; new dates are appended.

## Cron Response

```json
{
  "success": true,
  "date": "2026-02-05",
  "analytics": {
    "date": "2026-02-05",
    "unique_visitors": 1234,
    "total_sessions": 1890,
    "pageviews": 4567,
    "bounce_rate": 42.5,
    "avg_session_duration": 185,
    "mobile_sessions": 980,
    "desktop_sessions": 910,
    "top_country": "United Kingdom",
    "direct_sessions": 500,
    "organic_sessions": 600,
    "paid_sessions": 400,
    "social_sessions": 390,
    "product_views": 2100,
    "add_to_cart": 320,
    "checkout_started": 150,
    "purchases": 45,
    "conversion_rate": 3.65
  },
  "sheetAction": "updated"
}
```

| Field | Details |
|---|---|
| `analytics` | Full daily metrics object |
| `sheetAction` | `"updated"` (existing row overwritten) or `"appended"` (new row added) |

## Environment Variables

```
POSTHOG_API_KEY=<PostHog personal API key>
POSTHOG_PROJECT_ID=<PostHog project ID>
POSTHOG_HOST=eu.posthog.com
GOOGLE_SHEET_ID=<main spreadsheet ID>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account email>
GOOGLE_PRIVATE_KEY=<service account private key>
DATABASE_URL=<Neon connection string>
```

`POSTHOG_HOST` defaults to `eu.posthog.com` if not set (EU data residency).

## Local Development

### Manually trigger cron jobs

**Today's data:**
```
http://localhost:3000/api/cron/posthog-analytics?date=today
```

**Yesterday's data:**
```
http://localhost:3000/api/cron/posthog-analytics
```

## Key Files

| File | Purpose |
|---|---|
| `src/lib/posthog.ts` | PostHog HogQL client — `getDailyAnalytics()`, `upsertPosthogAnalytics()` |
| `src/lib/sheets.ts` | Google Sheets integration — `appendDailyAnalytics()`, `ensureDailyAnalyticsSheet()` |
| `src/lib/db/schema.ts` | Drizzle schema — `posthogAnalytics` table |
| `src/app/api/cron/posthog-analytics/route.ts` | Cron endpoint (dual-write) |
| `vercel.json` | Cron schedule configuration |
