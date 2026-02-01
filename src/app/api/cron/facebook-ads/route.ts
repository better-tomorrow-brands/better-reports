import { NextResponse } from 'next/server';
import { getDailyFacebookAds, getTodayDateLondon, getYesterdayDateLondon } from '@/lib/facebook';
import { syncFacebookAds } from '@/lib/sheets';

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

    // Fetch from Facebook Marketing API
    const ads = await getDailyFacebookAds(date);

    // Write to Google Sheets
    const result = await syncFacebookAds(date, ads);

    return NextResponse.json({
      success: true,
      date,
      adsCount: ads.length,
      ...result,
    });
  } catch (error) {
    console.error('Facebook ads sync error:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync Facebook ads',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
