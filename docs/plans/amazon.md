# Amazon SP-API Integration Brief

## Context
DooGood and Teevo (two brands, one seller account) — bamboo toilet paper, UK. Reporting app built in Next.js. Replacing Data Studio with custom reporting. This is the Amazon Selling Partner API integration — campaigns/advertising is a separate phase using the Amazon Advertising API.

## What We're Building
Pull sales, traffic and financial transaction data from Amazon SP-API into our database via cron jobs. Two data sources:

1. **Sales & Traffic Report** — revenue, units, sessions, page views by ASIN/date. Used for ROAS numerator and SKU performance.
2. **Finances API** — per-order FBA fees, referral fees, storage, refunds. Used for profitability/margin analysis.

**Important:** These two datasets should NOT be joined by date. Sales & Traffic uses order date; financial transactions post on settlement date. They serve different purposes.

**ROAS = Revenue (Sales & Traffic) / Ad Spend (Campaigns).** Date is the join key. Both align daily. Campaigns data comes in phase 2.

## Two Brands
Single seller account contains two brands: **DooGood** and **Teevo**. Need an `asin_brand_map` table to map ASINs to brands, so we can filter/aggregate reporting per brand.

## API Details
- **API:** Amazon Selling Partner API (SP-API)
- **Auth:** OAuth 2.0 via Login with Amazon (LWA) — no AWS IAM/signatures required (removed Oct 2023)
- **EU endpoint:** `https://sellingpartnerapi-eu.amazon.com`
- **Token endpoint:** `https://api.amazon.com/auth/o2/token`
- **Marketplace:** UK (`A1F83G8C2ARO7P`)
- **App type:** Private, self-authorized (no $1,400 fee)
- **Required roles:** Analytics, Reports, Finance and Accounting

## Auth Flow
Exchange refresh token for 1-hour access token:
```
POST https://api.amazon.com/auth/o2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={SP_API_REFRESH_TOKEN}
&client_id={SP_API_CLIENT_ID}
&client_secret={SP_API_CLIENT_SECRET}
```
Use access token in `x-amz-access-token` header on all SP-API requests.

## Env Vars Needed
```
SP_API_CLIENT_ID=
SP_API_CLIENT_SECRET=
SP_API_REFRESH_TOKEN=
SP_API_MARKETPLACE_ID=A1F83G8C2ARO7P
```

## Report 1: Sales & Traffic
**`GET_SALES_AND_TRAFFIC_REPORT`** (by ASIN, daily granularity) — contains:
- Ordered product sales, revenue, units ordered
- Page views, sessions, buy box percentage
- Aggregated by date and ASIN

Request via Reports API (`/reports/2021-06-30`):
1. `POST /reports/2021-06-30/reports` — create report request
2. Poll `GET /reports/2021-06-30/reports/{reportId}` until status is `DONE`
3. `GET /reports/2021-06-30/documents/{reportDocumentId}` — get download URL
4. Download and decompress (gzip) the report

Upsert rows by date + ASIN so lookback re-fetches overwrite stale numbers.

## Report 2: Financial Transactions
**Finances API** (`/finances/v0/financialEvents`) — contains:
- Per-order FBA fees, referral fees
- Storage fees
- Refunds
- Posts on settlement date (not order date)

Used for profitability/margin calculations, not ROAS.

## Data Lag & Lookback Strategy
- Data has ~48-72 hour lag from Amazon
- Implement lookback schedule: re-fetch days 2, 3, 7, 30 from current date
- Amazon won't return records for ASINs with 0 orders on a given date
- `dataStartTime` can go back up to 2 years

## Cron Schedule (suggested)
- Daily at 06:00 UTC: fetch day-2 and day-3
- Weekly (Monday): fetch day-7
- Monthly (1st): fetch day-30

## Credentials Status
- [ ] Registered as developer in Seller Central
- [ ] Created private app (roles: Analytics, Reports, Finance and Accounting)
- [ ] Got LWA Client ID + Client Secret
- [ ] Self-authorized app, got Refresh Token
- [ ] Tested token exchange

## Product Settings
The settings page includes a product/SKU table that does triple duty:
- **Brand mapping** — ASIN-to-brand (DooGood vs Teevo) for filtering/aggregation
- **Fee rates** — FBA fee and referral fee % per SKU, maintained manually through the settings page
- **Product reference** — SKU name, ASIN, category etc.

The app calculates **estimated daily payout** from Sales & Traffic data using these fee rates, without waiting for settlement. This gives near-real-time margin visibility.

## Phase 2 (separate brief)
Amazon Advertising API for campaign data (Sponsored Products/Brands/Display). Completely separate credentials and auth system. Required for the ad spend side of ROAS calculation.
