"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfDay, getDaysInMonth, startOfWeek, differenceInDays, subDays, addDays } from "date-fns";
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
  { key: "revenue", label: "Revenue", color: chartColors.amazon, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "estimatedPayout", label: "Est. Payout", color: chartColors.netCash, visible: true, type: "line", yAxisId: "left", showDots: true },
  { key: "adSpend", label: "Ad Spend", color: chartColors.adSpend, visible: true, type: "line", yAxisId: "left", showDots: true },
  { key: "unitsOrdered", label: "Units Ordered", color: chartColors.facebook, visible: false, type: "line", yAxisId: "left", showDots: false },
  { key: "sessions", label: "Sessions", color: chartColors.sessions, visible: false, type: "line", yAxisId: "left", showDots: false },
];

const STORAGE_KEY = "amazon-chart-settings-v4";

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
  revenue: number;
  unitsOrdered: number;
  sessions: number;
  adSpend: number;
  adRevenue: number;
  fbaFees: number;
  referralFees: number;
  estimatedPayout: number;
}

const EXPENSE_COLORS = {
  adSpend: "#2d2d2d",
  fbaFees: "#f59e0b",
  referralFees: "#6366f1",
} as const;

function ExpensesTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-600 dark:text-zinc-400">{entry.name}:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((e) => e.name === "Revenue")?.value ?? 0;
  const forecast = payload.find((e) => e.name === "Forecast")?.value ?? 0;
  const visible = payload.filter((e) => e.name !== "Forecast");
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-zinc-900 dark:text-zinc-100">{label}</p>
      {visible.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-zinc-600 dark:text-zinc-400">{entry.name}:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {entry.name === "Units Ordered" || entry.name === "Sessions"
              ? entry.value.toLocaleString()
              : formatCurrency(entry.value)}
          </span>
        </div>
      ))}
      {forecast > 0 && (
        <div className="flex items-center gap-2 py-0.5 mt-1 border-t border-zinc-200 dark:border-zinc-700 pt-1.5">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: visible.find((e) => e.name === "Revenue")?.color, opacity: 0.4 }} />
          <span className="text-zinc-600 dark:text-zinc-400">Forecast:</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatCurrency(revenue + forecast)}
          </span>
        </div>
      )}
    </div>
  );
}

