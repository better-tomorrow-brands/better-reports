import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";
import { encrypt, decrypt } from "./crypto";

export interface MetaSettings {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
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
