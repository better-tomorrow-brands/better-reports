import { NextResponse } from 'next/server';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'eu.posthog.com';

export async function GET() {
  try {
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];

    // Simple query to check available properties
    const query = `
      SELECT
        event,
        count() as count
      FROM events
      WHERE toDate(timestamp) = '${date}'
      GROUP BY event
      ORDER BY count DESC
      LIMIT 20
    `;

    const response = await fetch(
      `https://${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${POSTHOG_API_KEY}`,
        },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query,
          },
        }),
      }
    );

    const eventsResult = await response.json();

    // Get a sample of properties
    const propsQuery = `
      SELECT
        JSONExtractKeys(properties) as prop_keys
      FROM events
      WHERE toDate(timestamp) = '${date}'
      LIMIT 1
    `;

    const propsResponse = await fetch(
      `https://${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${POSTHOG_API_KEY}`,
        },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query: propsQuery,
          },
        }),
      }
    );

    const propsResult = await propsResponse.json();

    return NextResponse.json({
      date,
      events: eventsResult,
      sampleProperties: propsResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
