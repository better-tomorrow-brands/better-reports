# Facebook Ads Cron

Automated hourly sync of Facebook ad-level performance data to Google Sheets and Neon (dual-write).

## How It Works

1. Vercel cron triggers the `/api/cron/facebook-ads` endpoint on a schedule
2. The endpoint fetches ad-level insights from the Facebook Marketing API (paginated, 500 per page)
3. Data is written to the "Facebook" tab in Google Sheets (delete existing rows for that date, then append)
4. A `utm_campaign` value is looked up from the Campaigns Google Sheet by matching Ad Group name (Sheets path)
5. Separately, `utm_campaign` is looked up from the `campaigns_fcb` DB table (Neon path)
6. Data is upserted into the `facebook_ads` Neon table with the DB-sourced `utm_campaign`

The Sheets and Neon writes are independent — each has its own utm_campaign lookup source.

## Cron Schedules

| Schedule | Endpoint | Purpose |
|---|---|---|
| `5 0 * * *` (daily 00:05 UTC) | `/api/cron/facebook-ads` | Yesterday's final data |
| `0 * * * *` (hourly) | `/api/cron/facebook-ads?date=today` | Today's running data |

The daily cron fetches yesterday's complete data (no further changes expected). The hourly cron fetches today's data and replaces the existing rows for today each time.

## Data Flow

```
Facebook Marketing API (v21.0)
        │
        ▼
getDailyFacebookAds(date) → FacebookAdRow[] (utm_campaign: "")
        │
        ├──▶ syncFacebookAds(date, ads)        [Google Sheets path]
        │       │
        │       ├── lookupUtmCampaigns()        ← Campaigns Google Sheet
        │       ├── Delete existing rows for date
        │       └── Append rows with utm_campaign from Sheet
        │
        └──▶ lookupUtmCampaignsFromDb()         [Neon path]
                │
                ├── Query campaigns_fcb.ad_group + utm_campaign
                ├── Map ads with utm_campaign from DB
                └── upsertFacebookAds(adsWithUtm) → INSERT ... ON CONFLICT UPDATE
```

## utm_campaign Lookup

Two independent lookup sources exist:

### Google Sheets (for the Sheets write)

- **Campaigns Sheet ID:** `1uupcINWhwzT9pVJtBNAQbu9Js7GgYeI2h95G3G3sVnA`
- **Tab:** Campaigns
- **Match:** `adset_name` (lowercased) = `Ad Group` column (lowercased)
- **Returns:** `utm_campaign` column value

### Neon DB (for the DB write)

- **Table:** `campaigns_fcb`
- **Match:** `ad_group` column (lowercased) against `adset_name` (lowercased)
- **Returns:** `utm_campaign` column value
- **Filter:** Only rows where both `ad_group` and `utm_campaign` are non-null

Both are case-insensitive. If no match is found, utm_campaign is left as an empty string.

## Database Schema

### `facebook_ads` table

| Column | Type | Details |
|---|---|---|
| `id` | serial | Primary key |
| `date` | date | Ad date |
| `campaign` | text | Campaign name |
| `adset` | text | Ad set (ad group) name |
| `ad` | text | Ad name |
| `utm_campaign` | text | Looked up from `campaigns_fcb` |
| `spend` | real | Amount spent (GBP) |
| `impressions` | integer | Total impressions |
| `reach` | integer | Unique reach |
| `frequency` | real | Avg frequency |
| `clicks` | integer | Link clicks |
| `cpc` | real | Cost per click |
| `cpm` | real | Cost per 1000 impressions |
| `ctr` | real | Click-through rate |
| `purchases` | integer | Purchase conversions |
| `cost_per_purchase` | real | Cost per purchase |
| `purchase_value` | real | Total purchase value |
| `roas` | real | Return on ad spend |

**Unique index:** `(date, campaign, adset, ad)` — used for upsert conflict resolution.

### `campaigns_fcb` table (attribution lookup)

| Column | Type | Details |
|---|---|---|
| `id` | serial | Primary key |
| `campaign` | text | Facebook campaign name |
| `ad_group` | text | Facebook ad set name (used for utm lookup) |
| `ad` | text | Facebook ad name |
| `product_name` | text | Associated product |
| `product_url` | text | Product URL |
| `sku_suffix` | text | SKU suffix |
| `skus` | text | SKU list |
| `discount_code` | text | Discount code |
| `utm_source` | text | UTM source |
| `utm_medium` | text | UTM medium |
| `utm_campaign` | text | UTM campaign value |
| `utm_term` | text | UTM term |
| `product_template` | text | Template reference |
| `status` | text | active/inactive |

