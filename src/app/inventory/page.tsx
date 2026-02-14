"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Table, Column } from "@/components/Table";
import { useOrg } from "@/contexts/OrgContext";
import { subDays, startOfDay, endOfYesterday, format, differenceInDays, addDays } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

// ── Types ──────────────────────────────────────────────────
interface Product {
  id: number;
  sku: string;
  productName: string | null;
  brand: string | null;
  unitBarcode: string | null;
  asin: string | null;
  parentAsin: string | null;
  shippoSku: string | null;
  piecesPerPack: number | null;
  packWeightKg: string | null;
  packLengthCm: string | null;
  packWidthCm: string | null;
  packHeightCm: string | null;
  unitCbm: string | null;
  dimensionalWeight: string | null;
  unitPriceUsd: string | null;
  unitPriceGbp: string | null;
  packCostGbp: string | null;
  landedCost: string | null;
  unitLcogs: string | null;
  dtcRrp: string | null;
  ppUnit: string | null;
  dtcRrpExVat: string | null;
  amazonRrp: string | null;
  fbaFee: string | null;
  referralPercent: string | null;
  dtcFulfillmentFee: string | null;
  dtcCourier: string | null;
  cartonBarcode: string | null;
  unitsPerMasterCarton: number | null;
  piecesPerMasterCarton: number | null;
  grossWeightKg: string | null;
  cartonWidthCm: string | null;
  cartonLengthCm: string | null;
  cartonHeightCm: string | null;
  cartonCbm: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InventoryItem {
  sku: string;
  productName: string | null;
  brand: string | null;
  asin: string | null;
  amazonQty: number;
  warehouseQty: number;
  shopifyQty: number;
  totalQty: number;
}

// ── Tabs ───────────────────────────────────────────────────
const tabs = [
  { key: "products", label: "Product Database" },
  { key: "amazon", label: "Amazon" },
  { key: "dtc", label: "DTC" },
  { key: "inventory", label: "Inventory" },
  { key: "forecast", label: "Forecast" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

// ── Helpers ────────────────────────────────────────────────
const BRAND_OPTIONS = ["Teevo", "Doogood"];
const REORDER_THRESHOLD = 100;
const FORECAST_HORIZON = 180;

type ForecastSkuFilter = "all" | "8-rolls" | "24-rolls" | "48-rolls";
type ForecastChannelFilter = "all" | "amazon" | "shopify";

const LINE_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#3b82f6", // blue
  "#8b5cf6", // violet
];

function skuToFilterKey(sku: string): ForecastSkuFilter | null {
  if (sku.includes("48")) return "48-rolls";
  if (sku.includes("24")) return "24-rolls";
  if (sku.includes("8")) return "8-rolls";
  return null;
}

function n(val: string | null | undefined): number {
  if (!val) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function fmt(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "-";
  return val.toFixed(2);
}

function pct(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return "-";
  return (val * 100).toFixed(1) + "%";
}

// ── Column definitions per tab ─────────────────────────────
type ColDef = { key: string; label: string; defaultVisible: boolean };

const ALL_COLUMNS: ColDef[] = [
  { key: "sku", label: "SKU", defaultVisible: true },
  { key: "productName", label: "Product", defaultVisible: true },
  { key: "brand", label: "Brand", defaultVisible: true },
  { key: "unitBarcode", label: "Unit Barcode", defaultVisible: false },
  { key: "asin", label: "ASIN", defaultVisible: true },
  { key: "parentAsin", label: "Parent ASIN", defaultVisible: false },
  { key: "shippoSku", label: "Shippo SKU", defaultVisible: false },
  { key: "piecesPerPack", label: "Pieces/Pack", defaultVisible: true },
  { key: "packWeightKg", label: "Pack Weight (kg)", defaultVisible: false },
  { key: "packLengthCm", label: "Pack Length (cm)", defaultVisible: false },
  { key: "packWidthCm", label: "Pack Width (cm)", defaultVisible: false },
  { key: "packHeightCm", label: "Pack Height (cm)", defaultVisible: false },
  { key: "unitCbm", label: "Unit CBM", defaultVisible: false },
  { key: "dimensionalWeight", label: "Dim. Weight", defaultVisible: false },
  { key: "unitPriceUsd", label: "Unit Price (USD)", defaultVisible: false },
  { key: "unitPriceGbp", label: "Unit Price (GBP)", defaultVisible: true },
  { key: "packCostGbp", label: "Pack Cost (GBP)", defaultVisible: false },
  { key: "landedCost", label: "Landed Cost", defaultVisible: true },
  { key: "unitLcogs", label: "Unit LCOGS", defaultVisible: false },
  { key: "dtcRrp", label: "DTC RRP", defaultVisible: false },
  { key: "ppUnit", label: "PP Unit", defaultVisible: false },
  { key: "amazonRrp", label: "Amazon RRP", defaultVisible: false },
  { key: "cartonBarcode", label: "Carton Barcode", defaultVisible: false },
  { key: "unitsPerMasterCarton", label: "Units/MC", defaultVisible: false },
  { key: "piecesPerMasterCarton", label: "Pieces/MC", defaultVisible: false },
  { key: "grossWeightKg", label: "Gross Weight (kg)", defaultVisible: false },
  { key: "cartonWidthCm", label: "Carton Width (cm)", defaultVisible: false },
  { key: "cartonLengthCm", label: "Carton Length (cm)", defaultVisible: false },
  { key: "cartonHeightCm", label: "Carton Height (cm)", defaultVisible: false },
  { key: "cartonCbm", label: "Carton CBM", defaultVisible: false },
  { key: "active", label: "Active", defaultVisible: false },
];

const ALL_AMAZON_COLUMNS: ColDef[] = [
  { key: "sku", label: "SKU", defaultVisible: true },
  { key: "productName", label: "Product", defaultVisible: true },
  { key: "brand", label: "Brand", defaultVisible: true },
  { key: "landedCost", label: "Landed Cost", defaultVisible: true },
  { key: "amazonRrp", label: "RRP", defaultVisible: true },
  { key: "amazonRrpExVat", label: "RRP ex. VAT", defaultVisible: true },
  { key: "amazonCogsPercent", label: "% CoGs", defaultVisible: true },
  { key: "amazonGrossProfit", label: "Gross Profit", defaultVisible: true },
  { key: "amazonGrossMargin", label: "Gross Margin", defaultVisible: true },
  { key: "fbaFee", label: "FBA Fee", defaultVisible: true },
  { key: "referralPercent", label: "Referral %", defaultVisible: true },
  { key: "amazonReferralFee", label: "Referral Fee", defaultVisible: true },
  { key: "amazonTotalCoS", label: "Total CoS", defaultVisible: true },
  { key: "amazonContribProfit", label: "Contribution Profit", defaultVisible: true },
  { key: "amazonContribMargin", label: "Contribution Margin", defaultVisible: true },
];

const ALL_DTC_COLUMNS: ColDef[] = [
  { key: "sku", label: "SKU", defaultVisible: true },
  { key: "productName", label: "Product", defaultVisible: true },
  { key: "brand", label: "Brand", defaultVisible: true },
  { key: "landedCost", label: "Landed Cost", defaultVisible: true },
  { key: "dtcRrp", label: "RRP", defaultVisible: true },
  { key: "dtcRrpExVatCalc", label: "RRP ex. VAT", defaultVisible: true },
  { key: "dtcFulfillmentFee", label: "Fulfillment Fee", defaultVisible: true },
  { key: "dtcCourier", label: "Courier", defaultVisible: true },
  { key: "dtcCustomerShipping", label: "Customer Shipping", defaultVisible: true },
  { key: "dtcShopifyFees", label: "Shopify Fees (2%)", defaultVisible: true },
  { key: "dtcTotalCoS", label: "Total CoS", defaultVisible: true },
  { key: "dtcFullyLoadedCogs", label: "Fully Loaded COGS", defaultVisible: true },
  { key: "dtcContribProfit", label: "Contribution Profit", defaultVisible: true },
  { key: "dtcContribMargin", label: "Contribution Margin", defaultVisible: true },
];

const ALL_INVENTORY_COLUMNS: ColDef[] = [
  { key: "sku", label: "SKU", defaultVisible: true },
  { key: "productName", label: "Product", defaultVisible: true },
  { key: "brand", label: "Brand", defaultVisible: false },
  { key: "asin", label: "ASIN", defaultVisible: false },
  { key: "amazonQty", label: "Amazon Qty", defaultVisible: true },
  { key: "shopifyQty", label: "Shopify Qty", defaultVisible: true },
  { key: "warehouseQty", label: "Warehouse Qty", defaultVisible: true },
  { key: "totalQty", label: "Total Qty", defaultVisible: true },
  { key: "runRate", label: "Run Rate", defaultVisible: true },
  { key: "daysLeft", label: "Days Left", defaultVisible: true },
  { key: "oosDate", label: "Out of Stock Forecast", defaultVisible: true },
];

const COLUMN_STORAGE_KEY = "inventory-products-columns";
const AMAZON_COLUMN_STORAGE_KEY = "inventory-amazon-columns";
const DTC_COLUMN_STORAGE_KEY = "inventory-dtc-columns";
const INVENTORY_COLUMN_STORAGE_KEY = "inventory-overall-columns";

function loadVisibleCols(storageKey: string, allCols: ColDef[]): Set<string> {
  if (typeof window === "undefined") return new Set(allCols.filter((c) => c.defaultVisible).map((c) => c.key));
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(allCols.filter((c) => c.defaultVisible).map((c) => c.key));
}

const defaultVisibleColumns = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

// ── Sort / Filter config ───────────────────────────────────
type SortField = "sku" | "productName" | "brand" | "asin" | "dtcRrp" | "active" | "contribProfit" | "contribMargin";
type SortDirection = "asc" | "desc";

const baseSortFields: { value: SortField; label: string }[] = [
  { value: "sku", label: "SKU" },
  { value: "productName", label: "Product" },
  { value: "brand", label: "Brand" },
  { value: "asin", label: "ASIN" },
  { value: "dtcRrp", label: "DTC RRP" },
  { value: "active", label: "Active" },
];

const channelSortFields: { value: SortField; label: string }[] = [
  ...baseSortFields,
  { value: "contribProfit", label: "Contribution Profit" },
  { value: "contribMargin", label: "Contribution Margin" },
];

function computeAmazonContribProfit(p: Product): number {
  const exVat = n(p.amazonRrp) / 1.2;
  const referralFee = n(p.amazonRrp) * n(p.referralPercent) / 100;
  const totalCoS = n(p.landedCost) + n(p.fbaFee) + referralFee;
  return exVat - totalCoS;
}

function computeAmazonContribMargin(p: Product): number {
  const exVat = n(p.amazonRrp) / 1.2;
  if (exVat === 0) return 0;
  return computeAmazonContribProfit(p) / exVat;
}

function computeDtcContribProfit(p: Product): number {
  const exVat = n(p.dtcRrp) / 1.2;
  const customerShipping = n(p.dtcRrp) >= 20 ? 0 : 1.99;
  const totalCoS = n(p.dtcFulfillmentFee) + n(p.dtcCourier) + n(p.dtcRrp) * 0.02 - customerShipping;
  const fullyLoaded = n(p.landedCost) + totalCoS;
  return exVat - fullyLoaded;
}

function computeDtcContribMargin(p: Product): number {
  const exVat = n(p.dtcRrp) / 1.2;
  if (exVat === 0) return 0;
  return computeDtcContribProfit(p) / exVat;
}

const filterableFields: { key: keyof Product; label: string }[] = [
  { key: "brand", label: "Brand" },
  { key: "active", label: "Active" },
  { key: "asin", label: "ASIN" },
  { key: "parentAsin", label: "Parent ASIN" },
];

interface ActiveFilter {
  key: keyof Product;
  label: string;
  values: Set<string>;
}

// ── Inline editing helpers ─────────────────────────────────

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
        if (e.key === "Escape") setEditing(false);
      }}
      className="border border-zinc-300 dark:border-zinc-600 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-zinc-800 w-full"
    />
  );
}

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

