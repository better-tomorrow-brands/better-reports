import { NextResponse } from 'next/server';
import { getDailyFacebookAds } from '@/lib/facebook';
import { appendFacebookAds } from '@/lib/sheets';
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
    const results: Array<{ date: string; adsCount: number; action: string }> = [];

    // Generate all dates in range
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0];

      try {
        // Fetch from Facebook
        const ads = await getDailyFacebookAds(date, fbSettings);

        // Append to sheets (no delete)
        const result = await appendFacebookAds(ads);

        results.push({
          date,
          adsCount: ads.length,
          action: result.action,
        });

        console.log(`Backfilled ${date}: ${ads.length} ads`);

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to backfill ${date}:`, error);
        results.push({
          date,
          adsCount: 0,
          action: `error: ${error instanceof Error ? error.message : 'unknown'}`,
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
