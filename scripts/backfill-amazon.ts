/**
 * Standalone Amazon Sales & Traffic backfill script.
 * Run with: npx tsx scripts/backfill-amazon.ts --start=2025-01-01 --end=2026-02-07
 *
 * Respects SP-API rate limits (65s between report requests).
 * Skips dates already in the database.
 * Can be interrupted and resumed safely (upserts + skip logic).
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

const START_DATE = args.start || "2025-01-01";
const END_DATE = args.end || new Date().toISOString().split("T")[0];
const DELAY_MS = parseInt(args.delay || "65000"); // 65s default

// ── DB Setup ─────────────────────────────────────────────
const sql = neon(process.env.DATABASE_URL!);
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
      const backoff = Math.min(2000 * Math.pow(2, attempt), 120000);
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

// ── Fetch one day's report ───────────────────────────────
async function fetchDay(settings: Awaited<ReturnType<typeof getSettings>>, date: string) {
  // Create report
  const createRes = await spApi("/reports/2021-06-30/reports", settings, {
    method: "POST",
    body: JSON.stringify({
      reportType: "GET_SALES_AND_TRAFFIC_REPORT",
      marketplaceIds: [settings.marketplace_id],
      dataStartTime: `${date}T00:00:00Z`,
      dataEndTime: `${date}T23:59:59Z`,
      reportOptions: { dateGranularity: "DAY", asinGranularity: "CHILD" },
    }),
  });

  if (!createRes!.ok) throw new Error(`Create report failed (${createRes!.status}): ${await createRes!.text()}`);
  const { reportId } = await createRes!.json();

  // Poll
  let reportDocumentId: string | null = null;
  for (let i = 0; i < 20; i++) {
    await sleep(10000);
    const statusRes = await spApi(`/reports/2021-06-30/reports/${reportId}`, settings);
    const statusData = await statusRes!.json();

    if (statusData.processingStatus === "DONE") {
      reportDocumentId = statusData.reportDocumentId;
      break;
    }
    if (statusData.processingStatus === "CANCELLED" || statusData.processingStatus === "FATAL") {
      throw new Error(`Report failed: ${statusData.processingStatus}`);
    }
  }

  if (!reportDocumentId) throw new Error("Report did not complete in time");

  // Get document
  const docRes = await spApi(`/reports/2021-06-30/documents/${reportDocumentId}`, settings);
  const docData = await docRes!.json();

  // Download + decompress
  const downloadRes = await fetch(docData.url);
  let reportJson: Record<string, unknown>;
  if (docData.compressionAlgorithm === "GZIP") {
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    reportJson = JSON.parse(gunzipSync(buffer).toString("utf-8"));
  } else {
    reportJson = await downloadRes.json();
  }

  // Parse
  const entries = (reportJson.salesAndTrafficByAsin ?? []) as Record<string, unknown>[];
  const rows = entries.map((entry) => {
    const sales = (entry.salesByAsin ?? {}) as Record<string, unknown>;
    const traffic = (entry.trafficByAsin ?? {}) as Record<string, unknown>;
    const ops = sales.orderedProductSales as Record<string, unknown> | undefined;
    const opsB2b = sales.orderedProductSalesB2B as Record<string, unknown> | undefined;

    return {
      date,
      parentAsin: String(entry.parentAsin ?? ""),
      childAsin: String(entry.childAsin ?? ""),
      unitsOrdered: Number(sales.unitsOrdered ?? 0),
      unitsOrderedB2b: Number(sales.unitsOrderedB2B ?? 0),
      orderedProductSales: String(ops?.amount ?? "0"),
      orderedProductSalesB2b: String(opsB2b?.amount ?? "0"),
      totalOrderItems: Number(sales.totalOrderItems ?? 0),
      totalOrderItemsB2b: Number(sales.totalOrderItemsB2B ?? 0),
      browserSessions: Number(traffic.browserSessions ?? 0),
      mobileSessions: Number(traffic.mobileAppSessions ?? 0),
      sessions: Number(traffic.sessions ?? 0),
      browserSessionPercentage: Number(traffic.browserSessionPercentage ?? 0),
      mobileSessionPercentage: Number(traffic.mobileAppSessionPercentage ?? 0),
      sessionPercentage: Number(traffic.sessionPercentage ?? 0),
      browserPageViews: Number(traffic.browserPageViews ?? 0),
      mobilePageViews: Number(traffic.mobileAppPageViews ?? 0),
      pageViews: Number(traffic.pageViews ?? 0),
      browserPageViewsPercentage: Number(traffic.browserPageViewsPercentage ?? 0),
      mobilePageViewsPercentage: Number(traffic.mobileAppPageViewsPercentage ?? 0),
      pageViewsPercentage: Number(traffic.pageViewsPercentage ?? 0),
      buyBoxPercentage: Number(traffic.buyBoxPercentage ?? 0),
      unitSessionPercentage: Number(traffic.unitSessionPercentage ?? 0),
      unitSessionPercentageB2b: Number(traffic.unitSessionPercentageB2B ?? 0),
    };
  });

  // Upsert
  for (const row of rows) {
    await db
      .insert(schema.amazonSalesTraffic)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.amazonSalesTraffic.date, schema.amazonSalesTraffic.childAsin],
        set: { ...row },
      });
  }

  return rows.length;
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  const settings = await getSettings();
  console.log(`\n🚀 Amazon Sales & Traffic Backfill`);
  console.log(`   Range: ${START_DATE} → ${END_DATE}`);
  console.log(`   Delay: ${DELAY_MS / 1000}s between reports\n`);

  // Get existing dates
  const existingRows = await sql`SELECT DISTINCT date FROM amazon_sales_traffic`;
  const existingDates = new Set(existingRows.map((r) => {
    const d = r.date as string | Date;
    return typeof d === "string" ? d.split("T")[0] : new Date(d).toISOString().split("T")[0];
  }));
  console.log(`   Existing dates in DB: ${existingDates.size}\n`);

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

  let success = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const date = toProcess[i];
    const pct = ((i / toProcess.length) * 100).toFixed(1);
    const eta = Math.round(((toProcess.length - i) * DELAY_MS) / 60000);

    try {
      const rows = await fetchDay(settings, date);
      success++;
      console.log(`✅ ${date} — ${rows} ASINs  [${i + 1}/${toProcess.length} ${pct}% | ETA: ${eta}min | ✅${success} ❌${errors}]`);
    } catch (err) {
      errors++;
      console.error(`❌ ${date} — ${err instanceof Error ? err.message : err}  [${i + 1}/${toProcess.length}]`);
    }

    // Wait between reports (skip delay on last one)
    if (i < toProcess.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n✨ Done! ${success} succeeded, ${errors} failed out of ${toProcess.length} dates\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
