# Facebook Ads Cron

Automated hourly sync of Facebook ad-level performance data to Google Sheets.

## How It Works

1. Vercel cron triggers the `/api/cron/facebook-ads` endpoint on a schedule
2. The endpoint fetches ad-level insights from the Facebook Marketing API
3. Data is written to the "Facebook" tab in Google Sheets
4. A `utm_campaign` value is looked up from the Campaigns sheet by matching the Ad Group name

## Cron Schedules

| Schedule | Endpoint | Purpose |
|---|---|---|
| `5 0 * * *` (daily 00:05 UTC) | `/api/cron/facebook-ads` | Yesterday's final data |
| `0 * * * *` (hourly) | `/api/cron/facebook-ads?date=today` | Today's running data |

The daily cron fetches yesterday's complete data (no further changes expected). The hourly cron fetches today's data and replaces the existing rows for today each time (delete + re-add).

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

## utm_campaign Lookup

For each ad row, the system looks up `utm_campaign` from a separate Campaigns spreadsheet:

- **Campaigns Sheet ID:** `1uupcINWhwzT9pVJtBNAQbu9Js7GgYeI2h95G3G3sVnA`
- **Tab:** Campaigns
- **Match:** Facebook `adset_name` (Ad Group) = Campaigns sheet `Ad Group` column
- **Returns:** Campaigns sheet `utm_campaign` column value
- **No match:** Cell is left blank (no error)

The Ad Group names in Facebook Ads Manager must exactly match the Ad Group names in the Campaigns sheet (case-insensitive).

## Environment Variables

```
FACEBOOK_ACCESS_TOKEN=<long-lived user access token>
FACEBOOK_AD_ACCOUNT_ID=act_1208726206863653
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

### Start dev server

```bash
pnpm dev
```

Server runs at `http://localhost:3000`.

### Manually trigger cron jobs

**Facebook Ads - today's data:**
```
http://localhost:3000/api/cron/facebook-ads?date=today
```

**Facebook Ads - yesterday's data:**
```
http://localhost:3000/api/cron/facebook-ads
```

**PostHog Analytics - today's data:**
```
http://localhost:3000/api/cron/posthog-analytics?date=today
```

**PostHog Analytics - yesterday's data:**
```
http://localhost:3000/api/cron/posthog-analytics
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

## Key Files

| File | Purpose |
|---|---|
| `src/lib/facebook.ts` | Facebook Marketing API client, fetches ad-level insights |
| `src/lib/sheets.ts` | Google Sheets integration, sync/append/backfill functions |
| `src/app/api/cron/facebook-ads/route.ts` | Cron endpoint |
| `src/app/api/backfill/facebook/route.ts` | Historical data backfill |
| `src/app/api/backfill/facebook-utm/route.ts` | utm_campaign backfill |
| `vercel.json` | Cron schedule configuration |
