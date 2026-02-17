import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { getShopifySettings } from "@/lib/settings";
import { syncShopifyProducts } from "@/lib/shopify";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    const settings = await getShopifySettings(orgId);
    if (!settings?.store_domain || !settings?.access_token) {
      return NextResponse.json(
        { error: "Shopify not configured" },
        { status: 400 }
      );
    }

    const result = await syncShopifyProducts(settings, orgId);

    return NextResponse.json({ success: true, synced: result.synced, skipped: result.skipped, deactivated: result.deactivated });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Product sync error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync products",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
