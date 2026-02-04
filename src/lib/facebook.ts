const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const FACEBOOK_AD_ACCOUNT_ID = process.env.FACEBOOK_AD_ACCOUNT_ID;

const API_VERSION = 'v21.0';

interface FacebookAdInsight {
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  reach: string;
  frequency: string;
  clicks: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

interface FacebookInsightsResponse {
  data: FacebookAdInsight[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
  error?: {
    message: string;
    code: number;
  };
}

export interface FacebookAdRow {
  date: string;
  campaign: string;
  adset: string;
  ad: string;
  utm_campaign: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  purchases: number;
  cost_per_purchase: number;
  purchase_value: number;
  roas: number;
}

export async function getDailyFacebookAds(date: string): Promise<FacebookAdRow[]> {
  if (!FACEBOOK_ACCESS_TOKEN || !FACEBOOK_AD_ACCOUNT_ID) {
    throw new Error('Missing Facebook configuration');
  }

  const fields = [
    'campaign_name',
    'adset_name',
    'ad_name',
    'spend',
    'impressions',
    'reach',
    'frequency',
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'actions',
    'action_values',
    'cost_per_action_type',
  ].join(',');

  const allRows: FacebookAdRow[] = [];
  let nextUrl: string | null = null;

  // Build initial URL
  const baseUrl = new URL(
    `https://graph.facebook.com/${API_VERSION}/${FACEBOOK_AD_ACCOUNT_ID}/insights`
  );
  baseUrl.searchParams.set('fields', fields);
  baseUrl.searchParams.set('time_range', JSON.stringify({ since: date, until: date }));
  baseUrl.searchParams.set('level', 'ad');
  baseUrl.searchParams.set('limit', '500');
  baseUrl.searchParams.set('access_token', FACEBOOK_ACCESS_TOKEN);

  let url: string = baseUrl.toString();

  // Paginate through all results
  do {
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Facebook API error: ${response.status} - ${text.slice(0, 300)}`);
    }

    const result: FacebookInsightsResponse = await response.json();

    if (result.error) {
      throw new Error(`Facebook API error: ${result.error.message}`);
    }

    // Process each ad
    for (const row of result.data || []) {
      // Extract purchases from actions array
      const purchases = row.actions?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      const purchaseCount = purchases ? Number(purchases.value) : 0;

      // Extract purchase value from action_values array
      const purchaseValue = row.action_values?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      const purchaseValueNum = purchaseValue ? Number(purchaseValue.value) : 0;

      // Extract cost per purchase
      const costPerPurchase = row.cost_per_action_type?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
      );
      const costPerPurchaseNum = costPerPurchase ? Number(costPerPurchase.value) : 0;

      const spend = Number(row.spend) || 0;
      const roas = spend > 0 ? purchaseValueNum / spend : 0;

      allRows.push({
        date,
        campaign: row.campaign_name || '',
        adset: row.adset_name || '',
        ad: row.ad_name || '',
        utm_campaign: '', // Will be populated from Campaigns sheet lookup
        spend: Math.round(spend * 100) / 100,
        impressions: Number(row.impressions) || 0,
        reach: Number(row.reach) || 0,
        frequency: Math.round((Number(row.frequency) || 0) * 100) / 100,
        clicks: Number(row.clicks) || 0,
        cpc: Math.round((Number(row.cpc) || 0) * 100) / 100,
        cpm: Math.round((Number(row.cpm) || 0) * 100) / 100,
        ctr: Math.round((Number(row.ctr) || 0) * 100) / 100,
        purchases: purchaseCount,
        cost_per_purchase: Math.round(costPerPurchaseNum * 100) / 100,
        purchase_value: Math.round(purchaseValueNum * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      });
    }

    // Check for next page
    nextUrl = result.paging?.next || null;
    if (nextUrl) {
      url = nextUrl;
    }
  } while (nextUrl);

  return allRows;
}

export function getTodayDateLondon(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/London',
  });
}

export function getYesterdayDateLondon(): string {
  const now = new Date();
  const london = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  london.setDate(london.getDate() - 1);
  return london.toISOString().split('T')[0];
}
