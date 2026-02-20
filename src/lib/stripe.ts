import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover",
  typescript: true,
});

/**
 * Stripe Price ID → Plan Tier mapping
 * Configure these after creating products in Stripe Dashboard
 */
export const STRIPE_PRICE_TO_TIER: Record<string, string> = {
  // Example (replace with your actual Stripe price IDs):
  // price_xxx_starter_monthly: "starter",
  // price_xxx_starter_yearly: "starter",
  // price_xxx_growth_monthly: "growth",
  // price_xxx_growth_yearly: "growth",
  // price_xxx_pro_monthly: "pro",
  // price_xxx_pro_yearly: "pro",
};

export function getTierFromPriceId(priceId: string): string {
  return STRIPE_PRICE_TO_TIER[priceId] || "free";
}
