"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { format, startOfDay, getDaysInMonth, startOfWeek, differenceInDays, subDays, addDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets, suggestGroupBy } from "@/components/DateRangePicker";
import { ChartSettingsPopover, SeriesConfig } from "@/components/reports/ChartSettingsPopover";
import { chartColors } from "@/lib/chart-colors";
import {
  ComposedChart,
  BarChart,
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
  { key: "revenue", label: "Revenue", color: chartColors.shopify, visible: true, type: "bar", yAxisId: "left", showDots: false },
  { key: "orders", label: "Orders", color: chartColors.facebook, visible: false, type: "line", yAxisId: "left", showDots: false },
  { key: "fbSpend", label: "FB Spend", color: chartColors.fbSpend, visible: true, type: "line", yAxisId: "left", showDots: true },
  { key: "netCashIn", label: "Net Cash In", color: chartColors.netCash, visible: true, type: "line", yAxisId: "left", showDots: true },
];

const STORAGE_KEY = "shopify-chart-settings";

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
  orders: number;
  fbSpend: number;
  netCashIn: number;
}

const groupByLabels: Record<GroupBy, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

const groupByOrder: GroupBy[] = ["day", "week", "month"];

// ── Unit Sales constants ──
type UnitSalesSkuFilter = "all" | "8-rolls" | "24-rolls" | "48-rolls";
const UNIT_SALES_COLORS: Record<string, string> = {
  "8 Rolls": "#e4edaa",
  "24 Rolls": "#c4d34f",
  "48 Rolls": "#9aab2f",
};

const SKU_FILTER_PATTERNS: [string, UnitSalesSkuFilter][] = [
  ["14641003", "48-rolls"],
  ["14641002", "24-rolls"],
  ["14641001", "8-rolls"],
];

function skuToFilterKey(sku: string): UnitSalesSkuFilter | null {
  for (const [pattern, group] of SKU_FILTER_PATTERNS) {
    if (sku.includes(pattern)) return group;
  }
  return null;
}

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