export function AmazonChart() {
  const { apiFetch, currentOrg } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
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
      const res = await apiFetch(`/api/reports/amazon?from=${from}&to=${to}&groupBy=${groupBy}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch amazon report:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy, apiFetch, currentOrg]);

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
        const actual = d.revenue;
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
    return data.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        unitsOrdered: acc.unitsOrdered + d.unitsOrdered,
        sessions: acc.sessions + d.sessions,
        adSpend: acc.adSpend + d.adSpend,
        adRevenue: acc.adRevenue + d.adRevenue,
        fbaFees: acc.fbaFees + d.fbaFees,
        referralFees: acc.referralFees + d.referralFees,
        estimatedPayout: acc.estimatedPayout + d.estimatedPayout,
      }),
      { revenue: 0, unitsOrdered: 0, sessions: 0, adSpend: 0, adRevenue: 0, fbaFees: 0, referralFees: 0, estimatedPayout: 0 }
    );
  }, [data]);

  // ── Inventory data (Amazon only) ─────────────────────
  interface InventoryRow {
    sku: string;
    productName: string | null;
    inventory: number;
    valueCost: number;
    valueRrp: number;
    runRate: number | null;
    daysLeft: number | null;
    oosDate: string | null;
  }

  type ForecastPeriod = "7d" | "14d" | "30d";
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>("30d");
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryDate, setInventoryDate] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;

    (async () => {
      setInventoryLoading(true);
      try {
        const periodDays = forecastPeriod === "7d" ? 7 : forecastPeriod === "14d" ? 14 : 30;
        const fromDate = format(subDays(new Date(), periodDays), "yyyy-MM-dd");
        const toYesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

        const [invRes, rrRes] = await Promise.all([
          apiFetch("/api/inventory"),
          apiFetch(`/api/inventory/run-rate?from=${fromDate}&to=${toYesterday}`),
        ]);

        if (cancelled) return;

        if (invRes.ok && rrRes.ok) {
          const invData = await invRes.json();
          const rrData = await rrRes.json();
          const amazonUnits: Record<string, number> = rrData.amazonUnits ?? {};
          const days = periodDays;

          setInventoryDate(invData.date ?? null);

          const rows: InventoryRow[] = (invData.items ?? []).map((item: { sku: string; productName: string | null; amazonQty: number; landedCost?: number; amazonRrp?: number }) => {
            const sold = amazonUnits[item.sku] ?? 0;
            const rate = sold > 0 ? sold / days : null;
            const qty = item.amazonQty ?? 0;
            const daysLeft = rate ? Math.floor(qty / rate) : null;
            return {
              sku: item.sku,
              productName: item.productName,
              inventory: qty,
              valueCost: qty * (item.landedCost ?? 0),
              valueRrp: qty * (item.amazonRrp ?? 0),
              runRate: rate,
              daysLeft,
              oosDate: daysLeft !== null ? format(addDays(new Date(), daysLeft), "dd MMM yyyy") : null,
            };
          });

          setInventoryRows(rows);
        }
      } catch (err) {
        console.error("Failed to fetch inventory:", err);
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiFetch, currentOrg, forecastPeriod]);

  return (
    <div className="pt-4">
      {/* Sticky Controls */}
      <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950 pb-4 -mt-4 pt-4">
        <div className="flex items-center gap-3 justify-end">
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
      </div>

      {/* Summary */}
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Summary</h2>
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
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Revenue</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.revenue)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Ad Spend</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : formatCurrency(totals.adSpend)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Units Ordered</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.unitsOrdered.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Sessions</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.sessions.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Revenue vs Expenses */}
      {!loading && chartData.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Revenue vs Expenses</h2>
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
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
                  <Tooltip content={<ExpensesTooltip />} />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={chartColors.amazon}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartColors.amazon }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="estimatedPayout"
                    name="Est. Payout"
                    stroke={chartColors.netCash}
                    strokeWidth={2}
                    dot={{ r: 3, fill: chartColors.netCash }}
                  />
                  <Bar yAxisId="left" dataKey="adSpend" name="Ad Spend" fill={EXPENSE_COLORS.adSpend} stackId="expenses" maxBarSize={40} />
                  <Bar yAxisId="left" dataKey="fbaFees" name="FBA Fees" fill={EXPENSE_COLORS.fbaFees} stackId="expenses" maxBarSize={40} />
                  <Bar yAxisId="left" dataKey="referralFees" name="Referral Fees" fill={EXPENSE_COLORS.referralFees} stackId="expenses" radius={[2, 2, 0, 0]} maxBarSize={40} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Expense Scorecards */}
            <div className="flex flex-col gap-3 w-44 shrink-0 pt-11">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Ad Revenue</p>
                <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(totals.adRevenue)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Ad Spend</p>
                <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(totals.adSpend)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">ROAS</p>
                <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {totals.adSpend > 0 ? (totals.adRevenue / totals.adSpend).toFixed(2) + "x" : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Est. Payout</p>
                <p className={`text-xl font-semibold ${totals.estimatedPayout >= 0 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"}`}>
                  {formatCurrency(totals.estimatedPayout)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Amazon Inventory */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Amazon Inventory</h2>
            {inventoryDate && (
              <span className="text-sm text-zinc-400 block">as of {inventoryDate}</span>
            )}
          </div>
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {(["7d", "14d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setForecastPeriod(p)}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  forecastPeriod === p
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {p === "7d" ? "7 Days" : p === "14d" ? "14 Days" : "30 Days"}
              </button>
            ))}
          </div>
        </div>
        {inventoryLoading ? (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden">
            <div className="flex gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              {[80, 180, 80, 80, 80, 120].map((w, i) => (
                <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
              ))}
            </div>
            {[...Array(5)].map((_, row) => (
              <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                {[80, 180, 80, 80, 80, 120].map((w, col) => (
                  <div key={col} className="h-3.5 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse shrink-0" style={{ width: w }} />
                ))}
              </div>
            ))}
          </div>
        ) : inventoryRows.length === 0 ? (
          <div className="table-empty">No inventory data available.</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="table-header-row">
                  <th className="table-header-cell table-header-cell-sticky">SKU</th>
                  <th className="table-header-cell min-w-[180px]">Product</th>
                  <th className="table-header-cell">Inventory</th>
                  <th className="table-header-cell">Value (Cost)</th>
                  <th className="table-header-cell">Value (RRP)</th>
                  <th className="table-header-cell">Run Rate</th>
                  <th className="table-header-cell">Days Left</th>
                  <th className="table-header-cell">OOS Forecast</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((row) => (
                  <tr key={row.sku} className="table-body-row">
                    <td className="table-cell table-cell-sticky table-cell-primary">{row.sku}</td>
                    <td className="table-cell min-w-[180px]">{row.productName ?? "-"}</td>
                    <td className="table-cell">
                      {row.inventory === 0 ? (
                        <span className="text-red-500 font-medium">0</span>
                      ) : (
                        row.inventory
                      )}
                    </td>
                    <td className="table-cell">{formatCurrency(row.valueCost)}</td>
                    <td className="table-cell">{formatCurrency(row.valueRrp)}</td>
                    <td className="table-cell">
                      {row.runRate !== null ? row.runRate.toFixed(1) : "-"}
                    </td>
                    <td className={`table-cell ${
                      row.daysLeft !== null
                        ? row.daysLeft < 7
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium"
                          : row.daysLeft < 30
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium"
                            : ""
                        : ""
                    }`}>
                      {row.daysLeft !== null ? row.daysLeft : "-"}
                    </td>
                    <td className="table-cell">{row.oosDate ?? "-"}</td>
                  </tr>
                ))}
                <tr className="table-body-row border-t-2 border-zinc-300 dark:border-zinc-600 font-semibold">
                  <td className="table-cell table-cell-sticky table-cell-primary">Total</td>
                  <td className="table-cell min-w-[180px]"></td>
                  <td className="table-cell">{inventoryRows.reduce((s, r) => s + r.inventory, 0).toLocaleString()}</td>
                  <td className="table-cell">{formatCurrency(inventoryRows.reduce((s, r) => s + r.valueCost, 0))}</td>
                  <td className="table-cell">{formatCurrency(inventoryRows.reduce((s, r) => s + r.valueRrp, 0))}</td>
                  <td className="table-cell"></td>
                  <td className="table-cell"></td>
                  <td className="table-cell"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
