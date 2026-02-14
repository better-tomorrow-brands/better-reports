import { db } from "@/lib/db";
import { posthogAnalytics } from "@/lib/db/schema";

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'eu.posthog.com';

interface PostHogQueryResult {
  results?: unknown[][];
  columns?: string[];
  error?: string;
}

async function posthogQuery(query: string): Promise<PostHogQueryResult> {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new Error('Missing PostHog configuration');
  }

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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostHog API error: ${response.status} - ${text.slice(0, 300)}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`PostHog query error: ${result.error}`);
  }

  return result;
}

export interface DailyAnalytics {
  date: string;
  // Traffic
  unique_visitors: number;
  total_sessions: number;
  pageviews: number;
  bounce_rate: number;
  avg_session_duration: number;
  // Device
  mobile_sessions: number;
  desktop_sessions: number;
  top_country: string;
  // Referrers
  direct_sessions: number;
  organic_sessions: number;
  paid_sessions: number;
  social_sessions: number;
  // Funnel
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  conversion_rate: number;
}

export async function getDailyAnalytics(date: string): Promise<DailyAnalytics> {
  // Traffic metrics
  const trafficQuery = `
    SELECT
      count(DISTINCT person_id) as unique_visitors,
      count(DISTINCT properties.$session_id) as total_sessions,
      countIf(event = '$pageview') as pageviews
    FROM events
    WHERE toDate(timestamp) = '${date}'
  `;

  const trafficResult = await posthogQuery(trafficQuery);
  const trafficRow = trafficResult.results?.[0] || [0, 0, 0];

  const unique_visitors = Number(trafficRow[0]) || 0;
  const total_sessions = Number(trafficRow[1]) || 0;
  const pageviews = Number(trafficRow[2]) || 0;

  // Session duration and bounce rate
  const sessionQuery = `
    SELECT
      avg(session_duration) as avg_duration,
      countIf(pageview_count = 1) * 100.0 / nullIf(count(), 0) as bounce_rate
    FROM (
      SELECT
        properties.$session_id as session_id,
        dateDiff('second', min(timestamp), max(timestamp)) as session_duration,
        countIf(event = '$pageview') as pageview_count
      FROM events
      WHERE toDate(timestamp) = '${date}'
        AND properties.$session_id IS NOT NULL
      GROUP BY properties.$session_id
    )
  `;

  const sessionResult = await posthogQuery(sessionQuery);
  const sessionRow = sessionResult.results?.[0] || [0, 0];
  const avg_session_duration = Math.round(Number(sessionRow[0]) || 0);
  const bounce_rate = Math.round((Number(sessionRow[1]) || 0) * 100) / 100;

  // Device breakdown
  const deviceQuery = `
    SELECT
      properties.$device_type as device_type,
      count(DISTINCT properties.$session_id) as sessions
    FROM events
    WHERE toDate(timestamp) = '${date}'
      AND properties.$device_type IS NOT NULL
    GROUP BY properties.$device_type
  `;

  const deviceResult = await posthogQuery(deviceQuery);
  let mobile_sessions = 0;
  let desktop_sessions = 0;

  for (const row of deviceResult.results || []) {
    const deviceType = String(row[0]).toLowerCase();
    const count = Number(row[1]) || 0;
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      mobile_sessions += count;
    } else if (deviceType === 'desktop') {
      desktop_sessions = count;
    }
  }

  // Top country
  const countryQuery = `
    SELECT
      properties.$geoip_country_name as country,
      count(DISTINCT person_id) as visitors
    FROM events
    WHERE toDate(timestamp) = '${date}'
      AND properties.$geoip_country_name IS NOT NULL
    GROUP BY properties.$geoip_country_name
    ORDER BY visitors DESC
    LIMIT 1
  `;

  const countryResult = await posthogQuery(countryQuery);
  const top_country = String(countryResult.results?.[0]?.[0] || 'Unknown');

  // Referrer breakdown
  const referrerQuery = `
    SELECT
      multiIf(
        properties.$referring_domain IS NULL OR properties.$referring_domain = '' OR properties.$referring_domain = '$direct', 'direct',
        properties.$referring_domain ILIKE '%google%' OR properties.$referring_domain ILIKE '%bing%' OR properties.$referring_domain ILIKE '%duckduckgo%' OR properties.$referring_domain ILIKE '%yahoo%', 'organic',
        properties.$referring_domain ILIKE '%facebook%' OR properties.$referring_domain ILIKE '%instagram%' OR properties.$referring_domain ILIKE '%twitter%' OR properties.$referring_domain ILIKE '%tiktok%' OR properties.$referring_domain ILIKE '%pinterest%' OR properties.$referring_domain ILIKE '%linkedin%', 'social',
        properties.gclid IS NOT NULL OR properties.fbclid IS NOT NULL OR properties.ttclid IS NOT NULL OR properties.msclkid IS NOT NULL, 'paid',
        'other'
      ) as channel,
      count(DISTINCT properties.$session_id) as sessions
    FROM events
    WHERE toDate(timestamp) = '${date}'
      AND event = '$pageview'
    GROUP BY channel
  `;

  const referrerResult = await posthogQuery(referrerQuery);
  let direct_sessions = 0;
  let organic_sessions = 0;
  let paid_sessions = 0;
  let social_sessions = 0;

  for (const row of referrerResult.results || []) {
    const channel = String(row[0]);
    const count = Number(row[1]) || 0;
    if (channel === 'direct') direct_sessions = count;
    else if (channel === 'organic') organic_sessions = count;
    else if (channel === 'paid') paid_sessions = count;
    else if (channel === 'social') social_sessions = count;
  }

  // Purchase funnel - using common event names, will be 0 if not set up
  const funnelQuery = `
    SELECT
      countIf(event = 'product_viewed' OR event = 'Product Viewed' OR (event = '$pageview' AND properties.$pathname ILIKE '%/products/%')) as product_views,
      countIf(event = 'add_to_cart' OR event = 'Add to Cart' OR event = 'Added to Cart' OR event = '$autocapture' AND properties.$el_text ILIKE '%add to cart%') as add_to_cart,
      countIf(event = 'checkout_started' OR event = 'Checkout Started' OR event = 'begin_checkout' OR (event = '$pageview' AND properties.$pathname ILIKE '%/checkout%')) as checkout_started,
      countIf(event = 'purchase' OR event = 'Purchase' OR event = 'Order Completed' OR event = 'order_completed' OR (event = '$pageview' AND properties.$pathname ILIKE '%/thank%')) as purchases
    FROM events
    WHERE toDate(timestamp) = '${date}'
  `;

  const funnelResult = await posthogQuery(funnelQuery);
  const funnelRow = funnelResult.results?.[0] || [0, 0, 0, 0];

  const product_views = Number(funnelRow[0]) || 0;
  const add_to_cart = Number(funnelRow[1]) || 0;
  const checkout_started = Number(funnelRow[2]) || 0;
  const purchases = Number(funnelRow[3]) || 0;

  const conversion_rate = unique_visitors > 0
    ? Math.round((purchases / unique_visitors) * 10000) / 100
    : 0;

  return {
    date,
    unique_visitors,
    total_sessions,
    pageviews,
    bounce_rate,
    avg_session_duration,
    mobile_sessions,
    desktop_sessions,
    top_country,
    direct_sessions,
    organic_sessions,
    paid_sessions,
    social_sessions,
    product_views,
    add_to_cart,
    checkout_started,
    purchases,
    conversion_rate,
  };
}

export async function upsertPosthogAnalytics(data: DailyAnalytics, orgId: number) {
  const row = {
    orgId,
    date: data.date,
    uniqueVisitors: data.unique_visitors,
    totalSessions: data.total_sessions,
    pageviews: data.pageviews,
    bounceRate: data.bounce_rate,
    avgSessionDuration: data.avg_session_duration,
    mobileSessions: data.mobile_sessions,
    desktopSessions: data.desktop_sessions,
    topCountry: data.top_country,
    directSessions: data.direct_sessions,
    organicSessions: data.organic_sessions,
    paidSessions: data.paid_sessions,
    socialSessions: data.social_sessions,
    productViews: data.product_views,
    addToCart: data.add_to_cart,
    checkoutStarted: data.checkout_started,
    purchases: data.purchases,
    conversionRate: data.conversion_rate,
  };

  await db
    .insert(posthogAnalytics)
    .values(row)
    .onConflictDoUpdate({
      target: [posthogAnalytics.orgId, posthogAnalytics.date],
      set: row,
    });
}

export function getYesterdayDateLondon(): string {
  const now = new Date();
  const london = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  london.setDate(london.getDate() - 1);
  return london.toISOString().split('T')[0];
}

export function getTodayDateLondon(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/London',
  });
}
