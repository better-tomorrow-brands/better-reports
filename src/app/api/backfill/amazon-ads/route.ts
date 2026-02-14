import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSpAds } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { getAmazonAdsSettings } from "@/lib/settings";
import {
  getAmazonAdsAccessToken,
  createSpCampaignReport,
  getReportStatus,
  downloadReport,
  upsertSpAdsRows,
} from "@/lib/amazon-ads";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const orgIdParam = url.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  const days = parseInt(url.searchParams.get("days") || "60");
  const batchSize = parseInt(url.searchParams.get("batch") || "5");

  const settings = await getAmazonAdsSettings(orgId);
  if (!settings) {
    return NextResponse.json(
      { error: "Amazon Ads settings not configured" },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    const token = await getAmazonAdsAccessToken(settings);
    accessToken = token.access_token;
  } catch (err) {
    return NextResponse.json(
      { error: `Token exchange failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 },
    );
  }

  // Build date list (last N days, excluding today)
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  // Get dates we already have to skip them
  const existingRows = await db
    .select({ date: amazonSpAds.date })
    .from(amazonSpAds)
    .where(sql`${amazonSpAds.orgId} = ${orgId}`)
    .groupBy(amazonSpAds.date);
  const existingDates = new Set(existingRows.map((r) => r.date));

  const toFetch = dates.filter((d) => !existingDates.has(d));

  if (toFetch.length === 0) {
    return NextResponse.json({
      success: true,
      summary: { total: dates.length, skipped: dates.length, fetched: 0, rows: 0, errors: 0 },
      results: dates.map((d) => ({ date: d, status: "skipped" })),
    });
  }

  // Process in batches — each batch: create reports → poll → download → upsert
  const results: Array<{ date: string; status: string; rows?: number; error?: string }> = [];
  // Add skipped dates to results
  for (const d of dates) {
    if (existingDates.has(d)) {
      results.push({ date: d, status: "skipped" });
    }
  }

  let totalRows = 0;
  const deadline = Date.now() + 270_000; // stop 30s before maxDuration

  for (let batchStart = 0; batchStart < toFetch.length; batchStart += batchSize) {
    if (Date.now() > deadline) {
      // Mark remaining as timeout
      for (let j = batchStart; j < toFetch.length; j++) {
        results.push({ date: toFetch[j], status: "timeout" });
      }
      break;
    }

    const batch = toFetch.slice(batchStart, batchStart + batchSize);
    console.log(`Amazon Ads backfill: batch ${Math.floor(batchStart / batchSize) + 1}, dates: ${batch.join(", ")}`);

    // Create report requests in parallel
    const requests = await Promise.allSettled(
      batch.map(async (reportDate) => {
        const report = await createSpCampaignReport(accessToken, settings, reportDate);
        return { reportDate, reportId: report.reportId };
      }),
    );

    const pending: { reportDate: string; reportId: string }[] = [];
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      if (r.status === "fulfilled") {
        pending.push(r.value);
      } else {
        results.push({ date: batch[i], status: "error", error: `Request: ${r.reason?.message || "Unknown"}` });
      }
    }

    // Poll until all complete or timeout (max 3 min per batch)
    const batchDeadline = Math.min(Date.now() + 180_000, deadline);
    const remaining = [...pending];

    while (remaining.length > 0 && Date.now() < batchDeadline) {
      await new Promise((r) => setTimeout(r, 15_000));

      for (let i = remaining.length - 1; i >= 0; i--) {
        const { reportDate, reportId } = remaining[i];
        try {
          const status = await getReportStatus(accessToken, settings, reportId);
          if (status.status === "COMPLETED" && status.url) {
            const rows = await downloadReport(status.url);
            const upserted = await upsertSpAdsRows(rows, orgId);
            totalRows += upserted;
            results.push({ date: reportDate, status: "success", rows: upserted });
            remaining.splice(i, 1);
            console.log(`Amazon Ads backfill ${reportDate}: ${upserted} rows`);
          } else if (status.status === "FAILURE") {
            results.push({ date: reportDate, status: "error", error: status.failureReason || "Report failed" });
            remaining.splice(i, 1);
          }
        } catch (err) {
          if (err instanceof Error && err.message === "RATE_LIMITED") break;
          results.push({ date: reportDate, status: "error", error: err instanceof Error ? err.message : "Unknown" });
          remaining.splice(i, 1);
        }
      }
    }

    // Mark any still-processing as timeout
    for (const { reportDate } of remaining) {
      results.push({ date: reportDate, status: "timeout" });
    }

    // Brief pause between batches to avoid rate limits
    if (batchStart + batchSize < toFetch.length) {
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  // Sort results by date
  results.sort((a, b) => a.date.localeCompare(b.date));

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const timeoutCount = results.filter((r) => r.status === "timeout").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  return NextResponse.json({
    success: true,
    summary: {
      total: results.length,
      fetched: successCount,
      rows: totalRows,
      skipped: skippedCount,
      errors: errorCount,
      timeouts: timeoutCount,
    },
    results,
  });
}
