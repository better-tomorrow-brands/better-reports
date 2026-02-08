import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
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

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  if (!rows.length) return null;
  return decrypt(rows[0].value);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const encrypted = encrypt(value);
  await db
    .insert(settings)
    .values({ key, value: encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: encrypted, updatedAt: new Date() },
    });
}

export async function getMetaSettings(): Promise<MetaSettings | null> {
  const raw = await getSetting("meta");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveMetaSettings(meta: MetaSettings): Promise<void> {
  await setSetting("meta", JSON.stringify(meta));
}

export async function getShopifySettings(): Promise<ShopifySettings | null> {
  const raw = await getSetting("shopify");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveShopifySettings(shopify: ShopifySettings): Promise<void> {
  await setSetting("shopify", JSON.stringify(shopify));
}

export async function getAmazonSettings(): Promise<AmazonSettings | null> {
  const raw = await getSetting("amazon");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveAmazonSettings(amazon: AmazonSettings): Promise<void> {
  await setSetting("amazon", JSON.stringify(amazon));
}

export const DEFAULT_LIFECYCLE_SETTINGS: LifecycleSettings = {
  newMaxDays: 30,
  reorderMaxDays: 60,
  lapsedMaxDays: 90,
};

export async function getLifecycleSettings(): Promise<LifecycleSettings> {
  const raw = await getSetting("lifecycle");
  if (!raw) return DEFAULT_LIFECYCLE_SETTINGS;
  return { ...DEFAULT_LIFECYCLE_SETTINGS, ...JSON.parse(raw) };
}

export async function saveLifecycleSettings(lifecycle: LifecycleSettings): Promise<void> {
  await setSetting("lifecycle", JSON.stringify(lifecycle));
}
