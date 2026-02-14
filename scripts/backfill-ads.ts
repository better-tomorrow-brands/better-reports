/**
 * Standalone Amazon Ads (Sponsored Products) backfill script.
 * Run with: npx tsx scripts/backfill-ads.ts --start=2025-01-15 --end=2025-02-14
 *
 * Creates one async report per day, polls until ready, downloads + upserts.
 * Skips dates already in the database.
 * Can be interrupted and re-run safely (upserts + skip logic).
 *
 * Options:
 *   --start=YYYY-MM-DD   Start date (default: 30 days ago)
 *   --end=YYYY-MM-DD     End date (default: yesterday)
 *   --org=N              Org ID (default: 1)
 *   --delay=N            Delay in ms between report requests (default: 5000)
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { gunzipSync } from "zlib";

// ── Config ───────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  acc[key] = val;
  return acc;
}, {} as Record<string, string>);

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

const START_DATE = args.start || daysAgo(30);
const END_DATE = args.end || daysAgo(1); // yesterday (today's data not ready)
const ORG_ID = parseInt(args.org || "1");
const DELAY_MS = parseInt(args.delay || "5000");

// ── DB Setup ─────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL!;
const sql = neon(dbUrl);
const db = drizzle(sql, { schema });

// ── Settings (read directly from DB) ─────────────────────
import { decrypt } from "../src/lib/crypto";

interface AmazonAdsSettings {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  profile_id: string;
}

async function getSettings(): Promise<AmazonAdsSettings> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'amazon_ads'`;
  if (!rows.length) throw new Error("Amazon Ads settings not found in DB");
  const decrypted = decrypt(rows[0].value as string);
  return JSON.parse(decrypted);
}

// ── Auth ─────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(settings: AmazonAdsSettings): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const res = await fetch("https://api.amazon.co.uk/auth/o2/token", {
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

// ── Ads API helpers ──────────────────────────────────────
const ADS_ENDPOINT = "https://advertising-api-eu.amazon.com";

function adsHeaders(accessToken: string, settings: AmazonAdsSettings) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Amazon-Advertising-API-ClientId": settings.client_id,
    "Amazon-Advertising-API-Scope": settings.profile_id,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Report columns (same as amazon-ads.ts) ───────────────
const SP_CAMPAIGN_COLUMNS = [
  "date", "campaignId", "campaignName", "campaignStatus",
  "campaignBudgetAmount", "campaignBudgetType", "campaignBudgetCurrencyCode",
  "campaignRuleBasedBudgetAmount", "campaignBiddingStrategy",
  "campaignApplicableBudgetRuleId", "campaignApplicableBudgetRuleName",
  "impressions", "clicks", "cost", "spend", "costPerClick", "clickThroughRate",
  "topOfSearchImpressionShare",
  "sales1d", "sales7d", "sales14d", "sales30d",
  "attributedSalesSameSku1d", "attributedSalesSameSku7d", "attributedSalesSameSku14d", "attributedSalesSameSku30d",
  "purchases1d", "purchases7d", "purchases14d", "purchases30d",
  "purchasesSameSku1d", "purchasesSameSku7d", "purchasesSameSku14d", "purchasesSameSku30d",
  "unitsSoldClicks1d", "unitsSoldClicks7d", "unitsSoldClicks14d", "unitsSoldClicks30d",
  "unitsSoldSameSku1d", "unitsSoldSameSku7d", "unitsSoldSameSku14d", "unitsSoldSameSku30d",
  "acosClicks14d", "roasClicks14d",
  "addToList",
];

// ── Fetch one day's report ───────────────────────────────
async function fetchDay(settings: AmazonAdsSettings, date: string, orgId: number): Promise<number> {
  const token = await getAccessToken(settings);

  // 1. Create report
  const createRes = await fetch(`${ADS_ENDPOINT}/reporting/reports`, {
    method: "POST",
    headers: {
      ...adsHeaders(token, settings),
      "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
    },
    body: JSON.stringify({
      name: `spCampaigns ${date}`,
      startDate: date,
      endDate: date,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: SP_CAMPAIGN_COLUMNS,
        reportTypeId: "spCampaigns",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Create report failed (${createRes.status}): ${text}`);
  }

  const { reportId } = await createRes.json();

  // 2. Poll until ready
  let downloadUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const freshToken = await getAccessToken(settings);
    const statusRes = await fetch(`${ADS_ENDPOINT}/reporting/reports/${reportId}`, {
      headers: adsHeaders(freshToken, settings),
    });

    if (statusRes.status === 429) {
      console.log(`    ⏳ Rate limited polling, waiting 10s...`);
      await sleep(10000);
      continue;
    }

    if (!statusRes.ok) {
      const text = await statusRes.text();
      throw new Error(`Poll failed (${statusRes.status}): ${text}`);
    }

    const statusData = await statusRes.json();

    if (statusData.status === "COMPLETED") {
      downloadUrl = statusData.url;
      break;
    }
    if (statusData.status === "FAILURE") {
      throw new Error(`Report failed: ${statusData.failureReason || "unknown"}`);
    }
  }

  if (!downloadUrl) throw new Error("Report did not complete in time");

  // 3. Download + decompress
  const downloadRes = await fetch(downloadUrl);
  if (!downloadRes.ok) throw new Error(`Download failed (${downloadRes.status})`);
  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  const rows = JSON.parse(gunzipSync(buffer).toString("utf-8")) as Record<string, unknown>[];

  // 4. Upsert
  for (const row of rows) {
    const values = {
      orgId,
      date: row.date as string,
      campaignId: String(row.campaignId),
      campaignName: (row.campaignName as string) ?? null,
      campaignStatus: (row.campaignStatus as string) ?? null,
      campaignBudgetAmount: (row.campaignBudgetAmount as number) ?? null,
      campaignBudgetType: (row.campaignBudgetType as string) ?? null,
      campaignBudgetCurrencyCode: (row.campaignBudgetCurrencyCode as string) ?? null,
      campaignRuleBasedBudgetAmount: (row.campaignRuleBasedBudgetAmount as number) ?? null,
      campaignBiddingStrategy: (row.campaignBiddingStrategy as string) ?? null,
      campaignApplicableBudgetRuleId: (row.campaignApplicableBudgetRuleId as string) ?? null,
      campaignApplicableBudgetRuleName: (row.campaignApplicableBudgetRuleName as string) ?? null,
      impressions: (row.impressions as number) ?? 0,
      clicks: (row.clicks as number) ?? 0,
      cost: (row.cost as number) ?? 0,
      spend: (row.spend as number) ?? null,
      costPerClick: (row.costPerClick as number) ?? null,
      clickThroughRate: (row.clickThroughRate as number) ?? null,
      topOfSearchImpressionShare: (row.topOfSearchImpressionShare as number) ?? null,
      sales1d: (row.sales1d as number) ?? null,
      sales7d: (row.sales7d as number) ?? null,
      sales14d: (row.sales14d as number) ?? null,
      sales30d: (row.sales30d as number) ?? null,
      attributedSalesSameSku1d: (row.attributedSalesSameSku1d as number) ?? null,
      attributedSalesSameSku7d: (row.attributedSalesSameSku7d as number) ?? null,
      attributedSalesSameSku14d: (row.attributedSalesSameSku14d as number) ?? null,
      attributedSalesSameSku30d: (row.attributedSalesSameSku30d as number) ?? null,
      purchases1d: (row.purchases1d as number) ?? null,
      purchases7d: (row.purchases7d as number) ?? null,
      purchases14d: (row.purchases14d as number) ?? null,
      purchases30d: (row.purchases30d as number) ?? null,
      purchasesSameSku1d: (row.purchasesSameSku1d as number) ?? null,
      purchasesSameSku7d: (row.purchasesSameSku7d as number) ?? null,
      purchasesSameSku14d: (row.purchasesSameSku14d as number) ?? null,
      purchasesSameSku30d: (row.purchasesSameSku30d as number) ?? null,
      unitsSoldClicks1d: (row.unitsSoldClicks1d as number) ?? null,
      unitsSoldClicks7d: (row.unitsSoldClicks7d as number) ?? null,
      unitsSoldClicks14d: (row.unitsSoldClicks14d as number) ?? null,
      unitsSoldClicks30d: (row.unitsSoldClicks30d as number) ?? null,
      unitsSoldSameSku1d: (row.unitsSoldSameSku1d as number) ?? null,
      unitsSoldSameSku7d: (row.unitsSoldSameSku7d as number) ?? null,
      unitsSoldSameSku14d: (row.unitsSoldSameSku14d as number) ?? null,
      unitsSoldSameSku30d: (row.unitsSoldSameSku30d as number) ?? null,
      acosClicks14d: (row.acosClicks14d as number) ?? null,
      roasClicks14d: (row.roasClicks14d as number) ?? null,
      addToList: (row.addToList as number) ?? null,
      updatedAt: new Date(),
    };

    await db
      .insert(schema.amazonSpAds)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.amazonSpAds.orgId, schema.amazonSpAds.date, schema.amazonSpAds.campaignId],
        set: { ...values, createdAt: undefined },
      });
  }

  return rows.length;
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  const dbHost = dbUrl.match(/@([^/]+)\//)?.[1] || "unknown";
  const maskedHost = dbHost.length > 10 ? dbHost.slice(0, 8) + "..." + dbHost.slice(-6) : dbHost;

  console.log(`\n🚀 Amazon Ads (SP Campaigns) Backfill`);
  console.log(`   DB host: ${maskedHost}`);
  console.log(`   Range: ${START_DATE} → ${END_DATE}`);
  console.log(`   Org: ${ORG_ID}`);
  console.log(`   Delay: ${DELAY_MS / 1000}s between reports\n`);

  const settings = await getSettings();

  // Test auth
  console.log(`🔑 Testing auth...`);
  await getAccessToken(settings);
  console.log(`   Auth OK\n`);

  // Get existing dates
  const existingRows = await sql`SELECT DISTINCT date FROM amazon_sp_ads WHERE org_id = ${ORG_ID}`;
  const existingDates = new Set(existingRows.map((r) => {
    const d = r.date as string | Date;
    return typeof d === "string" ? d.split("T")[0] : new Date(d).toISOString().split("T")[0];
  }));
  console.log(`📋 Existing dates in DB: ${existingDates.size}\n`);

  // Build date list
  const dates: string[] = [];
  const current = new Date(START_DATE);
  const end = new Date(END_DATE);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  const toProcess = dates.filter((d) => !existingDates.has(d)).reverse(); // most recent first
  console.log(`   Total dates: ${dates.length}, to process: ${toProcess.length}, skipping: ${dates.length - toProcess.length}\n`);

  if (toProcess.length === 0) {
    console.log(`✨ Nothing to do — all dates already in DB!\n`);
    return;
  }

  let success = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const date = toProcess[i];
    const pct = ((i / toProcess.length) * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const avgPerDate = i > 0 ? elapsed / i : DELAY_MS / 1000;
    const eta = Math.round(((toProcess.length - i) * avgPerDate) / 60);

    try {
      const rows = await fetchDay(settings, date, ORG_ID);
      success++;
      console.log(
        `✅ ${date} — ${rows} campaigns  ` +
        `[${i + 1}/${toProcess.length} ${pct}% | ETA: ${eta}min | ✅${success} ❌${errors}]`
      );
    } catch (err) {
      errors++;
      console.error(
        `❌ ${date} — ${err instanceof Error ? err.message : err}  ` +
        `[${i + 1}/${toProcess.length}]`
      );
    }

    // Delay between reports (skip on last)
    if (i < toProcess.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const totalElapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `\n✨ Done! ${success} dates succeeded, ${errors} failed ` +
    `out of ${toProcess.length} dates in ${totalElapsed}s\n`
  );
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
