import { NextResponse } from 'next/server';
import { backfillUtmCampaigns } from '@/lib/sheets';

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
    const result = await backfillUtmCampaigns();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Facebook utm_campaign backfill error:', error);
    return NextResponse.json(
      {
        error: 'Failed to backfill utm_campaigns',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
