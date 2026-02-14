import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { getAmazonSettings } from "@/lib/settings";
import {
  fetchSalesTrafficReport,
  upsertSalesTraffic,
  fetchFinancialEvents,
  upsertFinancialEvents,
  fetchInventory,
  upsertInventory,
  syncRecentOrders,
} from "@/lib/amazon";

export const maxDuration = 300;

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const job = url.searchParams.get("job") || "sales-traffic";

  const orgIdParam = url.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  const settings = await getAmazonSettings(orgId);
  if (!settings) {
    return NextResponse.json(
      { error: "Amazon settings not configured" },
      { status: 400 }
    );
  }

  const timestamp = new Date();

  try {
    let result: Record<string, unknown>;

    switch (job) {
      case "sales-traffic": {
        // Lookback strategy: fetch multiple date ranges to catch late data
        const lookbacks = [
          { start: daysAgo(3), end: daysAgo(2) },   // day-2 to day-3
          { start: daysAgo(7), end: daysAgo(7) },   // day-7
          { start: daysAgo(30), end: daysAgo(30) },  // day-30
        ];

        let totalRows = 0;
        for (const lb of lookbacks) {
          const rows = await fetchSalesTrafficReport(settings, lb.start, lb.end);
          const upserted = await upsertSalesTraffic(rows, orgId);
          totalRows += upserted;
        }

        result = { job, totalRows, lookbacks };
        break;
      }

      case "finances": {
        const postedAfter = new Date(daysAgo(3) + "T00:00:00Z").toISOString();
        const postedBefore = new Date(Date.now() - 3 * 60000).toISOString(); // 3 min ago per API requirement
        const txns = await fetchFinancialEvents(settings, postedAfter, postedBefore);
        const upserted = await upsertFinancialEvents(txns, orgId);
        result = { job, transactions: txns.length, upserted };
        break;
      }

      case "inventory": {
        const items = await fetchInventory(settings);
        const snapshotDate = formatDate(new Date());
        const upserted = await upsertInventory(items, snapshotDate, orgId);
        result = { job, items: items.length, upserted, snapshotDate };
        break;
      }

      case "orders": {
        const lastUpdatedAfter = new Date(Date.now() - 2 * 3600000).toISOString();
        const { ordersFound, itemsUpserted } = await syncRecentOrders(settings, orgId, lastUpdatedAfter);
        result = { job, ordersFound, itemsUpserted };
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown job: ${job}. Use: sales-traffic, finances, inventory, orders` },
          { status: 400 }
        );
    }

    await db.insert(syncLogs).values({
      orgId,
      source: `amazon-${job}`,
      status: "success",
      syncedAt: timestamp,
      details: JSON.stringify(result),
    });

    return NextResponse.json({ success: true, ...result, timestamp });
  } catch (error) {
    console.error(`Amazon ${job} sync error:`, error);

    await db.insert(syncLogs).values({
      orgId,
      source: `amazon-${job}`,
      status: "error",
      syncedAt: timestamp,
      details: (error instanceof Error ? error.message : String(error)).replace(/\0/g, "").slice(0, 1000),
    });

    const errMsg = (error instanceof Error ? error.message : String(error)).replace(/\0/g, "");
    return NextResponse.json(
      {
        error: `Failed to sync Amazon ${job}`,
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
