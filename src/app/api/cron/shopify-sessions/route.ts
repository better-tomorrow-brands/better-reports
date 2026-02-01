import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: 'Missing Shopify configuration' },
      { status: 500 }
    );
  }

  try {
    const sql = getDb();

    // TODO: Implement Shopify API call to fetch sessions data
    // For now, this is a placeholder that logs the attempt

    const timestamp = new Date().toISOString();

    // Example: Insert a sync log entry
    await sql`
      INSERT INTO sync_logs (source, status, synced_at, details)
      VALUES ('shopify_sessions', 'pending', ${timestamp}, 'Cron job triggered')
      ON CONFLICT DO NOTHING
    `;

    return NextResponse.json({
      success: true,
      message: 'Shopify sessions sync initiated',
      timestamp,
      store: SHOPIFY_STORE,
    });
  } catch (error) {
    console.error('Shopify sessions sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync Shopify sessions' },
      { status: 500 }
    );
  }
}
