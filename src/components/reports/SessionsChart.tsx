"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets, suggestGroupBy } from "@/components/DateRangePicker";
import { usePersistedDateRange } from "@/hooks/usePersistedDateRange";
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
  { key: "totalSessions", label: "Sessions", color: chartColors.shopify, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "uniqueVisitors", label: "Unique Visitors", color: chartColors.visitors, visible: true, type: "line", yAxisId: "left", showDots: true },
  { key: "pageviews", label: "Pageviews", color: chartColors.fbSpend, visible: true, type: "line", yAxisId: "left", showDots: false },
  { key: "bounceRate", label: "Bounce Rate %", color: chartColors.bounce, visible: false, type: "line", yAxisId: "right", showDots: true },
];

const STORAGE_KEY = "sessions-chart-settings";

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
  totalSessions: number;
  uniqueVisitors: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  mobileSessions: number;
  desktopSessions: number;
  directSessions: number;
  organicSessions: number;
  paidSessions: number;
  socialSessions: number;
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-600 dark:text-zinc-400">{entry.name}:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {entry.name === "Bounce Rate %"
              ? `${entry.value}%`
              : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SessionsChart({ controlsContainer }: { controlsContainer?: HTMLDivElement | null }) {
  const { apiFetch, currentOrg } = useOrg();
  const [dateRange, setDateRange] = usePersistedDateRange(
    "dr-sessions",
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
    const stored = localStorage.getItem("chart-sessions-groupby");
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
      const res = await apiFetch(`/api/reports/sessions?from=${from}&to=${to}&groupBy=${groupBy}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch sessions report:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy, apiFetch, currentOrg]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = data.map((d) => ({
    ...d,
    dateLabel: groupBy === "month"
      ? format(new Date(d.date), "MMM yyyy")
      : format(new Date(d.date), "dd MMM"),
  }));

  const hasRightAxis = seriesConfig.some((s) => s.yAxisId === "right" && s.visible);

  const totals = useMemo(() => {
    const sum = data.reduce(
      (acc, d) => ({
        totalSessions: acc.totalSessions + d.totalSessions,
        uniqueVisitors: acc.uniqueVisitors + d.uniqueVisitors,
        pageviews: acc.pageviews + d.pageviews,
        avgSessionDuration: acc.avgSessionDuration + d.avgSessionDuration,
        bounceRate: acc.bounceRate + d.bounceRate,
      }),
      { totalSessions: 0, uniqueVisitors: 0, pageviews: 0, avgSessionDuration: 0, bounceRate: 0 }
    );
    return {
      ...sum,
      avgSessionDuration: data.length > 0 ? sum.avgSessionDuration / data.length : 0,
      bounceRate: data.length > 0 ? Math.round((sum.bounceRate / data.length) * 100) / 100 : 0,
    };
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
                  localStorage.setItem("chart-sessions-groupby", g);
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
                {hasRightAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                  />
                )}
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
                      maxBarSize={40}
                      radius={[2, 2, 0, 0]}
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
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Scorecards */}
        <div className="flex flex-col gap-3 w-44 shrink-0 pt-11">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Sessions</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.totalSessions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Unique Visitors</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.uniqueVisitors.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Pageviews</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.pageviews.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Avg Duration</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatDuration(totals.avgSessionDuration)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Bounce Rate</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : `${totals.bounceRate}%`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