## Google Sheets Columns

The Facebook tab has 26 columns (A-Z):

| Column | Field | Source |
|---|---|---|
| A | Campaign name | Facebook API |
| B | Day | Date parameter |
| C | Ad Group | Facebook API (adset_name) |
| D | Ad | Facebook API (ad_name) |
| E | utm_campaign | Looked up from Campaigns sheet |
| F | Delivery status | Not available from API |
| G | Delivery level | Always "ad" |
| H | Reach | Facebook API |
| I | Impressions | Facebook API |
| J | Frequency | Facebook API |
| K | Attribution setting | Not available from API |
| L | Result Type | "Website purchases" if purchases > 0 |
| M | Results | Purchase count |
| N | Amount spent (GBP) | Facebook API |
| O | Cost per result | Facebook API |
| P | Starts | Not available from API |
| Q | Ends | Not available from API |
| R | Link clicks | Facebook API |
| S | CPC | Facebook API |
| T | CPM | Facebook API |
| U | CTR | Facebook API |
| V | Result value type | "Website purchases conversion value" if value > 0 |
| W | Results ROAS | Calculated: purchase_value / spend |
| X | Website purchase ROAS | Same as Results ROAS |
| Y | Reporting starts | Same as date |
| Z | Reporting ends | Same as date |

## Cron Response

```json
{
  "success": true,
  "date": "2026-02-05",
  "adsCount": 42,
  "dbInserted": 42,
  "action": "synced",
  "rowsDeleted": 42,
  "rowsAdded": 42
}
```

| Field | Source |
|---|---|
| `adsCount` | Rows fetched from Facebook API |
| `dbInserted` | Rows upserted into Neon `facebook_ads` table |
| `rowsDeleted` | Rows removed from Google Sheets for that date |
| `rowsAdded` | Rows appended to Google Sheets |

## Environment Variables

```
FACEBOOK_ACCESS_TOKEN=<long-lived user access token>
FACEBOOK_AD_ACCOUNT_ID=act_1208726206863653
GOOGLE_SHEET_ID=<main spreadsheet ID>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account email>
GOOGLE_PRIVATE_KEY=<service account private key>
DATABASE_URL=<Neon connection string>
```

### Token Renewal

The Facebook access token is a long-lived token valid for ~60 days. Current token expires **April 2, 2026**.

To renew:
1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select the DooGood app
3. Add `ads_read` permission
4. Generate Access Token
5. Extend via [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
6. Update `FACEBOOK_ACCESS_TOKEN` in `.env.local` and Vercel

## Local Development

### Manually trigger cron jobs

**Today's data:**
```
http://localhost:3000/api/cron/facebook-ads?date=today
```

**Yesterday's data:**
```
http://localhost:3000/api/cron/facebook-ads
```

### Backfill endpoints

**Facebook Ads - historical data:**
```
http://localhost:3000/api/backfill/facebook?start=2025-02-06&end=2026-02-01
```

**Facebook utm_campaign - backfill existing rows:**
```
http://localhost:3000/api/backfill/facebook-utm
```

**Facebook campaigns_fcb - CSV upload:**
```
POST http://localhost:3000/api/backfill/facebook-upload
```

## Key Files

| File | Purpose |
|---|---|
| `src/lib/facebook.ts` | Facebook Marketing API client, `getDailyFacebookAds()`, `upsertFacebookAds()`, `lookupUtmCampaignsFromDb()` |
| `src/lib/sheets.ts` | Google Sheets integration — `syncFacebookAds()`, `lookupUtmCampaigns()` (Sheets-based) |
| `src/lib/db/schema.ts` | Drizzle schema — `facebookAds`, `campaignsFcb` tables |
| `src/app/api/cron/facebook-ads/route.ts` | Cron endpoint (dual-write) |
| `src/app/api/backfill/facebook/route.ts` | Historical data backfill |
| `src/app/api/backfill/facebook-utm/route.ts` | utm_campaign backfill (Sheets) |
| `src/app/api/backfill/facebook-upload/route.ts` | CSV upload to `campaigns_fcb` table |
| `vercel.json` | Cron schedule configuration |
