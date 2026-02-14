import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { getAmazonAdsSettings } from "@/lib/settings";
import {
  getAmazonAdsAccessToken,
  getPendingReports,
  getReportStatus,
  downloadReport,
  upsertSpAdsRows,
  markReportStatus,
  cleanupOldReports,
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
  const timestamp = new Date();

  try {
    const settings = await getAmazonAdsSettings(orgId);
    if (!settings) {
      return NextResponse.json({ error: "Amazon Ads settings not configured" }, { status: 400 });
    }

    const pending = await getPendingReports(orgId);
    if (pending.length === 0) {
      return NextResponse.json({ success: true, message: "No pending reports", timestamp });
    }

    // Get access token
    const token = await getAmazonAdsAccessToken(settings);

    const collected: { reportDate: string; rows: number }[] = [];
    const failures: { reportDate: string; reason: string }[] = [];
    const stillProcessing: string[] = [];

    for (const report of pending) {
      try {
        const status = await getReportStatus(token.access_token, settings, report.reportId);

        if (status.status === "COMPLETED" && status.url) {
          const rows = await downloadReport(status.url);
          const upserted = await upsertSpAdsRows(rows, orgId);
          await markReportStatus(report.id, "completed");
          collected.push({ reportDate: report.reportDate, rows: upserted });
        } else if (status.status === "FAILURE") {
          await markReportStatus(report.id, "failed");
          failures.push({ reportDate: report.reportDate, reason: status.failureReason || "Unknown" });
        } else {
          // Still processing — leave as pending for next run
          stillProcessing.push(report.reportDate);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "RATE_LIMITED") {
          // Back off — stop processing more reports this run
          console.warn("Rate limited by Amazon Ads API, stopping collection");
          stillProcessing.push(report.reportDate);
          break;
        }
        await markReportStatus(report.id, "failed");
        failures.push({
          reportDate: report.reportDate,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clean up old completed/failed rows
    await cleanupOldReports();

    const summary = {
      job: "amazon-ads-collect",
      collected: collected.length,
      failed: failures.length,
      stillProcessing: stillProcessing.length,
      details: { collected, failures, stillProcessing },
    };

    await db.insert(syncLogs).values({
      orgId,
      source: "amazon-ads-collect",
      status: failures.length > 0 && collected.length === 0 ? "error" : "success",
      syncedAt: timestamp,
      details: JSON.stringify(summary),
    });

    return NextResponse.json({ success: true, ...summary, timestamp });
  } catch (error) {
    console.error("Amazon Ads collect error:", error);

    await db.insert(syncLogs).values({
      orgId,
      source: "amazon-ads-collect",
      status: "error",
      syncedAt: timestamp,
      details: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    });

    return NextResponse.json(
      { error: "Failed to collect Amazon Ads reports", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
