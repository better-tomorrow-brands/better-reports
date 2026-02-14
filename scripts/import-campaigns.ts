import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { campaignsFcb } from "../src/lib/db/schema";
import { readFileSync } from "fs";
import { resolve } from "path";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Pass --org=<id> to target a specific org; defaults to 1
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  acc[key] = val;
  return acc;
}, {} as Record<string, string>);
const ORG_ID = parseInt(args.org || "1");

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function main() {
  const csvPath = resolve(__dirname, "..", "tmp", "campaigns.csv");
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.trim().split("\n");

  // Header: Campaign,Ad Group,Ad,product_name,product_url,sku_suffix,skus,disocunt_code,utm_source,utm_medium,utm_campaign,utm_term,product_template,Status
  // Index:  0        1        2   3            4           5          6    7              8          9          10           11       12               13

  let inserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols[0] && !cols[1] && !cols[10]) continue; // skip fully empty rows

    const status = (cols[13] || "").toLowerCase() === "on" ? "active" : "inactive";

    await db.insert(campaignsFcb).values({
      orgId: ORG_ID,
      campaign: cols[0] || null,
      adGroup: cols[1] || null,
      ad: cols[2] || null,
      productName: cols[3] || null,
      productUrl: cols[4] || null,
      skuSuffix: cols[5] || null,
      skus: cols[6] || null,
      discountCode: cols[7] || null,
      utmSource: cols[8] || null,
      utmMedium: cols[9] || null,
      utmCampaign: cols[10] || null,
      utmTerm: cols[11] || null,
      productTemplate: cols[12] || null,
      status,
    });

    inserted++;
    console.log(`Inserted: ${cols[0]} / ${cols[1]} / ${cols[10] || "(no utm)"}`);
  }

  console.log(`\nDone: ${inserted} campaigns inserted`);
}

main().catch(console.error);