// ── Channel table builders ─────────────────────────────────

function buildAmazonColumns(saveField: (id: number, field: string, value: unknown) => void): Column<Product>[] {
  return [
    { key: "sku", label: "SKU", sticky: true, primary: true },
    { key: "productName", label: "Product", className: "min-w-[180px]" },
    { key: "brand", label: "Brand" },
    { key: "landedCost", label: "Landed Cost", render: (v) => fmt(n(v as string)) },
    {
      key: "amazonRrp",
      label: "RRP",
      render: (_, row) => (
        <EditableText value={row.amazonRrp} onSave={(v) => saveField(row.id, "amazonRrp", v)} />
      ),
    },
    {
      key: "amazonRrpExVat" as keyof Product,
      label: "RRP ex. VAT",
      render: (_, row) => fmt(n(row.amazonRrp) / 1.2),
    },
    {
      key: "amazonCogsPercent" as keyof Product,
      label: "% CoGs",
      render: (_, row) => {
        const exVat = n(row.amazonRrp) / 1.2;
        return pct(exVat > 0 ? n(row.landedCost) / exVat : 0);
      },
    },
    {
      key: "amazonGrossProfit" as keyof Product,
      label: "Gross Profit",
      render: (_, row) => fmt(n(row.amazonRrp) / 1.2 - n(row.landedCost)),
    },
    {
      key: "amazonGrossMargin" as keyof Product,
      label: "Gross Margin",
      render: (_, row) => {
        const exVat = n(row.amazonRrp) / 1.2;
        const gp = exVat - n(row.landedCost);
        return pct(exVat > 0 ? gp / exVat : 0);
      },
    },
    {
      key: "fbaFee",
      label: "FBA Fee",
      render: (_, row) => (
        <EditableText value={row.fbaFee} onSave={(v) => saveField(row.id, "fbaFee", v)} />
      ),
    },
    {
      key: "referralPercent",
      label: "Referral %",
      render: (_, row) => (
        <EditableText value={row.referralPercent} onSave={(v) => saveField(row.id, "referralPercent", v)} />
      ),
    },
    {
      key: "amazonReferralFee" as keyof Product,
      label: "Referral Fee",
      render: (_, row) => fmt(n(row.amazonRrp) * n(row.referralPercent) / 100),
    },
    {
      key: "amazonTotalCoS" as keyof Product,
      label: "Total CoS",
      render: (_, row) => {
        const referralFee = n(row.amazonRrp) * n(row.referralPercent) / 100;
        return fmt(n(row.landedCost) + n(row.fbaFee) + referralFee);
      },
    },
    {
      key: "amazonContribProfit" as keyof Product,
      label: "Contribution Profit",
      render: (_, row) => {
        const exVat = n(row.amazonRrp) / 1.2;
        const referralFee = n(row.amazonRrp) * n(row.referralPercent) / 100;
        const totalCoS = n(row.landedCost) + n(row.fbaFee) + referralFee;
        return fmt(exVat - totalCoS);
      },
    },
    {
      key: "amazonContribMargin" as keyof Product,
      label: "Contribution Margin",
      render: (_, row) => {
        const exVat = n(row.amazonRrp) / 1.2;
        const referralFee = n(row.amazonRrp) * n(row.referralPercent) / 100;
        const totalCoS = n(row.landedCost) + n(row.fbaFee) + referralFee;
        const cp = exVat - totalCoS;
        return pct(exVat > 0 ? cp / exVat : 0);
      },
    },
  ];
}

