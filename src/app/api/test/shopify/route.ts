import { NextResponse } from 'next/server';
import { testShopifyAccess } from '@/lib/shopify';
import { getShopifySettings } from '@/lib/settings';
import { requireOrgFromRequest, OrgAuthError } from '@/lib/org-auth';

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);
    const settings = await getShopifySettings(orgId);
    if (!settings) {
      return NextResponse.json({ error: 'Shopify settings not configured' }, { status: 400 });
    }
    const result = await testShopifyAccess(settings);
    return NextResponse.json(result);
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
