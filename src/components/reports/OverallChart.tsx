"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { format, startOfDay, getDaysInMonth, startOfWeek, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets, suggestGroupBy } from "@/components/DateRangePicker";
import { ChartSettingsPopover, SeriesConfig } from "@/components/reports/ChartSettingsPopover";
import { chartColors } from "@/lib/chart-colors";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type GroupBy = "day" | "week" | "month";

const DEFAULT_SERIES: SeriesConfig[] = [
  { key: "shopifyRevenue", label: "Shopify", color: chartColors.shopify, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "amazonRevenue", label: "Amazon", color: chartColors.amazon, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "netCashIn", label: "Net Cash In", color: chartColors.netCash, visible: true, type: "line", yAxisId: "left", showDots: true },
];

const STORAGE_KEY = "overall-chart-settings";

function loadSeriesConfig(): SeriesConfig[] {
  if (typeof window === "undefined") return DEFAULT_SERIES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SERIES;
    const parsed = JSON.parse(stored) as SeriesConfig[];
    return DEFAULT_SERIES.map((def) => {
      const saved = parsed.find((s) => s.key === def.key);
      return saved ? { ...def, color: saved.color, visible: saved.visible, showDots: saved.showDots ?? def.showDots } : def;
    });
  } catch {
    return DEFAULT_SERIES;
  }
}

interface DataPoint {
  date: string;
  shopifyRevenue: number;
  amazonRevenue: number;
  netCashIn: number;
}

const groupByLabels: Record<GroupBy, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

const groupByOrder: GroupBy[] = ["day", "week", "month"];

function formatAxisValue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return value.toString();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const shopify = payload.find((e) => e.name === "Shopify")?.value ?? 0;
  const amazon = payload.find((e) => e.name === "Amazon")?.value ?? 0;
  const shopifyForecast = payload.find((e) => e.name === "Forecast" && e.color === (payload.find((p) => p.name === "Shopify")?.color))?.value ?? 0;
  const totalRevenue = shopify + amazon;
  // Filter out forecast entries from main list
  const visible = payload.filter((e) => e.name !== "Forecast");
  // Sum all forecast values
  const totalForecast = payload
    .filter((e) => e.name === "Forecast")
    .reduce((sum, e) => sum + (e.value ?? 0), 0);

  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
      {visible.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-600 dark:text-zinc-400">{entry.name}:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
      {(shopify > 0 || amazon > 0) && (
        <div className="flex items-center gap-2 py-0.5 mt-1 border-t border-zinc-200 dark:border-zinc-700 pt-1.5">
          <span className="w-3 h-3 rounded-sm shrink-0 bg-zinc-900 dark:bg-zinc-100" />
          <span className="text-zinc-600 dark:text-zinc-400">Total Revenue:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatCurrency(totalRevenue)}
          </span>
        </div>
      )}
      {totalForecast > 0 && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-3 rounded-sm shrink-0 bg-zinc-900/40 dark:bg-zinc-100/40" />
          <span className="text-zinc-600 dark:text-zinc-400">Forecast:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatCurrency(totalRevenue + totalForecast)}
          </span>
        </div>
      )}
    </div>
  );
}

