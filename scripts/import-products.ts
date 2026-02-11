/**
 * Import products from CSV export (Neon).
 * Run with: npx tsx scripts/import-products.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { readFileSync } from "fs";
import { parse } from "path";

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

  // Handle quoted fields with newlines
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
        i++; // skip escaped quote
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

function toNum(val: string | undefined): string | null {
  if (!val || val.trim() === "") return null;
  return val.trim();
}

function toInt(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function toBool(val: string | undefined): boolean {
  return val?.toLowerCase() === "true";
}

async function main() {
  const csvPath = process.argv[2] || "tmp/product_database.csv";
  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  console.log(`\nImporting ${rows.length} products from ${csvPath}\n`);

  let upserted = 0;
  for (const row of rows) {
    await db
      .insert(schema.products)
      .values({
        orgId: ORG_ID,
        sku: row.sku,
        productName: row.product_name || null,
        brand: row.brand || null,
        unitBarcode: row.unit_barcode || null,
        asin: row.asin || null,
        parentAsin: row.parent_asin || null,
        shippoSku: row.shippo_sku || null,
        piecesPerPack: toInt(row.pieces_per_pack),
        packWeightKg: toNum(row.pack_weight_kg),
        packLengthCm: toNum(row.pack_length_cm),
        packWidthCm: toNum(row.pack_width_cm),
        packHeightCm: toNum(row.pack_height_cm),
        unitCbm: toNum(row.unit_cbm),
        dimensionalWeight: toNum(row.dimensional_weight),
        unitPriceUsd: toNum(row.unit_price_usd),
        unitPriceGbp: toNum(row.unit_price_gbp),
        packCostGbp: toNum(row.pack_cost_gbp),
        landedCost: toNum(row.landed_cost),
        unitLcogs: toNum(row.unit_lcogs),
        dtcRrp: toNum(row.dtc_rrp),
        ppUnit: toNum(row.pp_unit),
        dtcRrpExVat: toNum(row.dtc_rrp_ex_vat),
        amazonRrp: toNum(row.amazon_rrp),
        fbaFee: toNum(row.fba_fee),
        referralPercent: toNum(row.referral_percent),
        dtcFulfillmentFee: toNum(row.dtc_fulfillment_fee),
        dtcCourier: toNum(row.dtc_courier),
        cartonBarcode: row.carton_barcode || null,
        unitsPerMasterCarton: toInt(row.units_per_master_carton),
        piecesPerMasterCarton: toInt(row.pieces_per_master_carton),
        grossWeightKg: toNum(row.gross_weight_kg),
        cartonWidthCm: toNum(row.carton_width_cm),
        cartonLengthCm: toNum(row.carton_length_cm),
        cartonHeightCm: toNum(row.carton_height_cm),
        cartonCbm: toNum(row.carton_cbm),
        active: toBool(row.active),
      })
      .onConflictDoUpdate({
        target: [schema.products.orgId, schema.products.sku],
        set: {
          productName: row.product_name || null,
          brand: row.brand || null,
          unitBarcode: row.unit_barcode || null,
          asin: row.asin || null,
          parentAsin: row.parent_asin || null,
          shippoSku: row.shippo_sku || null,
          piecesPerPack: toInt(row.pieces_per_pack),
          packWeightKg: toNum(row.pack_weight_kg),
          packLengthCm: toNum(row.pack_length_cm),
          packWidthCm: toNum(row.pack_width_cm),
          packHeightCm: toNum(row.pack_height_cm),
          unitCbm: toNum(row.unit_cbm),
          dimensionalWeight: toNum(row.dimensional_weight),
          unitPriceUsd: toNum(row.unit_price_usd),
          unitPriceGbp: toNum(row.unit_price_gbp),
          packCostGbp: toNum(row.pack_cost_gbp),
          landedCost: toNum(row.landed_cost),
          unitLcogs: toNum(row.unit_lcogs),
          dtcRrp: toNum(row.dtc_rrp),
          ppUnit: toNum(row.pp_unit),
          dtcRrpExVat: toNum(row.dtc_rrp_ex_vat),
          amazonRrp: toNum(row.amazon_rrp),
          fbaFee: toNum(row.fba_fee),
          referralPercent: toNum(row.referral_percent),
          dtcFulfillmentFee: toNum(row.dtc_fulfillment_fee),
          dtcCourier: toNum(row.dtc_courier),
          cartonBarcode: row.carton_barcode || null,
          unitsPerMasterCarton: toInt(row.units_per_master_carton),
          piecesPerMasterCarton: toInt(row.pieces_per_master_carton),
          grossWeightKg: toNum(row.gross_weight_kg),
          cartonWidthCm: toNum(row.carton_width_cm),
          cartonLengthCm: toNum(row.carton_length_cm),
          cartonHeightCm: toNum(row.carton_height_cm),
          cartonCbm: toNum(row.carton_cbm),
          active: toBool(row.active),
          updatedAt: new Date(),
        },
      });

    upserted++;
    console.log(`  ✅ ${row.sku} — ${row.product_name}`);
  }

  console.log(`\n✨ Done! ${upserted} products upserted.\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
