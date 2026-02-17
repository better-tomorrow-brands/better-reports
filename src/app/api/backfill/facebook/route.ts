import { NextResponse } from 'next/server';
import { getDailyFacebookAds, lookupUtmCampaignsFromDb, upsertFacebookAds } from '@/lib/facebook';
import { getFacebookAdsSettings } from '@/lib/settings';
import { requireOrgFromRequest, OrgAuthError } from '@/lib/org-auth';

export const maxDuration = 300; // 5 minutes for Vercel

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let orgId: number;
  try {
    const auth = await requireOrgFromRequest(request);
    orgId = auth.orgId;
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fbSettings = await getFacebookAdsSettings(orgId);
  if (!fbSettings) {
    return NextResponse.json({ error: 'Facebook Ads settings not configured for this org' }, { status: 400 });
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get('start') || '2025-01-01';
  const endDate = url.searchParams.get('end') || new Date().toISOString().split('T')[0];

  try {
    const results: Array<{ date: string; adsCount: number; dbInserted: number }> = [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    const utmMap = await lookupUtmCampaignsFromDb();

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0];

      try {
        const ads = await getDailyFacebookAds(date, fbSettings);
        const adsWithUtm = ads.map((ad) => ({
          ...ad,
          utm_campaign: utmMap.get(ad.adset.toLowerCase()) || "",
        }));
        const dbInserted = await upsertFacebookAds(adsWithUtm, orgId);

        results.push({ date, adsCount: ads.length, dbInserted });
        console.log(`Backfilled ${date}: ${ads.length} ads`);

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to backfill ${date}:`, error);
        results.push({
          date,
          adsCount: 0,
          dbInserted: 0,
        });
      }
    }

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      daysProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error('Facebook backfill error:', error);
    return NextResponse.json(
      {
        error: 'Failed to backfill Facebook ads',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
