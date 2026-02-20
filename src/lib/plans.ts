/**
 * Plan definitions and feature gates
 */

export type PlanTier = "free" | "free_trial" | "starter" | "growth" | "pro" | "enterprise";

export interface PlanLimits {
  maxUsers: number | null; // null = unlimited
  maxDataSources: number | null;
  maxAccounts: number | null;
  dataRefreshInterval: "weekly" | "daily" | "hourly" | "on-demand";
  features: {
    sso: boolean;
    dataTransformations: boolean;
    customDataImport: boolean;
    apiAccess: boolean;
    supermetricsStorage: boolean;
    dataWarehousing: boolean;
    multipleTeams: boolean;
    premiumSupport: boolean;
  };
}

export const PLANS: Record<PlanTier, PlanLimits> = {
  free: {
    maxUsers: 1,
    maxDataSources: 1,
    maxAccounts: 1,
    dataRefreshInterval: "weekly",
    features: {
      sso: false,
      dataTransformations: false,
      customDataImport: false,
      apiAccess: false,
      supermetricsStorage: false,
      dataWarehousing: false,
      multipleTeams: false,
      premiumSupport: false,
    },
  },
  free_trial: {
    // Early adopters: full Pro-level features for feedback period
    maxUsers: 5,
    maxDataSources: 10,
    maxAccounts: 10,
    dataRefreshInterval: "hourly",
    features: {
      sso: true,
      dataTransformations: true,
      customDataImport: true,
      apiAccess: true,
      supermetricsStorage: true,
      dataWarehousing: false,
      multipleTeams: false,
      premiumSupport: true,
    },
  },
  starter: {
    maxUsers: 1,
    maxDataSources: 3,
    maxAccounts: 3,
    dataRefreshInterval: "weekly",
    features: {
      sso: true,
      dataTransformations: false,
      customDataImport: false,
      apiAccess: true,
      supermetricsStorage: false,
      dataWarehousing: false,
      multipleTeams: false,
      premiumSupport: false,
    },
  },
  growth: {
    maxUsers: 2,
    maxDataSources: 7,
    maxAccounts: 7,
    dataRefreshInterval: "daily",
    features: {
      sso: true,
      dataTransformations: true, // limited
      customDataImport: true,
      apiAccess: true,
      supermetricsStorage: false,
      dataWarehousing: false,
      multipleTeams: false,
      premiumSupport: false,
    },
  },
  pro: {
    maxUsers: 3,
    maxDataSources: 10,
    maxAccounts: 10,
    dataRefreshInterval: "hourly",
    features: {
      sso: true,
      dataTransformations: true,
      customDataImport: true,
      apiAccess: true,
      supermetricsStorage: true,
      dataWarehousing: false,
      multipleTeams: false,
      premiumSupport: false,
    },
  },
  enterprise: {
    maxUsers: null,
    maxDataSources: null,
    maxAccounts: null,
    dataRefreshInterval: "on-demand",
    features: {
      sso: true,
      dataTransformations: true,
      customDataImport: true,
      apiAccess: true,
      supermetricsStorage: true,
      dataWarehousing: true,
      multipleTeams: true,
      premiumSupport: true,
    },
  },
};

export interface Subscription {
  tier: PlanTier;
  status: "active" | "canceled" | "past_due" | "trialing";
  maxUsers: number | null;
  maxDataSources: number | null;
  maxAccounts: number | null;
  dataRefreshInterval: string;
}

/**
 * Check if a given subscription allows a specific feature
 */
export function hasFeature(subscription: Subscription | null, feature: keyof PlanLimits["features"]): boolean {
  if (!subscription || subscription.status !== "active") {
    return PLANS.free.features[feature];
  }
  const plan = PLANS[subscription.tier] || PLANS.free;
  return plan.features[feature];
}

/**
 * Check if a count is within the subscription's limit
 */
export function withinLimit(
  subscription: Subscription | null,
  limitKey: "maxUsers" | "maxDataSources" | "maxAccounts",
  currentCount: number
): boolean {
  if (!subscription || subscription.status !== "active") {
    const freeLimit = PLANS.free[limitKey];
    return freeLimit === null || currentCount < freeLimit;
  }

  const limit = subscription[limitKey];
  // null means unlimited (enterprise)
  if (limit === null) return true;
  return currentCount < limit;
}

/**
 * Get the limit value for display
 */
export function getLimitDisplay(
  subscription: Subscription | null,
  limitKey: "maxUsers" | "maxDataSources" | "maxAccounts"
): string {
  if (!subscription || subscription.status !== "active") {
    const val = PLANS.free[limitKey];
    return val === null ? "Unlimited" : String(val);
  }
  const val = subscription[limitKey];
  return val === null ? "Unlimited" : String(val);
}

/**
 * Get human-readable tier name
 */
export function getTierDisplayName(tier: PlanTier): string {
  const map: Record<PlanTier, string> = {
    free: "Free",
    free_trial: "Free Trial",
    starter: "Starter",
    growth: "Growth",
    pro: "Pro",
    enterprise: "Enterprise",
  };
  return map[tier] || tier;
}
