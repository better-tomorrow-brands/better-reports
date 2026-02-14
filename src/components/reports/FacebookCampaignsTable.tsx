"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";
import { DateRangePicker, presets } from "@/components/DateRangePicker";
import { usePersistedDateRange } from "@/hooks/usePersistedDateRange";

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "utmCampaign", label: "UTM Campaign", visible: true },
  { key: "adSpend", label: "Ad Spend", visible: true },
  { key: "orders", label: "Orders", visible: true },
  { key: "revenue", label: "Revenue", visible: true },
  { key: "roas", label: "ROAS", visible: true },
  { key: "costPerResult", label: "Cost per Result", visible: true },
];

const STORAGE_KEY = "facebook-campaigns-table-settings";

function loadColumnConfig(): ColumnConfig[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(stored) as ColumnConfig[];
    return DEFAULT_COLUMNS.map((def) => {
      const saved = parsed.find((c) => c.key === def.key);
      return saved ? { ...def, visible: saved.visible } : def;
    });
  } catch {
    return DEFAULT_COLUMNS;
  }
}

interface CampaignRow {
  campaign: string;
  utmCampaign: string;
  adSpend: number;
  orders: number;
  revenue: number;
  roas: number;
  costPerResult: number;
}

interface Totals {
  shopifyRevenue: number;
  shopifyOrders: number;
  amazonRevenue: number;
  amazonOrders: number;
  sessions: number;
  adSpend: number;
}

type OverallFilter = "total" | "amazon" | "shopify";
const SOURCES_STORAGE_KEY = "dashboard-overall-filter";

function loadOverallFilter(): OverallFilter {
  if (typeof window === "undefined") return "total";
  try {
    const stored = localStorage.getItem(SOURCES_STORAGE_KEY);
    if (stored === "total" || stored === "amazon" || stored === "shopify") return stored;
    return "total";
  } catch {
    return "total";
  }
}

type SortKey = keyof CampaignRow;
type SortDir = "asc" | "desc";

const ROW_HEIGHT = 45;
const MAX_VISIBLE_ROWS = 8;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

