import type { ShopifySettings } from "@/lib/settings";

const API_VERSION = '2024-10';

interface ShopifyResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

// Test what fields are available
export async function testShopifyAccess(settings: ShopifySettings): Promise<ShopifyResponse> {
  if (!settings.store_domain || !settings.access_token) {
    throw new Error('Missing Shopify configuration');
  }

  // Simple introspection query to see available fields
  const query = `
    query {
      shop {
        name
        plan {
          displayName
        }
      }
    }
  `;

  const response = await fetch(
    `https://${settings.store_domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': settings.access_token,
      },
      body: JSON.stringify({ query }),
    }
  );

  const result: ShopifyResponse = await response.json();
  return result;
}

export async function getSessionsData(date: string, settings: ShopifySettings): Promise<{
  visitors: number;
  sessions: number;
}> {
  if (!settings.store_domain || !settings.access_token) {
    throw new Error('Missing Shopify configuration');
  }

  // Try REST API for analytics
  const response = await fetch(
    `https://${settings.store_domain}/admin/api/${API_VERSION}/reports.json`,
    {
      headers: {
        'X-Shopify-Access-Token': settings.access_token,
      },
    }
  );

  if (!response.ok) {
    // If reports API not available, return error with details
    const text = await response.text();
    throw new Error(`Shopify Reports API: ${response.status} - ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  // Log available reports for debugging
  console.log('Available Shopify reports:', JSON.stringify(data, null, 2));

  // For now, return zeros - we need to see what's available
  return { sessions: 0, visitors: 0 };
}

export function getTodayDateLondon(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/London',
  });
}

// ── Shopify Inventory Sync ─────────────────────────────────

import { db } from "@/lib/db";
import { eq, and, notInArray } from "drizzle-orm";
import { inventorySnapshots, products } from "@/lib/db/schema";

interface ShopifyInventoryItem {
  sku: string;
  quantity: number;
}

interface VariantNode {
  sku: string | null;
  inventoryQuantity: number;
}

interface VariantsResponse {
  data?: {
    productVariants: {
      edges: Array<{ node: VariantNode }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

export async function fetchShopifyInventory(
  settings: ShopifySettings
): Promise<ShopifyInventoryItem[]> {
  const items: ShopifyInventoryItem[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{
      productVariants(first: 250${afterClause}) {
        edges {
          node {
            sku
            inventoryQuantity
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`;

    const response = await fetch(
      `https://${settings.store_domain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": settings.access_token,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Shopify GraphQL error (${response.status}): ${text.slice(0, 500)}`
      );
    }

    const result: VariantsResponse = await response.json();

    if (result.errors?.length) {
      throw new Error(
        `Shopify GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`
      );
    }

    const variants = result.data?.productVariants;
    if (!variants) break;

    for (const edge of variants.edges) {
      const { sku, inventoryQuantity } = edge.node;
      if (sku) {
        items.push({ sku, quantity: inventoryQuantity });
      }
    }

    hasNextPage = variants.pageInfo.hasNextPage;
    cursor = variants.pageInfo.endCursor;
  }

  return items;
}

export async function upsertShopifyInventory(
  items: ShopifyInventoryItem[],
  snapshotDate: string,
  orgId: number
): Promise<number> {
  let upserted = 0;
  for (const item of items) {
    await db
      .insert(inventorySnapshots)
      .values({
        orgId,
        sku: item.sku,
        date: snapshotDate,
        shopifyQty: item.quantity,
      })
      .onConflictDoUpdate({
        target: [
          inventorySnapshots.orgId,
          inventorySnapshots.sku,
          inventorySnapshots.date,
        ],
        set: {
          shopifyQty: item.quantity,
          updatedAt: new Date(),
        },
      });
    upserted++;
  }
  return upserted;
}

// ── Shopify Product Sync ───────────────────────────────────

interface ShopifyVariantNode {
  sku: string | null;
  barcode: string | null;
  product: {
    title: string;
    vendor: string | null;
    featuredImage: {
      url: string;
    } | null;
  };
}

interface ShopifyProductsResponse {
  data?: {
    productVariants: {
      edges: Array<{ node: ShopifyVariantNode }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

export async function syncShopifyProducts(
  settings: ShopifySettings,
  orgId: number
): Promise<{ synced: number; skipped: number; deactivated: number }> {
  let synced = 0;
  let skipped = 0;
  let cursor: string | null = null;
  let hasNextPage = true;
  const syncedSkus: string[] = [];

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{
      productVariants(first: 250${afterClause}) {
        edges {
          node {
            sku
            barcode
            product {
              title
              vendor
              featuredImage {
                url
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`;

    const response = await fetch(
      `https://${settings.store_domain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": settings.access_token,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify GraphQL error (${response.status}): ${text.slice(0, 500)}`);
    }

    const result: ShopifyProductsResponse = await response.json();

    if (result.errors?.length) {
      throw new Error(`Shopify GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
    }

    const variants = result.data?.productVariants;
    if (!variants) break;

    for (const edge of variants.edges) {
      const { sku, barcode, product } = edge.node;
      if (!sku?.trim()) {
        skipped++;
        continue;
      }

      const trimmedSku = sku.trim();
      const imageUrl = product.featuredImage?.url || null;
      const brand = product.vendor || null;

      await db
        .insert(products)
        .values({
          orgId,
          sku: trimmedSku,
          productName: product.title || null,
          brand,
          unitBarcode: barcode || null,
          imageUrl,
          active: true,
        })
        .onConflictDoUpdate({
          target: [products.orgId, products.sku],
          set: {
            productName: product.title || null,
            brand,
            unitBarcode: barcode || null,
            imageUrl,
            active: true,
            updatedAt: new Date(),
          },
        });
      syncedSkus.push(trimmedSku);
      synced++;
    }

    hasNextPage = variants.pageInfo.hasNextPage;
    cursor = variants.pageInfo.endCursor;
  }

  // Mark any products not returned by Shopify as inactive
  let deactivated = 0;
  if (syncedSkus.length > 0) {
    const result = await db
      .update(products)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(products.orgId, orgId),
          notInArray(products.sku, syncedSkus)
        )
      )
      .returning({ sku: products.sku });
    deactivated = result.length;
  }

  return { synced, skipped, deactivated };
}
