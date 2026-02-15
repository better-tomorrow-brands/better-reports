"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Table, Column } from "@/components/Table";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Scorecard, ScorecardGrid } from "@/components/Scorecard";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";

const UTM_SOURCE_OPTIONS = ["facebook", "instagram", "google", "tiktok", "email", "referral"];

function EditableSelect({
  value,
  options,
  onSave,
}: {
  value: string | null;
  options: string[];
  onSave: (val: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        className="inline-flex items-center gap-1 text-left w-full group hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
        onClick={() => setEditing(true)}
      >
        <span className="truncate">{value || "-"}</span>
        <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  return (
    <select
      ref={selectRef}
      value={value || ""}
      onChange={(e) => {
        onSave(e.target.value || null);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="border border-zinc-300 dark:border-zinc-600 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-zinc-800 w-full"
    >
      <option value="">-- clear --</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function EditableText({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (val: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        className="inline-flex items-center gap-1 text-left w-full group hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
        onClick={() => {
          setDraft(value || "");
          setEditing(true);
        }}
      >
        <span className="truncate">{value || "-"}</span>
        <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onSave(draft || null);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onSave(draft || null);
          setEditing(false);
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="border border-zinc-300 dark:border-zinc-600 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-zinc-800 w-full"
    />
  );
}

interface Order {
  id: number;
  shopifyId: string;
  orderNumber: string | null;
  email: string | null;
  customerName: string | null;
  phone: string | null;
  createdAt: string | null;
  fulfillmentStatus: string | null;
  fulfilledAt: string | null;
  subtotal: string | null;
  shipping: string | null;
  tax: string | null;
  total: string | null;
  discountCodes: string | null;
  skus: string | null;
  quantity: number | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  trackingNumber: string | null;
  tags: string | null;
  hasConversionData: boolean;
  isRepeatCustomer: boolean;
  receivedAt: string | null;
}

interface ColumnDef {
  key: keyof Order;
  label: string;
  defaultVisible: boolean;
  sticky?: boolean;
  primary?: boolean;
  filterable?: boolean;
  editable?: "source" | "campaign" | "text";
  render?: (value: unknown, order: Order) => React.ReactNode;
}

interface ActiveFilter {
  key: keyof Order;
  label: string;
  values: Set<string>;
}

const allColumns: ColumnDef[] = [
  { key: "orderNumber", label: "Order", defaultVisible: true, sticky: true, primary: true, render: (v) => v ? `#${v}` : "-" },
  { key: "createdAt", label: "Date", defaultVisible: true, render: (v) => formatDate(v as string) },
  { key: "customerName", label: "Customer", defaultVisible: true, filterable: true },
  { key: "email", label: "Email", defaultVisible: false, filterable: true },
  { key: "phone", label: "Phone", defaultVisible: false },
  { key: "total", label: "Total", defaultVisible: true, render: (v) => formatCurrency(v as string) },
  { key: "subtotal", label: "Subtotal", defaultVisible: false, render: (v) => formatCurrency(v as string) },
  { key: "shipping", label: "Shipping", defaultVisible: false, render: (v) => formatCurrency(v as string) },
  { key: "tax", label: "Tax", defaultVisible: false, render: (v) => formatCurrency(v as string) },
  { key: "fulfillmentStatus", label: "Status", defaultVisible: true, filterable: true, render: (v) => formatStatus(v as string) },
  { key: "quantity", label: "Qty", defaultVisible: true },
  { key: "skus", label: "SKUs", defaultVisible: false, filterable: true },
  { key: "discountCodes", label: "Discount", defaultVisible: true, filterable: true },
  { key: "utmSource", label: "Source", defaultVisible: true, filterable: true, editable: "source" },
  { key: "utmMedium", label: "Medium", defaultVisible: false, filterable: true, editable: "text" },
  { key: "utmCampaign", label: "Campaign", defaultVisible: true, filterable: true, editable: "campaign" },
  { key: "utmContent", label: "Content", defaultVisible: false, filterable: true, editable: "text" },
  { key: "utmTerm", label: "Term", defaultVisible: false, filterable: true, editable: "text" },
  { key: "trackingNumber", label: "Tracking", defaultVisible: false },
  { key: "tags", label: "Tags", defaultVisible: false, filterable: true },
  { key: "hasConversionData", label: "Conv?", defaultVisible: true, filterable: true, render: (v) => formatBoolean(v as boolean) },
  { key: "isRepeatCustomer", label: "Repeat?", defaultVisible: true, filterable: true, render: (v) => formatBoolean(v as boolean) },
  { key: "fulfilledAt", label: "Fulfilled At", defaultVisible: false, render: (v) => formatDate(v as string) },
  { key: "receivedAt", label: "Received", defaultVisible: false, render: (v) => formatDate(v as string) },
  { key: "shopifyId", label: "Shopify ID", defaultVisible: false },
];

const filterableColumns = allColumns.filter((c) => c.filterable);

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: string | null): string {
  if (!amount) return "-";
  return `£${parseFloat(amount).toFixed(2)}`;
}

function formatStatus(status: string | null): React.ReactNode {
  const s = status || "unfulfilled";
  const badgeClass = s === "fulfilled" ? "badge-success" : "badge-warning";
  return <span className={`badge ${badgeClass}`}>{s}</span>;
}

function formatBoolean(value: boolean): React.ReactNode {
  return value ? (
    <span className="text-success">Y</span>
  ) : (
    <span className="text-muted">N</span>
  );
}

function getDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const STORAGE_KEY = "orders-visible-columns";

function getInitialColumns(): Set<string> {
  if (typeof window === "undefined") {
    return new Set(allColumns.filter((c) => c.defaultVisible).map((c) => c.key));
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return new Set(JSON.parse(saved));
    } catch {
      // Invalid JSON, use defaults
    }
  }
  return new Set(allColumns.filter((c) => c.defaultVisible).map((c) => c.key));
}

export default function OrdersPage() {
  const { apiFetch, currentOrg } = useOrg();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(getInitialColumns);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [editingFilter, setEditingFilter] = useState<keyof Order | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const filterModalRef = useRef<HTMLDivElement>(null);

  // Date range filter
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Search
  const [search, setSearch] = useState("");

  // Sort
  type SortField = "createdAt" | "total" | "customerName" | "fulfillmentStatus" | "quantity";
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showSortModal, setShowSortModal] = useState(false);
  const sortModalRef = useRef<HTMLDivElement>(null);

  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // UTM campaign options from DB
  const [utmCampaignOptions, setUtmCampaignOptions] = useState<string[]>([]);

  const updateOrderUtm = useCallback(
    async (orderId: number, field: string, value: string | null) => {
      try {
        const res = await apiFetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: orderId, [field]: value }),
        });
        if (!res.ok) throw new Error("Failed to update");
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, [field]: value } : o))
        );
      } catch (err) {
        console.error("UTM update failed:", err);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    if (!currentOrg) return;
    apiFetch("/api/campaigns/utm-options")
      .then((res) => res.json())
      .then((data) => {
        if (data.utmCampaigns) setUtmCampaignOptions(data.utmCampaigns);
      })
      .catch(() => {});
  }, [apiFetch, currentOrg]);

  const fetchOrders = useCallback(() => {
    if (!currentOrg) return;
    apiFetch("/api/orders?limit=1000")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrders(data.orders || []);
          setTotal(data.total || 0);
        }
      })
      .catch(() => setError("Failed to load orders"))
      .finally(() => setLoading(false));
  }, [apiFetch, currentOrg]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiFetch("/api/orders/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || "Sync failed");
      } else {
        setSyncMessage(`Synced ${data.upserted} order${data.upserted === 1 ? "" : "s"}`);
        fetchOrders();
      }
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 3000);
    }
  }, [fetchOrders, apiFetch]);

  useEffect(() => {
    setVisibleColumns(getInitialColumns());
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
        setShowColumnPicker(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (sortModalRef.current && !sortModalRef.current.contains(event.target as Node)) {
        setShowSortModal(false);
      }
      if (filterModalRef.current && !filterModalRef.current.contains(event.target as Node)) {
        setEditingFilter(null);
        setFilterSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get unique values for a field
  const getUniqueValues = (key: keyof Order): string[] => {
    const values = new Set<string>();
    orders.forEach((order) => {
      const val = order[key];
      values.add(getDisplayValue(val));
    });
    return Array.from(values).sort((a, b) => {
      if (a === "(empty)") return 1;
      if (b === "(empty)") return -1;
      return a.localeCompare(b);
    });
  };

  // Get currently selected values for a filter
  const getFilterValues = (key: keyof Order): Set<string> => {
    const filter = filters.find((f) => f.key === key);
    return filter?.values || new Set();
  };

  // Toggle a value in a filter
  const toggleFilterValue = (key: keyof Order, value: string) => {
    setFilters((prev) => {
      const existing = prev.find((f) => f.key === key);
      if (existing) {
        const newValues = new Set(existing.values);
        if (newValues.has(value)) {
          newValues.delete(value);
        } else {
          newValues.add(value);
        }
        if (newValues.size === 0) {
          return prev.filter((f) => f.key !== key);
        }
        return prev.map((f) => (f.key === key ? { ...f, values: newValues } : f));
      } else {
        const col = allColumns.find((c) => c.key === key);
        return [...prev, { key, label: col?.label || key, values: new Set([value]) }];
      }
    });
  };

  // Remove a filter entirely
  const removeFilter = (key: keyof Order) => {
    setFilters((prev) => prev.filter((f) => f.key !== key));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters([]);
  };

  // Apply filters to orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((order) =>
        [order.orderNumber, order.customerName, order.email, order.skus, order.discountCodes, order.utmSource, order.utmCampaign, order.tags]
          .some((field) => field && String(field).toLowerCase().includes(q))
      );
    }

    // Apply date range filter
    if (dateRange?.from || dateRange?.to) {
      result = result.filter((order) => {
        if (!order.createdAt) return false;
        const orderDate = new Date(order.createdAt);
        if (dateRange.from) {
          const start = new Date(dateRange.from);
          start.setHours(0, 0, 0, 0);
          if (orderDate < start) return false;
        }
        if (dateRange.to) {
          const end = new Date(dateRange.to);
          end.setHours(23, 59, 59, 999);
          if (orderDate > end) return false;
        }
        return true;
      });
    }

    // Apply column filters
    if (filters.length > 0) {
      result = result.filter((order) => {
        return filters.every((filter) => {
          const value = getDisplayValue(order[filter.key]);
          return filter.values.has(value);
        });
      });
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      switch (sortField) {
        case "createdAt":
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case "total":
          aVal = a.total ? parseFloat(a.total) : 0;
          bVal = b.total ? parseFloat(b.total) : 0;
          break;
        case "customerName":
          aVal = (a.customerName || "").toLowerCase();
          bVal = (b.customerName || "").toLowerCase();
          break;
        case "fulfillmentStatus":
          aVal = (a.fulfillmentStatus || "unfulfilled").toLowerCase();
          bVal = (b.fulfillmentStatus || "unfulfilled").toLowerCase();
          break;
        case "quantity":
          aVal = a.quantity || 0;
          bVal = b.quantity || 0;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [orders, filters, dateRange, search, sortField, sortDirection]);

  function toggleColumn(key: string) {
    const newSet = new Set(visibleColumns);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setVisibleColumns(newSet);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...newSet]));
  }

  function showAllColumns() {
    const allKeys = new Set(allColumns.map((c) => c.key));
    setVisibleColumns(allKeys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...allKeys]));
  }

  function resetColumns() {
    const defaults = new Set(allColumns.filter((c) => c.defaultVisible).map((c) => c.key));
    setVisibleColumns(defaults);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...defaults]));
  }

  const activeColumns: Column<Order>[] = allColumns
    .filter((c) => visibleColumns.has(c.key))
    .map((c) => {
      let render = c.render;

      if (c.editable === "source") {
        render = (_value: unknown, order: Order) => (
          <EditableSelect
            value={order[c.key] as string | null}
            options={UTM_SOURCE_OPTIONS}
            onSave={(val) => updateOrderUtm(order.id, c.key, val)}
          />
        );
      } else if (c.editable === "campaign") {
        render = (_value: unknown, order: Order) => (
          <EditableSelect
            value={order[c.key] as string | null}
            options={utmCampaignOptions}
            onSave={(val) => updateOrderUtm(order.id, c.key, val)}
          />
        );
      } else if (c.editable === "text") {
        render = (_value: unknown, order: Order) => (
          <EditableText
            value={order[c.key] as string | null}
            onSave={(val) => updateOrderUtm(order.id, c.key, val)}
          />
        );
      }

      return {
        key: c.key,
        label: c.label,
        sticky: c.sticky,
        primary: c.primary,
        render,
      };
    });

  // Filter modal unique values (with search)
  const editingFilterValues = useMemo(() => {
    if (!editingFilter) return [];
    const values = getUniqueValues(editingFilter);
    if (!filterSearch) return values;
    return values.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()));
  }, [editingFilter, orders, filterSearch]);

  // Calculate previous period orders for comparison
  const previousPeriodOrders = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];

    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    const periodDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const prevEnd = new Date(fromDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - periodDays + 1);

    return orders.filter((order) => {
      if (!order.createdAt) return false;
      const orderDate = new Date(order.createdAt);
      const start = new Date(prevStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(prevEnd);
      end.setHours(23, 59, 59, 999);
      return orderDate >= start && orderDate <= end;
    });
  }, [orders, dateRange]);

  // Scorecard stats
  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalRevenue = filteredOrders.reduce((sum, order) => {
      return sum + (order.total ? parseFloat(order.total) : 0);
    }, 0);
    const unfulfilled = filteredOrders.filter(
      (order) => !order.fulfillmentStatus || order.fulfillmentStatus === "unfulfilled"
    ).length;
    const newCustomers = filteredOrders.filter((order) => !order.isRepeatCustomer).length;
    const repeatCustomers = filteredOrders.filter((order) => order.isRepeatCustomer).length;

    // Previous period stats
    const prevTotalOrders = previousPeriodOrders.length;
    const prevTotalRevenue = previousPeriodOrders.reduce((sum, order) => {
      return sum + (order.total ? parseFloat(order.total) : 0);
    }, 0);

    // Calculate percentage changes
    const ordersChange = prevTotalOrders > 0
      ? Math.round(((totalOrders - prevTotalOrders) / prevTotalOrders) * 100)
      : null;
    const revenueChange = prevTotalRevenue > 0
      ? Math.round(((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100)
      : null;

    return {
      totalOrders,
      totalRevenue,
      unfulfilled,
      newCustomers,
      repeatCustomers,
      ordersChange,
      revenueChange,
    };
  }, [filteredOrders, previousPeriodOrders]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          {/* Toolbar */}
          <div className="flex justify-between items-center mb-4">
            <div className="h-8 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="flex items-center gap-3">
              {[48, 64, 64, 64, 80, 80, 144].map((w, i) => (
                <div key={i} className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" style={{ width: w }} />
              ))}
            </div>
          </div>
          {/* Scorecards */}
          <div className="flex gap-3 overflow-x-hidden pb-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 w-40">
                <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-3" />
                <div className="h-7 w-14 bg-zinc-300 dark:bg-zinc-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        {/* Table */}
        <div className="page-content">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden">
            <div className="flex gap-6 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              {[48, 72, 96, 56, 72, 40, 72, 80, 96, 48, 52].map((w, i) => (
                <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
              ))}
            </div>
            {[...Array(14)].map((_, row) => (
              <div key={row} className="flex gap-6 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                {[48, 72, 96, 56, 72, 40, 72, 80, 96, 48, 52].map((w, col) => (
                  <div key={col} className="h-3.5 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse shrink-0" style={{ width: w }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Orders</h1>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {filteredOrders.length === total ? total : `${filteredOrders.length} of ${total}`} orders
          </span>

          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 w-48"
          />

          {/* Sync */}
          <div className="relative">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-secondary btn-sm"
            >
              {syncing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {syncing ? "Syncing..." : "Sync"}
            </button>
            {syncMessage && (
              <div className="absolute top-full mt-1 right-0 whitespace-nowrap bg-zinc-800 text-white text-xs px-3 py-1.5 rounded shadow-lg z-50">
                {syncMessage}
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="relative" ref={sortModalRef}>
            <button
              onClick={() => setShowSortModal(!showSortModal)}
              className="btn btn-secondary btn-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              Sort
            </button>
            {showSortModal && (
              <div className="dropdown right-0 mt-2 w-56" onClick={(e) => e.stopPropagation()}>
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="text-sm font-medium mb-2">Sort by</div>
                  <div className="flex flex-col gap-1">
                    {([
                      { value: "createdAt" as SortField, label: "Date" },
                      { value: "total" as SortField, label: "Total" },
                      { value: "customerName" as SortField, label: "Customer" },
                      { value: "fulfillmentStatus" as SortField, label: "Status" },
                      { value: "quantity" as SortField, label: "Quantity" },
                    ]).map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                        <input
                          type="radio"
                          name="sortField"
                          checked={sortField === opt.value}
                          onChange={() => setSortField(opt.value)}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="p-2">
                  <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${sortDirection === "asc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    <input type="radio" name="sortDir" checked={sortDirection === "asc"} onChange={() => setSortDirection("asc")} className="sr-only" />
                    <span className="text-sm">Ascending</span>
                  </label>
                  <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${sortDirection === "desc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <input type="radio" name="sortDir" checked={sortDirection === "desc"} onChange={() => setSortDirection("desc")} className="sr-only" />
                    <span className="text-sm">Descending</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Add Filter */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="btn btn-secondary btn-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Add filter
            </button>
            {showFilterDropdown && (
              <div className="dropdown right-0 mt-2 w-48 max-h-64 overflow-y-auto">
                {filterableColumns.map((col) => (
                  <button
                    key={col.key}
                    className="dropdown-item"
                    onClick={() => {
                      setEditingFilter(col.key);
                      setShowFilterDropdown(false);
                      setFilterSearch("");
                    }}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Columns */}
          <div className="relative" ref={columnPickerRef}>
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="btn btn-secondary btn-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Columns ({activeColumns.length})
            </button>
            {showColumnPicker && (
              <div className="dropdown right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto">
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700 flex gap-2">
                  <button onClick={showAllColumns} className="btn btn-secondary btn-sm flex-1">
                    Show All
                  </button>
                  <button onClick={resetColumns} className="btn btn-secondary btn-sm flex-1">
                    Reset
                  </button>
                </div>
                <div className="p-2">
                  {allColumns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded"
                      />
                      <span className="text-sm">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date Range Picker */}
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            placeholder="Select dates"
          />
        </div>
      </div>

      {/* Scorecards */}
      <ScorecardGrid scrollable>
        <Scorecard
          title="Total Orders"
          value={stats.totalOrders.toLocaleString()}
          trend={dateRange?.from && dateRange?.to && stats.ordersChange !== null ? {
            value: stats.ordersChange,
            isPositive: stats.ordersChange >= 0,
          } : undefined}
        />
        <Scorecard
          title="Total Revenue"
          value={`£${Math.round(stats.totalRevenue).toLocaleString("en-GB")}`}
          trend={dateRange?.from && dateRange?.to && stats.revenueChange !== null ? {
            value: stats.revenueChange,
            isPositive: stats.revenueChange >= 0,
          } : undefined}
        />
        <Scorecard
          title="Unfulfilled"
          value={stats.unfulfilled.toLocaleString()}
        />
        <Scorecard
          title="New Customers"
          value={stats.newCustomers.toLocaleString()}
          subtitle={`${stats.totalOrders > 0 ? Math.round((stats.newCustomers / stats.totalOrders) * 100) : 0}% of total`}
          subtitleColor="success"
        />
        <Scorecard
          title="Repeat Customers"
          value={stats.repeatCustomers.toLocaleString()}
          subtitle={`${stats.totalOrders > 0 ? Math.round((stats.repeatCustomers / stats.totalOrders) * 100) : 0}% of total`}
          subtitleColor="success"
        />
      </ScorecardGrid>

      {/* Filter Pills */}
      {filters.length > 0 && (
        <div className="filter-pills-container">
          {filters.map((filter) => (
            <div key={filter.key} className="filter-pill">
              <button
                className="filter-pill-label"
                onClick={() => {
                  setEditingFilter(filter.key);
                  setFilterSearch("");
                }}
              >
                <span className="filter-pill-key">{filter.label}:</span>
                <span className="filter-pill-values">
                  {filter.values.size <= 2
                    ? Array.from(filter.values).join(", ")
                    : `${filter.values.size} selected`}
                </span>
              </button>
              <button
                className="filter-pill-remove"
                onClick={() => removeFilter(filter.key)}
              >
                ×
              </button>
            </div>
          ))}
          <button className="filter-clear-all" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>
      )}

      {/* Filter Value Modal */}
      {editingFilter && (
        <div className="modal-overlay" onClick={() => { setEditingFilter(null); setFilterSearch(""); }}>
          <div
            className="filter-modal"
            ref={filterModalRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="filter-modal-header">
              <h3 className="filter-modal-title">
                Filter by {allColumns.find((c) => c.key === editingFilter)?.label}
              </h3>
              <button
                className="modal-close"
                onClick={() => { setEditingFilter(null); setFilterSearch(""); }}
              >
                ×
              </button>
            </div>
            <div className="filter-modal-search">
              <input
                type="text"
                className="input"
                placeholder="Search values..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="filter-modal-options">
              {editingFilterValues.length === 0 ? (
                <div className="filter-modal-empty">No matching values</div>
              ) : (
                editingFilterValues.map((value) => (
                  <label key={value} className="filter-modal-option">
                    <input
                      type="checkbox"
                      checked={getFilterValues(editingFilter).has(value)}
                      onChange={() => toggleFilterValue(editingFilter, value)}
                    />
                    <span>{value}</span>
                  </label>
                ))
              )}
            </div>
            <div className="filter-modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => { setEditingFilter(null); setFilterSearch(""); }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      <div className="page-content">
        <Table
          columns={activeColumns}
          data={filteredOrders}
          rowKey="id"
          emptyMessage={filters.length > 0 ? "No orders match the current filters." : "No orders yet. Orders will appear here once you configure Shopify webhooks in Settings."}
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
        />
      </div>
    </div>
  );
}
