import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventorySnapshots } from "@/lib/db/schema";
import type { ShipBobSettings } from "@/lib/settings";

const SHIPBOB_API_BASE = "https://api.shipbob.com/1.0";

export interface ShipBobInventoryItem {
  sku: string;
  name: string;
  fulfillableQuantity: number;
  onHandQuantity: number;
  committedQuantity: number;
}

interface ShipBobInventoryRecord {
  id: number;
  name: string;
  is_active: boolean;
  total_fulfillable_quantity: number;
  total_onhand_quantity: number;
  total_committed_quantity: number;
  inventory_items?: Array<{
    id: number;
    name: string;
    sku?: string;
    total_fulfillable_quantity: number;
    total_onhand_quantity: number;
    total_committed_quantity: number;
  }>;
}

interface ShipBobProductRecord {
  id: number;
  name: string;
  sku: string;
  is_active: boolean;
  inventory_items?: Array<{
    id: number;
    name: string;
    sku?: string;
    total_fulfillable_quantity: number;
    total_onhand_quantity: number;
    total_committed_quantity: number;
  }>;
}

async function shipbobFetch<T>(
  path: string,
  settings: ShipBobSettings,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${SHIPBOB_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${settings.pat}`,
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ShipBob API error ${resp.status}: ${text.slice(0, 300)}`);
  }

  return resp.json() as Promise<T>;
}

/**
 * Fetch all inventory from ShipBob. Returns one item per SKU with fulfillable quantity.
 * Uses the /product endpoint which groups inventory items under each product SKU.
 */
export async function fetchShipBobInventory(
  settings: ShipBobSettings
): Promise<ShipBobInventoryItem[]> {
  const items: ShipBobInventoryItem[] = [];
  let page = 1;
  const limit = 250;

  while (true) {
    const data = await shipbobFetch<ShipBobProductRecord[]>("/product", settings, {
      Page: String(page),
      Limit: String(limit),
      IsActive: "true",
    });

    if (!data || data.length === 0) break;

    for (const product of data) {
      if (!product.sku) continue;

      // Sum across all inventory items under this product
      let fulfillable = 0;
      let onhand = 0;
      let committed = 0;

      if (product.inventory_items && product.inventory_items.length > 0) {
        for (const inv of product.inventory_items) {
          fulfillable += inv.total_fulfillable_quantity ?? 0;
          onhand += inv.total_onhand_quantity ?? 0;
          committed += inv.total_committed_quantity ?? 0;
        }
      }

      items.push({
        sku: product.sku,
        name: product.name,
        fulfillableQuantity: fulfillable,
        onHandQuantity: onhand,
        committedQuantity: committed,
      });
    }

    if (data.length < limit) break;
    page++;
  }

  return items;
}

/**
 * Upsert ShipBob inventory quantities into the shared inventory_snapshots table.
 * Only updates shipbob_qty; leaves amazon/shopify/warehouse columns untouched.
 */
export async function upsertShipBobInventory(
  items: ShipBobInventoryItem[],
  snapshotDate: string,
  orgId: number
): Promise<number> {
  if (items.length === 0) return 0;

  const BATCH_SIZE = 100;
  let upserted = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE).map((item) => ({
      orgId,
      sku: item.sku,
      date: snapshotDate,
      shipbobQty: item.fulfillableQuantity,
      amazonQty: 0,
      warehouseQty: 0,
      shopifyQty: 0,
    }));

    await db
      .insert(inventorySnapshots)
      .values(batch)
      .onConflictDoUpdate({
        target: [inventorySnapshots.orgId, inventorySnapshots.sku, inventorySnapshots.date],
        set: {
          shipbobQty: sql`excluded.shipbob_qty`,
          updatedAt: sql`now()`,
        },
      });

    upserted += batch.length;
  }

  return upserted;
}
