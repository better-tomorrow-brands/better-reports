import { db } from "./db";
import { amazonSpAds, amazonAdsPendingReports } from "./db/schema";
import { and, eq, lt } from "drizzle-orm";
import type { AmazonAdsSettings } from "./settings";
import { gunzipSync } from "zlib";

// ── Auth ───────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export async function getAmazonAdsAccessToken(
  settings: AmazonAdsSettings,
): Promise<TokenResponse> {
  const res = await fetch("https://api.amazon.co.uk/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.refresh_token,
      client_id: settings.client_id,
      client_secret: settings.client_secret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon Ads token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

function adsHeaders(accessToken: string, settings: AmazonAdsSettings) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Amazon-Advertising-API-ClientId": settings.client_id,
    "Amazon-Advertising-API-Scope": settings.profile_id,
  };
}

// ── Report columns ─────────────────────────────────────

const SP_CAMPAIGN_COLUMNS = [
  // Dimensions
  "date", "campaignId", "campaignName", "campaignStatus",
  "campaignBudgetAmount", "campaignBudgetType", "campaignBudgetCurrencyCode",
  "campaignRuleBasedBudgetAmount", "campaignBiddingStrategy",
  "campaignApplicableBudgetRuleId", "campaignApplicableBudgetRuleName",
  // Core metrics
  "impressions", "clicks", "cost", "spend", "costPerClick", "clickThroughRate",
  "topOfSearchImpressionShare",
  // Sales (all attribution windows + same-SKU)
  "sales1d", "sales7d", "sales14d", "sales30d",
  "attributedSalesSameSku1d", "attributedSalesSameSku7d", "attributedSalesSameSku14d", "attributedSalesSameSku30d",
  // Purchases (all attribution windows + same-SKU)
  "purchases1d", "purchases7d", "purchases14d", "purchases30d",
  "purchasesSameSku1d", "purchasesSameSku7d", "purchasesSameSku14d", "purchasesSameSku30d",
  // Units sold (clicks + same-SKU)
  "unitsSoldClicks1d", "unitsSoldClicks7d", "unitsSoldClicks14d", "unitsSoldClicks30d",
  "unitsSoldSameSku1d", "unitsSoldSameSku7d", "unitsSoldSameSku14d", "unitsSoldSameSku30d",
  // Efficiency
  "acosClicks14d", "roasClicks14d",
  // Other
  "addToList",
];

// ── Create report request ──────────────────────────────

interface CreateReportResponse {
  reportId: string;
  status: string;
}

