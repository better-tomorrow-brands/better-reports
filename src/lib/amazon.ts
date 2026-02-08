import { gunzipSync } from "zlib";
import { db } from "@/lib/db";
import {
  amazonSalesTraffic,
  amazonFinancialEvents,
  inventorySnapshots,
  syncLogs,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAmazonSettings, type AmazonSettings } from "@/lib/settings";

// ── Auth Token Cache ─────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(settings: AmazonSettings): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch("https://api.amazon.com/auth/o2/token", {
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
    throw new Error(`Amazon token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
  };

  return cachedToken.token;
}

// ── SP-API Request Helper ────────────────────────────────
const EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";

async function spApiRequest(
  path: string,
  settings: AmazonSettings,
  options: RequestInit = {},
  maxRetries = 5
): Promise<Response> {
  const token = await getAccessToken(settings);
  const url = path.startsWith("http") ? path : `${EU_ENDPOINT}${path}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "x-amz-access-token": token,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (res.status === 429 && attempt < maxRetries) {
      const backoff = Math.min(2000 * Math.pow(2, attempt), 60000); // 2s, 4s, 8s, 16s, 32s
      console.log(`Rate limited (429), retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(backoff);
      continue;
    }

    return res;
  }

  // Should not reach here, but satisfy TypeScript
  throw new Error("Max retries exceeded");
}

// ── Sleep helper ─────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Test Connection ──────────────────────────────────────
export async function testAmazonConnection(): Promise<{ success: boolean; message: string }> {
  const settings = await getAmazonSettings();
  if (!settings) {
    return { success: false, message: "Amazon settings not configured" };
  }

  const res = await spApiRequest(
    "/sellers/v1/marketplaceParticipations",
    settings
  );

  if (!res.ok) {
    const text = await res.text();
    return { success: false, message: `SP-API error (${res.status}): ${text}` };
  }

  const data = await res.json();
  const count = data.payload?.length ?? 0;
  return { success: true, message: `Connected — ${count} marketplace participation(s) found` };
}

// ── Sales & Traffic Report ───────────────────────────────

interface SalesTrafficRow {
  date: string;
  parentAsin: string;
  childAsin: string;
  unitsOrdered: number;
  unitsOrderedB2b: number;
  orderedProductSales: string;
  orderedProductSalesB2b: string;
  totalOrderItems: number;
  totalOrderItemsB2b: number;
  browserSessions: number;
  mobileSessions: number;
  sessions: number;
  browserSessionPercentage: number;
  mobileSessionPercentage: number;
  sessionPercentage: number;
  browserPageViews: number;
  mobilePageViews: number;
  pageViews: number;
  browserPageViewsPercentage: number;
  mobilePageViewsPercentage: number;
  pageViewsPercentage: number;
  buyBoxPercentage: number;
  unitSessionPercentage: number;
  unitSessionPercentageB2b: number;
}

export async function fetchSalesTrafficReport(
  settings: AmazonSettings,
  startDate: string,
  endDate: string
): Promise<SalesTrafficRow[]> {
  // 1. Create report
  const createRes = await spApiRequest("/reports/2021-06-30/reports", settings, {
    method: "POST",
    body: JSON.stringify({
      reportType: "GET_SALES_AND_TRAFFIC_REPORT",
      marketplaceIds: [settings.marketplace_id],
      dataStartTime: `${startDate}T00:00:00Z`,
      dataEndTime: `${endDate}T23:59:59Z`,
      reportOptions: {
        dateGranularity: "DAY",
        asinGranularity: "CHILD",
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create report (${createRes.status}): ${text}`);
  }

  const { reportId } = await createRes.json();

  // 2. Poll for completion
  let reportDocumentId: string | null = null;
  for (let i = 0; i < 12; i++) {
    await sleep(15000);

    const statusRes = await spApiRequest(
      `/reports/2021-06-30/reports/${reportId}`,
      settings
    );
    const statusData = await statusRes.json();

    if (statusData.processingStatus === "DONE") {
      reportDocumentId = statusData.reportDocumentId;
      break;
    }

    if (statusData.processingStatus === "CANCELLED" || statusData.processingStatus === "FATAL") {
      throw new Error(`Report ${reportId} failed: ${statusData.processingStatus}`);
    }
  }

  if (!reportDocumentId) {
    throw new Error(`Report ${reportId} did not complete within 180s`);
  }

  // 3. Get document URL
  const docRes = await spApiRequest(
    `/reports/2021-06-30/documents/${reportDocumentId}`,
    settings
  );
  const docData = await docRes.json();

  // 4. Download and parse (reports may be gzip-compressed)
  const downloadRes = await fetch(docData.url);
  let reportJson: Record<string, unknown>;
  if (docData.compressionAlgorithm === "GZIP") {
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    const decompressed = gunzipSync(buffer).toString("utf-8");
    reportJson = JSON.parse(decompressed);
  } else {
    reportJson = await downloadRes.json();
  }

  // Parse the report structure
  // salesAndTrafficByAsin aggregates across the full date range (no per-entry date),
  // so we stamp each row with startDate (cron/backfill always request single days)
  const reportData = reportJson as Record<string, unknown>;
  const salesAndTrafficByAsin = (reportData.salesAndTrafficByAsin ?? []) as Record<string, unknown>[];
  const rows: SalesTrafficRow[] = [];

  for (const entry of salesAndTrafficByAsin) {
    const sales = (entry.salesByAsin ?? {}) as Record<string, unknown>;
    const traffic = (entry.trafficByAsin ?? {}) as Record<string, unknown>;
    const orderedProductSales = sales.orderedProductSales as Record<string, unknown> | undefined;
    const orderedProductSalesB2B = sales.orderedProductSalesB2B as Record<string, unknown> | undefined;

    rows.push({
      date: startDate,
      parentAsin: String(entry.parentAsin ?? ""),
      childAsin: String(entry.childAsin ?? ""),
      unitsOrdered: Number(sales.unitsOrdered ?? 0),
      unitsOrderedB2b: Number(sales.unitsOrderedB2B ?? 0),
      orderedProductSales: String(orderedProductSales?.amount ?? "0"),
      orderedProductSalesB2b: String(orderedProductSalesB2B?.amount ?? "0"),
      totalOrderItems: Number(sales.totalOrderItems ?? 0),
      totalOrderItemsB2b: Number(sales.totalOrderItemsB2B ?? 0),
      browserSessions: Number(traffic.browserSessions ?? 0),
      mobileSessions: Number(traffic.mobileAppSessions ?? 0),
      sessions: Number(traffic.sessions ?? 0),
      browserSessionPercentage: Number(traffic.browserSessionPercentage ?? 0),
      mobileSessionPercentage: Number(traffic.mobileAppSessionPercentage ?? 0),
      sessionPercentage: Number(traffic.sessionPercentage ?? 0),
      browserPageViews: Number(traffic.browserPageViews ?? 0),
      mobilePageViews: Number(traffic.mobileAppPageViews ?? 0),
      pageViews: Number(traffic.pageViews ?? 0),
      browserPageViewsPercentage: Number(traffic.browserPageViewsPercentage ?? 0),
      mobilePageViewsPercentage: Number(traffic.mobileAppPageViewsPercentage ?? 0),
      pageViewsPercentage: Number(traffic.pageViewsPercentage ?? 0),
      buyBoxPercentage: Number(traffic.buyBoxPercentage ?? 0),
      unitSessionPercentage: Number(traffic.unitSessionPercentage ?? 0),
      unitSessionPercentageB2b: Number(traffic.unitSessionPercentageB2B ?? 0),
    });
  }

  return rows;
}