function buildDtcColumns(saveField: (id: number, field: string, value: unknown) => void): Column<Product>[] {
  return [
    { key: "sku", label: "SKU", sticky: true, primary: true },
    { key: "productName", label: "Product", className: "min-w-[180px]" },
    { key: "brand", label: "Brand" },
    { key: "landedCost", label: "Landed Cost", render: (v) => fmt(n(v as string)) },
    {
      key: "dtcRrp",
      label: "RRP",
      render: (_, row) => (
        <EditableText value={row.dtcRrp} onSave={(v) => saveField(row.id, "dtcRrp", v)} />
      ),
    },
    {
      key: "dtcRrpExVatCalc" as keyof Product,
      label: "RRP ex. VAT",
      render: (_, row) => fmt(n(row.dtcRrp) / 1.2),
    },
    {
      key: "dtcFulfillmentFee",
      label: "Fulfillment Fee",
      render: (_, row) => (
        <EditableText value={row.dtcFulfillmentFee} onSave={(v) => saveField(row.id, "dtcFulfillmentFee", v)} />
      ),
    },
    {
      key: "dtcCourier",
      label: "Courier",
      render: (_, row) => (
        <EditableText value={row.dtcCourier} onSave={(v) => saveField(row.id, "dtcCourier", v)} />
      ),
    },
    {
      key: "dtcCustomerShipping" as keyof Product,
      label: "Customer Shipping",
      render: (_, row) => {
        const rrp = n(row.dtcRrp);
        return fmt(rrp >= 20 ? 0 : 1.99);
      },
    },
    {
      key: "dtcShopifyFees" as keyof Product,
      label: "Shopify Fees (2%)",
      render: (_, row) => fmt(n(row.dtcRrp) * 0.02),
    },
    {
      key: "dtcTotalCoS" as keyof Product,
      label: "Total CoS",
      render: (_, row) => {
        const customerShipping = n(row.dtcRrp) >= 20 ? 0 : 1.99;
        return fmt(n(row.dtcFulfillmentFee) + n(row.dtcCourier) + n(row.dtcRrp) * 0.02 - customerShipping);
      },
    },
    {
      key: "dtcFullyLoadedCogs" as keyof Product,
      label: "Fully Loaded COGS",
      render: (_, row) => {
        const customerShipping = n(row.dtcRrp) >= 20 ? 0 : 1.99;
        const totalCoS = n(row.dtcFulfillmentFee) + n(row.dtcCourier) + n(row.dtcRrp) * 0.02 - customerShipping;
        return fmt(n(row.landedCost) + totalCoS);
      },
    },
    {
      key: "dtcContribProfit" as keyof Product,
      label: "Contribution Profit",
      render: (_, row) => {
        const exVat = n(row.dtcRrp) / 1.2;
        const customerShipping = n(row.dtcRrp) >= 20 ? 0 : 1.99;
        const totalCoS = n(row.dtcFulfillmentFee) + n(row.dtcCourier) + n(row.dtcRrp) * 0.02 - customerShipping;
        const fullyLoaded = n(row.landedCost) + totalCoS;
        return fmt(exVat - fullyLoaded);
      },
    },
    {
      key: "dtcContribMargin" as keyof Product,
      label: "Contribution Margin",
      render: (_, row) => {
        const exVat = n(row.dtcRrp) / 1.2;
        const customerShipping = n(row.dtcRrp) >= 20 ? 0 : 1.99;
        const totalCoS = n(row.dtcFulfillmentFee) + n(row.dtcCourier) + n(row.dtcRrp) * 0.02 - customerShipping;
        const fullyLoaded = n(row.landedCost) + totalCoS;
        const cp = exVat - fullyLoaded;
        return pct(exVat > 0 ? cp / exVat : 0);
      },
    },
  ];
}

// ── Main page ──────────────────────────────────────────────

