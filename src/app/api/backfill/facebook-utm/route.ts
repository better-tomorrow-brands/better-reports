import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { facebookAds, campaignsFcb } from '@/lib/db/schema';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { requireOrgFromRequest, OrgAuthError } from '@/lib/org-auth';

/**
 * POST /api/backfill/facebook-utm
 * Backfills campaign_id on existing facebook_ads rows by matching utm_campaign
 * to campaigns_fcb records that have a meta_campaign_id set.
 *
 * For each campaign mapping with a metaCampaignId, updates all facebook_ads rows
 * in the same org where utm_campaign matches and campaign_id is currently empty.
 */
export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    // Fetch all campaign mappings for this org that have a meta_campaign_id
    const campaigns = await db
      .select({
        metaCampaignId: campaignsFcb.metaCampaignId,
        utmCampaign: campaignsFcb.utmCampaign,
      })
      .from(campaignsFcb)
      .where(
        and(
          eq(campaignsFcb.orgId, orgId),
          isNotNull(campaignsFcb.metaCampaignId),
          ne(campaignsFcb.metaCampaignId, '')
        )
      );

    if (campaigns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No campaigns with Meta Campaign ID found for this org.',
        updated: 0,
      });
    }

    let totalUpdated = 0;

    for (const campaign of campaigns) {
      if (!campaign.metaCampaignId || !campaign.utmCampaign) continue;

      // Update facebook_ads rows where utm_campaign matches and campaign_id is empty
      const result = await db
        .update(facebookAds)
        .set({ campaignId: campaign.metaCampaignId })
        .where(
          and(
            eq(facebookAds.orgId, orgId),
            eq(facebookAds.utmCampaign, campaign.utmCampaign),
            eq(facebookAds.campaignId, '') // only rows not yet backfilled
          )
        )
        .returning({ id: facebookAds.id });

      totalUpdated += result.length;
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled campaign_id on ${totalUpdated} facebook_ads rows across ${campaigns.length} campaign mapping(s).`,
      updated: totalUpdated,
      campaigns: campaigns.length,
    });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('facebook-utm backfill error:', error);
    return NextResponse.json(
      { error: 'Backfill failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to backfill campaign_id on existing facebook_ads rows from utm_campaign matches.',
  });
}