export async function createSpCampaignReport(
  accessToken: string,
  settings: AmazonAdsSettings,
  reportDate: string,
): Promise<CreateReportResponse> {
  const res = await fetch("https://advertising-api-eu.amazon.com/reporting/reports", {
    method: "POST",
    headers: {
      ...adsHeaders(accessToken, settings),
      "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
    },
    body: JSON.stringify({
      name: `spCampaigns ${reportDate}`,
      startDate: reportDate,
      endDate: reportDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: SP_CAMPAIGN_COLUMNS,
        reportTypeId: "spCampaigns",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create report failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── Poll report status ─────────────────────────────────

interface ReportStatusResponse {
  reportId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILURE";
  url?: string;
  failureReason?: string;
}

export async function getReportStatus(
  accessToken: string,
  settings: AmazonAdsSettings,
  reportId: string,
): Promise<ReportStatusResponse> {
  const res = await fetch(`https://advertising-api-eu.amazon.com/reporting/reports/${reportId}`, {
    headers: adsHeaders(accessToken, settings),
  });

  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Poll report failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── Download and decompress report ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function downloadReport(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download report failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const decompressed = gunzipSync(buffer);
  return JSON.parse(decompressed.toString("utf-8"));
}

// ── Upsert rows into amazon_sp_ads ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertSpAdsRows(rows: any[], orgId: number): Promise<number> {
  let count = 0;

  for (const row of rows) {
    const values = {
      orgId,
      date: row.date,
      // Dimensions
      campaignId: String(row.campaignId),
      campaignName: row.campaignName ?? null,
      campaignStatus: row.campaignStatus ?? null,
      campaignBudgetAmount: row.campaignBudgetAmount ?? null,
      campaignBudgetType: row.campaignBudgetType ?? null,
      campaignBudgetCurrencyCode: row.campaignBudgetCurrencyCode ?? null,
      campaignRuleBasedBudgetAmount: row.campaignRuleBasedBudgetAmount ?? null,
      campaignBiddingStrategy: row.campaignBiddingStrategy ?? null,
      campaignApplicableBudgetRuleId: row.campaignApplicableBudgetRuleId ?? null,
      campaignApplicableBudgetRuleName: row.campaignApplicableBudgetRuleName ?? null,
      // Core metrics
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      cost: row.cost ?? 0,
      spend: row.spend ?? null,
      costPerClick: row.costPerClick ?? null,
      clickThroughRate: row.clickThroughRate ?? null,
      topOfSearchImpressionShare: row.topOfSearchImpressionShare ?? null,
      // Sales
      sales1d: row.sales1d ?? null,
      sales7d: row.sales7d ?? null,
      sales14d: row.sales14d ?? null,
      sales30d: row.sales30d ?? null,
      attributedSalesSameSku1d: row.attributedSalesSameSku1d ?? null,
      attributedSalesSameSku7d: row.attributedSalesSameSku7d ?? null,
      attributedSalesSameSku14d: row.attributedSalesSameSku14d ?? null,
      attributedSalesSameSku30d: row.attributedSalesSameSku30d ?? null,
      // Purchases
      purchases1d: row.purchases1d ?? null,
      purchases7d: row.purchases7d ?? null,
      purchases14d: row.purchases14d ?? null,
      purchases30d: row.purchases30d ?? null,
      purchasesSameSku1d: row.purchasesSameSku1d ?? null,
      purchasesSameSku7d: row.purchasesSameSku7d ?? null,
      purchasesSameSku14d: row.purchasesSameSku14d ?? null,
      purchasesSameSku30d: row.purchasesSameSku30d ?? null,
      // Units sold
      unitsSoldClicks1d: row.unitsSoldClicks1d ?? null,
      unitsSoldClicks7d: row.unitsSoldClicks7d ?? null,
      unitsSoldClicks14d: row.unitsSoldClicks14d ?? null,
      unitsSoldClicks30d: row.unitsSoldClicks30d ?? null,
      unitsSoldSameSku1d: row.unitsSoldSameSku1d ?? null,
      unitsSoldSameSku7d: row.unitsSoldSameSku7d ?? null,
      unitsSoldSameSku14d: row.unitsSoldSameSku14d ?? null,
      unitsSoldSameSku30d: row.unitsSoldSameSku30d ?? null,
      // Efficiency
      acosClicks14d: row.acosClicks14d ?? null,
      roasClicks14d: row.roasClicks14d ?? null,
      // Other
      addToList: row.addToList ?? null,
      updatedAt: new Date(),
    };

    await db
      .insert(amazonSpAds)
      .values(values)
      .onConflictDoUpdate({
        target: [amazonSpAds.orgId, amazonSpAds.date, amazonSpAds.campaignId],
        set: { ...values, createdAt: undefined },
      });

    count++;
  }

  return count;
}

// ── Pending reports helpers ────────────────────────────

export async function storePendingReport(
  orgId: number,
  reportId: string,
  reportDate: string,
): Promise<void> {
  await db.insert(amazonAdsPendingReports).values({
    orgId,
    reportId,
    reportDate,
    status: "pending",
  });
}

export async function getPendingReports(orgId: number) {
  return db
    .select()
    .from(amazonAdsPendingReports)
    .where(
      and(
        eq(amazonAdsPendingReports.orgId, orgId),
        eq(amazonAdsPendingReports.status, "pending"),
      ),
    );
}

export async function markReportStatus(id: number, status: "completed" | "failed") {
  await db
    .update(amazonAdsPendingReports)
    .set({ status })
    .where(eq(amazonAdsPendingReports.id, id));
}

export async function cleanupOldReports() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .delete(amazonAdsPendingReports)
    .where(lt(amazonAdsPendingReports.createdAt, cutoff));
}

// ── Lookback dates helper ──────────────────────────────

export function getLookbackDates(): string[] {
  const offsets = [1, 3, 7, 14, 30];
  return offsets.map((n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  });
}
