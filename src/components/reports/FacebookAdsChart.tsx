"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, subDays, startOfDay, endOfDay, getDaysInMonth, startOfWeek, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ChartSettingsPopover, SeriesConfig } from "@/components/reports/ChartSettingsPopover";
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
  { key: "adRevenue", label: "Ad Revenue", color: "#c4d34f", visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "adSpend", label: "Ad Spend", color: "#6366f1", visible: true, type: "line", yAxisId: "left", showDots: true },
  { key: "fbOrders", label: "FB Orders", color: "#4472c4", visible: false, type: "line", yAxisId: "left", showDots: false },
  { key: "roas", label: "ROAS", color: "#10b981", visible: true, type: "line", yAxisId: "right", showDots: false },
];

const STORAGE_KEY = "facebook-ads-chart-settings";

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
  adRevenue: number;
  adSpend: number;
  fbOrders: number;
  roas: number;
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
  const visible = payload.filter((e) => !(e.name === "Forecast" && e.value === 0));
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
      {visible.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-600 dark:text-zinc-400">{entry.name}:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {entry.name === "ROAS"
              ? `${entry.value.toFixed(2)}x`
              : entry.name === "FB Orders"
                ? entry.value
                : formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FacebookAdsChart() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(subDays(new Date(), 90)),
    to: endOfDay(new Date()),
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("week");
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig[]>(DEFAULT_SERIES);

  // Load persisted config on mount
  useEffect(() => {
    setSeriesConfig(loadSeriesConfig());
  }, []);

  const handleSeriesChange = (updated: SeriesConfig[]) => {
    setSeriesConfig(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);
    try {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await fetch(`/api/reports/facebook-ads?from=${from}&to=${to}&groupBy=${groupBy}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch facebook ads report:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const barSeries = seriesConfig.find((s) => s.type === "bar");

  const chartData = data.map((d, i) => {
    let forecast = 0;

    if (i === data.length - 1 && groupBy !== "day" && barSeries?.visible) {
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
        const actual = d.adRevenue;
        const projected = (actual / daysElapsed) * totalDays;
        forecast = Math.max(0, Math.round((projected - actual) * 100) / 100);
      }
    }

    return {
      ...d,
      dateLabel: groupBy === "month"
        ? format(new Date(d.date), "MMM yyyy")
        : format(new Date(d.date), "dd MMM"),
      forecast,
    };
  });

  const totals = useMemo(() => {
    const sums = data.reduce(
      (acc, d) => ({
        adRevenue: acc.adRevenue + d.adRevenue,
        adSpend: acc.adSpend + d.adSpend,
        fbOrders: acc.fbOrders + d.fbOrders,
      }),
      { adRevenue: 0, adSpend: 0, fbOrders: 0 }
    );
    return {
      ...sums,
      roas: sums.adSpend > 0 ? Math.round((sums.adRevenue / sums.adSpend) * 100) / 100 : 0,
    };
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
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v: number) => `${v.toFixed(1)}x`}
                  tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                  tickLine={false}
                  axisLine={false}
                  width={45}
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
                      stackId="bar"
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
                {barSeries?.visible && (
                  <Bar
                    yAxisId="left"
                    dataKey="forecast"
                    name="Forecast"
                    legendType="none"
                    fill={barSeries.color}
                    fillOpacity={0.3}
                    stackId="bar"
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
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Ad Revenue</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.adRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Ad Spend</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.adSpend)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">ROAS</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.roas.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">FB Orders</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.fbOrders.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
