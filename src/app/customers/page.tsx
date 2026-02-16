"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Table, Column } from "@/components/Table";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Scorecard, ScorecardGrid } from "@/components/Scorecard";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";

interface Customer {
  id: number;
  shopifyCustomerId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailMarketingConsent: boolean;
  phone: string | null;
  totalSpent: string | null;
  ordersCount: number | null;
  tags: string | null;
  createdAt: string | null;
  lastOrderAt: string | null;
  lapse: number | null;
  lastWhatsappAt: string | null;
}

interface LifecycleSettings {
  newMaxDays: number;
  reorderMaxDays: number;
  lapsedMaxDays: number;
}

interface ColumnDef {
  key: keyof Customer | string;
  label: string;
  defaultVisible: boolean;
  sticky?: boolean;
  primary?: boolean;
  filterable?: boolean;
  render?: (value: unknown, customer: Customer) => React.ReactNode;
}

interface ActiveFilter {
  key: keyof Customer;
  label: string;
  values: Set<string>;
}

type LapseFilterType = "new" | "due_reorder" | "lapsed" | "lost" | "custom" | null;

interface LapseFilter {
  type: LapseFilterType;
  customMax?: number;
}

const allColumns: ColumnDef[] = [
  {
    key: "name",
    label: "Customer",
    defaultVisible: true,
    sticky: true,
    primary: true,
    render: (_, customer) => {
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
      return name || "-";
    }
  },
  { key: "email", label: "Email", defaultVisible: true, filterable: true },
  { key: "phone", label: "Phone", defaultVisible: false },
  { key: "ordersCount", label: "Orders", defaultVisible: true, filterable: true },
  { key: "totalSpent", label: "Total Spent", defaultVisible: true, render: (v) => formatCurrency(v as string) },
  {
    key: "emailMarketingConsent",
    label: "Subscribed",
    defaultVisible: true,
    filterable: true,
    render: (v) => formatBoolean(v as boolean)
  },
  { key: "tags", label: "Tags", defaultVisible: false, filterable: true },
  { key: "createdAt", label: "Customer Since", defaultVisible: true, render: (v) => formatDate(v as string) },
  { key: "lastOrderAt", label: "Last Order", defaultVisible: true, render: (v) => formatDate(v as string) },
  {
    key: "lapse",
    label: "Days Since Order",
    defaultVisible: true,
    render: (v) => v !== null ? `${v} days` : "-"
  },
  {
    key: "lastWhatsappAt",
    label: "Last WhatsApp",
    defaultVisible: true,
    render: (v) => formatDate(v as string)
  },
  { key: "shopifyCustomerId", label: "Shopify ID", defaultVisible: false },
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

function formatBoolean(value: boolean): React.ReactNode {
  return value ? (
    <span className="text-success">Yes</span>
  ) : (
    <span className="text-muted">No</span>
  );
}

function getDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const STORAGE_KEY = "customers-visible-columns";
const PAGE_SIZE = 100;

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

export default function CustomersPage() {
  const { apiFetch, currentOrg } = useOrg();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [lifecycleSettings, setLifecycleSettings] = useState<LifecycleSettings>({
    newMaxDays: 30,
    reorderMaxDays: 60,
    lapsedMaxDays: 90,
  });
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(getInitialColumns);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [editingFilter, setEditingFilter] = useState<keyof Customer | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const filterModalRef = useRef<HTMLDivElement>(null);

  // Date range filter
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Lapse filter (days since last order)
  const [lapseFilter, setLapseFilter] = useState<LapseFilter>({ type: null });
  const [showLapseFilter, setShowLapseFilter] = useState(false);
  const [customLapseInput, setCustomLapseInput] = useState("");
  const lapseFilterRef = useRef<HTMLDivElement>(null);

  // Sort state
  type SortField = "totalSpent" | "ordersCount" | "lastOrderAt" | "lapse" | "createdAt";
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showSortModal, setShowSortModal] = useState(false);
  const sortModalRef = useRef<HTMLDivElement>(null);

  // Search
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchCustomers = useCallback(() => {
    if (!currentOrg) return;
    Promise.all([
      apiFetch("/api/customers?limit=1000").then((res) => res.json()),
      apiFetch("/api/settings/lifecycle").then((res) => res.json()),
    ])
      .then(([customersData, lifecycleData]) => {
        if (customersData.error) {
          setError(customersData.error);
        } else {
          setCustomers(customersData.customers || []);
          setTotal(customersData.total || 0);
        }
        if (lifecycleData && !lifecycleData.error) {
          setLifecycleSettings(lifecycleData);
        }
      })
      .catch(() => setError("Failed to load customers"))
      .finally(() => setLoading(false));
  }, [apiFetch, currentOrg]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiFetch("/api/customers/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || "Sync failed");
      } else {
        setSyncMessage(`Synced ${data.upserted} customer${data.upserted === 1 ? "" : "s"}`);
        fetchCustomers();
      }
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 3000);
    }
  }, [fetchCustomers, apiFetch]);

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
      if (lapseFilterRef.current && !lapseFilterRef.current.contains(event.target as Node)) {
        setShowLapseFilter(false);
      }
      if (sortModalRef.current && !sortModalRef.current.contains(event.target as Node)) {
        setShowSortModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get unique values for a field
  const getUniqueValues = (key: keyof Customer): string[] => {
    const values = new Set<string>();
    customers.forEach((customer) => {
      const val = customer[key];
      values.add(getDisplayValue(val));
    });
    return Array.from(values).sort((a, b) => {
      if (a === "(empty)") return 1;
      if (b === "(empty)") return -1;
      return a.localeCompare(b);
    });
  };

  // Get currently selected values for a filter
  const getFilterValues = (key: keyof Customer): Set<string> => {
    const filter = filters.find((f) => f.key === key);
    return filter?.values || new Set();
  };

  // Toggle a value in a filter
  const toggleFilterValue = (key: keyof Customer, value: string) => {
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
  const removeFilter = (key: keyof Customer) => {
    setFilters((prev) => prev.filter((f) => f.key !== key));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters([]);
  };

  // Apply filters to customers
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((customer) =>
        [customer.firstName, customer.lastName, customer.email, customer.phone, customer.tags]
          .some((field) => field && String(field).toLowerCase().includes(q))
      );
    }

    // Apply date range filter (on createdAt)
    if (dateRange?.from || dateRange?.to) {
      result = result.filter((customer) => {
        if (!customer.createdAt) return false;
        const customerDate = new Date(customer.createdAt);
        if (dateRange.from) {
          const start = new Date(dateRange.from);
          start.setHours(0, 0, 0, 0);
          if (customerDate < start) return false;
        }
        if (dateRange.to) {
          const end = new Date(dateRange.to);
          end.setHours(23, 59, 59, 999);
          if (customerDate > end) return false;
        }
        return true;
      });
    }

    // Apply lapse filter (days since last order)
    if (lapseFilter.type) {
      const { newMaxDays, reorderMaxDays, lapsedMaxDays } = lifecycleSettings;
      result = result.filter((customer) => {
        if (customer.lapse === null || (customer.ordersCount || 0) === 0) return false;
        const lapse = customer.lapse;
        switch (lapseFilter.type) {
          case "new":
            return lapse <= newMaxDays;
          case "due_reorder":
            return lapse > newMaxDays && lapse <= reorderMaxDays;
          case "lapsed":
            return lapse > reorderMaxDays && lapse <= lapsedMaxDays;
          case "lost":
            return lapse > lapsedMaxDays;
          case "custom":
            return lapseFilter.customMax !== undefined && lapse <= lapseFilter.customMax;
          default:
            return true;
        }
      });
    }

    // Apply column filters
    if (filters.length > 0) {
      result = result.filter((customer) => {
        return filters.every((filter) => {
          const value = getDisplayValue(customer[filter.key]);
          return filter.values.has(value);
        });
      });
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      switch (sortField) {
        case "totalSpent":
          aVal = a.totalSpent ? parseFloat(a.totalSpent) : 0;
          bVal = b.totalSpent ? parseFloat(b.totalSpent) : 0;
          break;
        case "ordersCount":
          aVal = a.ordersCount || 0;
          bVal = b.ordersCount || 0;
          break;
        case "lastOrderAt":
          aVal = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
          bVal = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
          break;
        case "lapse":
          aVal = a.lapse ?? 999999;
          bVal = b.lapse ?? 999999;
          break;
        case "createdAt":
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [customers, filters, dateRange, lapseFilter, lifecycleSettings, sortField, sortDirection, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, dateRange, filters, lapseFilter, sortField, sortDirection]);

  const pagedCustomers = filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  const activeColumns: Column<Customer>[] = allColumns
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
  }, [editingFilter, customers, filterSearch]);

  // Scorecard stats
  const stats = useMemo(() => {
    const totalCustomers = filteredCustomers.length;
    const emailSubscribers = filteredCustomers.filter((c) => c.emailMarketingConsent).length;

    // Subscribers = customers tagged with 'Active Subscriber'
    const subscribers = filteredCustomers.filter((c) =>
      c.tags?.toLowerCase().includes("active subscriber")
    ).length;

    const totalRevenue = filteredCustomers.reduce((sum, c) => {
      return sum + (c.totalSpent ? parseFloat(c.totalSpent) : 0);
    }, 0);

    // LTV = Total Revenue / Number of Customers
    const ltv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    // Only include customers with orders for avg calculations
    const customersWithOrders = filteredCustomers.filter((c) => (c.ordersCount || 0) > 0);
    const totalOrders = customersWithOrders.reduce((sum, c) => sum + (c.ordersCount || 0), 0);

    // For AOV, exclude customers with 0 spend (samples, replacements, etc.)
    const customersWithSpend = filteredCustomers.filter((c) =>
      (c.ordersCount || 0) > 0 && c.totalSpent && parseFloat(c.totalSpent) > 0
    );
    const totalOrdersWithSpend = customersWithSpend.reduce((sum, c) => sum + (c.ordersCount || 0), 0);
    const totalRevenueWithSpend = customersWithSpend.reduce((sum, c) => {
      return sum + parseFloat(c.totalSpent!);
    }, 0);

    const avgOrdersPerCustomer = customersWithOrders.length > 0 ? totalOrders / customersWithOrders.length : 0;
    const avgOrderValue = totalOrdersWithSpend > 0 ? totalRevenueWithSpend / totalOrdersWithSpend : 0;

    // Lifecycle segments (based on lapse - days since last order)
    // Only include customers who have placed at least 1 order
    const { newMaxDays, reorderMaxDays, lapsedMaxDays } = lifecycleSettings;
    const customersWithLapse = filteredCustomers.filter((c) => c.lapse !== null && (c.ordersCount || 0) > 0);

    const newCustomers = customersWithLapse.filter((c) => c.lapse! <= newMaxDays).length;

    const dueReorder = customersWithLapse.filter((c) =>
      c.lapse! > newMaxDays && c.lapse! <= reorderMaxDays
    ).length;

    const lapsed = customersWithLapse.filter((c) =>
      c.lapse! > reorderMaxDays && c.lapse! <= lapsedMaxDays
    ).length;

    const lost = customersWithLapse.filter((c) => c.lapse! > lapsedMaxDays).length;

    // Purchased = customers with total spent > 0
    const purchased = filteredCustomers.filter((c) =>
      c.totalSpent && parseFloat(c.totalSpent) > 0
    ).length;

    // Prospects = customers with 0 orders
    const prospects = filteredCustomers.filter((c) => (c.ordersCount || 0) === 0).length;

    return {
      totalCustomers,
      purchased,
      prospects,
      subscribers,
      emailSubscribers,
      ltv,
      avgOrdersPerCustomer,
      avgOrderValue,
      newCustomers,
      dueReorder,
      lapsed,
      lost,
    };
  }, [filteredCustomers, lifecycleSettings]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          {/* Toolbar */}
          <div className="flex justify-between items-center mb-4">
            <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="flex items-center gap-3">
              {[48, 64, 64, 64, 80, 80, 144].map((w, i) => (
                <div key={i} className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" style={{ width: w }} />
              ))}
            </div>
          </div>
          {/* Scorecards */}
          <div className="flex gap-3 overflow-x-hidden pb-1">
            {[...Array(12)].map((_, i) => (
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
              {[96, 128, 52, 80, 64, 88, 80, 104, 96].map((w, i) => (
                <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
              ))}
            </div>
            {[...Array(14)].map((_, row) => (
              <div key={row} className="flex gap-6 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                {[96, 128, 52, 80, 64, 88, 80, 104, 96].map((w, col) => (
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
        <h1 className="text-2xl font-bold mb-6">Customers</h1>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Customers</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {filteredCustomers.length === total ? total : `${filteredCustomers.length} of ${total}`} customers
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
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                      <input
                        type="radio"
                        name="sortField"
                        checked={sortField === "createdAt"}
                        onChange={() => setSortField("createdAt")}
                      />
                      <span className="text-sm">Customer since</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                      <input
                        type="radio"
                        name="sortField"
                        checked={sortField === "totalSpent"}
                        onChange={() => setSortField("totalSpent")}
                      />
                      <span className="text-sm">Total spent</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                      <input
                        type="radio"
                        name="sortField"
                        checked={sortField === "ordersCount"}
                        onChange={() => setSortField("ordersCount")}
                      />
                      <span className="text-sm">Number of orders</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                      <input
                        type="radio"
                        name="sortField"
                        checked={sortField === "lastOrderAt"}
                        onChange={() => setSortField("lastOrderAt")}
                      />
                      <span className="text-sm">Last order</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                      <input
                        type="radio"
                        name="sortField"
                        checked={sortField === "lapse"}
                        onChange={() => setSortField("lapse")}
                      />
                      <span className="text-sm">Days since order</span>
                    </label>
                  </div>
                </div>
                <div className="p-2">
                  <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${sortDirection === "asc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    <input
                      type="radio"
                      name="sortDir"
                      checked={sortDirection === "asc"}
                      onChange={() => setSortDirection("asc")}
                      className="sr-only"
                    />
                    <span className="text-sm">Ascending</span>
                  </label>
                  <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${sortDirection === "desc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <input
                      type="radio"
                      name="sortDir"
                      checked={sortDirection === "desc"}
                      onChange={() => setSortDirection("desc")}
                      className="sr-only"
                    />
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
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowLapseFilter(true);
                    setShowFilterDropdown(false);
                  }}
                >
                  Days Since Order
                </button>
                <div className="dropdown-divider" />
                {filterableColumns.map((col) => (
                  <button
                    key={col.key}
                    className="dropdown-item"
                    onClick={() => {
                      setEditingFilter(col.key as keyof Customer);
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
          title="Total Customers"
          value={stats.totalCustomers.toLocaleString()}
        />
        <Scorecard
          title="Purchased"
          value={stats.purchased.toLocaleString()}
          subtitle={`${stats.totalCustomers > 0 ? Math.round((stats.purchased / stats.totalCustomers) * 100) : 0}% of total`}
        />
        <Scorecard
          title="Prospects"
          value={stats.prospects.toLocaleString()}
          subtitle={`${stats.totalCustomers > 0 ? Math.round((stats.prospects / stats.totalCustomers) * 100) : 0}% of total`}
        />
        <Scorecard
          title="Subscribers"
          value={stats.subscribers.toLocaleString()}
          subtitle={`${stats.totalCustomers > 0 ? Math.round((stats.subscribers / stats.totalCustomers) * 100) : 0}% of total`}
        />
        <Scorecard
          title="Email Subscribers"
          value={stats.emailSubscribers.toLocaleString()}
          subtitle={`${stats.totalCustomers > 0 ? Math.round((stats.emailSubscribers / stats.totalCustomers) * 100) : 0}% of total`}
        />
        <Scorecard
          title="LTV"
          value={`£${stats.ltv.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Scorecard
          title="Avg Orders / Customer"
          value={stats.avgOrdersPerCustomer.toFixed(1)}
        />
        <Scorecard
          title="AOV"
          value={`£${stats.avgOrderValue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Scorecard
          title="New"
          value={stats.newCustomers.toLocaleString()}
          subtitle={`≤${lifecycleSettings.newMaxDays} days`}
        />
        <Scorecard
          title="Due Reorder"
          value={stats.dueReorder.toLocaleString()}
          subtitle={`${lifecycleSettings.newMaxDays + 1}-${lifecycleSettings.reorderMaxDays} days`}
        />
        <Scorecard
          title="Lapsed"
          value={stats.lapsed.toLocaleString()}
          subtitle={`${lifecycleSettings.reorderMaxDays + 1}-${lifecycleSettings.lapsedMaxDays} days`}
        />
        <Scorecard
          title="Lost"
          value={stats.lost.toLocaleString()}
          subtitle={`>${lifecycleSettings.lapsedMaxDays} days`}
        />
      </ScorecardGrid>

      {/* Filter Pills */}
      {(filters.length > 0 || lapseFilter.type) && (
        <div className="filter-pills-container">
          {lapseFilter.type && (
            <div className="filter-pill">
              <button
                className="filter-pill-label"
                onClick={() => setShowLapseFilter(true)}
              >
                <span className="filter-pill-key">Days Since Order:</span>
                <span className="filter-pill-values">
                  {lapseFilter.type === "new" && `New (≤${lifecycleSettings.newMaxDays} days)`}
                  {lapseFilter.type === "due_reorder" && `Due Reorder (${lifecycleSettings.newMaxDays + 1}-${lifecycleSettings.reorderMaxDays} days)`}
                  {lapseFilter.type === "lapsed" && `Lapsed (${lifecycleSettings.reorderMaxDays + 1}-${lifecycleSettings.lapsedMaxDays} days)`}
                  {lapseFilter.type === "lost" && `Lost (>${lifecycleSettings.lapsedMaxDays} days)`}
                  {lapseFilter.type === "custom" && `≤${lapseFilter.customMax} days`}
                </span>
              </button>
              <button
                className="filter-pill-remove"
                onClick={() => setLapseFilter({ type: null })}
              >
                ×
              </button>
            </div>
          )}
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
          <button className="filter-clear-all" onClick={() => { clearAllFilters(); setLapseFilter({ type: null }); }}>
            Clear all
          </button>
        </div>
      )}

      {/* Lapse Filter Modal */}
      {showLapseFilter && (
        <div className="modal-overlay" onClick={() => setShowLapseFilter(false)}>
          <div
            className="filter-modal"
            ref={lapseFilterRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="filter-modal-header">
              <h3 className="filter-modal-title">Days Since Last Order</h3>
              <button
                className="modal-close"
                onClick={() => setShowLapseFilter(false)}
              >
                ×
              </button>
            </div>
            <div className="filter-modal-options">
              <label className="filter-modal-option">
                <input
                  type="radio"
                  name="lapseFilter"
                  checked={lapseFilter.type === "new"}
                  onChange={() => setLapseFilter({ type: "new" })}
                />
                <span>New (≤{lifecycleSettings.newMaxDays} days)</span>
              </label>
              <label className="filter-modal-option">
                <input
                  type="radio"
                  name="lapseFilter"
                  checked={lapseFilter.type === "due_reorder"}
                  onChange={() => setLapseFilter({ type: "due_reorder" })}
                />
                <span>Due Reorder ({lifecycleSettings.newMaxDays + 1}-{lifecycleSettings.reorderMaxDays} days)</span>
              </label>
              <label className="filter-modal-option">
                <input
                  type="radio"
                  name="lapseFilter"
                  checked={lapseFilter.type === "lapsed"}
                  onChange={() => setLapseFilter({ type: "lapsed" })}
                />
                <span>Lapsed ({lifecycleSettings.reorderMaxDays + 1}-{lifecycleSettings.lapsedMaxDays} days)</span>
              </label>
              <label className="filter-modal-option">
                <input
                  type="radio"
                  name="lapseFilter"
                  checked={lapseFilter.type === "lost"}
                  onChange={() => setLapseFilter({ type: "lost" })}
                />
                <span>Lost (&gt;{lifecycleSettings.lapsedMaxDays} days)</span>
              </label>
              <div className="dropdown-divider" style={{ margin: "0.5rem 0" }} />
              <label className="filter-modal-option">
                <input
                  type="radio"
                  name="lapseFilter"
                  checked={lapseFilter.type === "custom"}
                  onChange={() => {
                    const val = parseInt(customLapseInput) || 0;
                    setLapseFilter({ type: "custom", customMax: val });
                  }}
                />
                <span>Custom: ≤</span>
                <input
                  type="number"
                  className="input"
                  style={{ width: "80px", marginLeft: "0.5rem" }}
                  placeholder="days"
                  value={customLapseInput}
                  onChange={(e) => {
                    setCustomLapseInput(e.target.value);
                    const val = parseInt(e.target.value) || 0;
                    if (lapseFilter.type === "custom" || e.target.value) {
                      setLapseFilter({ type: "custom", customMax: val });
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span style={{ marginLeft: "0.25rem" }}>days</span>
              </label>
            </div>
            <div className="filter-modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setLapseFilter({ type: null });
                  setCustomLapseInput("");
                }}
              >
                Clear
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setShowLapseFilter(false)}
              >
                Apply
              </button>
            </div>
          </div>
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
          data={pagedCustomers}
          rowKey="id"
          emptyMessage={filters.length > 0 ? "No customers match the current filters." : "No customers yet. Run the backfill to import customers from Shopify."}
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
        />
        {filteredCustomers.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500">
            <span>
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, filteredCustomers.length).toLocaleString()} of {filteredCustomers.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span>{page} / {Math.ceil(filteredCustomers.length / PAGE_SIZE)}</span>
              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(filteredCustomers.length / PAGE_SIZE), p + 1))}
                disabled={page >= Math.ceil(filteredCustomers.length / PAGE_SIZE)}
                className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