function formatCurrencyInt(value: number): string {
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
            {entry.name === "Orders" ? entry.value : formatCurrency(entry.value)}
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

export function ShopifyChart({ controlsContainer }: { controlsContainer?: HTMLDivElement | null }) {
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

  // Load persisted config on mount
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
      const res = await apiFetch(`/api/reports/shopify?from=${from}&to=${to}&groupBy=${groupBy}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch shopify report:", err);
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
        orders: acc.orders + d.orders,
        netCashIn: acc.netCashIn + d.netCashIn,
      }),
      { revenue: 0, orders: 0, netCashIn: 0 }
    );
  }, [data]);

  // ── Inventory data (Shopify only) ─────────────────────
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
          const shopifyUnitsMap: Record<string, number> = rrData.shopifyUnits ?? {};
          const days = periodDays;

          setInventoryDate(invData.date ?? null);

          const rows: InventoryRow[] = (invData.items ?? []).map((item: { sku: string; productName: string | null; shopifyQty: number; landedCost?: number; dtcRrp?: number }) => {
            const sold = shopifyUnitsMap[item.sku] ?? 0;
            const rate = sold > 0 ? sold / days : null;
            const qty = item.shopifyQty ?? 0;
            const daysLeft = rate ? Math.floor(qty / rate) : null;
            return {
              sku: item.sku,
              productName: item.productName,
              inventory: qty,
              valueCost: qty * (item.landedCost ?? 0),
              valueRrp: qty * (item.dtcRrp ?? 0),
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

  // ── Unit Sales state ──────────────────────────────────
  const [unitSalesData, setUnitSalesData] = useState<{ data: Record<string, number | string>[]; skus: string[] }>({ data: [], skus: [] });
  const [unitSalesLoading, setUnitSalesLoading] = useState(false);
  const [unitSalesSkuFilter, setUnitSalesSkuFilter] = useState<UnitSalesSkuFilter>("all");

  const fetchUnitSales = useCallback(async () => {
    if (!currentOrg || !dateRange?.from || !dateRange?.to) return;
    setUnitSalesLoading(true);
    try {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await apiFetch(
        `/api/inventory/unit-sales?from=${from}&to=${to}&groupBy=${groupBy}&channel=shopify&skuFilter=${unitSalesSkuFilter}`
      );
      if (res.ok) {
        const json = await res.json();
        setUnitSalesData({ data: json.data ?? [], skus: json.skus ?? [] });
      }
    } catch (e) {
      console.error("Failed to fetch unit sales:", e);
    } finally {
      setUnitSalesLoading(false);
    }
  }, [apiFetch, currentOrg, dateRange, groupBy, unitSalesSkuFilter]);

  useEffect(() => {
    fetchUnitSales();
  }, [fetchUnitSales]);

  const unitSalesStats = useMemo(() => {
    let total = 0;
    for (const row of unitSalesData.data) {
      for (const sku of unitSalesData.skus) {
        total += (Number(row[sku]) || 0);
      }
    }

    // Last 30 days run rate (units/day)
    const cutoff = format(subDays(new Date(), 30), "yyyy-MM-dd");
    let last30Units = 0;
    for (const row of unitSalesData.data) {
      if (String(row.date) >= cutoff) {
        for (const sku of unitSalesData.skus) {
          last30Units += (Number(row[sku]) || 0);
        }
      }
    }
    const dailyRunRate = last30Units / 30;

    // Inventory held — Shopify only, filtered by SKU filter
    let inventoryHeld = 0;
    const filteredRows = unitSalesSkuFilter === "all"
      ? inventoryRows
      : inventoryRows.filter((r) => skuToFilterKey(r.sku) === unitSalesSkuFilter);
    for (const row of filteredRows) {
      inventoryHeld += row.inventory;
    }

    const daysRemaining = dailyRunRate > 0 ? Math.floor(inventoryHeld / dailyRunRate) : null;

    return { total, dailyRunRate, inventoryHeld, daysRemaining };
  }, [unitSalesData, inventoryRows, unitSalesSkuFilter]);

  return (
    <div className="pt-4">
      {controlsContainer && createPortal(
        <>
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
        </>,
        controlsContainer,
      )}

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
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Orders</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : totals.orders.toLocaleString()}
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

      {/* Shopify Inventory */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Shopify Inventory</h2>
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
              {[80, 180, 80, 80, 80, 80, 80, 120].map((w, i) => (
                <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
              ))}
            </div>
            {[...Array(5)].map((_, row) => (
              <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                {[80, 180, 80, 80, 80, 80, 80, 120].map((w, col) => (
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
                    <td className="table-cell">{formatCurrencyInt(row.valueCost)}</td>
                    <td className="table-cell">{formatCurrencyInt(row.valueRrp)}</td>
                    <td className="table-cell">
                      {row.runRate !== null ? row.runRate.toFixed(1) : "-"}
                    </td>
                    <td className={`table-cell ${
                      row.daysLeft !== null
                        ? row.daysLeft < 90
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium"
                          : row.daysLeft <= 150
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
                  <td className="table-cell">{formatCurrencyInt(inventoryRows.reduce((s, r) => s + r.valueCost, 0))}</td>
                  <td className="table-cell">{formatCurrencyInt(inventoryRows.reduce((s, r) => s + r.valueRrp, 0))}</td>
                  <td className="table-cell"></td>
                  <td className="table-cell"></td>
                  <td className="table-cell"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unit Sales */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Unit Sales</h2>
        <div className="flex items-center gap-4 flex-wrap mb-4">
          {/* SKU filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">SKU</span>
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {([["all", "All"], ["8-rolls", "8 Rolls"], ["24-rolls", "24 Rolls"], ["48-rolls", "48 Rolls"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setUnitSalesSkuFilter(val)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                    unitSalesSkuFilter === val
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scorecards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Total Units Sold</div>
            <div className="text-2xl font-bold">{unitSalesLoading ? "..." : unitSalesStats.total.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Units / Day (30d avg)</div>
            <div className="text-2xl font-bold">{unitSalesLoading ? "..." : unitSalesStats.dailyRunRate.toFixed(1)}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Units / Month (30d avg)</div>
            <div className="text-2xl font-bold">{unitSalesLoading ? "..." : Math.round(unitSalesStats.dailyRunRate * 30).toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Inventory Held</div>
            <div className="text-2xl font-bold">{unitSalesLoading ? "..." : unitSalesStats.inventoryHeld.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Days Remaining</div>
            <div className="text-2xl font-bold">{unitSalesLoading ? "..." : unitSalesStats.daysRemaining !== null ? unitSalesStats.daysRemaining.toLocaleString() : "—"}</div>
          </div>
        </div>

        {/* Chart */}
        {unitSalesLoading ? (
          <div className="flex items-center justify-center h-[420px] text-zinc-400 dark:text-zinc-500 text-sm">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading unit sales...
          </div>
        ) : unitSalesData.skus.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
            No unit sales data for the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={unitSalesData.data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-200)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-zinc-200)" }}
                tickFormatter={(d) => {
                  const date = new Date(String(d));
                  return groupBy === "month"
                    ? format(date, "MMM yyyy")
                    : format(date, "dd MMM");
                }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--color-zinc-500)" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                labelFormatter={(d) => {
                  const date = new Date(String(d));
                  return groupBy === "month"
                    ? format(date, "MMM yyyy")
                    : format(date, "dd MMM yyyy");
                }}
                formatter={(value, name) => [
                  Number(value).toLocaleString() + " units",
                  String(name),
                ]}
                contentStyle={{
                  backgroundColor: "var(--color-zinc-50, #fafafa)",
                  border: "1px solid var(--color-zinc-200, #e4e4e7)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span className="text-zinc-900 dark:text-zinc-100">{value}</span>} />
              {unitSalesData.skus.map((group) => (
                <Bar
                  key={group}
                  dataKey={group}
                  stackId="units"
                  fill={UNIT_SALES_COLORS[group] ?? "#c4d34f"}
                  name={group}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
