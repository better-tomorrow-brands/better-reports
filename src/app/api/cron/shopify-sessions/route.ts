import { NextResponse } from 'next/server';
import { getSessionsData, getTodayDateLondon } from '@/lib/shopify';
import { upsertSessionsRow } from '@/lib/sheets';

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const date = getTodayDateLondon();

    // Fetch from Shopify
    const { visitors, sessions } = await getSessionsData(date);

    // Write to Google Sheets
    const result = await upsertSessionsRow({ date, visitors, sessions });

    return NextResponse.json({
      success: true,
      date,
      visitors,
      sessions,
      sheetAction: result.action,
    });
  } catch (error) {
    console.error('Shopify sessions sync error:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync Shopify sessions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
