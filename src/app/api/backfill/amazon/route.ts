import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSalesTraffic } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
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
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

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

  try {
    switch (job) {
      case "sales-traffic": {
        if (!start || !end) {
          return NextResponse.json(
            { error: "start and end query params required (YYYY-MM-DD)" },
            { status: 400 }
          );
        }

        const results: Array<{ date: string; status: string; rows?: number; error?: string }> = [];

        // Get dates we already have (for this org) to skip them
        const existingRows = await db
          .select({ date: amazonSalesTraffic.date })
          .from(amazonSalesTraffic)
          .where(sql`${amazonSalesTraffic.orgId} = ${orgId}`)
          .groupBy(amazonSalesTraffic.date);
        const existingDates = new Set(existingRows.map((r) => r.date));

        // Loop through date range, one day at a time
        const current = new Date(start);
        const endDate = new Date(end);

        while (current <= endDate) {
          const dateStr = current.toISOString().split("T")[0];

          if (existingDates.has(dateStr)) {
            results.push({ date: dateStr, status: "skipped" });
            current.setDate(current.getDate() + 1);
            continue;
          }

          try {
            const rows = await fetchSalesTrafficReport(settings, dateStr, dateStr);
            const upserted = await upsertSalesTraffic(rows, orgId);
            results.push({ date: dateStr, status: "success", rows: upserted });
            console.log(`Amazon backfill ${dateStr}: ${upserted} rows`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            results.push({ date: dateStr, status: "error", error: msg });
            console.error(`Amazon backfill ${dateStr} failed:`, msg);
          }

          // 5s delay between reports to respect SP-API rate limits (~15 req/min)
          await new Promise((resolve) => setTimeout(resolve, 5000));
          current.setDate(current.getDate() + 1);
        }

        const successCount = results.filter((r) => r.status === "success").length;
        return NextResponse.json({
          success: true,
          job,
          summary: { total: results.length, success: successCount, errors: results.length - successCount },
          results,
        });
      }

      case "finances": {
        const postedAfter = start
          ? new Date(start + "T00:00:00Z").toISOString()
          : new Date(Date.now() - 30 * 86400000).toISOString();
        const postedBefore = end
          ? new Date(end + "T23:59:59Z").toISOString()
          : new Date(Date.now() - 3 * 60000).toISOString(); // 3 min ago per API requirement

        const txns = await fetchFinancialEvents(settings, postedAfter, postedBefore);
        const upserted = await upsertFinancialEvents(txns, orgId);
        return NextResponse.json({ success: true, job, transactions: txns.length, upserted });
      }

      case "inventory": {
        const items = await fetchInventory(settings);
        const snapshotDate = new Date().toISOString().split("T")[0];
        const upserted = await upsertInventory(items, snapshotDate, orgId);
        return NextResponse.json({ success: true, job, items: items.length, upserted, snapshotDate });
      }

      case "orders": {
        // Default: 7 days lookback, or use ?days=N
        const daysParam = url.searchParams.get("days");
        const days = daysParam ? parseInt(daysParam) : 7;
        const lastUpdatedAfter = new Date(Date.now() - days * 86400000).toISOString();
        const { ordersFound, itemsUpserted } = await syncRecentOrders(settings, orgId, lastUpdatedAfter);
        return NextResponse.json({ success: true, job, days, lastUpdatedAfter, ordersFound, itemsUpserted });
      }

      default:
        return NextResponse.json(
          { error: `Unknown job: ${job}. Use: sales-traffic, finances, inventory, orders` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`Amazon backfill ${job} error:`, error);
    return NextResponse.json(
      {
        error: `Backfill failed for ${job}`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
