"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets } from "@/components/DateRangePicker";
import { usePersistedDateRange } from "@/hooks/usePersistedDateRange";
import { chartColors } from "@/lib/chart-colors";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";

interface FunnelData {
  totalSessions: number;
  productViews: number;
  addToCart: number;
  checkoutStarted: number;
  purchases: number;
}

interface DailyData {
  date: string;
  totalSessions: number;
  productViews: number;
  addToCart: number;
  checkoutStarted: number;
  purchases: number;
}

const FUNNEL_STEPS = [
  { key: "totalSessions" as const, label: "Session Start" },
  { key: "productViews" as const, label: "View Product" },
  { key: "addToCart" as const, label: "Add to Basket" },
  { key: "checkoutStarted" as const, label: "Begin Checkout" },
  { key: "purchases" as const, label: "Purchase" },
];

function formatAxisValue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return value.toString();
}

export function EcommerceChart({ controlsContainer }: { controlsContainer?: HTMLDivElement | null }) {
  const { apiFetch, currentOrg } = useOrg();
  const [dateRange, setDateRange] = usePersistedDateRange(
    "dr-ecommerce",
    () => presets.find((p) => p.label === "Last 7 days")!.getValue()
  );
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to || !currentOrg) return;
    setLoading(true);
    try {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await apiFetch(`/api/reports/ecommerce?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setFunnel(json.funnel);
      setDaily(json.daily);
    } catch (err) {
      console.error("Failed to fetch ecommerce report:", err);
      setFunnel(null);
      setDaily([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, apiFetch, currentOrg]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const trendData = daily.map((d) => ({
    ...d,
    dateLabel: format(new Date(d.date), "dd MMM"),
    conversionRate: d.totalSessions > 0
      ? Math.round((d.purchases / d.totalSessions) * 10000) / 100
      : 0,
  }));

  return (
    <div className="pt-4">
      {controlsContainer && createPortal(
        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />,
        controlsContainer,
      )}

      {loading ? (
        <div className="flex items-center justify-center h-80 text-zinc-400">
          Loading...
        </div>
      ) : !funnel ? (
        <div className="flex items-center justify-center h-80 text-zinc-400">
          No data for selected range
        </div>
      ) : (
        <div className="space-y-8">
          {/* Purchase Funnel */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Purchase Journey
            </h3>
            <PurchaseFunnel funnel={funnel} />
          </div>

          {/* Conversion Rate Trend */}
          {trendData.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                Conversion Rate Trend
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-200)" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-zinc-200)" }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={formatAxisValue}
                    tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
                          {payload.map((entry) => (
                            <div key={entry.name} className="flex items-center gap-2 py-0.5">
                              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color as string }} />
                              <span className="text-zinc-600 dark:text-zinc-400">{entry.name}:</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                {entry.name === "Conversion %" ? `${entry.value}%` : Number(entry.value).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="purchases"
                    name="Purchases"
                    fill={chartColors.social}
                    maxBarSize={32}
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="conversionRate"
                    name="Conversion %"
                    stroke={chartColors.visitors}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartColors.visitors }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PurchaseFunnel({ funnel }: { funnel: FunnelData }) {
  const steps = FUNNEL_STEPS.map((step, i) => {
    const value = funnel[step.key];
    const prevValue = i === 0 ? value : funnel[FUNNEL_STEPS[i - 1].key];
    const pctOfPrev = prevValue > 0 ? (value / prevValue) * 100 : 0;
    const pctOfFirst = funnel.totalSessions > 0 ? (value / funnel.totalSessions) * 100 : 0;
    const abandoned = prevValue - value;
    const abandonPct = prevValue > 0 ? (abandoned / prevValue) * 100 : 0;
    return { ...step, value, pctOfPrev, pctOfFirst, abandoned, abandonPct };
  });

  const maxValue = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="grid grid-cols-5 gap-0 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      {steps.map((step, i) => (
        <div
          key={step.key}
          className={`flex flex-col ${i < steps.length - 1 ? "border-r border-zinc-200 dark:border-zinc-700" : ""}`}
        >
          {/* Step Header */}
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Step {i + 1}</span>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {i === 0 ? "100%" : `${step.pctOfPrev.toFixed(1)}%`}
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
              {step.label}
            </p>
          </div>

          {/* Bar */}
          <div className="flex-1 flex flex-col justify-end px-4 pt-4 pb-2 min-h-[180px]">
            <div className="relative w-full flex justify-center">
              <div
                className="w-3/4 bg-[var(--color-social)] rounded-t-sm transition-all duration-300"
                style={{
                  height: `${Math.max((step.value / maxValue) * 160, 2)}px`,
                }}
              />
            </div>
            <p className="text-center text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-2">
              {step.value.toLocaleString()}
            </p>
          </div>

          {/* Abandonment */}
          {i < steps.length - 1 && (
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-1">Abandonment</p>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-social)] shrink-0" />
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {step.abandoned.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {step.abandonPct.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
          {i === steps.length - 1 && (
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-1">Overall rate</p>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {step.pctOfFirst.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
