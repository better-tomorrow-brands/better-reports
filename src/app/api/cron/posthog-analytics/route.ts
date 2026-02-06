import { NextResponse } from 'next/server';
import { getDailyAnalytics, getYesterdayDateLondon, getTodayDateLondon, upsertPosthogAnalytics } from '@/lib/posthog';
import { appendDailyAnalytics } from '@/lib/sheets';

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
    // Check for date query param: "today" for hourly updates, default to yesterday for daily cron
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const date = dateParam === 'today' ? getTodayDateLondon() : getYesterdayDateLondon();

    // Fetch from PostHog
    const analytics = await getDailyAnalytics(date);

    // Write to Google Sheets
    const result = await appendDailyAnalytics(analytics);

    // Write to Neon
    await upsertPosthogAnalytics(analytics);

    return NextResponse.json({
      success: true,
      date,
      analytics,
      sheetAction: result.action,
    });
  } catch (error) {
    console.error('PostHog analytics sync error:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync PostHog analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
