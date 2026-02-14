import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { getShopifySettings } from "@/lib/settings";
import { fetchShopifyInventory, upsertShopifyInventory } from "@/lib/shopify";

export const maxDuration = 300;

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
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
  const orgIdParam = url.searchParams.get("orgId");
  if (!orgIdParam) {
    return NextResponse.json({ error: "orgId query param required" }, { status: 400 });
  }
  const orgId = parseInt(orgIdParam);

  const settings = await getShopifySettings(orgId);
  if (!settings) {
    return NextResponse.json(
      { error: "Shopify settings not configured" },
      { status: 400 }
    );
  }

  const timestamp = new Date();

  try {
    const items = await fetchShopifyInventory(settings);
    const snapshotDate = formatDate(new Date());
    const upserted = await upsertShopifyInventory(items, snapshotDate, orgId);

    const result = { items: items.length, upserted, snapshotDate };

    await db.insert(syncLogs).values({
      orgId,
      source: "shopify-inventory",
      status: "success",
      syncedAt: timestamp,
      details: JSON.stringify(result),
    });

    return NextResponse.json({ success: true, ...result, timestamp });
  } catch (error) {
    console.error("Shopify inventory sync error:", error);

    await db.insert(syncLogs).values({
      orgId,
      source: "shopify-inventory",
      status: "error",
      syncedAt: timestamp,
      details: (error instanceof Error ? error.message : String(error)).replace(/\0/g, "").slice(0, 1000),
    });

    const errMsg = (error instanceof Error ? error.message : String(error)).replace(/\0/g, "");
    return NextResponse.json(
      {
        error: "Failed to sync Shopify inventory",
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
