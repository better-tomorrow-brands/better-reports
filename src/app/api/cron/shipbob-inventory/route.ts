import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncLogs } from '@/lib/db/schema';
import { getOrgsWithSetting, getShipBobSettings } from '@/lib/settings';
import { fetchShipBobInventory, upsertShipBobInventory } from '@/lib/shipbob';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const snapshotDate = today();
  const orgIds = await getOrgsWithSetting('shipbob');
  const results: Array<{ orgId: number; status: string; items?: number; error?: string }> = [];

  for (const orgId of orgIds) {
    const timestamp = new Date();
    try {
      const settings = await getShipBobSettings(orgId);
      if (!settings) {
        results.push({ orgId, status: 'skipped', error: 'No settings found' });
        continue;
      }
      if (!settings.enabled) {
        results.push({ orgId, status: 'skipped', error: 'ShipBob integration not enabled' });
        continue;
      }

      const items = await fetchShipBobInventory(settings);
      const upserted = await upsertShipBobInventory(items, snapshotDate, orgId);

      await db.insert(syncLogs).values({
        orgId,
        source: 'shipbob-inventory',
        status: 'success',
        syncedAt: timestamp,
        details: JSON.stringify({ items: items.length, upserted, snapshotDate }),
      });

      results.push({ orgId, status: 'success', items: upserted });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`ShipBob inventory sync failed for org ${orgId}:`, msg);

      await db.insert(syncLogs).values({
        orgId,
        source: 'shipbob-inventory',
        status: 'error',
        syncedAt: timestamp,
        details: JSON.stringify({ error: msg }),
      });

      results.push({ orgId, status: 'error', error: msg });
    }
  }

  return NextResponse.json({ success: true, snapshotDate, results });
}
