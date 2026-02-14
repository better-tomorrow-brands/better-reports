/**
 * Import amazon_sales_traffic from CSV export (Neon).
 * Run with: npx tsx scripts/import-sales-traffic.ts [path]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { readFileSync } from "fs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// Pass --org=<id> to target a specific org; defaults to 1
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  acc[key] = val;
  return acc;
}, {} as Record<string, string>);
const ORG_ID = parseInt(args.org || "1");

function parseCSV(content: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of content) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  const csvPath = process.argv[2] || "tmp/amazon_sales_traffic.csv";
  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  console.log(`\nImporting ${rows.length} sales/traffic rows from ${csvPath}\n`);

  const BATCH = 50;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    for (const row of batch) {
      try {
        const values = {
          orgId: ORG_ID,
          date: row.date,
          parentAsin: row.parent_asin || null,
          childAsin: row.child_asin,
          unitsOrdered: parseInt(row.units_ordered) || 0,
          unitsOrderedB2b: parseInt(row.units_ordered_b2b) || 0,
          orderedProductSales: row.ordered_product_sales || "0",
          orderedProductSalesB2b: row.ordered_product_sales_b2b || "0",
          totalOrderItems: parseInt(row.total_order_items) || 0,
          totalOrderItemsB2b: parseInt(row.total_order_items_b2b) || 0,
          browserSessions: parseInt(row.browser_sessions) || 0,
          mobileSessions: parseInt(row.mobile_sessions) || 0,
          sessions: parseInt(row.sessions) || 0,
          browserSessionPercentage: parseFloat(row.browser_session_percentage) || 0,
          mobileSessionPercentage: parseFloat(row.mobile_session_percentage) || 0,
          sessionPercentage: parseFloat(row.session_percentage) || 0,
          browserPageViews: parseInt(row.browser_page_views) || 0,
          mobilePageViews: parseInt(row.mobile_page_views) || 0,
          pageViews: parseInt(row.page_views) || 0,
          browserPageViewsPercentage: parseFloat(row.browser_page_views_percentage) || 0,
          mobilePageViewsPercentage: parseFloat(row.mobile_page_views_percentage) || 0,
          pageViewsPercentage: parseFloat(row.page_views_percentage) || 0,
          buyBoxPercentage: parseFloat(row.buy_box_percentage) || 0,
          unitSessionPercentage: parseFloat(row.unit_session_percentage) || 0,
          unitSessionPercentageB2b: parseFloat(row.unit_session_percentage_b2b) || 0,
        };

        await db
          .insert(schema.amazonSalesTraffic)
          .values(values)
          .onConflictDoUpdate({
            target: [schema.amazonSalesTraffic.orgId, schema.amazonSalesTraffic.date, schema.amazonSalesTraffic.childAsin],
            set: values,
          });
        upserted++;
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ❌ ${row.date} ${row.child_asin} — ${msg.substring(0, 80)}`);
      }
    }

    const pct = ((i + batch.length) / rows.length * 100).toFixed(1);
    console.log(`  ✅ ${i + batch.length}/${rows.length} (${pct}%) — ${upserted} upserted, ${errors} errors`);
  }

  console.log(`\n✨ Done! ${upserted} rows upserted, ${errors} errors.\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
