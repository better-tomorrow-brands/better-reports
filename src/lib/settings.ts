import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { settings, organizations } from "./db/schema";
import { encrypt, decrypt } from "./crypto";

export interface MetaSettings {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
}

export interface ShopifySettings {
  store_domain: string;
  access_token: string;
  webhook_secret: string;
}

export interface AmazonSettings {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  marketplace_id: string; // A1F83G8C2ARO7P for UK
}

export interface LifecycleSettings {
  newMaxDays: number;      // New: ≤ this many days (default 30)
  reorderMaxDays: number;  // Due Reorder: newMaxDays+1 to this (default 60)
  lapsedMaxDays: number;   // Lapsed: reorderMaxDays+1 to this (default 90)
  // Lost: > lapsedMaxDays
}

export async function getSetting(orgId: number, key: string): Promise<string | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.orgId, orgId), eq(settings.key, key)));
  if (!rows.length) return null;
  return decrypt(rows[0].value);
}

export async function setSetting(orgId: number, key: string, value: string): Promise<void> {
  const encrypted = encrypt(value);
  await db
    .insert(settings)
    .values({ orgId, key, value: encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [settings.orgId, settings.key],
      set: { value: encrypted, updatedAt: new Date() },
    });
}

export async function getMetaSettings(orgId: number): Promise<MetaSettings | null> {
  const raw = await getSetting(orgId, "meta");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveMetaSettings(orgId: number, meta: MetaSettings): Promise<void> {
  await setSetting(orgId, "meta", JSON.stringify(meta));
}

export async function getShopifySettings(orgId: number): Promise<ShopifySettings | null> {
  const raw = await getSetting(orgId, "shopify");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveShopifySettings(orgId: number, shopify: ShopifySettings): Promise<void> {
  await setSetting(orgId, "shopify", JSON.stringify(shopify));
}

export async function getAmazonSettings(orgId: number): Promise<AmazonSettings | null> {
  const raw = await getSetting(orgId, "amazon");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveAmazonSettings(orgId: number, amazon: AmazonSettings): Promise<void> {
  await setSetting(orgId, "amazon", JSON.stringify(amazon));
}

export const DEFAULT_LIFECYCLE_SETTINGS: LifecycleSettings = {
  newMaxDays: 30,
  reorderMaxDays: 60,
  lapsedMaxDays: 90,
};

export async function getLifecycleSettings(orgId: number): Promise<LifecycleSettings> {
  const raw = await getSetting(orgId, "lifecycle");
  if (!raw) return DEFAULT_LIFECYCLE_SETTINGS;
  return { ...DEFAULT_LIFECYCLE_SETTINGS, ...JSON.parse(raw) };
}

export async function saveLifecycleSettings(orgId: number, lifecycle: LifecycleSettings): Promise<void> {
  await setSetting(orgId, "lifecycle", JSON.stringify(lifecycle));
}

export async function getAllOrgIds(): Promise<number[]> {
  const rows = await db.select({ id: organizations.id }).from(organizations);
  return rows.map((r) => r.id);
}

export async function getOrgIdByStoreDomain(storeDomain: string): Promise<number | null> {
  const rows = await db
    .select({ orgId: settings.orgId, value: settings.value })
    .from(settings)
    .where(eq(settings.key, "shopify"));

  for (const row of rows) {
    try {
      const parsed: { store_domain?: string } = JSON.parse(decrypt(row.value));
      if (parsed.store_domain === storeDomain) {
        return row.orgId;
      }
    } catch {
      // skip malformed entries
    }
  }
  return null;
}
