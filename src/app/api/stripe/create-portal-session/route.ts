import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/stripe/create-portal-session
 * Creates a Stripe billing portal session for the current org
 */
export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgFromRequest(request);

    // Fetch subscription to get Stripe customer ID
    const rows = await db
      .select({ stripeCustomerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .limit(1);

    if (!rows.length || !rows[0].stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe subscription found" },
        { status: 404 }
      );
    }

    // Get the origin from the request headers for the return URL
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: rows[0].stripeCustomerId,
      return_url: `${origin}/settings?tab=billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("create-portal-session error:", error);
    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
