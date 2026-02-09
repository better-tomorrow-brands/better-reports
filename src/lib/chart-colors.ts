/**
 * Chart brand colors — single source of truth.
 * Values match the CSS custom properties in globals.css.
 * Used in DEFAULT_SERIES configs where CSS vars can't be passed directly to Recharts.
 */
export const chartColors = {
  shopify: "#c4d34f",
  amazon: "#f59e0b",
  facebook: "#4472c4",
  fbSpend: "#6366f1",
  netCash: "#f97316",
  roas: "#10b981",
  sessions: "#8b5cf6",
  bounce: "#ef4444",
  visitors: "#2d2d2d",
  organic: "#f4b940",
  social: "#4285f4",
  direct: "#7bc67e",
} as const;