// ── Upsert Sales & Traffic ───────────────────────────────
export async function upsertSalesTraffic(rows: SalesTrafficRow[]) {
  let upserted = 0;
  for (const row of rows) {
    await db
      .insert(amazonSalesTraffic)
      .values({
        date: row.date,
        parentAsin: row.parentAsin,
        childAsin: row.childAsin,
        unitsOrdered: row.unitsOrdered,
        unitsOrderedB2b: row.unitsOrderedB2b,
        orderedProductSales: row.orderedProductSales,
        orderedProductSalesB2b: row.orderedProductSalesB2b,
        totalOrderItems: row.totalOrderItems,
        totalOrderItemsB2b: row.totalOrderItemsB2b,
        browserSessions: row.browserSessions,
        mobileSessions: row.mobileSessions,
        sessions: row.sessions,
        browserSessionPercentage: row.browserSessionPercentage,
        mobileSessionPercentage: row.mobileSessionPercentage,
        sessionPercentage: row.sessionPercentage,
        browserPageViews: row.browserPageViews,
        mobilePageViews: row.mobilePageViews,
        pageViews: row.pageViews,
        browserPageViewsPercentage: row.browserPageViewsPercentage,
        mobilePageViewsPercentage: row.mobilePageViewsPercentage,
        pageViewsPercentage: row.pageViewsPercentage,
        buyBoxPercentage: row.buyBoxPercentage,
        unitSessionPercentage: row.unitSessionPercentage,
        unitSessionPercentageB2b: row.unitSessionPercentageB2b,
      })
      .onConflictDoUpdate({
        target: [amazonSalesTraffic.date, amazonSalesTraffic.childAsin],
        set: {
          parentAsin: row.parentAsin,
          unitsOrdered: row.unitsOrdered,
          unitsOrderedB2b: row.unitsOrderedB2b,
          orderedProductSales: row.orderedProductSales,
          orderedProductSalesB2b: row.orderedProductSalesB2b,
          totalOrderItems: row.totalOrderItems,
          totalOrderItemsB2b: row.totalOrderItemsB2b,
          browserSessions: row.browserSessions,
          mobileSessions: row.mobileSessions,
          sessions: row.sessions,
          browserSessionPercentage: row.browserSessionPercentage,
          mobileSessionPercentage: row.mobileSessionPercentage,
          sessionPercentage: row.sessionPercentage,
          browserPageViews: row.browserPageViews,
          mobilePageViews: row.mobilePageViews,
          pageViews: row.pageViews,
          browserPageViewsPercentage: row.browserPageViewsPercentage,
          mobilePageViewsPercentage: row.mobilePageViewsPercentage,
          pageViewsPercentage: row.pageViewsPercentage,
          buyBoxPercentage: row.buyBoxPercentage,
          unitSessionPercentage: row.unitSessionPercentage,
          unitSessionPercentageB2b: row.unitSessionPercentageB2b,
        },
      });
    upserted++;
  }
  return upserted;
}