export function OverallChart({ controlsContainer }: { controlsContainer?: HTMLDivElement | null }) {
  const { apiFetch, currentOrg } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () => presets.find((p) => p.label === "Last 12 months")!.getValue()
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(() => suggestGroupBy(dateRange));
  const [prevDateRange, setPrevDateRange] = useState(dateRange);
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig[]>(DEFAULT_SERIES);
  const userSetGroupByRef = useRef(false);

  if (dateRange !== prevDateRange) {
    setPrevDateRange(dateRange);
    if (!userSetGroupByRef.current) {
      setGroupBy(suggestGroupBy(dateRange));
    }
  }

  useEffect(() => {
    setSeriesConfig(loadSeriesConfig());
    const stored = localStorage.getItem("chart-overall-groupby");
    if (stored === "day" || stored === "week" || stored === "month") {
      setGroupBy(stored);
      userSetGroupByRef.current = true;
    }
  }, []);

  const handleSeriesChange = (updated: SeriesConfig[]) => {
    setSeriesConfig(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to || !currentOrg) return;
    setLoading(true);
    try {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await apiFetch(`/api/reports/overall?from=${from}&to=${to}&groupBy=${groupBy}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch overall report:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy, apiFetch, currentOrg]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const barSeries = seriesConfig.filter((s) => s.type === "bar" && s.visible);
  const hasVisibleBars = barSeries.length > 0;

  const chartData = data.map((d, i) => {
    let shopifyForecast = 0;
    let amazonForecast = 0;

    if (i === data.length - 1 && groupBy !== "day" && hasVisibleBars) {
      const today = new Date();
      const lastDate = new Date(d.date);
      let isCurrentPeriod = false;
      let daysElapsed = 0;
      let totalDays = 0;

      if (groupBy === "month") {
        isCurrentPeriod = lastDate.getFullYear() === today.getFullYear() && lastDate.getMonth() === today.getMonth();
        if (isCurrentPeriod) {
          daysElapsed = today.getDate();
          totalDays = getDaysInMonth(today);
        }
      } else if (groupBy === "week") {
        const weekStart = startOfWeek(today, { weekStartsOn: 1 });
        isCurrentPeriod = d.date === format(weekStart, "yyyy-MM-dd");
        if (isCurrentPeriod) {
          daysElapsed = differenceInDays(startOfDay(today), weekStart) + 1;
          totalDays = 7;
        }
      }

      if (isCurrentPeriod && daysElapsed > 0) {
        const shopifyProjected = (d.shopifyRevenue / daysElapsed) * totalDays;
        shopifyForecast = Math.max(0, Math.round((shopifyProjected - d.shopifyRevenue) * 100) / 100);
        const amazonProjected = (d.amazonRevenue / daysElapsed) * totalDays;
        amazonForecast = Math.max(0, Math.round((amazonProjected - d.amazonRevenue) * 100) / 100);
      }
    }

    return {
      ...d,
      dateLabel: groupBy === "month"
        ? format(new Date(d.date), "MMM yyyy")
        : format(new Date(d.date), "dd MMM"),
      shopifyForecast,
      amazonForecast,
    };
  });

  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        shopifyRevenue: acc.shopifyRevenue + d.shopifyRevenue,
        amazonRevenue: acc.amazonRevenue + d.amazonRevenue,
        netCashIn: acc.netCashIn + d.netCashIn,
      }),
      { shopifyRevenue: 0, amazonRevenue: 0, netCashIn: 0 }
    );
  }, [data]);

  return (
    <div className="pt-4">
      {controlsContainer && createPortal(
        <>
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {groupByOrder.map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGroupBy(g);
                  userSetGroupByRef.current = true;
                  localStorage.setItem("chart-overall-groupby", g);
                }}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  groupBy === g
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {groupByLabels[g]}
              </button>
            ))}
          </div>
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          <ChartSettingsPopover series={seriesConfig} onChange={handleSeriesChange} />
        </>,
        controlsContainer,
      )}

      {/* Chart + Scorecards */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-80 text-zinc-400">
              Loading...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-80 text-zinc-400">
              No data for selected range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-200)" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-zinc-200)" }}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={formatAxisValue}
                  tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {seriesConfig.filter((s) => s.visible).map((s) =>
                  s.type === "bar" ? (
                    <Bar
                      key={s.key}
                      yAxisId={s.yAxisId}
                      dataKey={s.key}
                      name={s.label}
                      fill={s.color}
                      stackId="revenue"
                      maxBarSize={40}
                    />
                  ) : (
                    <Line
                      key={s.key}
                      yAxisId={s.yAxisId}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={s.showDots ? { r: 3, fill: s.color } : false}
                    />
                  )
                )}
                {/* Forecast overlays */}
                {seriesConfig.find((s) => s.key === "shopifyRevenue")?.visible && (
                  <Bar
                    yAxisId="left"
                    dataKey="shopifyForecast"
                    name="Forecast"
                    legendType="none"
                    fill={seriesConfig.find((s) => s.key === "shopifyRevenue")!.color}
                    fillOpacity={0.3}
                    stackId="revenue"
                    maxBarSize={40}
                  />
                )}
                {seriesConfig.find((s) => s.key === "amazonRevenue")?.visible && (
                  <Bar
                    yAxisId="left"
                    dataKey="amazonForecast"
                    name="Forecast"
                    legendType="none"
                    fill={seriesConfig.find((s) => s.key === "amazonRevenue")!.color}
                    fillOpacity={0.3}
                    stackId="revenue"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={40}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Scorecards */}
        <div className="flex flex-col gap-3 w-44 shrink-0 pt-11">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Total Revenue</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.shopifyRevenue + totals.amazonRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Shopify</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.shopifyRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Amazon</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.amazonRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Net Cash In</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.netCashIn)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
