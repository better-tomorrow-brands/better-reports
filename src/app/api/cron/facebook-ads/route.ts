import { NextResponse } from 'next/server';
import { getDailyFacebookAds, getTodayDateLondon, getYesterdayDateLondon, lookupUtmCampaignsFromDb, upsertFacebookAds } from '@/lib/facebook';
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

    const orgIdParam = url.searchParams.get('orgId');
    if (!orgIdParam) {
      return NextResponse.json({ error: 'orgId query param required' }, { status: 400 });
    }
    const orgId = parseInt(orgIdParam);

    // Fetch from Facebook Marketing API
    const ads = await getDailyFacebookAds(date);

    // Write to Google Sheets
    const result = await syncFacebookAds(date, ads);

    // Dual-write to Neon
    const utmMap = await lookupUtmCampaignsFromDb();
    const adsWithUtm = ads.map((ad) => ({
      ...ad,
      utm_campaign: utmMap.get(ad.adset.toLowerCase()) || "",
    }));
    const dbInserted = await upsertFacebookAds(adsWithUtm, orgId);

    return NextResponse.json({
      success: true,
      date,
      adsCount: ads.length,
      dbInserted,
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
