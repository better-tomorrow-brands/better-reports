/**
 * Import amazon_financial_events from CSV export (Neon).
 * Run with: npx tsx scripts/import-financials.ts [path]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { readFileSync } from "fs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

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
  const csvPath = process.argv[2] || "tmp/amazon_financial_events.csv";
  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  console.log(`\nImporting ${rows.length} financial events from ${csvPath}\n`);

  const BATCH = 50;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    for (const row of batch) {
      try {
        await db
          .insert(schema.amazonFinancialEvents)
          .values({
            transactionId: row.transaction_id,
            transactionType: row.transaction_type || null,
            postedDate: row.posted_date ? new Date(row.posted_date) : null,
            totalAmount: row.total_amount || null,
            totalCurrency: row.total_currency || null,
            relatedIdentifiers: row.related_identifiers || null,
            items: row.items || null,
            breakdowns: row.breakdowns || null,
          })
          .onConflictDoUpdate({
            target: schema.amazonFinancialEvents.transactionId,
            set: {
              transactionType: row.transaction_type || null,
              postedDate: row.posted_date ? new Date(row.posted_date) : null,
              totalAmount: row.total_amount || null,
              totalCurrency: row.total_currency || null,
              relatedIdentifiers: row.related_identifiers || null,
              items: row.items || null,
              breakdowns: row.breakdowns || null,
            },
          });
        upserted++;
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ❌ ${row.transaction_id?.substring(0, 20)}... — ${msg.substring(0, 80)}`);
      }
    }

    const pct = ((i + batch.length) / rows.length * 100).toFixed(1);
    console.log(`  ✅ ${i + batch.length}/${rows.length} (${pct}%) — ${upserted} upserted, ${errors} errors`);
  }

  console.log(`\n✨ Done! ${upserted} events upserted, ${errors} errors.\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
