/**
 * Import Amazon Ads campaign data from a manually downloaded CSV.
 * Aggregates ad group / search term rows up to campaign level per day.
 *
 * Run with: npx tsx scripts/import-ads-csv.ts --file=tmp/my-report.csv
 *
 * Options:
 *   --file=PATH     Path to CSV file (required)
 *   --org=N         Org ID (default: 1)
 *   --dry-run       Show what would be imported without writing to DB
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { readFileSync } from "fs";

// ── Config ───────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  acc[key] = val ?? "true";
  return acc;
}, {} as Record<string, string>);

const FILE_PATH = args.file;
if (!FILE_PATH) {
  console.error("Usage: npx tsx scripts/import-ads-csv.ts --file=path/to/report.csv");
  process.exit(1);
}

const ORG_ID = parseInt(args.org || "1");
const DRY_RUN = args["dry-run"] === "true";

// ── DB Setup ─────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL!;
const sql = neon(dbUrl);
const db = drizzle(sql, { schema });

// ── CSV Parsing ──────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDate(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;

  const trimmed = raw.trim();

  // DD/MM/YYYY
  const ukMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // "Apr 01, 2025" or "January 15, 2025"
  const namedMatch = new Date(trimmed);
  if (!isNaN(namedMatch.getTime()) && trimmed.match(/[A-Za-z]/)) {
    return namedMatch.toISOString().split("T")[0];
  }

  // YYYY-MM-DD
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return trimmed;
  }

  return null;
}

function parseNumber(raw: string): number {
  if (!raw || raw.trim() === "" || raw === "-") return 0;
  // Strip £, ¬£, %, commas
  const cleaned = raw.replace(/[£¬%,]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── Main ─────────────────────────────────────────────────

interface CampaignDayKey {
  date: string;
  campaignName: string;
}

interface CampaignDayData {
  currency: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales7d: number;
  purchases7d: number;
  unitsSoldClicks7d: number;
  unitsSoldSameSku7d: number;
  attributedSalesSameSku7d: number;
}

async function main() {
  const dbHost = dbUrl.match(/@([^/]+)\//)?.[1] || "unknown";
  const maskedHost = dbHost.length > 10 ? dbHost.slice(0, 8) + "..." + dbHost.slice(-6) : dbHost;

  console.log(`\n📊 Amazon Ads CSV Import`);
  console.log(`   DB host: ${maskedHost}`);
  console.log(`   File: ${FILE_PATH}`);
  console.log(`   Org: ${ORG_ID}`);
  if (DRY_RUN) console.log(`   ⚠️  DRY RUN — no data will be written`);
  console.log();

  // Read CSV
  const content = readFileSync(FILE_PATH, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    console.error("CSV has no data rows");
    process.exit(1);
  }

  // Parse header to find column indices
  const headers = parseCSVLine(lines[0]);
  const colIndex = (name: string): number => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
    if (idx === -1) console.warn(`  ⚠️  Column "${name}" not found in CSV`);
    return idx;
  };

  const iDate = colIndex("Date") !== -1 ? colIndex("Date") : colIndex("Start date");
  const iCurrency = colIndex("Currency");
  const iCampaign = colIndex("Campaign Name");
  const iImpressions = colIndex("Impressions");
  const iClicks = colIndex("Clicks");
  const iSpend = colIndex("Spend");
  const iSales = colIndex("7 Day Total Sales");
  const iOrders = colIndex("7 Day Total Orders");
  const iUnits = colIndex("7 Day Total Units");
  const iAdvUnits = colIndex("7 Day Advertised SKU Units");
  const iOtherUnits = colIndex("7 Day Other SKU Units");
  const iAdvSales = colIndex("7 Day Advertised SKU Sales");

  if (iDate === -1 || iCampaign === -1) {
    console.error("Required columns (Date, Campaign Name) not found");
    process.exit(1);
  }

  // Fetch dates that already have API data — skip those to avoid double-counting
  const existingRows = await sql`SELECT DISTINCT date FROM amazon_sp_ads WHERE org_id = ${ORG_ID}`;
  const existingDates = new Set(existingRows.map((r) => {
    const d = r.date as string | Date;
    return typeof d === "string" ? d.split("T")[0] : new Date(d).toISOString().split("T")[0];
  }));
  console.log(`📋 Found ${existingDates.size} dates already in DB (will skip)\n`);

  // Parse rows and aggregate by date + campaign
  const aggregated = new Map<string, CampaignDayData>();
  let skippedNoDate = 0;
  let skippedExisting = 0;
  let totalRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const date = parseDate(fields[iDate]);

    if (!date) {
      skippedNoDate++;
      continue;
    }

    if (existingDates.has(date)) {
      skippedExisting++;
      continue;
    }

    const campaignName = fields[iCampaign] || "Unknown";
    const key = `${date}||${campaignName}`;
    totalRows++;

    const existing = aggregated.get(key) || {
      currency: "",
      impressions: 0,
      clicks: 0,
      spend: 0,
      sales7d: 0,
      purchases7d: 0,
      unitsSoldClicks7d: 0,
      unitsSoldSameSku7d: 0,
      attributedSalesSameSku7d: 0,
    };

    existing.currency = iCurrency !== -1 ? (fields[iCurrency] || "GBP") : "GBP";
    existing.impressions += iImpressions !== -1 ? parseNumber(fields[iImpressions]) : 0;
    existing.clicks += iClicks !== -1 ? parseNumber(fields[iClicks]) : 0;
    existing.spend += iSpend !== -1 ? parseNumber(fields[iSpend]) : 0;
    existing.sales7d += iSales !== -1 ? parseNumber(fields[iSales]) : 0;
    existing.purchases7d += iOrders !== -1 ? parseNumber(fields[iOrders]) : 0;
    existing.unitsSoldClicks7d += iUnits !== -1 ? parseNumber(fields[iUnits]) : 0;
    existing.unitsSoldSameSku7d += iAdvUnits !== -1 ? parseNumber(fields[iAdvUnits]) : 0;
    existing.attributedSalesSameSku7d += iAdvSales !== -1 ? parseNumber(fields[iAdvSales]) : 0;

    aggregated.set(key, existing);
  }

  console.log(`📋 Parsed ${totalRows} data rows → ${aggregated.size} campaign-day records`);
  if (skippedNoDate > 0) console.log(`   Skipped ${skippedNoDate} rows with no date`);
  if (skippedExisting > 0) console.log(`   Skipped ${skippedExisting} rows for dates already in DB`);

  // Show date range
  const dates = [...new Set([...aggregated.keys()].map((k) => k.split("||")[0]))].sort();
  console.log(`   Date range: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log();

  // Show top 5 preview
  const entries = [...aggregated.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  console.log(`   Preview (first 5):`);
  for (const [key, data] of entries.slice(0, 5)) {
    const [date, campaign] = key.split("||");
    console.log(`   ${date} | ${campaign.slice(0, 40).padEnd(40)} | spend: £${data.spend.toFixed(2)} | sales: £${data.sales7d.toFixed(2)}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log(`⚠️  DRY RUN — stopping here. Remove --dry-run to import.\n`);
    return;
  }

  // Upsert into DB
  let success = 0;
  let errors = 0;

  for (const [key, data] of entries) {
    const [date, campaignName] = key.split("||");

    try {
      const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
      const cpc = data.clicks > 0 ? data.spend / data.clicks : 0;
      const acos = data.sales7d > 0 ? (data.spend / data.sales7d) * 100 : null;
      const roas = data.spend > 0 ? data.sales7d / data.spend : null;

      const values = {
        orgId: ORG_ID,
        date,
        campaignId: campaignName, // use name as ID for CSV imports
        campaignName,
        campaignStatus: null,
        campaignBudgetAmount: null,
        campaignBudgetType: null,
        campaignBudgetCurrencyCode: data.currency,
        campaignRuleBasedBudgetAmount: null,
        campaignBiddingStrategy: null,
        campaignApplicableBudgetRuleId: null,
        campaignApplicableBudgetRuleName: null,
        impressions: Math.round(data.impressions),
        clicks: Math.round(data.clicks),
        cost: Math.round(data.spend * 100) / 100,
        spend: Math.round(data.spend * 100) / 100,
        costPerClick: Math.round(cpc * 100) / 100,
        clickThroughRate: Math.round(ctr * 100) / 100,
        topOfSearchImpressionShare: null,
        sales1d: null,
        sales7d: Math.round(data.sales7d * 100) / 100,
        sales14d: null,
        sales30d: null,
        attributedSalesSameSku1d: null,
        attributedSalesSameSku7d: Math.round(data.attributedSalesSameSku7d * 100) / 100,
        attributedSalesSameSku14d: null,
        attributedSalesSameSku30d: null,
        purchases1d: null,
        purchases7d: Math.round(data.purchases7d),
        purchases14d: null,
        purchases30d: null,
        purchasesSameSku1d: null,
        purchasesSameSku7d: null,
        purchasesSameSku14d: null,
        purchasesSameSku30d: null,
        unitsSoldClicks1d: null,
        unitsSoldClicks7d: Math.round(data.unitsSoldClicks7d),
        unitsSoldClicks14d: null,
        unitsSoldClicks30d: null,
        unitsSoldSameSku1d: null,
        unitsSoldSameSku7d: Math.round(data.unitsSoldSameSku7d),
        unitsSoldSameSku14d: null,
        unitsSoldSameSku30d: null,
        acosClicks14d: acos !== null ? Math.round(acos * 100) / 100 : null,
        roasClicks14d: roas !== null ? Math.round(roas * 100) / 100 : null,
        addToList: null,
        updatedAt: new Date(),
      };

      await db
        .insert(schema.amazonSpAds)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.amazonSpAds.orgId, schema.amazonSpAds.date, schema.amazonSpAds.campaignId],
          set: { ...values, createdAt: undefined },
        });

      success++;
    } catch (err) {
      errors++;
      console.error(`❌ ${date} | ${campaignName.slice(0, 30)} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n✨ Done! ${success} campaign-day records upserted, ${errors} errors\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