export default function InventoryPage() {
  const { apiFetch, currentOrg } = useOrg();
  const [activeTab, setActiveTab] = useState<TabKey>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Inventory tab state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryDate, setInventoryDate] = useState<string>("");
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("sku");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showSortModal, setShowSortModal] = useState(false);
  const sortModalRef = useRef<HTMLDivElement>(null);

  // Filters
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [editingFilter, setEditingFilter] = useState<keyof Product | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const filterModalRef = useRef<HTMLDivElement>(null);

  // Column visibility — per tab
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => loadVisibleCols(COLUMN_STORAGE_KEY, ALL_COLUMNS));
  const [visibleAmazonCols, setVisibleAmazonCols] = useState<Set<string>>(() => loadVisibleCols(AMAZON_COLUMN_STORAGE_KEY, ALL_AMAZON_COLUMNS));
  const [visibleDtcCols, setVisibleDtcCols] = useState<Set<string>>(() => loadVisibleCols(DTC_COLUMN_STORAGE_KEY, ALL_DTC_COLUMNS));
  const [visibleInventoryCols, setVisibleInventoryCols] = useState<Set<string>>(() => loadVisibleCols(INVENTORY_COLUMN_STORAGE_KEY, ALL_INVENTORY_COLUMNS));
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [showInventoryColPicker, setShowInventoryColPicker] = useState(false);
  const inventoryColPickerRef = useRef<HTMLDivElement>(null);

  // DTC default filter — auto-apply Doogood brand on first visit
  const dtcFilterApplied = useRef(false);

  // ── Click-outside handler ────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortModalRef.current && !sortModalRef.current.contains(event.target as Node)) {
        setShowSortModal(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (colPickerRef.current && !colPickerRef.current.contains(event.target as Node)) {
        setShowColPicker(false);
      }
      if (inventoryColPickerRef.current && !inventoryColPickerRef.current.contains(event.target as Node)) {
        setShowInventoryColPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Persist column visibility (tab-aware) ────────────────
  function getActiveColState() {
    if (activeTab === "amazon") return { cols: visibleAmazonCols, setCols: setVisibleAmazonCols, allCols: ALL_AMAZON_COLUMNS, storageKey: AMAZON_COLUMN_STORAGE_KEY };
    if (activeTab === "dtc") return { cols: visibleDtcCols, setCols: setVisibleDtcCols, allCols: ALL_DTC_COLUMNS, storageKey: DTC_COLUMN_STORAGE_KEY };
    return { cols: visibleCols, setCols: setVisibleCols, allCols: ALL_COLUMNS, storageKey: COLUMN_STORAGE_KEY };
  }

  function toggleCol(key: string) {
    const { cols, setCols, storageKey } = getActiveColState();
    const newSet = new Set(cols);
    if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
    setCols(newSet);
    localStorage.setItem(storageKey, JSON.stringify([...newSet]));
  }
  function showAllCols() {
    const { setCols, allCols, storageKey } = getActiveColState();
    const all = new Set(allCols.map((c) => c.key));
    setCols(all);
    localStorage.setItem(storageKey, JSON.stringify([...all]));
  }
  function clearCols() {
    const { setCols, storageKey } = getActiveColState();
    setCols(new Set());
    localStorage.setItem(storageKey, JSON.stringify([]));
  }

  function toggleInventoryCol(key: string) {
    const newSet = new Set(visibleInventoryCols);
    if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
    setVisibleInventoryCols(newSet);
    localStorage.setItem(INVENTORY_COLUMN_STORAGE_KEY, JSON.stringify([...newSet]));
  }

  // ── DTC default filter ──────────────────────────────────
  useEffect(() => {
    if (activeTab === "dtc" && !dtcFilterApplied.current) {
      dtcFilterApplied.current = true;
      const hasBrandFilter = filters.some((f) => f.key === "brand");
      if (!hasBrandFilter) {
        setFilters((prev) => [...prev, { key: "brand", label: "Brand", values: new Set(["Doogood"]) }]);
      }
    }
  }, [activeTab, filters]);

  // ── Fetch products ───────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/products");
      if (res.ok) setProducts(await res.json());
    } finally {
      setLoading(false);
    }
  }, [apiFetch, currentOrg]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── Fetch inventory snapshots ──────────────────────────
  const fetchInventoryData = useCallback(async () => {
    if (!currentOrg) return;
    setInventoryLoading(true);
    try {
      const res = await apiFetch("/api/inventory");
      if (res.ok) {
        const data = await res.json();
        setInventoryItems(data.items);
        setInventoryDate(data.date);
      }
    } finally {
      setInventoryLoading(false);
    }
  }, [apiFetch, currentOrg]);

  useEffect(() => {
    if (activeTab === "inventory" || activeTab === "forecast") {
      fetchInventoryData();
    }
  }, [activeTab, fetchInventoryData]);

  // ── CRUD helpers ─────────────────────────────────────────
  const saveField = useCallback(async (id: number, field: string, value: unknown) => {
    const res = await apiFetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    }
  }, [apiFetch]);

  const addProduct = useCallback(async () => {
    const sku = prompt("Enter SKU:");
    if (!sku?.trim()) return;
    const res = await apiFetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku.trim() }),
    });
    if (res.ok) {
      const newProduct = await res.json();
      setProducts((prev) => [...prev, newProduct]);
    }
  }, [apiFetch]);

  const deleteProduct = useCallback(async (id: number) => {
    if (!confirm("Delete this product?")) return;
    const res = await apiFetch(`/api/products?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }, [apiFetch]);

  // ── Shopify forecast period ────────────────────────────
  type ForecastPeriod = "7d" | "14d" | "30d";
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>("30d");
  const [forecastDateRange, setForecastDateRange] = useState<{ from: Date; to: Date } | undefined>(
    () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfYesterday() })
  );

  // Sync toggle with date picker
  const handleForecastPeriodChange = useCallback((period: ForecastPeriod) => {
    setForecastPeriod(period);
    const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
    setForecastDateRange({ from: startOfDay(subDays(new Date(), days)), to: endOfYesterday() });
  }, []);

  // ── Run rate data ──────────────────────────────────────
  const [shopifyUnits, setShopifyUnits] = useState<Record<string, number>>({});
  const [amazonUnits, setAmazonUnits] = useState<Record<string, number>>({});

  const fetchRunRate = useCallback(async () => {
    if (!currentOrg || !forecastDateRange?.from || !forecastDateRange?.to) return;
    try {
      const from = format(forecastDateRange.from, "yyyy-MM-dd");
      const to = format(forecastDateRange.to, "yyyy-MM-dd");
      const res = await apiFetch(`/api/inventory/run-rate?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setShopifyUnits(data.shopifyUnits ?? {});
        setAmazonUnits(data.amazonUnits ?? {});
      }
    } catch (e) {
      console.error("Failed to fetch run rate:", e);
    }
  }, [apiFetch, currentOrg, forecastDateRange]);

  useEffect(() => {
    if (activeTab === "inventory" || activeTab === "forecast") {
      fetchRunRate();
    }
  }, [activeTab, fetchRunRate]);

  const forecastDays = useMemo(() => {
    if (!forecastDateRange?.from || !forecastDateRange?.to) return 30;
    return differenceInDays(forecastDateRange.to, forecastDateRange.from) || 1;
  }, [forecastDateRange]);

  // ── Inventory sync ─────────────────────────────────────
  const [syncing, setSyncing] = useState(false);

  const syncShopifyInventory = useCallback(async () => {
    if (!currentOrg) return;
    setSyncing(true);
    try {
      const res = await apiFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-shopify" }),
      });
      if (res.ok) {
        fetchInventoryData();
      } else {
        const err = await res.json();
        alert(`Sync failed: ${err.error}`);
      }
    } catch (e) {
      alert(`Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }, [apiFetch, currentOrg, fetchInventoryData]);

  // ── Inventory edit modal state ──────────────────────────
  const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null);
  const [editAmazonQty, setEditAmazonQty] = useState("");
  const [editShopifyQty, setEditShopifyQty] = useState("");
  const [editWarehouseQty, setEditWarehouseQty] = useState("");
  const [savingInventory, setSavingInventory] = useState(false);

  const openInventoryModal = useCallback((item: InventoryItem) => {
    setEditingInventory(item);
    setEditAmazonQty(String(item.amazonQty));
    setEditShopifyQty(String(item.shopifyQty));
    setEditWarehouseQty(String(item.warehouseQty));
  }, []);

  const saveInventory = useCallback(async () => {
    if (!editingInventory) return;
    setSavingInventory(true);
    const amazonQty = Number(editAmazonQty) || 0;
    const shopifyQty = Number(editShopifyQty) || 0;
    const warehouseQty = Number(editWarehouseQty) || 0;
    try {
      const res = await apiFetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: editingInventory.sku, amazonQty, shopifyQty, warehouseQty }),
      });
      if (res.ok) {
        setInventoryItems((prev) =>
          prev.map((item) =>
            item.sku === editingInventory.sku
              ? { ...item, amazonQty, shopifyQty, warehouseQty, totalQty: amazonQty + shopifyQty + warehouseQty }
              : item
          )
        );
        setEditingInventory(null);
      }
    } finally {
      setSavingInventory(false);
    }
  }, [editingInventory, editAmazonQty, editShopifyQty, editWarehouseQty, apiFetch]);

  // ── Forecast tab state ──────────────────────────────────
  const [forecastSkuFilter, setForecastSkuFilter] = useState<ForecastSkuFilter>("all");
  const [forecastChannelFilter, setForecastChannelFilter] = useState<ForecastChannelFilter>("all");

  const initInventoryFromProducts = useCallback(async () => {
    // Create today's snapshot for every active product that doesn't already have one
    const existingSkus = new Set(inventoryItems.map((i) => i.sku));
    const missing = products.filter((p) => p.active && !existingSkus.has(p.sku));
    if (missing.length === 0) return;
    for (const p of missing) {
      await apiFetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: p.sku, amazonQty: 0, shopifyQty: 0, warehouseQty: 0 }),
      });
    }
    fetchInventoryData();
  }, [inventoryItems, products, fetchInventoryData, apiFetch]);

  // ── Grouped inventory rows (Total / Amazon / Shopify per SKU) ──
  type ChannelRow = {
    sku: string;
    productName: string | null;
    channel: "Total" | "Amazon" | "Shopify";
    inventory: number;
    runRate: number | null; // units/day, null = no data
    daysLeft: number | null;
    oosDate: string | null;
    isFirstInGroup: boolean;
    sourceItem: InventoryItem;
  };

  const groupedRows = useMemo((): ChannelRow[] => {
    const rows: ChannelRow[] = [];
    for (const item of inventoryItems) {
      const shopifySold = shopifyUnits[item.sku] ?? 0;
      const amazonSold = amazonUnits[item.sku] ?? 0;
      const shopifyRate = shopifySold > 0 ? shopifySold / forecastDays : null;
      const amazonRate = amazonSold > 0 ? amazonSold / forecastDays : null;
      const totalQty = (item.amazonQty ?? 0) + (item.shopifyQty ?? 0);
      const totalSold = shopifySold + amazonSold;
      const totalRate = totalSold > 0 ? totalSold / forecastDays : null;

      // Total row
      const totalDaysLeft = totalRate ? Math.floor(totalQty / totalRate) : null;
      rows.push({
        sku: item.sku,
        productName: item.productName,
        channel: "Total",
        inventory: totalQty,
        runRate: totalRate,
        daysLeft: totalDaysLeft,
        oosDate: totalDaysLeft !== null ? format(addDays(new Date(), totalDaysLeft), "dd MMM yyyy") : null,
        isFirstInGroup: true,
        sourceItem: item,
      });

      // Amazon row
      const amazonDaysLeft = amazonRate ? Math.floor((item.amazonQty ?? 0) / amazonRate) : null;
      rows.push({
        sku: item.sku,
        productName: item.productName,
        channel: "Amazon",
        inventory: item.amazonQty ?? 0,
        runRate: amazonRate,
        daysLeft: amazonDaysLeft,
        oosDate: amazonDaysLeft !== null ? format(addDays(new Date(), amazonDaysLeft), "dd MMM yyyy") : null,
        isFirstInGroup: false,
        sourceItem: item,
      });

      // Shopify row
      const shopifyDaysLeft = shopifyRate ? Math.floor((item.shopifyQty ?? 0) / shopifyRate) : null;
      rows.push({
        sku: item.sku,
        productName: item.productName,
        channel: "Shopify",
        inventory: item.shopifyQty ?? 0,
        runRate: shopifyRate,
        daysLeft: shopifyDaysLeft,
        oosDate: shopifyDaysLeft !== null ? format(addDays(new Date(), shopifyDaysLeft), "dd MMM yyyy") : null,
        isFirstInGroup: false,
        sourceItem: item,
      });
    }
    return rows;
  }, [inventoryItems, shopifyUnits, amazonUnits, forecastDays]);

  // ── Forecast burn-down chart data ──────────────────────
  const forecastChartData = useMemo(() => {
    // Filter items by SKU toggle
    const items = forecastSkuFilter === "all"
      ? inventoryItems
      : inventoryItems.filter((item) => skuToFilterKey(item.sku) === forecastSkuFilter);

    if (items.length === 0) return { data: [], skus: [] };

    // For each item, compute starting inventory + daily run rate based on channel
    const skuInfo = items.map((item) => {
      let inventory: number;
      let sold: number;

      if (forecastChannelFilter === "amazon") {
        inventory = item.amazonQty ?? 0;
        sold = amazonUnits[item.sku] ?? 0;
      } else if (forecastChannelFilter === "shopify") {
        inventory = item.shopifyQty ?? 0;
        sold = shopifyUnits[item.sku] ?? 0;
      } else {
        inventory = (item.amazonQty ?? 0) + (item.shopifyQty ?? 0);
        sold = (amazonUnits[item.sku] ?? 0) + (shopifyUnits[item.sku] ?? 0);
      }

      const runRate = sold > 0 ? sold / forecastDays : 0;
      return { sku: item.sku, name: item.productName || item.sku, inventory, runRate };
    });

    // Generate data points for day 0 to FORECAST_HORIZON
    const data: Record<string, number | string>[] = [];
    for (let d = 0; d <= FORECAST_HORIZON; d++) {
      const point: Record<string, number | string> = { day: d };
      for (const s of skuInfo) {
        point[s.sku] = Math.max(0, Math.round(s.inventory - s.runRate * d));
      }
      data.push(point);
    }

    return {
      data,
      skus: skuInfo.map((s) => ({ sku: s.sku, name: s.name })),
    };
  }, [inventoryItems, forecastSkuFilter, forecastChannelFilter, amazonUnits, shopifyUnits, forecastDays]);

  // ── Filter helpers ───────────────────────────────────────
  function getDisplayValue(val: unknown): string {
    if (val === null || val === undefined) return "(empty)";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  }

  function getUniqueValues(key: keyof Product): string[] {
    const set = new Set<string>();
    for (const p of products) set.add(getDisplayValue(p[key]));
    return Array.from(set).sort();
  }

  function getFilterValues(key: keyof Product): Set<string> {
    const filter = filters.find((f) => f.key === key);
    return filter?.values || new Set();
  }

  function toggleFilterValue(key: keyof Product, value: string) {
    setFilters((prev) => {
      const existing = prev.find((f) => f.key === key);
      if (existing) {
        const newValues = new Set(existing.values);
        if (newValues.has(value)) newValues.delete(value);
        else newValues.add(value);
        if (newValues.size === 0) return prev.filter((f) => f.key !== key);
        return prev.map((f) => (f.key === key ? { ...f, values: newValues } : f));
      }
      const field = filterableFields.find((f) => f.key === key);
      return [...prev, { key, label: field?.label || String(key), values: new Set([value]) }];
    });
  }

  function removeFilter(key: keyof Product) {
    setFilters((prev) => prev.filter((f) => f.key !== key));
  }

  const editingFilterValues = useMemo(() => {
    if (!editingFilter) return [];
    const values = getUniqueValues(editingFilter);
    if (!filterSearch) return values;
    return values.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFilter, products, filterSearch]);

  // ── Filtered & sorted data ───────────────────────────────
  const filtered = useMemo(() => {
    let result = [...products];

    // Multi-field filters
    if (filters.length > 0) {
      result = result.filter((p) =>
        filters.every((filter) => {
          const value = getDisplayValue(p[filter.key]);
          return filter.values.has(value);
        })
      );
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          (p.productName || "").toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q) ||
          (p.asin || "").toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortField === "contribProfit") {
        aVal = activeTab === "dtc" ? computeDtcContribProfit(a) : computeAmazonContribProfit(a);
        bVal = activeTab === "dtc" ? computeDtcContribProfit(b) : computeAmazonContribProfit(b);
      } else if (sortField === "contribMargin") {
        aVal = activeTab === "dtc" ? computeDtcContribMargin(a) : computeAmazonContribMargin(a);
        bVal = activeTab === "dtc" ? computeDtcContribMargin(b) : computeAmazonContribMargin(b);
      } else {
        aVal = getDisplayValue(a[sortField]).toLowerCase();
        bVal = getDisplayValue(b[sortField]).toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, filters, search, sortField, sortDirection, activeTab]);

  // ── Build Product Database columns ───────────────────────
  const columns: Column<Product>[] = useMemo(() => {
    const cols: Column<Product>[] = [];

    if (visibleCols.has("sku")) {
      cols.push({
        key: "sku",
        label: "SKU",
        sticky: true,
        primary: true,
        render: (_, row) => (
          <EditableText value={row.sku} onSave={(v) => v && saveField(row.id, "sku", v)} />
        ),
      });
    }

    if (visibleCols.has("productName")) {
      cols.push({
        key: "productName",
        label: "Product",
        className: "min-w-[200px]",
        render: (_, row) => (
          <EditableText value={row.productName} onSave={(v) => saveField(row.id, "productName", v)} />
        ),
      });
    }

    if (visibleCols.has("brand")) {
      cols.push({
        key: "brand",
        label: "Brand",
        render: (_, row) => (
          <EditableSelect value={row.brand} options={BRAND_OPTIONS} onSave={(v) => saveField(row.id, "brand", v)} />
        ),
      });
    }

    const simpleColumns: { key: keyof Product; label: string; editable?: boolean; price?: boolean }[] = [
      { key: "unitBarcode", label: "Unit Barcode", editable: true },
      { key: "asin", label: "ASIN", editable: true },
      { key: "parentAsin", label: "Parent ASIN", editable: true },
      { key: "shippoSku", label: "Shippo SKU", editable: true },
      { key: "piecesPerPack", label: "Pieces/Pack", editable: true },
      { key: "packWeightKg", label: "Pack Weight (kg)" },
      { key: "packLengthCm", label: "Pack Length (cm)" },
      { key: "packWidthCm", label: "Pack Width (cm)" },
      { key: "packHeightCm", label: "Pack Height (cm)" },
      { key: "unitCbm", label: "Unit CBM" },
      { key: "dimensionalWeight", label: "Dim. Weight" },
      { key: "unitPriceUsd", label: "Unit Price (USD)", price: true },
      { key: "unitPriceGbp", label: "Unit Price (GBP)", price: true },
      { key: "packCostGbp", label: "Pack Cost (GBP)", price: true },
      { key: "landedCost", label: "Landed Cost", price: true },
      { key: "unitLcogs", label: "Unit LCOGS", price: true },
      { key: "dtcRrp", label: "DTC RRP", price: true },
      { key: "ppUnit", label: "PP Unit", price: true },
      { key: "amazonRrp", label: "Amazon RRP", price: true },
      { key: "cartonBarcode", label: "Carton Barcode" },
      { key: "unitsPerMasterCarton", label: "Units/MC" },
      { key: "piecesPerMasterCarton", label: "Pieces/MC" },
      { key: "grossWeightKg", label: "Gross Weight (kg)" },
      { key: "cartonWidthCm", label: "Carton Width (cm)" },
      { key: "cartonLengthCm", label: "Carton Length (cm)" },
      { key: "cartonHeightCm", label: "Carton Height (cm)" },
      { key: "cartonCbm", label: "Carton CBM" },
    ];

    for (const col of simpleColumns) {
      if (!visibleCols.has(col.key)) continue;
      if (col.editable) {
        cols.push({
          key: col.key,
          label: col.label,
          render: (_, row) => (
            <EditableText
              value={String(row[col.key] ?? "")}
              onSave={(v) => saveField(row.id, col.key, v)}
            />
          ),
        });
      } else if (col.price) {
        cols.push({
          key: col.key,
          label: col.label,
          render: (val) => {
            if (val === null || val === undefined || val === "") return "-";
            const num = Number(val);
            return isNaN(num) ? String(val) : num.toFixed(2);
          },
        });
      } else {
        cols.push({ key: col.key, label: col.label });
      }
    }

    if (visibleCols.has("active")) {
      cols.push({
        key: "active",
        label: "Active",
        render: (_, row) => (
          <button
            onClick={() => saveField(row.id, "active", !row.active)}
            className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${
              row.active
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
            }`}
          >
            {row.active ? "Yes" : "No"}
          </button>
        ),
      });
    }

    cols.push({
      key: "actions" as keyof Product,
      label: "",
      render: (_, row) => (
        <button
          onClick={() => deleteProduct(row.id)}
          className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
          title="Delete product"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    });

    return cols;
  }, [visibleCols, saveField, deleteProduct]);

  // ── Amazon / DTC columns (filtered by visibility) ────────
  const amazonColumns = useMemo(() => {
    const all = buildAmazonColumns(saveField);
    return all.filter((col) => visibleAmazonCols.has(String(col.key)));
  }, [saveField, visibleAmazonCols]);

  const dtcColumns = useMemo(() => {
    const all = buildDtcColumns(saveField);
    return all.filter((col) => visibleDtcCols.has(String(col.key)));
  }, [saveField, visibleDtcCols]);

  // ── Toolbar (shared across Product Database / Amazon / DTC) ──
  const renderToolbar = () => {
    const { cols, allCols } = getActiveColState();
    const sortFields = activeTab === "amazon" || activeTab === "dtc" ? channelSortFields : baseSortFields;

    return (
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-muted">
          {filtered.length === products.length
            ? products.length
            : `${filtered.length} of ${products.length}`} products
        </span>

        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 w-48"
        />

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
                  {sortFields.map((opt) => (
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
              {filterableFields.map((field) => (
                <button
                  key={String(field.key)}
                  className="dropdown-item"
                  onClick={() => {
                    setEditingFilter(field.key);
                    setShowFilterDropdown(false);
                    setFilterSearch("");
                  }}
                >
                  {field.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Columns — all data tabs */}
        {activeTab !== "forecast" && activeTab !== "inventory" && (
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              className="btn btn-secondary btn-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Columns ({cols.size})
            </button>
            {showColPicker && (
              <div className="dropdown right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto">
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700 flex gap-2">
                  <button onClick={showAllCols} className="btn btn-secondary btn-sm flex-1">
                    Show All
                  </button>
                  <button onClick={clearCols} className="btn btn-secondary btn-sm flex-1">
                    Clear
                  </button>
                </div>
                <div className="p-2">
                  {allCols.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={cols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="rounded"
                      />
                      <span className="text-sm">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Filter pills + modal (shared) ───────────────────────
  const renderFilterPills = () => (
    <>
      {filters.length > 0 && (
        <div className="filter-pills-container">
          {filters.map((filter) => (
            <div key={String(filter.key)} className="filter-pill">
              <button
                className="filter-pill-label"
                onClick={() => { setEditingFilter(filter.key); setFilterSearch(""); }}
              >
                <span className="filter-pill-key">{filter.label}:</span>
                <span className="filter-pill-values">
                  {filter.values.size <= 2
                    ? Array.from(filter.values).join(", ")
                    : `${filter.values.size} selected`}
                </span>
              </button>
              <button className="filter-pill-remove" onClick={() => removeFilter(filter.key)}>×</button>
            </div>
          ))}
          <button className="filter-clear-all" onClick={() => setFilters([])}>Clear all</button>
        </div>
      )}

      {editingFilter && (
        <div className="modal-overlay" onClick={() => { setEditingFilter(null); setFilterSearch(""); }}>
          <div className="filter-modal" ref={filterModalRef} onClick={(e) => e.stopPropagation()}>
            <div className="filter-modal-header">
              <h3 className="filter-modal-title">
                Filter by {filterableFields.find((f) => f.key === editingFilter)?.label}
              </h3>
              <button className="modal-close" onClick={() => { setEditingFilter(null); setFilterSearch(""); }}>×</button>
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
              <button className="btn btn-secondary" onClick={() => { setEditingFilter(null); setFilterSearch(""); }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Inventory</h1>
          {activeTab === "products" && (
            <button
              onClick={addProduct}
              className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80"
            >
              Add Product
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "border-zinc-900 dark:border-white text-zinc-900 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content">
        {activeTab === "products" ? (
          <div className="pt-4 flex flex-col flex-1 overflow-hidden">
            {renderToolbar()}
            {renderFilterPills()}
            {loading ? (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden">
                <div className="flex gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  {[48, 160, 64, 80, 72, 80, 80, 24].map((w, i) => (
                    <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
                  ))}
                </div>
                {[...Array(8)].map((_, row) => (
                  <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                    {[48, 160, 64, 80, 72, 80, 80, 24].map((w, col) => (
                      <div key={col} className="h-3.5 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse shrink-0" style={{ width: w }} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Table<Product>
                columns={columns}
                data={filtered}
                rowKey="id"
                emptyMessage={search || filters.length > 0 ? "No products match your search." : "No products yet. Run the backfill to import."}
              />
            )}
          </div>
        ) : activeTab === "amazon" ? (
          <div className="pt-4 flex flex-col flex-1 overflow-hidden">
            {renderToolbar()}
            {renderFilterPills()}
            {loading ? (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden">
                <div className="flex gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  {[48, 160, 64, 56, 56, 64, 56, 72, 72, 48, 56, 64, 56, 96, 96].map((w, i) => (
                    <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
                  ))}
                </div>
                {[...Array(8)].map((_, row) => (
                  <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                    {[48, 160, 64, 56, 56, 64, 56, 72, 72, 48, 56, 64, 56, 96, 96].map((w, col) => (
                      <div key={col} className="h-3.5 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse shrink-0" style={{ width: w }} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Table<Product>
                columns={amazonColumns}
                data={filtered}
                rowKey="id"
                emptyMessage="No products yet."
              />
            )}
          </div>
        ) : activeTab === "dtc" ? (
          <div className="pt-4 flex flex-col flex-1 overflow-hidden">
            {renderToolbar()}
            {renderFilterPills()}
            {loading ? (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden">
                <div className="flex gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  {[48, 160, 64, 56, 56, 64, 72, 56, 80, 72, 56, 96, 80, 96].map((w, i) => (
                    <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
                  ))}
                </div>
                {[...Array(8)].map((_, row) => (
                  <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                    {[48, 160, 64, 56, 56, 64, 72, 56, 80, 72, 56, 96, 80, 96].map((w, col) => (
                      <div key={col} className="h-3.5 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse shrink-0" style={{ width: w }} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Table<Product>
                columns={dtcColumns}
                data={filtered}
                rowKey="id"
                emptyMessage="No products yet."
              />
            )}
          </div>
        ) : activeTab === "inventory" ? (
          <div className="pt-4 flex flex-col overflow-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-muted">
                {inventoryItems.length} SKUs
                {inventoryDate && (
                  <span className="ml-2 text-zinc-400">as of {inventoryDate}</span>
                )}
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  {(["7d", "14d", "30d"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handleForecastPeriodChange(p)}
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
                <button
                  onClick={syncShopifyInventory}
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
                {inventoryItems.length === 0 && products.length > 0 && (
                  <button
                    onClick={initInventoryFromProducts}
                    className="btn btn-secondary btn-sm"
                  >
                    Add All Products
                  </button>
                )}
              </div>
            </div>
            {inventoryLoading ? (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden">
                <div className="flex gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  {[48, 160, 80, 64, 64, 64, 80, 24].map((w, i) => (
                    <div key={i} className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse shrink-0" style={{ width: w }} />
                  ))}
                </div>
                {[...Array(9)].map((_, row) => (
                  <div key={row} className="flex gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50">
                    {[48, 160, 80, 64, 64, 64, 80, 24].map((w, col) => (
                      <div key={col} className="h-3.5 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse shrink-0" style={{ width: w }} />
                    ))}
                  </div>
                ))}
              </div>
            ) : groupedRows.length === 0 ? (
              <div className="table-empty">No inventory data yet. Click &apos;Add All Products&apos; to start tracking.</div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr className="table-header-row">
                      <th className="table-header-cell table-header-cell-sticky">SKU</th>
                      <th className="table-header-cell min-w-[180px]">Product</th>
                      <th className="table-header-cell">Channel</th>
                      <th className="table-header-cell">Inventory</th>
                      <th className="table-header-cell">Run Rate</th>
                      <th className="table-header-cell">Days Left</th>
                      <th className="table-header-cell">OOS Forecast</th>
                      <th className="table-header-cell"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map((row) => {
                      const isTotal = row.channel === "Total";
                      return (
                        <tr
                          key={`${row.sku}-${row.channel}`}
                          className={`table-body-row ${isTotal ? "border-t-2 border-zinc-300 dark:border-zinc-600" : ""}`}
                        >
                          <td className={`table-cell table-cell-sticky table-cell-primary ${!row.isFirstInGroup ? "text-transparent select-none" : ""}`}>
                            {row.sku}
                          </td>
                          <td className={`table-cell min-w-[180px] ${!row.isFirstInGroup ? "text-transparent select-none" : ""}`}>
                            {row.productName ?? "-"}
                          </td>
                          <td className={`table-cell ${isTotal ? "font-semibold" : "text-zinc-500 dark:text-zinc-400 pl-6"}`}>
                            {row.channel}
                          </td>
                          <td className={`table-cell ${isTotal ? "font-semibold" : ""}`}>
                            {row.inventory === 0 ? (
                              <span className="text-red-500 font-medium">0</span>
                            ) : (
                              row.inventory
                            )}
                          </td>
                          <td className="table-cell">
                            {row.runRate !== null ? row.runRate.toFixed(1) : "-"}
                          </td>
                          <td className={`table-cell ${
                            row.daysLeft !== null
                              ? row.channel === "Amazon"
                                ? row.daysLeft < 7
                                  ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium"
                                  : row.daysLeft < 30
                                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium"
                                    : ""
                                : (row.channel === "Total" || row.channel === "Shopify")
                                  ? row.daysLeft < 90
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium"
                                    : row.daysLeft <= 150
                                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium"
                                      : ""
                                  : ""
                              : ""
                          }`}>
                            {row.daysLeft !== null ? row.daysLeft : "-"}
                          </td>
                          <td className="table-cell">
                            {row.oosDate ?? "-"}
                          </td>
                          <td className="table-cell">
                            {row.isFirstInGroup && (
                              <button
                                onClick={() => openInventoryModal(row.sourceItem)}
                                className="text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                                title="Edit stock"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Edit inventory modal */}
            {editingInventory && (
              <div className="modal-overlay" onClick={() => setEditingInventory(null)}>
                <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="filter-modal-header">
                    <h3 className="filter-modal-title">Update Stock</h3>
                    <button className="modal-close" onClick={() => setEditingInventory(null)}>×</button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <div className="text-sm font-medium">{editingInventory.sku}</div>
                      <div className="text-xs text-zinc-500">{editingInventory.productName || "Unnamed product"}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Amazon FBA Qty</label>
                      <input
                        type="number"
                        value={editAmazonQty}
                        onChange={(e) => setEditAmazonQty(e.target.value)}
                        className="input w-full"
                        min={0}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Shopify Qty</label>
                      <input
                        type="number"
                        value={editShopifyQty}
                        onChange={(e) => setEditShopifyQty(e.target.value)}
                        className="input w-full"
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Warehouse Qty</label>
                      <input
                        type="number"
                        value={editWarehouseQty}
                        onChange={(e) => setEditWarehouseQty(e.target.value)}
                        className="input w-full"
                        min={0}
                      />
                    </div>
                    <div className="text-sm text-zinc-500">
                      Total: <span className="font-medium text-zinc-900 dark:text-white">{(Number(editAmazonQty) || 0) + (Number(editShopifyQty) || 0) + (Number(editWarehouseQty) || 0)}</span>
                    </div>
                  </div>
                  <div className="filter-modal-footer">
                    <button className="btn btn-secondary" onClick={() => setEditingInventory(null)}>Cancel</button>
                    <button
                      className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80 text-sm"
                      onClick={saveInventory}
                      disabled={savingInventory}
                    >
                      {savingInventory ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-4 flex flex-col gap-4">
            {/* Forecast toolbar */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* SKU filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">SKU</span>
                <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  {([["all", "All"], ["8-rolls", "8 Rolls"], ["24-rolls", "24 Rolls"], ["48-rolls", "48 Rolls"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setForecastSkuFilter(val)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                        forecastSkuFilter === val
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Channel</span>
                <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  {([["all", "All"], ["amazon", "Amazon"], ["shopify", "Shopify"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setForecastChannelFilter(val)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                        forecastChannelFilter === val
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Run rate period */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Run Rate</span>
                <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  {(["7d", "14d", "30d"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => handleForecastPeriodChange(p)}
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
            </div>

            {/* Chart */}
            {forecastChartData.skus.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-zinc-400 dark:text-zinc-500 text-sm">
                No inventory data available. Switch to the Inventory tab to add stock levels.
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                <ResponsiveContainer width="100%" height={420}>
                  <LineChart data={forecastChartData.data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis
                      dataKey="day"
                      type="number"
                      domain={[0, FORECAST_HORIZON]}
                      ticks={[0, 30, 60, 90, 120, 150, 180]}
                      tickFormatter={(d) => `Day ${d}`}
                      fontSize={12}
                    />
                    <YAxis fontSize={12} />
                    <Tooltip
                      labelFormatter={(d) => `Day ${d}`}
                      formatter={(value, name) => {
                        const match = forecastChartData.skus.find((s) => s.sku === name);
                        return [Number(value).toLocaleString() + " units", match?.name || String(name)];
                      }}
                      contentStyle={{
                        backgroundColor: "var(--color-zinc-50, #fafafa)",
                        border: "1px solid var(--color-zinc-200, #e4e4e7)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend
                      formatter={(value) => {
                        const match = forecastChartData.skus.find((s) => s.sku === value);
                        return match?.name || value;
                      }}
                    />
                    <ReferenceLine
                      y={REORDER_THRESHOLD}
                      stroke="#ef4444"
                      strokeDasharray="8 4"
                      label={{ value: "Reorder", position: "right", fill: "#ef4444", fontSize: 12 }}
                    />
                    {forecastChartData.skus.map((s, i) => (
                      <Line
                        key={s.sku}
                        type="monotone"
                        dataKey={s.sku}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        name={s.sku}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
