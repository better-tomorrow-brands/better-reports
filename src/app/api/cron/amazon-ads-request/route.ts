import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { getAmazonAdsSettings } from "@/lib/settings";
import {
  getAmazonAdsAccessToken,
  createSpCampaignReport,
  storePendingReport,
  getLookbackDates,
} from "@/lib/amazon-ads";

export const maxDuration = 60;

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

    // Step 1 — Get access token
    const token = await getAmazonAdsAccessToken(settings);

    // Step 2 — Create report requests in parallel
    const dates = getLookbackDates();
    const results = await Promise.allSettled(
      dates.map(async (reportDate) => {
        const report = await createSpCampaignReport(token.access_token, settings, reportDate);
        await storePendingReport(orgId, report.reportId, reportDate);
        return { reportDate, reportId: report.reportId };
      }),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ reportDate: string; reportId: string }>).value);
    const failed = results.filter((r) => r.status === "rejected").map((r, i) => ({
      reportDate: dates[i],
      error: (r as PromiseRejectedResult).reason?.message || "Unknown",
    }));

    const summary = {
      job: "amazon-ads-request",
      requested: succeeded.length,
      failed: failed.length,
      reports: succeeded,
      errors: failed,
    };

    await db.insert(syncLogs).values({
      orgId,
      source: "amazon-ads-request",
      status: failed.length === dates.length ? "error" : "success",
      syncedAt: timestamp,
      details: JSON.stringify(summary),
    });

    return NextResponse.json({ success: true, ...summary, timestamp });
  } catch (error) {
    console.error("Amazon Ads request error:", error);

    await db.insert(syncLogs).values({
      orgId,
      source: "amazon-ads-request",
      status: "error",
      syncedAt: timestamp,
      details: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    });

    return NextResponse.json(
      { error: "Failed to create Amazon Ads reports", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
