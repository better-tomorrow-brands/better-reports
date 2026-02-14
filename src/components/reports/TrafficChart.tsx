"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  { key: "organicSessions", label: "Organic", color: chartColors.organic, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "socialSessions", label: "Social", color: chartColors.social, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "directSessions", label: "Direct", color: chartColors.direct, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "paidSessions", label: "Paid", color: chartColors.bounce, visible: false, type: "bar", yAxisId: "left", showDots: false },
  { key: "totalSessions", label: "Total Sessions", color: chartColors.visitors, visible: true, type: "line", yAxisId: "left", showDots: true },
];

const STORAGE_KEY = "traffic-chart-settings";

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
  organicSessions: number;
  socialSessions: number;
  directSessions: number;
  paidSessions: number;
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
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrafficChart() {
  const { apiFetch, currentOrg } = useOrg();
  const [dateRange, setDateRange] = usePersistedDateRange(
    "dr-traffic",
    () => presets.find((p) => p.label === "Last 12 months")!.getValue()
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(() => suggestGroupBy(dateRange));
  const [prevDateRange, setPrevDateRange] = useState(dateRange);
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig[]>(DEFAULT_SERIES);

  if (dateRange !== prevDateRange) {
    setPrevDateRange(dateRange);
    setGroupBy(suggestGroupBy(dateRange));
  }

  useEffect(() => {
    setSeriesConfig(loadSeriesConfig());
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
      console.error("Failed to fetch traffic report:", err);
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

  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        totalSessions: acc.totalSessions + d.totalSessions,
        organicSessions: acc.organicSessions + d.organicSessions,
        socialSessions: acc.socialSessions + d.socialSessions,
        directSessions: acc.directSessions + d.directSessions,
        paidSessions: acc.paidSessions + d.paidSessions,
      }),
      { totalSessions: 0, organicSessions: 0, socialSessions: 0, directSessions: 0, paidSessions: 0 }
    );
  }, [data]);

  return (
    <div className="pt-4">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 justify-end">
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
          {groupByOrder.map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
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
      </div>

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
                {seriesConfig.filter((s) => s.visible && s.type === "bar").map((s) => (
                  <Bar
                    key={s.key}
                    yAxisId={s.yAxisId}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    stackId="source"
                    maxBarSize={40}
                  />
                ))}
                {seriesConfig.filter((s) => s.visible && s.type === "line").map((s) => (
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
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Scorecards */}
        <div className="flex flex-col gap-3 w-44 shrink-0 pt-11">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Total Sessions</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.totalSessions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Direct</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.directSessions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Social</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.socialSessions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Organic</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.organicSessions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Paid</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.paidSessions.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
