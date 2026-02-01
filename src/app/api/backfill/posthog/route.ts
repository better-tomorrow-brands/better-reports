import { NextResponse } from 'next/server';
import { getDailyAnalytics, getYesterdayDateLondon } from '@/lib/posthog';
import { appendDailyAnalytics } from '@/lib/sheets';

export const maxDuration = 300; // 5 minutes max for Vercel

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
  const startDate = url.searchParams.get('start') || '2025-01-01';
  const endDate = url.searchParams.get('end') || getYesterdayDateLondon();

  const results: Array<{ date: string; status: string; error?: string }> = [];

  try {
    // Generate date range
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    console.log(`Backfilling ${dates.length} days from ${startDate} to ${endDate}`);

    // Process each date
    for (const date of dates) {
      try {
        const analytics = await getDailyAnalytics(date);
        await appendDailyAnalytics(analytics);
        results.push({ date, status: 'success' });
        console.log(`Backfilled ${date}: ${analytics.unique_visitors} visitors`);

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ date, status: 'error', error: errorMessage });
        console.error(`Failed to backfill ${date}:`, errorMessage);
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      success: true,
      summary: {
        total: dates.length,
        success: successCount,
        errors: errorCount,
        startDate,
        endDate,
      },
      results,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      {
        error: 'Backfill failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    );
  }
}
