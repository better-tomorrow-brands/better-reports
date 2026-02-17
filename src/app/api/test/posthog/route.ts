import { NextResponse } from 'next/server';
import { requireOrgFromRequest, OrgAuthError } from '@/lib/org-auth';
import { getPosthogSettings } from '@/lib/settings';
import { getEnvCredentials } from '@/lib/posthog';

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const phSettings = await getPosthogSettings(orgId);
    const creds = phSettings ?? getEnvCredentials();

    if (!creds.api_key || !creds.project_id) {
      return NextResponse.json({ error: 'PostHog not configured for this org' }, { status: 400 });
    }

    // Count total events yesterday to verify data exists
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];

    const countQuery = `SELECT count() as total FROM events WHERE toDate(timestamp) = '${date}'`;

    const countRes = await fetch(
      `https://${creds.host}/api/projects/${creds.project_id}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.api_key}`,
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: countQuery } }),
      }
    );
    const countData = await countRes.json();

    // Top events yesterday
    const topQuery = `
      SELECT event, count() as n
      FROM events
      WHERE toDate(timestamp) = '${date}'
      GROUP BY event ORDER BY n DESC LIMIT 10
    `;
    const topRes = await fetch(
      `https://${creds.host}/api/projects/${creds.project_id}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.api_key}`,
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: topQuery } }),
      }
    );
    const topData = await topRes.json();

    return NextResponse.json({
      date,
      host: creds.host,
      project_id: creds.project_id,
      total_events_yesterday: countData.results?.[0]?.[0] ?? 0,
      top_events: topData.results ?? [],
      raw_count: countData,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
