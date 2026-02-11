import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import path from "path";

export const maxDuration = 60;

function stripCurrency(val: string | undefined): string | null {
  if (!val || val === "-" || val === "TBC") return null;
  return val.replace(/[£$,]/g, "");
}

function parseDecimal(val: string | undefined): string | null {
  const stripped = stripCurrency(val);
  if (!stripped || isNaN(Number(stripped))) return null;
  return stripped;
}

function parseInt_(val: string | undefined): number | null {
  if (!val || val === "-" || val === "TBC") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function scientificToText(val: string | undefined): string | null {
  if (!val || val === "-" || val === "TBC") return null;
  // Handle scientific notation (e.g. 6.46681E+11)
  if (val.includes("E+") || val.includes("e+")) {
    const num = Number(val);
    if (!isNaN(num)) return num.toFixed(0);
  }
  return val;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && secret !== "dev-backfill") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgIdParam = url.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  try {
    const csvPath = path.join(process.cwd(), "tmp", "product_database.csv");
    const csvContent = readFileSync(csvPath, "utf-8");

    // Parse CSV - use columns: false so we get arrays (handles duplicate column names)
    const records: string[][] = parse(csvContent, {
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    });

    // Skip header row
    const rows = records.slice(1);

    let upserted = 0;
    for (const row of rows) {
      // Map by position:
      // 0: SKU, 1: Product description, 2: Brand, 3: Unit Barcode, 4: Amazon ASIN
      // 5: Shippo SKU, 6: Pieces/Pack, 7: Pack Weight, 8: Pack Length, 9: Pack Width
      // 10: Pack Height, 11: Unit CBM, 12: Dimensional weight
      // 13: Unit price USD, 14: Unit price GBP, 15: Pack cost GBP
      // 16: Landed Cost, 17: Unit LCOGS, 18: RRP (first), 19: PP Unit
      // 20: Carton Barcode, 21: Units per MC, 22: Pieces per MC, 23: Gross Weight
      // 24: Carton Width, 25: Carton Length, 26: Carton Height, 27: Carton CBM
      // 28: RRP (second - this is RRP ex.VAT)
      // Note: CSV has 30 columns (0-29), RRP at pos 18, RRP ex.VAT at pos 29

      const sku = row[0]?.trim();
      if (!sku) continue;

      await db
        .insert(products)
        .values({
          orgId,
          sku,
          productName: row[1]?.trim() || null,
          brand: row[2]?.trim() || null,
          unitBarcode: scientificToText(row[3]?.trim()),
          asin: row[4]?.trim() === "TBC" ? null : row[4]?.trim() || null,
          shippoSku: row[5]?.trim() === "-" ? null : row[5]?.trim() || null,
          piecesPerPack: parseInt_(row[6]?.trim()),
          packWeightKg: parseDecimal(row[7]?.trim()),
          packLengthCm: parseDecimal(row[8]?.trim()),
          packWidthCm: parseDecimal(row[9]?.trim()),
          packHeightCm: parseDecimal(row[10]?.trim()),
          unitCbm: parseDecimal(row[11]?.trim()),
          dimensionalWeight: parseDecimal(row[12]?.trim()),
          unitPriceUsd: parseDecimal(row[13]?.trim()),
          unitPriceGbp: parseDecimal(row[14]?.trim()),
          packCostGbp: parseDecimal(row[15]?.trim()),
          landedCost: parseDecimal(row[16]?.trim()),
          unitLcogs: parseDecimal(row[17]?.trim()),
          dtcRrp: parseDecimal(row[18]?.trim()),
          ppUnit: parseDecimal(row[19]?.trim()),
          cartonBarcode: scientificToText(row[20]?.trim()),
          unitsPerMasterCarton: parseInt_(row[21]?.trim()),
          piecesPerMasterCarton: parseInt_(row[22]?.trim()),
          grossWeightKg: parseDecimal(row[23]?.trim()),
          cartonWidthCm: parseDecimal(row[24]?.trim()),
          cartonLengthCm: parseDecimal(row[25]?.trim()),
          cartonHeightCm: parseDecimal(row[26]?.trim()),
          cartonCbm: parseDecimal(row[27]?.trim()),
          dtcRrpExVat: parseDecimal(row[29]?.trim()),
          active: true,
        })
        .onConflictDoUpdate({
          target: products.sku,
          set: {
            productName: sql`excluded.product_name`,
            brand: sql`excluded.brand`,
            unitBarcode: sql`excluded.unit_barcode`,
            asin: sql`excluded.asin`,
            shippoSku: sql`excluded.shippo_sku`,
            piecesPerPack: sql`excluded.pieces_per_pack`,
            packWeightKg: sql`excluded.pack_weight_kg`,
            packLengthCm: sql`excluded.pack_length_cm`,
            packWidthCm: sql`excluded.pack_width_cm`,
            packHeightCm: sql`excluded.pack_height_cm`,
            unitCbm: sql`excluded.unit_cbm`,
            dimensionalWeight: sql`excluded.dimensional_weight`,
            unitPriceUsd: sql`excluded.unit_price_usd`,
            unitPriceGbp: sql`excluded.unit_price_gbp`,
            packCostGbp: sql`excluded.pack_cost_gbp`,
            landedCost: sql`excluded.landed_cost`,
            unitLcogs: sql`excluded.unit_lcogs`,
            dtcRrp: sql`excluded.dtc_rrp`,
            ppUnit: sql`excluded.pp_unit`,
            cartonBarcode: sql`excluded.carton_barcode`,
            unitsPerMasterCarton: sql`excluded.units_per_master_carton`,
            piecesPerMasterCarton: sql`excluded.pieces_per_master_carton`,
            grossWeightKg: sql`excluded.gross_weight_kg`,
            cartonWidthCm: sql`excluded.carton_width_cm`,
            cartonLengthCm: sql`excluded.carton_length_cm`,
            cartonHeightCm: sql`excluded.carton_height_cm`,
            cartonCbm: sql`excluded.carton_cbm`,
            dtcRrpExVat: sql`excluded.dtc_rrp_ex_vat`,
            updatedAt: new Date(),
          },
        });

      upserted++;
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      upserted,
    });
  } catch (error) {
    console.error("Products backfill error:", error);
    return NextResponse.json(
      {
        error: "Backfill failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
