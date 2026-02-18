import { sql, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { facebookAds, campaignsFcb } from "@/lib/db/schema";
import type { FacebookAdsSettings } from "@/lib/settings";

const API_VERSION = 'v21.0';

interface FacebookAdInsight {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
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
  inline_link_clicks?: string;
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
  campaign_id: string;
  campaign: string;
  adset_id: string;
  adset: string;
  ad_id: string;
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
  link_clicks: number;
  shop_clicks: number;
  landing_page_views: number;
  cost_per_landing_page_view: number;
}

export async function getDailyFacebookAds(date: string, settings: FacebookAdsSettings): Promise<FacebookAdRow[]> {
  if (!settings.access_token || !settings.ad_account_id) {
    throw new Error('Missing Facebook Ads configuration');
  }

  const fields = [
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',
    'spend',
    'impressions',
    'reach',
    'frequency',
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'inline_link_clicks',
    'actions',
    'action_values',
    'cost_per_action_type',
  ].join(',');

  const allRows: FacebookAdRow[] = [];
  let nextUrl: string | null = null;

  // Build initial URL
  const baseUrl = new URL(
    `https://graph.facebook.com/${API_VERSION}/${settings.ad_account_id}/insights`
  );
  baseUrl.searchParams.set('fields', fields);
  baseUrl.searchParams.set('time_range', JSON.stringify({ since: date, until: date }));
  baseUrl.searchParams.set('level', 'ad');
  baseUrl.searchParams.set('limit', '500');
  baseUrl.searchParams.set('access_token', settings.access_token);

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

      // Extract link clicks (inline_link_clicks field)
      const linkClicksNum = Number(row.inline_link_clicks) || 0;

      // Extract shop clicks (fb_pixel_initiate_checkout or add_to_cart as proxy)
      const shopClicksAction = row.actions?.find(
        (a) => a.action_type === 'initiate_checkout'
      );
      const shopClicksNum = shopClicksAction ? Number(shopClicksAction.value) : 0;

      // Extract landing page views from actions
      const landingPageViewsAction = row.actions?.find(
        (a) => a.action_type === 'landing_page_view'
      );
      const landingPageViewsNum = landingPageViewsAction ? Number(landingPageViewsAction.value) : 0;

      // Cost per landing page view
      const costPerLpvAction = row.cost_per_action_type?.find(
        (a) => a.action_type === 'landing_page_view'
      );
      const costPerLpvNum = costPerLpvAction ? Number(costPerLpvAction.value) : 0;

      const spend = Number(row.spend) || 0;
      const roas = spend > 0 ? purchaseValueNum / spend : 0;

      allRows.push({
        date,
        campaign_id: row.campaign_id || '',
        campaign: row.campaign_name || '',
        adset_id: row.adset_id || '',
        adset: row.adset_name || '',
        ad_id: row.ad_id || '',
        ad: row.ad_name || '',
        utm_campaign: '', // Will be populated from Campaigns table lookup
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
        link_clicks: linkClicksNum,
        shop_clicks: shopClicksNum,
        landing_page_views: landingPageViewsNum,
        cost_per_landing_page_view: Math.round(costPerLpvNum * 100) / 100,
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

export async function upsertFacebookAds(rows: FacebookAdRow[], orgId: number): Promise<number> {
  if (rows.length === 0) return 0;

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({
      orgId,
      date: row.date,
      campaignId: row.campaign_id,
      campaign: row.campaign,
      adsetId: row.adset_id,
      adset: row.adset,
      adId: row.ad_id,
      ad: row.ad,
      utmCampaign: row.utm_campaign,
      spend: row.spend,
      impressions: row.impressions,
      reach: row.reach,
      frequency: row.frequency,
      clicks: row.clicks,
      cpc: row.cpc,
      cpm: row.cpm,
      ctr: row.ctr,
      purchases: row.purchases,
      costPerPurchase: row.cost_per_purchase,
      purchaseValue: row.purchase_value,
      roas: row.roas,
      linkClicks: row.link_clicks,
      shopClicks: row.shop_clicks,
      landingPageViews: row.landing_page_views,
      costPerLandingPageView: row.cost_per_landing_page_view,
    }));

    await db
      .insert(facebookAds)
      .values(batch)
      .onConflictDoUpdate({
        target: [facebookAds.orgId, facebookAds.date, facebookAds.campaign, facebookAds.adset, facebookAds.ad],
        set: {
          campaignId: sql`excluded.campaign_id`,
          adsetId: sql`excluded.adset_id`,
          adId: sql`excluded.ad_id`,
          utmCampaign: sql`excluded.utm_campaign`,
          spend: sql`excluded.spend`,
          impressions: sql`excluded.impressions`,
          reach: sql`excluded.reach`,
          frequency: sql`excluded.frequency`,
          clicks: sql`excluded.clicks`,
          cpc: sql`excluded.cpc`,
          cpm: sql`excluded.cpm`,
          ctr: sql`excluded.ctr`,
          purchases: sql`excluded.purchases`,
          costPerPurchase: sql`excluded.cost_per_purchase`,
          purchaseValue: sql`excluded.purchase_value`,
          roas: sql`excluded.roas`,
          linkClicks: sql`excluded.link_clicks`,
          shopClicks: sql`excluded.shop_clicks`,
          landingPageViews: sql`excluded.landing_page_views`,
          costPerLandingPageView: sql`excluded.cost_per_landing_page_view`,
        },
      });

    inserted += batch.length;
  }

  return inserted;
}

export async function lookupUtmCampaignsFromDb(): Promise<Map<string, string>> {
  const rows = await db
    .select({
      adGroup: campaignsFcb.adGroup,
      utmCampaign: campaignsFcb.utmCampaign,
    })
    .from(campaignsFcb)
    .where(
      and(isNotNull(campaignsFcb.adGroup), isNotNull(campaignsFcb.utmCampaign))
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.adGroup && row.utmCampaign) {
      map.set(row.adGroup.toLowerCase(), row.utmCampaign);
    }
  }
  return map;
}
