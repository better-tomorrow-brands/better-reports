import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { amazonSalesTraffic, facebookAds, posthogAnalytics } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAmazonSettings } from "@/lib/settings";
import {
  fetchSalesTrafficReport,
  upsertSalesTraffic,
  fetchFinancialEvents,
  upsertFinancialEvents,
} from "@/lib/amazon";
import {
  getDailyFacebookAds,
  upsertFacebookAds,
  lookupUtmCampaignsFromDb,
  getTodayDateLondon,
} from "@/lib/facebook";
import {
  getDailyAnalytics,
  upsertPosthogAnalytics,
  getYesterdayDateLondon,
} from "@/lib/posthog";

export const maxDuration = 300;

// ── Helpers ──────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Returns dates from (afterDate, upToDate] — exclusive start, inclusive end */
function dateRange(afterDate: string, upToDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(afterDate + "T12:00:00Z"); // noon to avoid DST issues
  const end = new Date(upToDate + "T12:00:00Z");
  current.setUTCDate(current.getUTCDate() + 1);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function getLatestDate(
  table: typeof amazonSalesTraffic | typeof facebookAds | typeof posthogAnalytics,
  orgId: number
): Promise<string | null> {
  const result = await db
    .select({ maxDate: sql<string>`MAX(${table.date})` })
    .from(table)
    .where(eq(table.orgId, orgId));
  return result[0]?.maxDate || null;
}

// ── Per-source sync logic ────────────────────────────────

interface SourceResult {
  status: "ok" | "partial" | "error" | "skipped";
  latestBefore: string | null;
  latestAfter: string | null;
  datesSynced: number;
  errors: string[];
}

async function syncAmazonSales(orgId: number): Promise<SourceResult> {
  const errors: string[] = [];
  let latestBefore: string | null = null;

  try {
    latestBefore = await getLatestDate(amazonSalesTraffic, orgId);
  } catch (err) {
    console.error("syncAmazonSales: getLatestDate failed:", err);
    return { status: "error", latestBefore: null, latestAfter: null, datesSynced: 0, errors: [`DB query failed: ${err instanceof Error ? err.message : "Unknown"}`] };
  }

  let settings;
  try {
    settings = await getAmazonSettings(orgId);
  } catch (err) {
    console.error("syncAmazonSales: getAmazonSettings failed:", err);
    return { status: "error", latestBefore, latestAfter: latestBefore, datesSynced: 0, errors: [`Settings decrypt failed: ${err instanceof Error ? err.message : "Unknown"}`] };
  }
  if (!settings) {
    return { status: "skipped", latestBefore, latestAfter: latestBefore, datesSynced: 0, errors: ["No Amazon settings configured"] };
  }

  // Fetch up to today — if a date has no data yet, Amazon returns empty (safe to retry)
  const cutoff = getTodayDateLondon();
  // If no data at all, go back 30 days
  const fromDate = latestBefore || formatDate(new Date(Date.now() - 30 * 86400000));
  const dates = dateRange(fromDate, cutoff);

  if (dates.length === 0) {
    return { status: "ok", latestBefore, latestAfter: latestBefore, datesSynced: 0, errors: [] };
  }

  let synced = 0;
  for (const date of dates) {
    try {
      const rows = await fetchSalesTrafficReport(settings, date, date);
      if (rows.length > 0) {
        await upsertSalesTraffic(rows, orgId);
      }
      synced++;
    } catch (err) {
      errors.push(`${date}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Also run finances (last 3 days, same as cron)
  try {
    const postedAfter = new Date(Date.now() - 3 * 86400000).toISOString();
    const postedBefore = new Date(Date.now() - 3 * 60000).toISOString();
    const txns = await fetchFinancialEvents(settings, postedAfter, postedBefore);
    if (txns.length > 0) {
      await upsertFinancialEvents(txns, orgId);
    }
  } catch (err) {
    errors.push(`finances: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  const latestAfter = await getLatestDate(amazonSalesTraffic, orgId);

  return {
    status: errors.length === 0 ? "ok" : synced > 0 ? "partial" : "error",
    latestBefore,
    latestAfter,
    datesSynced: synced,
    errors,
  };
}

async function syncFacebook(orgId: number): Promise<SourceResult> {
  const errors: string[] = [];
  let latestBefore: string | null = null;

  try {
    latestBefore = await getLatestDate(facebookAds, orgId);
  } catch (err) {
    console.error("syncFacebook: getLatestDate failed:", err);
    return { status: "error", latestBefore: null, latestAfter: null, datesSynced: 0, errors: [`DB query failed: ${err instanceof Error ? err.message : "Unknown"}`] };
  }

  const today = getTodayDateLondon();
  const fromDate = latestBefore || formatDate(new Date(Date.now() - 30 * 86400000));
  const dates = dateRange(fromDate, today);

  if (dates.length === 0) {
    return { status: "ok", latestBefore, latestAfter: latestBefore, datesSynced: 0, errors: [] };
  }

  // Load UTM mapping once
  let utmMap: Map<string, string>;
  try {
    utmMap = await lookupUtmCampaignsFromDb();
  } catch {
    utmMap = new Map();
    errors.push("UTM lookup failed — ads saved without UTM mapping");
  }

  let synced = 0;
  for (const date of dates) {
    try {
      const ads = await getDailyFacebookAds(date);
      const adsWithUtm = ads.map((ad) => ({
        ...ad,
        utm_campaign: utmMap.get(ad.adset.toLowerCase()) || "",
      }));
      await upsertFacebookAds(adsWithUtm, orgId);
      synced++;
    } catch (err) {
      errors.push(`${date}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  const latestAfter = await getLatestDate(facebookAds, orgId);

  return {
    status: errors.length === 0 ? "ok" : synced > 0 ? "partial" : "error",
    latestBefore,
    latestAfter,
    datesSynced: synced,
    errors,
  };
}

async function syncPosthog(orgId: number): Promise<SourceResult> {
  const errors: string[] = [];
  let latestBefore: string | null = null;

  try {
    latestBefore = await getLatestDate(posthogAnalytics, orgId);
  } catch (err) {
    console.error("syncPosthog: getLatestDate failed:", err);
    return { status: "error", latestBefore: null, latestAfter: null, datesSynced: 0, errors: [`DB query failed: ${err instanceof Error ? err.message : "Unknown"}`] };
  }

  const yesterday = getYesterdayDateLondon();
  const fromDate = latestBefore || formatDate(new Date(Date.now() - 30 * 86400000));
  const dates = dateRange(fromDate, yesterday);

  if (dates.length === 0) {
    return { status: "ok", latestBefore, latestAfter: latestBefore, datesSynced: 0, errors: [] };
  }

  let synced = 0;
  for (const date of dates) {
    try {
      const analytics = await getDailyAnalytics(date);
      await upsertPosthogAnalytics(analytics, orgId);
      synced++;
    } catch (err) {
      errors.push(`${date}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  const latestAfter = await getLatestDate(posthogAnalytics, orgId);

  return {
    status: errors.length === 0 ? "ok" : synced > 0 ? "partial" : "error",
    latestBefore,
    latestAfter,
    datesSynced: synced,
    errors,
  };
}

// ── Main handler ─────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    // Run all sources in parallel — each handles its own gap detection
    const [amazon, facebook, posthog] = await Promise.all([
      syncAmazonSales(orgId),
      syncFacebook(orgId),
      syncPosthog(orgId),
    ]);

    const sources = { amazon, facebook, posthog };
    const totalSynced = amazon.datesSynced + facebook.datesSynced + posthog.datesSynced;
    const allOk = Object.values(sources).every((s) => s.status === "ok" || s.status === "skipped");

    // Build human-readable summary
    const labels: Record<string, string> = { amazon: "Amazon", facebook: "Facebook", posthog: "PostHog" };
    const parts: string[] = [];
    for (const [name, result] of Object.entries(sources)) {
      if (result.status === "skipped") continue;
      if (result.datesSynced > 0) {
        parts.push(`${labels[name] || name}: ${result.datesSynced} day${result.datesSynced === 1 ? "" : "s"}`);
      }
    }
    const summary = parts.length > 0
      ? parts.join(", ")
      : totalSynced === 0 ? "All data is up to date" : "Sync complete";

    return NextResponse.json({ success: allOk, summary, results: sources });
  } catch (err) {
    if (err instanceof OrgAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
