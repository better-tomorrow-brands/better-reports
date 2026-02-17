import { NextResponse } from 'next/server';
import { getDailyAnalytics, getYesterdayDateLondon, getTodayDateLondon, upsertPosthogAnalytics, getEnvCredentials } from '@/lib/posthog';
import { getPosthogSettings, getOrgsWithSetting } from '@/lib/settings';

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

  // Get all orgs with PostHog configured
  const orgIds = await getOrgsWithSetting('posthog');

  // Fall back to env-var org if nothing in DB (legacy)
  const envCreds = getEnvCredentials();
  if (orgIds.length === 0 && envCreds.api_key) {
    orgIds.push(1);
  }

  const results: Array<{ orgId: number; status: string; error?: string }> = [];

  for (const orgId of orgIds) {
    try {
      const phSettings = await getPosthogSettings(orgId);
      const creds = phSettings ?? envCreds;
      const analytics = await getDailyAnalytics(date, creds);
      await upsertPosthogAnalytics(analytics, orgId);
      results.push({ orgId, status: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`PostHog sync failed for org ${orgId}:`, msg);
      results.push({ orgId, status: 'error', error: msg });
    }
  }

  return NextResponse.json({ success: true, date, results });
}
