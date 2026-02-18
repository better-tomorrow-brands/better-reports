import { NextResponse } from "next/server";
import { upsertFacebookAds } from "@/lib/facebook";
import type { FacebookAdRow } from "@/lib/facebook";

export const maxDuration = 300;

/** Parse a CSV line respecting quoted fields (handles commas inside quotes) */
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
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadUrl = new URL(request.url);
  const orgIdParam = uploadUrl.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.trim().split("\n");

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // CSV column indices → FacebookAdRow fields:
    //  0: Campaign name    1: Day              2: Ad Group         3: Ad
    //  4: utm_campaign     7: Reach            8: Impressions      9: Frequency
    // 12: Results         13: Amount spent    14: Cost per result 17: Link clicks
    // 18: CPC             19: CPM             20: CTR (all)       22: Results ROAS

    const rows: FacebookAdRow[] = [];
    let parseErrors = 0;
    const errorDetails: Array<{ row: number; error: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const cols = parseCsvLine(line);

        // Skip blank rows (all commas / empty fields)
        const date = cols[1]?.trim();
        if (!date) continue;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error(`Invalid date: ${cols[1]}`);
        }

        const spend = Number(cols[13]) || 0;
        const roas = Number(cols[22]) || 0;

        rows.push({
          date,
          campaign_id: "",
          campaign: cols[0]?.trim() || "",
          adset_id: "",
          adset: cols[2]?.trim() || "",
          ad_id: "",
          ad: cols[3]?.trim() || "",
          utm_campaign: cols[4]?.trim() || "",
          reach: Number(cols[7]) || 0,
          impressions: Number(cols[8]) || 0,
          frequency: Number(cols[9]) || 0,
          purchases: Number(cols[12]) || 0,
          spend,
          cost_per_purchase: Number(cols[14]) || 0,
          clicks: Number(cols[17]) || 0,
          cpc: Number(cols[18]) || 0,
          cpm: Number(cols[19]) || 0,
          ctr: Number(cols[20]) || 0,
          roas,
          purchase_value: Math.round(roas * spend * 100) / 100,
          link_clicks: 0,
          shop_clicks: 0,
          landing_page_views: 0,
          cost_per_landing_page_view: 0,
        });
      } catch (error) {
        parseErrors++;
        if (errorDetails.length < 20) {
          errorDetails.push({
            row: i + 1,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    // Deduplicate by (date, campaign, adset, ad) — keep last occurrence
    // Postgres ON CONFLICT can't handle duplicate keys within a single INSERT
    const deduped = new Map<string, FacebookAdRow>();
    for (const row of rows) {
      deduped.set(`${row.date}|${row.campaign}|${row.adset}|${row.ad}`, row);
    }
    const uniqueRows = Array.from(deduped.values());

    const inserted = await upsertFacebookAds(uniqueRows, orgId);

    return NextResponse.json({
      success: true,
      total: lines.length - 1,
      parsed: rows.length,
      duplicatesRemoved: rows.length - uniqueRows.length,
      inserted,
      parseErrors,
      ...(errorDetails.length > 0 && { errorDetails }),
    });
  } catch (error) {
    console.error("Facebook CSV upload error:", error);
    return NextResponse.json(
      {
        error: "Failed to process CSV",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