// ── Finances API ─────────────────────────────────────────

interface FinancialTransaction {
  transactionId: string;
  transactionType: string;
  postedDate: string;
  totalAmount: string;
  totalCurrency: string;
  relatedIdentifiers: string; // JSON string
  items: string; // JSON string
  breakdowns: string; // JSON string
}

export async function fetchFinancialEvents(
  settings: AmazonSettings,
  postedAfter: string,
  postedBefore: string
): Promise<FinancialTransaction[]> {
  const transactions: FinancialTransaction[] = [];
  let nextToken: string | null = null;

  do {
    const params = new URLSearchParams({
      postedAfter,
      postedBefore,
    });
    if (nextToken) params.set("nextToken", nextToken);

    const res = await spApiRequest(
      `/finances/2024-06-19/transactions?${params.toString()}`,
      settings
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Finances API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const payload = data.payload || data;
    const txns = payload.transactions || [];

    for (const txn of txns) {
      transactions.push({
        transactionId: txn.transactionId || `txn-${txn.postedDate}-${txn.transactionType}-${transactions.length}`,
        transactionType: txn.transactionType || "",
        postedDate: txn.postedDate || "",
        totalAmount: String(txn.totalAmount?.amount ?? "0"),
        totalCurrency: txn.totalAmount?.currencyCode || "GBP",
        relatedIdentifiers: JSON.stringify(txn.relatedIdentifiers || []),
        items: JSON.stringify(txn.items || []),
        breakdowns: JSON.stringify(txn.breakdowns || []),
      });
    }

    nextToken = payload.nextToken || null;
  } while (nextToken);

  return transactions;
}

// ── Upsert Financial Events ──────────────────────────────
export async function upsertFinancialEvents(txns: FinancialTransaction[]) {
  let upserted = 0;
  for (const txn of txns) {
    await db
      .insert(amazonFinancialEvents)
      .values({
        transactionId: txn.transactionId,
        transactionType: txn.transactionType,
        postedDate: txn.postedDate ? new Date(txn.postedDate) : null,
        totalAmount: txn.totalAmount,
        totalCurrency: txn.totalCurrency,
        relatedIdentifiers: txn.relatedIdentifiers,
        items: txn.items,
        breakdowns: txn.breakdowns,
      })
      .onConflictDoUpdate({
        target: amazonFinancialEvents.transactionId,
        set: {
          transactionType: txn.transactionType,
          postedDate: txn.postedDate ? new Date(txn.postedDate) : null,
          totalAmount: txn.totalAmount,
          totalCurrency: txn.totalCurrency,
          relatedIdentifiers: txn.relatedIdentifiers,
          items: txn.items,
          breakdowns: txn.breakdowns,
        },
      });
    upserted++;
  }
  return upserted;
}

// ── Inventory API ────────────────────────────────────────

interface InventoryRow {
  sellerSku: string;
  totalQuantity: number;
}

export async function fetchInventory(settings: AmazonSettings): Promise<InventoryRow[]> {
  // Use Reports API (GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA) instead of
  // direct Inventory API which requires a specific role that may not be approved
  const createRes = await spApiRequest("/reports/2021-06-30/reports", settings, {
    method: "POST",
    body: JSON.stringify({
      reportType: "GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA",
      marketplaceIds: [settings.marketplace_id],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create inventory report (${createRes.status}): ${text}`);
  }

  const { reportId } = await createRes.json();

  // Poll for completion
  let reportDocumentId: string | null = null;
  for (let i = 0; i < 12; i++) {
    await sleep(15000);

    const statusRes = await spApiRequest(
      `/reports/2021-06-30/reports/${reportId}`,
      settings
    );
    const statusData = await statusRes.json();

    if (statusData.processingStatus === "DONE") {
      reportDocumentId = statusData.reportDocumentId;
      break;
    }

    if (statusData.processingStatus === "CANCELLED" || statusData.processingStatus === "FATAL") {
      throw new Error(`Inventory report ${reportId} failed: ${statusData.processingStatus}`);
    }
  }

  if (!reportDocumentId) {
    throw new Error(`Inventory report ${reportId} did not complete within 180s`);
  }

  // Get document URL
  const docRes = await spApiRequest(
    `/reports/2021-06-30/documents/${reportDocumentId}`,
    settings
  );
  const docData = await docRes.json();

  // Download (may be gzip-compressed) — this is a TSV file
  const downloadRes = await fetch(docData.url);
  let tsvContent: string;
  if (docData.compressionAlgorithm === "GZIP") {
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    tsvContent = gunzipSync(buffer).toString("utf-8");
  } else {
    tsvContent = await downloadRes.text();
  }

  // Parse TSV
  const lines = tsvContent.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  const items: InventoryRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] ?? "").trim(); });

    items.push({
      sellerSku: row["sku"] || "",
      totalQuantity: Number(row["afn-total-quantity"]) || 0,
    });
  }

  return items;
}

// ── Upsert Inventory ─────────────────────────────────────
export async function upsertInventory(items: InventoryRow[], snapshotDate: string) {
  let upserted = 0;
  for (const item of items) {
    await db
      .insert(inventorySnapshots)
      .values({
        sku: item.sellerSku,
        date: snapshotDate,
        amazonQty: item.totalQuantity,
      })
      .onConflictDoUpdate({
        target: [inventorySnapshots.sku, inventorySnapshots.date],
        set: {
          amazonQty: item.totalQuantity,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }
  return upserted;
}
