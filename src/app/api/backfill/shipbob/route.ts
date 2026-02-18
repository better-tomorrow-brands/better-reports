import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncLogs } from '@/lib/db/schema';
import { getShipBobSettings } from '@/lib/settings';
import { fetchShipBobInventory, upsertShipBobInventory } from '@/lib/shipbob';
import { requireOrgFromRequest, OrgAuthError } from '@/lib/org-auth';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * POST /api/backfill/shipbob
 * Syncs ShipBob inventory for today (ShipBob is real-time stock, not historical).
 * Optionally accepts { date } in body to backfill a specific date with today's data.
 */
export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const snapshotDate = (body as { date?: string }).date ?? today();

    const settings = await getShipBobSettings(orgId);
    if (!settings) {
      return NextResponse.json({ error: 'ShipBob not configured for this org' }, { status: 400 });
    }
    if (!settings.enabled) {
      return NextResponse.json({ error: 'ShipBob integration is not enabled for this org' }, { status: 400 });
    }

    const timestamp = new Date();
    const items = await fetchShipBobInventory(settings);
    const upserted = await upsertShipBobInventory(items, snapshotDate, orgId);

    await db.insert(syncLogs).values({
      orgId,
      source: 'shipbob-inventory',
      status: 'success',
      syncedAt: timestamp,
      details: JSON.stringify({ items: items.length, upserted, snapshotDate, manual: true }),
    });

    return NextResponse.json({ success: true, items: items.length, upserted, snapshotDate });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('ShipBob backfill error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync ShipBob inventory' },
      { status: 500 }
    );
  }
}