function SortIcon({ direction }: { direction: SortDir | null }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`inline-block ml-1 ${direction ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
    >
      <path
        d="M6 2L9 5H3L6 2Z"
        fill="currentColor"
        opacity={direction === "asc" ? 1 : 0.3}
      />
      <path
        d="M6 10L3 7H9L6 10Z"
        fill="currentColor"
        opacity={direction === "desc" ? 1 : 0.3}
      />
    </svg>
  );
}

function DashboardSettingsPopover({
  columns,
  onColumnsChange,
}: {
  columns: ColumnConfig[];
  onColumnsChange: (updated: ColumnConfig[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
        aria-label="Dashboard settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 w-48">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Facebook Table</p>
          <div className="flex flex-col gap-2">
            {columns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={(e) =>
                    onColumnsChange(
                      columns.map((c) =>
                        c.key === col.key ? { ...c, visible: e.target.checked } : c
                      )
                    )
                  }
                  className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FacebookCampaignsTable({ controlsContainer }: { controlsContainer?: HTMLDivElement | null }) {
  const { apiFetch, currentOrg } = useOrg();
  const [dateRange, setDateRange] = usePersistedDateRange(
    "dr-campaigns",
    () => presets.find((p) => p.label === "Today")!.getValue()
  );
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [overallTotals, setOverallTotals] = useState<Totals>({ shopifyRevenue: 0, shopifyOrders: 0, amazonRevenue: 0, amazonOrders: 0, sessions: 0, adSpend: 0 });
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [filter, setFilter] = useState<OverallFilter>("total");
  const [sortKey, setSortKey] = useState<SortKey>("roas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setColumns(loadColumnConfig());
    setFilter(loadOverallFilter());
  }, []);

  const handleColumnsChange = (updated: ColumnConfig[]) => {
    setColumns(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleFilterChange = (value: OverallFilter) => {
    setFilter(value);
    localStorage.setItem(SOURCES_STORAGE_KEY, value);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "campaign" || key === "utmCampaign" ? "asc" : "desc");
    }
  };

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to || !currentOrg) return;
    setLoading(true);
    try {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");
      const res = await apiFetch(
        `/api/reports/facebook-campaigns?from=${from}&to=${to}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setRows(json.rows);
      setOverallTotals(json.totals);
    } catch (err) {
      console.error("Failed to fetch facebook campaigns:", err);
      setRows([]);
      setOverallTotals({ shopifyRevenue: 0, shopifyOrders: 0, amazonRevenue: 0, amazonOrders: 0, sessions: 0, adSpend: 0 });
    } finally {
      setLoading(false);
    }
  }, [dateRange, apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const sums = rows.reduce(
      (acc, r) => ({
        adSpend: acc.adSpend + r.adSpend,
        revenue: acc.revenue + r.revenue,
        orders: acc.orders + r.orders,
      }),
      { adSpend: 0, revenue: 0, orders: 0 }
    );
    return {
      ...sums,
      roas:
        sums.adSpend > 0
          ? Math.round((sums.revenue / sums.adSpend) * 100) / 100
          : 0,
      costPerResult:
        sums.orders > 0
          ? Math.round((sums.adSpend / sums.orders) * 100) / 100
          : 0,
    };
  }, [rows]);

  const combinedTotals = useMemo(() => {
    const revenue =
      filter === "shopify" ? overallTotals.shopifyRevenue :
      filter === "amazon" ? overallTotals.amazonRevenue :
      overallTotals.shopifyRevenue + overallTotals.amazonRevenue;
    const totalOrders =
      filter === "shopify" ? overallTotals.shopifyOrders :
      filter === "amazon" ? overallTotals.amazonOrders :
      overallTotals.shopifyOrders + overallTotals.amazonOrders;
    const conversionRate = overallTotals.sessions > 0
      ? Math.round((totalOrders / overallTotals.sessions) * 10000) / 100
      : 0;
    const roas = overallTotals.adSpend > 0
      ? Math.round((revenue / overallTotals.adSpend) * 100) / 100
      : 0;
    return { revenue, orders: totalOrders, sessions: overallTotals.sessions, conversionRate, adSpend: overallTotals.adSpend, roas };
  }, [overallTotals, filter]);

  const isVisible = (key: string) =>
    columns.find((c) => c.key === key)?.visible ?? true;

  // Show sessions/CR unless the date range includes today and filter includes Amazon data
  const showSessions = useMemo(() => {
    if (filter === "shopify") return true;
    if (!dateRange?.to) return true;
    const today = format(new Date(), "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    return toStr < today; // hide when range includes today
  }, [filter, dateRange]);

  const sortDirFor = (key: SortKey) => (sortKey === key ? sortDir : null);

  const thClass = (align: "left" | "right") =>
    `${align === "left" ? "text-left" : "text-right"} px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer select-none group whitespace-nowrap bg-zinc-50 dark:bg-zinc-800/50`;

  const scrollMaxHeight = ROW_HEIGHT * MAX_VISIBLE_ROWS;

  return (
    <div className="pt-4">
      {controlsContainer && createPortal(
        <>
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {(["total", "amazon", "shopify"] as const).map((value) => (
              <button
                key={value}
                onClick={() => handleFilterChange(value)}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  filter === value
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          <DashboardSettingsPopover columns={columns} onColumnsChange={handleColumnsChange} />
        </>,
        controlsContainer,
      )}

      {/* Overall */}
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Overall</h2>
      <div className={`grid gap-3 mb-6 ${showSessions ? "grid-cols-6" : "grid-cols-4"}`}>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Total Revenue</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {loading ? "—" : formatCurrency(combinedTotals.revenue)}
          </p>
        </div>
        {showSessions && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Sessions</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : combinedTotals.sessions.toLocaleString()}
            </p>
          </div>
        )}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Orders</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {loading ? "—" : combinedTotals.orders.toLocaleString()}
          </p>
        </div>
        {showSessions && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Conversion Rate</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {loading ? "—" : `${combinedTotals.conversionRate.toFixed(2)}%`}
            </p>
          </div>
        )}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Ad Spend</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {loading ? "—" : formatCurrency(combinedTotals.adSpend)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">ROAS</p>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {loading ? "—" : combinedTotals.roas.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Facebook performance */}
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Facebook Performance</h2>
      {loading ? (
        <div className="flex items-center justify-center h-80 text-zinc-400">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center h-80 text-zinc-400">
          No data for selected range
        </div>
      ) : (
        <div
          className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700"
          style={{ maxHeight: scrollMaxHeight + ROW_HEIGHT }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th
                  className={thClass("left")}
                  style={{ position: "sticky", top: 0, zIndex: 10 }}
                  onClick={() => handleSort("campaign")}
                >
                  Campaign
                  <SortIcon direction={sortDirFor("campaign")} />
                </th>
                {isVisible("utmCampaign") && (
                  <th
                    className={thClass("left")}
                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                    onClick={() => handleSort("utmCampaign")}
                  >
                    UTM
                    <SortIcon direction={sortDirFor("utmCampaign")} />
                  </th>
                )}
                {isVisible("adSpend") && (
                  <th
                    className={thClass("right")}
                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                    onClick={() => handleSort("adSpend")}
                  >
                    Ad Spend
                    <SortIcon direction={sortDirFor("adSpend")} />
                  </th>
                )}
                {isVisible("orders") && (
                  <th
                    className={thClass("right")}
                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                    onClick={() => handleSort("orders")}
                  >
                    Orders
                    <SortIcon direction={sortDirFor("orders")} />
                  </th>
                )}
                {isVisible("revenue") && (
                  <th
                    className={thClass("right")}
                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                    onClick={() => handleSort("revenue")}
                  >
                    Revenue
                    <SortIcon direction={sortDirFor("revenue")} />
                  </th>
                )}
                {isVisible("roas") && (
                  <th
                    className={thClass("right")}
                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                    onClick={() => handleSort("roas")}
                  >
                    ROAS
                    <SortIcon direction={sortDirFor("roas")} />
                  </th>
                )}
                {isVisible("costPerResult") && (
                  <th
                    className={thClass("right")}
                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                    onClick={() => handleSort("costPerResult")}
                  >
                    Cost per Result
                    <SortIcon direction={sortDirFor("costPerResult")} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    {row.campaign || "—"}
                  </td>
                  {isVisible("utmCampaign") && (
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {row.utmCampaign || "—"}
                    </td>
                  )}
                  {isVisible("adSpend") && (
                    <td className="px-4 py-3 text-right text-zinc-900 dark:text-zinc-100">
                      {row.adSpend > 0 ? formatCurrency(row.adSpend) : "—"}
                    </td>
                  )}
                  {isVisible("orders") && (
                    <td className="px-4 py-3 text-right text-zinc-900 dark:text-zinc-100">
                      {row.orders}
                    </td>
                  )}
                  {isVisible("revenue") && (
                    <td className="px-4 py-3 text-right text-zinc-900 dark:text-zinc-100">
                      {row.revenue > 0 ? formatCurrency(row.revenue) : "—"}
                    </td>
                  )}
                  {isVisible("roas") && (
                    <td className="px-4 py-3 text-right text-zinc-900 dark:text-zinc-100">
                      {row.adSpend > 0 ? row.roas.toFixed(2) : "—"}
                    </td>
                  )}
                  {isVisible("costPerResult") && (
                    <td className="px-4 py-3 text-right text-zinc-900 dark:text-zinc-100">
                      {row.orders > 0 ? formatCurrency(row.costPerResult) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Scorecards */}
      {!loading && rows.length > 0 && (
        <div className="flex gap-3 mt-6">
          <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Ad Spend
            </p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(totals.adSpend)}
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Revenue
            </p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(totals.revenue)}
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              ROAS
            </p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {totals.roas.toFixed(2)}
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Orders
            </p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {totals.orders.toLocaleString()}
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Cost per Result
            </p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {totals.orders > 0 ? formatCurrency(totals.costPerResult) : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
