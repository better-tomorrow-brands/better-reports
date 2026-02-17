import { NextResponse } from 'next/server';
import { getDailyFacebookAds, getTodayDateLondon, getYesterdayDateLondon, lookupUtmCampaignsFromDb, upsertFacebookAds } from '@/lib/facebook';
import { getFacebookAdsSettings, getOrgsWithSetting } from '@/lib/settings';

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const date = dateParam === 'today' ? getTodayDateLondon() : getYesterdayDateLondon();

  // Get all orgs with Facebook Ads configured
  const orgIds = await getOrgsWithSetting('facebook_ads');

  const results: Array<{ orgId: number; status: string; adsCount?: number; error?: string }> = [];
  const utmMap = await lookupUtmCampaignsFromDb();

  for (const orgId of orgIds) {
    try {
      const fbSettings = await getFacebookAdsSettings(orgId);
      if (!fbSettings) {
        results.push({ orgId, status: 'skipped', error: 'No settings found' });
        continue;
      }

      const ads = await getDailyFacebookAds(date, fbSettings);
      const adsWithUtm = ads.map((ad) => ({
        ...ad,
        utm_campaign: utmMap.get(ad.adset.toLowerCase()) || "",
      }));
      const dbInserted = await upsertFacebookAds(adsWithUtm, orgId);
      results.push({ orgId, status: 'success', adsCount: dbInserted });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Facebook ads sync failed for org ${orgId}:`, msg);
      results.push({ orgId, status: 'error', error: msg });
    }
  }

  return NextResponse.json({ success: true, date, results });
}
