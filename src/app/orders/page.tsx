"use client";

import { useState, useEffect, useRef } from "react";
import { Table, Column } from "@/components/Table";

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
  render?: (value: unknown, order: Order) => React.ReactNode;
}

const allColumns: ColumnDef[] = [
  { key: "orderNumber", label: "Order", defaultVisible: true, sticky: true, primary: true, render: (v) => v ? `#${v}` : "-" },
  { key: "createdAt", label: "Date", defaultVisible: true, render: (v) => formatDate(v as string) },
  { key: "customerName", label: "Customer", defaultVisible: true },
  { key: "email", label: "Email", defaultVisible: false },
  { key: "phone", label: "Phone", defaultVisible: false },
  { key: "total", label: "Total", defaultVisible: true, render: (v) => formatCurrency(v as string) },
  { key: "subtotal", label: "Subtotal", defaultVisible: false, render: (v) => formatCurrency(v as string) },
  { key: "shipping", label: "Shipping", defaultVisible: false, render: (v) => formatCurrency(v as string) },
  { key: "tax", label: "Tax", defaultVisible: false, render: (v) => formatCurrency(v as string) },
  { key: "fulfillmentStatus", label: "Status", defaultVisible: true, render: (v) => formatStatus(v as string) },
  { key: "quantity", label: "Qty", defaultVisible: true },
  { key: "skus", label: "SKUs", defaultVisible: false },
  { key: "discountCodes", label: "Discount", defaultVisible: true },
  { key: "utmSource", label: "Source", defaultVisible: true },
  { key: "utmMedium", label: "Medium", defaultVisible: false },
  { key: "utmCampaign", label: "Campaign", defaultVisible: true },
  { key: "utmContent", label: "Content", defaultVisible: false },
  { key: "utmTerm", label: "Term", defaultVisible: false },
  { key: "trackingNumber", label: "Tracking", defaultVisible: false },
  { key: "tags", label: "Tags", defaultVisible: false },
  { key: "hasConversionData", label: "Conv?", defaultVisible: true, render: (v) => formatBoolean(v as boolean) },
  { key: "isRepeatCustomer", label: "Repeat?", defaultVisible: true, render: (v) => formatBoolean(v as boolean) },
  { key: "fulfilledAt", label: "Fulfilled At", defaultVisible: false, render: (v) => formatDate(v as string) },
  { key: "receivedAt", label: "Received", defaultVisible: false, render: (v) => formatDate(v as string) },
  { key: "shopifyId", label: "Shopify ID", defaultVisible: false },
];

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

  // Load saved columns on mount
  useEffect(() => {
    setVisibleColumns(getInitialColumns());
  }, []);

  // Close column picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
        setShowColumnPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Orders</h1>
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Orders</h1>
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">{total} orders</span>
          <div className="relative" ref={columnPickerRef}>
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Columns ({activeColumns.length})
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700 flex gap-2">
                  <button
                    onClick={showAllColumns}
                    className="flex-1 px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-700 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600"
                  >
                    Show All
                  </button>
                  <button
                    onClick={resetColumns}
                    className="flex-1 px-2 py-1 text-xs bg-zinc-100 dark:bg-zinc-700 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600"
                  >
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
                        className="rounded border-zinc-300 dark:border-zinc-600"
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

      <Table
        columns={activeColumns}
        data={orders}
        rowKey="id"
        emptyMessage="No orders yet. Orders will appear here once you configure Shopify webhooks in Settings."
      />
    </div>
  );
}
