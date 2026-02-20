import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Stripe webhook handler
 *
 * Setup:
 * 1. Install stripe: npm install stripe
 * 2. Add to .env.local:
 *    STRIPE_SECRET_KEY=sk_...
 *    STRIPE_WEBHOOK_SECRET=whsec_...
 * 3. Configure webhook in Stripe dashboard:
 *    URL: https://your-domain.com/api/stripe/webhook
 *    Events: customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
 *
 * TODO: Uncomment when Stripe is installed and configured
 */

export async function POST(request: Request) {
  return NextResponse.json({ error: "Stripe integration not yet configured" }, { status: 501 });

  /* Uncomment when ready:

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const orgId = subscription.metadata.orgId;

        if (!orgId) {
          console.error("Missing orgId in subscription metadata");
          break;
        }

        // Map Stripe price ID to tier (you'll need to configure these mappings)
        const tierMap: Record<string, string> = {
          // price_xxx: "starter",
          // price_yyy: "growth",
          // price_zzz: "pro",
        };

        const tier = tierMap[subscription.items.data[0]?.price.id] || "free";

        await db
          .insert(subscriptions)
          .values({
            orgId: Number(orgId),
            tier,
            status: subscription.status === "active" ? "active" : subscription.status,
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price.id,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          })
          .onConflictDoUpdate({
            target: subscriptions.orgId,
            set: {
              tier,
              status: subscription.status === "active" ? "active" : subscription.status,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0]?.price.id,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              updatedAt: new Date(),
            },
          });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const orgId = subscription.metadata.orgId;

        if (!orgId) {
          console.error("Missing orgId in subscription metadata");
          break;
        }

        // Downgrade to free tier
        await db
          .update(subscriptions)
          .set({
            tier: "free",
            status: "canceled",
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.orgId, Number(orgId)));

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
  */
}
