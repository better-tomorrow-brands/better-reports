import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover",
  typescript: true,
});

/**
 * Stripe Product ID → Plan Tier mapping
 * Monthly subscription products configured in Stripe Dashboard
 * Annual products will be added later
 */
export const STRIPE_PRICE_TO_TIER: Record<string, string> = {
  // Monthly products
  prod_U0tNRKhw623wDI: "starter",
  prod_U0tOHqzzerOuIG: "growth",
  prod_U0tQAE1pcCd9zU: "pro",
  prod_U0tQfxh3gufOS6: "enterprise",
};

export function getTierFromPriceId(priceId: string): string {
  return STRIPE_PRICE_TO_TIER[priceId] || "free";
}
