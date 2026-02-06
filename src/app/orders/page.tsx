"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Table, Column } from "@/components/Table";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Scorecard, ScorecardGrid } from "@/components/Scorecard";
import { DateRange } from "react-day-picker";

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
  { key: "utmSource", label: "Source", defaultVisible: true, filterable: true },
  { key: "utmMedium", label: "Medium", defaultVisible: false, filterable: true },
  { key: "utmCampaign", label: "Campaign", defaultVisible: true, filterable: true },
  { key: "utmContent", label: "Content", defaultVisible: false, filterable: true },
  { key: "utmTerm", label: "Term", defaultVisible: false, filterable: true },
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

  useEffect(() => {
    fetch("/api/orders?limit=100")
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
  }, []);

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

    return result;
  }, [orders, filters, dateRange]);

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
    .map((c) => ({
      key: c.key,
      label: c.label,
      sticky: c.sticky,
      primary: c.primary,
      render: c.render,
    }));

  // Filter modal unique values (with search)
  const editingFilterValues = useMemo(() => {
    if (!editingFilter) return [];
    const values = getUniqueValues(editingFilter);
    if (!filterSearch) return values;
    return values.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()));
  }, [editingFilter, orders, filterSearch]);

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

    return {
      totalOrders,
      totalRevenue,
      unfulfilled,
      newCustomers,
      repeatCustomers,
    };
  }, [filteredOrders]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Orders</h1>
        <p className="text-muted">Loading...</p>
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {filteredOrders.length === total ? total : `${filteredOrders.length} of ${total}`} orders
          </span>

          {/* Date Range Picker */}
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            placeholder="Select dates"
          />

          {/* Filter Button */}
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

          {/* Columns Button */}
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
              <div className="dropdown right-0 mt-2 w-64 max-h-96 overflow-y-auto">
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
        </div>
      </div>

      {/* Scorecards */}
      <ScorecardGrid>
        <Scorecard
          title="Total Orders"
          value={stats.totalOrders.toLocaleString()}
        />
        <Scorecard
          title="Total Revenue"
          value={`£${stats.totalRevenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Scorecard
          title="Unfulfilled"
          value={stats.unfulfilled.toLocaleString()}
        />
        <Scorecard
          title="New Customers"
          value={stats.newCustomers.toLocaleString()}
        />
        <Scorecard
          title="Repeat Customers"
          value={stats.repeatCustomers.toLocaleString()}
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

      <Table
        columns={activeColumns}
        data={filteredOrders}
        rowKey="id"
        emptyMessage={filters.length > 0 ? "No orders match the current filters." : "No orders yet. Orders will appear here once you configure Shopify webhooks in Settings."}
      />
    </div>
  );
}
