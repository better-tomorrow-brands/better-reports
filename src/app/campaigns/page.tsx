"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Table, Column } from "@/components/Table";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DateRange } from "react-day-picker";
import { useOrg } from "@/contexts/OrgContext";

// ── Types ──────────────────────────────────────────────

interface FbCampaign {
  id: number;
  campaign: string | null;
  adGroup: string | null;
  ad: string | null;
  productName: string | null;
  productUrl: string | null;
  skuSuffix: string | null;
  skus: string | null;
  discountCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  productTemplate: string | null;
  status: string | null;
}

interface WaCampaign {
  id: number;
  name: string;
  templateName: string;
  customerCount: number;
  successCount: number;
  errorCount: number;
  status: string;
  createdAt: string;
  sentAt: string | null;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  variants: Array<{
    id: string;
    sku: string;
    title: string;
  }>;
}

interface ShopifyDiscount {
  id: string;
  title: string;
  code: string;
  value: string;
}

interface FbFormData {
  id?: number;
  campaign: string;
  adGroup: string;
  ad: string;
  productName: string;
  productUrl: string;
  skuSuffix: string;
  skus: string;
  discountCode: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  productTemplate: string;
  status: string;
}

interface Template {
  name: string;
  status: string;
  language: string;
  params: { name: string }[];
  header?: string;
  body?: string;
}

interface CsvRow {
  phone: string;
  first_name: string;
  [key: string]: string;
}

interface SendResult {
  phone: string;
  first_name: string;
  status: "pending" | "sending" | "success" | "error";
  message?: string;
}

interface CampaignCustomer {
  id: number;
  customerId: number;
  phone: string | null;
  firstName: string | null;
  status: string;
}

interface CampaignWithCustomers {
  id: number;
  name: string;
  templateName: string;
  status: string;
  campaignsWaCustomers: CampaignCustomer[];
}

interface CampaignSendResult {
  id: number;
  phone: string;
  firstName: string;
  status: "pending" | "sending" | "success" | "error";
  error?: string;
}

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

type LapseFilterType = "new" | "due_reorder" | "lapsed" | "lost" | "custom" | null;

interface LapseFilter {
  type: LapseFilterType;
  customMax?: number;
}

const emptyFbForm: FbFormData = {
  campaign: "",
  adGroup: "",
  ad: "",
  productName: "",
  productUrl: "",
  skuSuffix: "",
  skus: "",
  discountCode: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmTerm: "",
  productTemplate: "",
  status: "active",
};

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const phoneIdx = headers.indexOf("phone");
  const nameIdx = headers.indexOf("first_name");

  if (phoneIdx === -1 || nameIdx === -1) return [];

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: CsvRow = { phone: "", first_name: "" };
      headers.forEach((header, i) => {
        row[header] = values[i] || "";
      });
      return row;
    });
}

// ── Helpers ────────────────────────────────────────────

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status, type }: { status: string | null; type: "fb" | "wa" }) {
  if (type === "fb") {
    return (
      <span
        className={`px-2 py-0.5 rounded text-xs ${
          status === "active"
            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
        }`}
      >
        {status || "active"}
      </span>
    );
  }

  switch (status) {
    case "completed":
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Completed</span>;
    case "sending":
      return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Sending</span>;
    default:
      return <span className="px-2 py-1 text-xs rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">Draft</span>;
  }
}

// ── Main Component ─────────────────────────────────────

export default function CampaignsPage() {
  const { apiFetch, currentOrg } = useOrg();
  const [activeTab, setActiveTab] = useState<"facebook" | "whatsapp" | "manual">("facebook");

  // ── Facebook State ─────────────────────────────────
  const [fbCampaigns, setFbCampaigns] = useState<FbCampaign[]>([]);
  const [fbLoading, setFbLoading] = useState(true);
  const [fbError, setFbError] = useState("");
  const [showFbModal, setShowFbModal] = useState(false);
  const [fbSaving, setFbSaving] = useState(false);
  const [fbForm, setFbForm] = useState<FbFormData>(emptyFbForm);
  const [fbIsEditing, setFbIsEditing] = useState(false);

  // Facebook sort & filter
  type FbSortField = "campaign" | "adGroup" | "status" | "utmCampaign" | "discountCode";
  type FbSortDirection = "asc" | "desc";
  const [fbSortField, setFbSortField] = useState<FbSortField>("campaign");
  const [fbSortDirection, setFbSortDirection] = useState<FbSortDirection>("asc");
  const [showFbSortModal, setShowFbSortModal] = useState(false);
  const fbSortModalRef = useRef<HTMLDivElement>(null);
  const [fbSearch, setFbSearch] = useState("");

  // Facebook multi-field filters (like Customers page)
  interface FbActiveFilter {
    key: keyof FbCampaign;
    label: string;
    values: Set<string>;
  }
  const fbFilterableFields: { key: keyof FbCampaign; label: string }[] = [
    { key: "campaign", label: "Campaign" },
    { key: "adGroup", label: "Ad Group" },
    { key: "productName", label: "Product" },
    { key: "discountCode", label: "Discount" },
    { key: "status", label: "Status" },
  ];
  const [fbFilters, setFbFilters] = useState<FbActiveFilter[]>([]);
  const [showFbFilterDropdown, setShowFbFilterDropdown] = useState(false);
  const fbFilterDropdownRef = useRef<HTMLDivElement>(null);
  const [fbEditingFilter, setFbEditingFilter] = useState<keyof FbCampaign | null>(null);
  const [fbFilterSearch, setFbFilterSearch] = useState("");
  const fbFilterModalRef = useRef<HTMLDivElement>(null);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Discount search
  const [discountSearch, setDiscountSearch] = useState("");
  const [discounts, setDiscounts] = useState<ShopifyDiscount[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [showDiscountDropdown, setShowDiscountDropdown] = useState(false);
  const [showCreateDiscount, setShowCreateDiscount] = useState(false);
  const [newDiscountCode, setNewDiscountCode] = useState("");
  const [newDiscountType, setNewDiscountType] = useState("percentage");
  const [newDiscountValue, setNewDiscountValue] = useState("");
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const discountDropdownRef = useRef<HTMLDivElement>(null);
  const discountSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Delete confirmation
  const [fbDeleteId, setFbDeleteId] = useState<number | null>(null);
  const [fbDeleting, setFbDeleting] = useState(false);

  // Column visibility
  const [showFbColumnPicker, setShowFbColumnPicker] = useState(false);
  const fbColumnPickerRef = useRef<HTMLDivElement>(null);
  const FB_COLUMN_STORAGE_KEY = "campaigns-fb-visible-columns";
  const allFbColumnKeys: (keyof FbCampaign)[] = [
    "campaign", "adGroup", "ad", "productName", "productUrl", "skuSuffix",
    "skus", "discountCode", "utmSource", "utmMedium", "utmCampaign",
    "utmTerm", "productTemplate", "status",
  ];
  const defaultFbVisibleColumns = new Set<string>([
    "campaign", "adGroup", "productName", "skus", "discountCode", "utmSource", "status",
  ]);
  const [fbVisibleColumns, setFbVisibleColumns] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return defaultFbVisibleColumns;
    const saved = localStorage.getItem(FB_COLUMN_STORAGE_KEY);
    if (saved) {
      try { return new Set(JSON.parse(saved)); } catch { /* use defaults */ }
    }
    return defaultFbVisibleColumns;
  });

  function toggleFbColumn(key: string) {
    const newSet = new Set(fbVisibleColumns);
    if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
    setFbVisibleColumns(newSet);
    localStorage.setItem(FB_COLUMN_STORAGE_KEY, JSON.stringify([...newSet]));
  }
  function showAllFbColumns() {
    const all = new Set(allFbColumnKeys as string[]);
    setFbVisibleColumns(all);
    localStorage.setItem(FB_COLUMN_STORAGE_KEY, JSON.stringify([...all]));
  }
  function resetFbColumns() {
    setFbVisibleColumns(defaultFbVisibleColumns);
    localStorage.setItem(FB_COLUMN_STORAGE_KEY, JSON.stringify([...defaultFbVisibleColumns]));
  }

  // ── WhatsApp Campaigns State ───────────────────────
  const [waCampaigns, setWaCampaigns] = useState<WaCampaign[]>([]);
  const [waLoading, setWaLoading] = useState(true);
  const [showWaModal, setShowWaModal] = useState(false);
  const [waForm, setWaForm] = useState<{ id?: number; name: string; templateName: string }>({ name: "", templateName: "" });
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState("");
  const [waIsEditing, setWaIsEditing] = useState(false);
  const [waDeleteId, setWaDeleteId] = useState<number | null>(null);
  const [waDeleting, setWaDeleting] = useState(false);

  // ── Customer Modal State ──────────────────────────
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalCampaignId, setCustomerModalCampaignId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string | number>>(new Set());
  const [addingCustomers, setAddingCustomers] = useState(false);
  const [isEditingCustomers, setIsEditingCustomers] = useState(false);
  // ── Send Modal State ─────────────────────────────
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalStep, setSendModalStep] = useState<"preview" | "confirm" | "sending">("preview");
  const [sendModalCampaign, setSendModalCampaign] = useState<CampaignWithCustomers | null>(null);
  const [sendModalTemplate, setSendModalTemplate] = useState<Template | null>(null);
  const [campaignSendResults, setCampaignSendResults] = useState<CampaignSendResult[]>([]);
  const [campaignSending, setCampaignSending] = useState(false);
  const campaignAbortRef = useRef(false);

  const [lifecycleSettings, setLifecycleSettings] = useState<LifecycleSettings>({
    newMaxDays: 30,
    reorderMaxDays: 60,
    lapsedMaxDays: 90,
  });

  // Customer modal filters
  const [customerDateRange, setCustomerDateRange] = useState<DateRange | undefined>(undefined);
  const [customerLapseFilter, setCustomerLapseFilter] = useState<LapseFilter>({ type: null });
  const [showCustomerLapseFilter, setShowCustomerLapseFilter] = useState(false);
  const [customLapseInput, setCustomLapseInput] = useState("");
  const customerLapseFilterRef = useRef<HTMLDivElement>(null);

  // Customer modal sort
  type SortField = "totalSpent" | "ordersCount" | "lastOrderAt" | "lapse" | "createdAt";
  type SortDirection = "asc" | "desc";
  const [customerSortField, setCustomerSortField] = useState<SortField>("lastOrderAt");
  const [customerSortDirection, setCustomerSortDirection] = useState<SortDirection>("desc");
  const [showCustomerSortModal, setShowCustomerSortModal] = useState(false);
  const customerSortModalRef = useRef<HTMLDivElement>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // Customer modal - tags filter
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [showTagsFilter, setShowTagsFilter] = useState(false);
  const [tagsFilterSearch, setTagsFilterSearch] = useState("");
  const tagsFilterRef = useRef<HTMLDivElement>(null);

  // Customer modal - orders filter
  const [ordersFilterMin, setOrdersFilterMin] = useState<string>("");
  const [ordersFilterMax, setOrdersFilterMax] = useState<string>("");
  const [showOrdersFilter, setShowOrdersFilter] = useState(false);
  const ordersFilterRef = useRef<HTMLDivElement>(null);

  // ── Manual Send State ──────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [results, setResults] = useState<SendResult[]>([]);
  const [sending, setSending] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  // ── Table Columns ──────────────────────────────────

  const fbColumns: Column<FbCampaign>[] = [
    { key: "campaign", label: "Campaign", sticky: true, primary: true },
    { key: "adGroup", label: "Ad Group" },
    { key: "ad", label: "Ad" },
    { key: "productName", label: "Product" },
    { key: "productUrl", label: "Product URL" },
    { key: "skuSuffix", label: "SKU Suffix" },
    { key: "skus", label: "SKUs", className: "font-mono" },
    { key: "discountCode", label: "Discount" },
    { key: "utmSource", label: "UTM Source" },
    { key: "utmMedium", label: "UTM Medium" },
    { key: "utmCampaign", label: "UTM Campaign" },
    { key: "utmTerm", label: "UTM Term" },
    { key: "productTemplate", label: "Template" },
    {
      key: "status",
      label: "Status",
      render: (value) => <StatusBadge status={value as string | null} type="fb" />,
    },
    {
      key: "actions",
      label: "",
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openFbModal(row);
            }}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFbDeleteId(row.id);
            }}
            className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  const waColumns: Column<WaCampaign>[] = [
    { key: "name", label: "Name", sticky: true, primary: true },
    { key: "templateName", label: "Template" },
    {
      key: "customerCount",
      label: "Customers",
      render: (value, row) => {
        const isDraft = row.status === "draft";
        return isDraft ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openCustomerModalWithExisting(row.id);
            }}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
          >
            {value as number}
          </button>
        ) : (
          <span>{value as number}</span>
        );
      },
    },
    {
      key: "successCount",
      label: "Sent",
      render: (value) => <span className="text-green-600">{value as number}</span>,
    },
    {
      key: "errorCount",
      label: "Failed",
      render: (value) => <span className="text-red-600">{value as number}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (value) => <StatusBadge status={value as string} type="wa" />,
    },
    {
      key: "createdAt",
      label: "Created",
      render: (value) => <span className="text-zinc-500">{formatDate(value as string)}</span>,
    },
    {
      key: "sentAt",
      label: "Sent At",
      render: (value) => <span className="text-zinc-500">{formatDate(value as string | null)}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (_, row) => {
        const isDraft = row.status === "draft";
        return (
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCustomerModalWithExisting(row.id);
              }}
              disabled={!isDraft}
              className={`px-2 py-1 text-xs font-medium border rounded ${
                isDraft
                  ? "border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
              }`}
            >
              Add customers
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openWaModal(row);
              }}
              disabled={!isDraft}
              className={`${
                isDraft
                  ? "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  : "text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
              }`}
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setWaDeleteId(row.id);
              }}
              disabled={!isDraft}
              className={`${
                isDraft
                  ? "text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                  : "text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
              }`}
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {isDraft && row.customerCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openSendModal(row.id);
                }}
                className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700"
              >
                Send
              </button>
            )}
          </div>
        );
      },
    },
  ];

  // ── Facebook Filter Helpers ────────────────────────
  function getFbDisplayValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "(empty)";
    return String(value);
  }

  function getFbUniqueValues(key: keyof FbCampaign): string[] {
    const values = new Set<string>();
    fbCampaigns.forEach((c) => values.add(getFbDisplayValue(c[key])));
    return Array.from(values).sort((a, b) => {
      if (a === "(empty)") return 1;
      if (b === "(empty)") return -1;
      return a.localeCompare(b);
    });
  }

  function getFbFilterValues(key: keyof FbCampaign): Set<string> {
    const filter = fbFilters.find((f) => f.key === key);
    return filter?.values || new Set();
  }

  function toggleFbFilterValue(key: keyof FbCampaign, value: string) {
    setFbFilters((prev) => {
      const existing = prev.find((f) => f.key === key);
      if (existing) {
        const newValues = new Set(existing.values);
        if (newValues.has(value)) newValues.delete(value);
        else newValues.add(value);
        if (newValues.size === 0) return prev.filter((f) => f.key !== key);
        return prev.map((f) => (f.key === key ? { ...f, values: newValues } : f));
      }
      const field = fbFilterableFields.find((f) => f.key === key);
      return [...prev, { key, label: field?.label || String(key), values: new Set([value]) }];
    });
  }

  function removeFbFilter(key: keyof FbCampaign) {
    setFbFilters((prev) => prev.filter((f) => f.key !== key));
  }

  const fbEditingFilterValues = useMemo(() => {
    if (!fbEditingFilter) return [];
    const values = getFbUniqueValues(fbEditingFilter);
    if (!fbFilterSearch) return values;
    return values.filter((v) => v.toLowerCase().includes(fbFilterSearch.toLowerCase()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbEditingFilter, fbCampaigns, fbFilterSearch]);

  // ── Facebook Filtered & Sorted Data ────────────────
  const filteredFbCampaigns = useMemo(() => {
    let result = [...fbCampaigns];

    // Multi-field filters
    if (fbFilters.length > 0) {
      result = result.filter((c) =>
        fbFilters.every((filter) => {
          const value = getFbDisplayValue(c[filter.key]);
          return filter.values.has(value);
        })
      );
    }

    // Search
    if (fbSearch.trim()) {
      const q = fbSearch.toLowerCase();
      result = result.filter(
        (c) =>
          c.campaign?.toLowerCase().includes(q) ||
          c.adGroup?.toLowerCase().includes(q) ||
          c.ad?.toLowerCase().includes(q) ||
          c.productName?.toLowerCase().includes(q) ||
          c.utmCampaign?.toLowerCase().includes(q) ||
          c.discountCode?.toLowerCase().includes(q) ||
          c.skus?.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      const aVal = (a[fbSortField] || "").toLowerCase();
      const bVal = (b[fbSortField] || "").toLowerCase();
      if (aVal < bVal) return fbSortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return fbSortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [fbCampaigns, fbFilters, fbSearch, fbSortField, fbSortDirection]);

  // ── Load Data ──────────────────────────────────────

  useEffect(() => {
    if (!currentOrg) return;
    loadFbCampaigns();
    loadWaCampaigns();
    loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
      if (discountDropdownRef.current && !discountDropdownRef.current.contains(event.target as Node)) {
        setShowDiscountDropdown(false);
        setShowCreateDiscount(false);
      }
      if (customerSortModalRef.current && !customerSortModalRef.current.contains(event.target as Node)) {
        setShowCustomerSortModal(false);
      }
      if (customerLapseFilterRef.current && !customerLapseFilterRef.current.contains(event.target as Node)) {
        setShowCustomerLapseFilter(false);
      }
      if (tagsFilterRef.current && !tagsFilterRef.current.contains(event.target as Node)) {
        setShowTagsFilter(false);
      }
      if (ordersFilterRef.current && !ordersFilterRef.current.contains(event.target as Node)) {
        setShowOrdersFilter(false);
      }
      if (fbSortModalRef.current && !fbSortModalRef.current.contains(event.target as Node)) {
        setShowFbSortModal(false);
      }
      if (fbFilterDropdownRef.current && !fbFilterDropdownRef.current.contains(event.target as Node)) {
        setShowFbFilterDropdown(false);
      }
      if (fbColumnPickerRef.current && !fbColumnPickerRef.current.contains(event.target as Node)) {
        setShowFbColumnPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced product search
  useEffect(() => {
    if (productSearchTimeoutRef.current) {
      clearTimeout(productSearchTimeoutRef.current);
    }

    if (productSearch.length >= 2) {
      productSearchTimeoutRef.current = setTimeout(() => {
        searchProducts(productSearch);
      }, 300);
    } else if (productSearch.length === 0 && showProductDropdown) {
      searchProducts("");
    }

    return () => {
      if (productSearchTimeoutRef.current) {
        clearTimeout(productSearchTimeoutRef.current);
      }
    };
  }, [productSearch, showProductDropdown]);

  // Debounced discount search
  useEffect(() => {
    if (discountSearchTimeoutRef.current) {
      clearTimeout(discountSearchTimeoutRef.current);
    }

    if (discountSearch.length >= 2) {
      discountSearchTimeoutRef.current = setTimeout(() => {
        searchDiscounts(discountSearch);
      }, 300);
    } else if (discountSearch.length === 0 && showDiscountDropdown) {
      searchDiscounts("");
    }

    return () => {
      if (discountSearchTimeoutRef.current) {
        clearTimeout(discountSearchTimeoutRef.current);
      }
    };
  }, [discountSearch, showDiscountDropdown]);

  async function loadFbCampaigns() {
    try {
      const res = await apiFetch("/api/campaigns");
      const data = await res.json();
      if (data.error) {
        setFbError(data.error);
      } else {
        setFbCampaigns(data.campaigns || []);
      }
    } catch {
      setFbError("Failed to load campaigns");
    } finally {
      setFbLoading(false);
    }
  }

  async function loadWaCampaigns() {
    try {
      const res = await apiFetch("/api/campaigns-wa");
      const data = await res.json();
      if (!data.error) {
        setWaCampaigns(data.campaigns || []);
      }
    } finally {
      setWaLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const res = await apiFetch("/api/whatsapp/templates");
      const data = await res.json();
      if (data.error) {
        setTemplatesError(data.error);
      } else {
        setTemplates(data.templates || []);
      }
    } catch {
      setTemplatesError("Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }

  // ── Facebook Campaign Functions ────────────────────

  async function searchProducts(query: string) {
    setLoadingProducts(true);
    setProductError("");
    try {
      const res = await apiFetch(`/api/shopify/products?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.error) {
        setProductError(data.error + (data.details ? `: ${data.details}` : ""));
        setProducts([]);
      } else if (data.products) {
        setProducts(data.products);
      }
    } catch (err) {
      setProductError("Failed to fetch products");
      console.error("Failed to search products", err);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function searchDiscounts(query: string) {
    setLoadingDiscounts(true);
    setDiscountError("");
    try {
      const res = await apiFetch(`/api/shopify/discounts?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.error) {
        setDiscountError(data.error + (data.details ? `: ${data.details}` : ""));
        setDiscounts([]);
      } else if (data.discounts) {
        setDiscounts(data.discounts);
      }
    } catch (err) {
      setDiscountError("Failed to fetch discounts");
      console.error("Failed to search discounts", err);
    } finally {
      setLoadingDiscounts(false);
    }
  }

  async function createDiscount() {
    if (!newDiscountCode || !newDiscountValue) return;

    setCreatingDiscount(true);
    try {
      const res = await apiFetch("/api/shopify/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newDiscountCode,
          title: newDiscountCode,
          discountType: newDiscountType,
          discountValue: newDiscountValue,
        }),
      });

      const data = await res.json();
      if (res.ok && data.code) {
        setFbForm({ ...fbForm, discountCode: data.code });
        setDiscountSearch(data.code);
        setShowCreateDiscount(false);
        setShowDiscountDropdown(false);
        setNewDiscountCode("");
        setNewDiscountValue("");
      } else {
        setDiscountError(data.error || "Failed to create discount");
      }
    } catch {
      setDiscountError("Failed to create discount");
    } finally {
      setCreatingDiscount(false);
    }
  }

  function selectProduct(product: ShopifyProduct) {
    const skus = product.variants
      .map((v) => v.sku)
      .filter((sku) => sku)
      .join(", ");

    setFbForm({
      ...fbForm,
      productName: product.title,
      productUrl: product.handle,
      skus: skus,
    });
    setProductSearch(product.title);
    setShowProductDropdown(false);
  }

  function selectDiscount(discount: ShopifyDiscount) {
    setFbForm({ ...fbForm, discountCode: discount.code });
    setDiscountSearch(discount.code);
    setShowDiscountDropdown(false);
  }

  async function handleFbSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFbSaving(true);

    try {
      const method = fbIsEditing ? "PUT" : "POST";
      const res = await apiFetch("/api/campaigns", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fbForm),
      });

      const data = await res.json();
      if (res.ok) {
        closeFbModal();
        loadFbCampaigns();
      } else {
        setFbError(data.error || "Failed to save campaign");
      }
    } catch {
      setFbError("Failed to save campaign");
    } finally {
      setFbSaving(false);
    }
  }

  async function handleFbDelete() {
    if (!fbDeleteId) return;

    setFbDeleting(true);
    try {
      const res = await apiFetch(`/api/campaigns?id=${fbDeleteId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFbDeleteId(null);
        loadFbCampaigns();
      } else {
        const data = await res.json();
        setFbError(data.error || "Failed to delete campaign");
      }
    } catch {
      setFbError("Failed to delete campaign");
    } finally {
      setFbDeleting(false);
    }
  }

  function updateFbForm(field: keyof FbFormData, value: string) {
    setFbForm({ ...fbForm, [field]: value });
  }

  function openFbModal(campaign?: FbCampaign) {
    if (campaign) {
      setFbIsEditing(true);
      setFbForm({
        id: campaign.id,
        campaign: campaign.campaign || "",
        adGroup: campaign.adGroup || "",
        ad: campaign.ad || "",
        productName: campaign.productName || "",
        productUrl: campaign.productUrl || "",
        skuSuffix: campaign.skuSuffix || "",
        skus: campaign.skus || "",
        discountCode: campaign.discountCode || "",
        utmSource: campaign.utmSource || "",
        utmMedium: campaign.utmMedium || "",
        utmCampaign: campaign.utmCampaign || "",
        utmTerm: campaign.utmTerm || "",
        productTemplate: campaign.productTemplate || "",
        status: campaign.status || "active",
      });
      setProductSearch(campaign.productName || "");
      setDiscountSearch(campaign.discountCode || "");
    } else {
      setFbIsEditing(false);
      setFbForm(emptyFbForm);
      setProductSearch("");
      setDiscountSearch("");
    }
    setProductError("");
    setDiscountError("");
    setProducts([]);
    setDiscounts([]);
    setShowCreateDiscount(false);
    setShowFbModal(true);
  }

  function closeFbModal() {
    setShowFbModal(false);
    setFbIsEditing(false);
    setFbForm(emptyFbForm);
    setProductSearch("");
    setDiscountSearch("");
    setShowCreateDiscount(false);
  }

  // ── WhatsApp Campaign Functions ────────────────────

  function openWaModal(campaign?: WaCampaign) {
    if (campaign) {
      setWaIsEditing(true);
      setWaForm({
        id: campaign.id,
        name: campaign.name,
        templateName: campaign.templateName,
      });
    } else {
      setWaIsEditing(false);
      setWaForm({ name: "", templateName: "" });
    }
    setWaError("");
    setShowWaModal(true);
  }

  function closeWaModal() {
    setShowWaModal(false);
    setWaIsEditing(false);
    setWaForm({ name: "", templateName: "" });
    setWaError("");
  }

  async function handleWaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!waForm.name || !waForm.templateName) {
      setWaError("Please fill in all fields");
      return;
    }

    setWaSaving(true);
    setWaError("");

    try {
      const method = waIsEditing ? "PUT" : "POST";
      const res = await apiFetch("/api/campaigns-wa", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: waForm.id,
          name: waForm.name,
          templateName: waForm.templateName,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        closeWaModal();
        loadWaCampaigns();
      } else {
        setWaError(data.error || `Failed to ${waIsEditing ? "update" : "create"} campaign`);
      }
    } catch {
      setWaError(`Failed to ${waIsEditing ? "update" : "create"} campaign`);
    } finally {
      setWaSaving(false);
    }
  }

  async function handleWaDelete() {
    if (!waDeleteId) return;

    setWaDeleting(true);
    try {
      const res = await apiFetch(`/api/campaigns-wa?id=${waDeleteId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setWaDeleteId(null);
        loadWaCampaigns();
      } else {
        const data = await res.json();
        setWaError(data.error || "Failed to delete campaign");
      }
    } catch {
      setWaError("Failed to delete campaign");
    } finally {
      setWaDeleting(false);
    }
  }

  // ── Customer Modal Functions ──────────────────────

  async function loadCustomers() {
    setCustomersLoading(true);
    try {
      const [customersRes, lifecycleRes] = await Promise.all([
        apiFetch("/api/customers?limit=1000"),
        apiFetch("/api/settings/lifecycle"),
      ]);
      const customersData = await customersRes.json();
      const lifecycleData = await lifecycleRes.json();

      if (!customersData.error) {
        setCustomers(customersData.customers || []);
        setCustomersTotal(customersData.total || 0);
      }
      if (lifecycleData && !lifecycleData.error) {
        setLifecycleSettings(lifecycleData);
      }
    } catch (err) {
      console.error("Failed to load customers:", err);
    } finally {
      setCustomersLoading(false);
    }
  }

  function openCustomerModal(campaignId: number) {
    setCustomerModalCampaignId(campaignId);
    setSelectedCustomers(new Set());
    setCustomerDateRange(undefined);
    setCustomerLapseFilter({ type: null });
    setCustomLapseInput("");
    setCustomerSearch("");
    setIsEditingCustomers(false);
    setShowSelectedOnly(false);
    setSelectedTags(new Set(uniqueTags));
    setTagsFilterSearch("");
    setOrdersFilterMin("");
    setOrdersFilterMax("");
    setShowCustomerModal(true);
    if (customers.length === 0) {
      loadCustomers();
    }
  }

  async function openCustomerModalWithExisting(campaignId: number) {
    setCustomerModalCampaignId(campaignId);
    setCustomerDateRange(undefined);
    setCustomerLapseFilter({ type: null });
    setCustomLapseInput("");
    setCustomerSearch("");
    setIsEditingCustomers(true);
    setShowSelectedOnly(true);
    setSelectedTags(new Set(uniqueTags));
    setTagsFilterSearch("");
    setOrdersFilterMin("");
    setOrdersFilterMax("");
    setShowCustomerModal(true);

    // Load customers if not already loaded
    if (customers.length === 0) {
      await loadCustomers();
    }

    // Fetch existing campaign customers
    try {
      const res = await fetch(`/api/campaigns-wa/${campaignId}`);
      const data = await res.json();
      if (data.campaign?.campaignsWaCustomers) {
        const existingIds = new Set<string | number>(
          data.campaign.campaignsWaCustomers.map((c: { customerId: number }) => c.customerId)
        );
        setSelectedCustomers(existingIds);
      } else {
        setSelectedCustomers(new Set());
      }
    } catch (err) {
      console.error("Failed to fetch campaign customers:", err);
      setSelectedCustomers(new Set());
    }
  }

  function closeCustomerModal() {
    setShowCustomerModal(false);
    setCustomerModalCampaignId(null);
    setSelectedCustomers(new Set());
  }

  async function addCustomersToCampaign() {
    if (!customerModalCampaignId) return;

    // When editing, allow saving even with 0 customers (to clear the list)
    if (!isEditingCustomers && selectedCustomers.size === 0) return;

    setAddingCustomers(true);
    try {
      const customerIds = Array.from(selectedCustomers);
      const customersToSave = customers
        .filter((c) => customerIds.includes(c.id))
        .map((c) => ({
          id: c.id,
          phone: c.phone || "",
          firstName: c.firstName || "",
        }));

      const res = await fetch(`/api/campaigns-wa/${customerModalCampaignId}/customers`, {
        method: isEditingCustomers ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customers: customersToSave }),
      });

      if (res.ok) {
        closeCustomerModal();
        loadWaCampaigns();
      } else {
        const data = await res.json();
        console.error("Failed to save customers:", data.error);
      }
    } catch (err) {
      console.error("Failed to save customers:", err);
    } finally {
      setAddingCustomers(false);
    }
  }

  // Get unique tags from all customers
  const uniqueTags = useMemo(() => {
    const tagsSet = new Set<string>();
    customers.forEach((c) => {
      if (c.tags) {
        c.tags.split(",").forEach((tag) => {
          const trimmed = tag.trim();
          if (trimmed) tagsSet.add(trimmed);
        });
      }
    });
    return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  // Update selectedTags when customers load and modal is open (to select all by default)
  useEffect(() => {
    if (showCustomerModal && uniqueTags.length > 0 && selectedTags.size === 0) {
      setSelectedTags(new Set(uniqueTags));
    }
  }, [showCustomerModal, uniqueTags]);

  // Filtered tags for search
  const filteredTags = useMemo(() => {
    if (!tagsFilterSearch.trim()) return uniqueTags;
    const search = tagsFilterSearch.toLowerCase().trim();
    return uniqueTags.filter((tag) => tag.toLowerCase().includes(search));
  }, [uniqueTags, tagsFilterSearch]);

  // Filtered customers for modal
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Apply date range filter (on createdAt)
    if (customerDateRange?.from || customerDateRange?.to) {
      result = result.filter((customer) => {
        if (!customer.createdAt) return false;
        const customerDate = new Date(customer.createdAt);
        if (customerDateRange.from) {
          const start = new Date(customerDateRange.from);
          start.setHours(0, 0, 0, 0);
          if (customerDate < start) return false;
        }
        if (customerDateRange.to) {
          const end = new Date(customerDateRange.to);
          end.setHours(23, 59, 59, 999);
          if (customerDate > end) return false;
        }
        return true;
      });
    }

    // Apply lapse filter (days since last order)
    if (customerLapseFilter.type) {
      const { newMaxDays, reorderMaxDays, lapsedMaxDays } = lifecycleSettings;
      result = result.filter((customer) => {
        if (customer.lapse === null || (customer.ordersCount || 0) === 0) return false;
        const lapse = customer.lapse;
        switch (customerLapseFilter.type) {
          case "new":
            return lapse <= newMaxDays;
          case "due_reorder":
            return lapse > newMaxDays && lapse <= reorderMaxDays;
          case "lapsed":
            return lapse > reorderMaxDays && lapse <= lapsedMaxDays;
          case "lost":
            return lapse > lapsedMaxDays;
          case "custom":
            return customerLapseFilter.customMax !== undefined && lapse <= customerLapseFilter.customMax;
          default:
            return true;
        }
      });
    }

    // Apply tags filter (only if some tags are deselected)
    if (selectedTags.size > 0 && selectedTags.size < uniqueTags.length) {
      result = result.filter((customer) => {
        if (!customer.tags) return false;
        const customerTags = customer.tags.split(",").map((t) => t.trim());
        return Array.from(selectedTags).some((tag) => customerTags.includes(tag));
      });
    }

    // Apply orders filter
    const minOrders = ordersFilterMin ? parseInt(ordersFilterMin) : null;
    const maxOrders = ordersFilterMax ? parseInt(ordersFilterMax) : null;
    if (minOrders !== null || maxOrders !== null) {
      result = result.filter((customer) => {
        const orders = customer.ordersCount || 0;
        if (minOrders !== null && orders < minOrders) return false;
        if (maxOrders !== null && orders > maxOrders) return false;
        return true;
      });
    }

    // Only include customers with phone numbers
    result = result.filter((c) => c.phone);

    // Apply search filter
    if (customerSearch.trim()) {
      const search = customerSearch.toLowerCase().trim();
      result = result.filter((c) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
        return (
          name.includes(search) ||
          c.email?.toLowerCase().includes(search) ||
          c.phone?.includes(search) ||
          c.tags?.toLowerCase().includes(search)
        );
      });
    }

    // Filter to show only selected customers
    if (showSelectedOnly) {
      result = result.filter((c) => selectedCustomers.has(c.id));
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      switch (customerSortField) {
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

      if (aVal < bVal) return customerSortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return customerSortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [customers, customerDateRange, customerLapseFilter, lifecycleSettings, customerSortField, customerSortDirection, customerSearch, showSelectedOnly, selectedCustomers, selectedTags, ordersFilterMin, ordersFilterMax, uniqueTags]);

  // ── Send Campaign Modal Functions ─────────────────

  async function openSendModal(campaignId: number) {
    try {
      // Fetch campaign with customers
      const res = await fetch(`/api/campaigns-wa/${campaignId}`);
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load campaign");
        return;
      }

      const campaign = data.campaign as CampaignWithCustomers;

      // Find template details
      const template = templates.find((t) => t.name === campaign.templateName);

      setSendModalCampaign(campaign);
      setSendModalTemplate(template || null);
      setSendModalStep("preview");
      setCampaignSendResults([]);
      campaignAbortRef.current = false;
      setShowSendModal(true);
    } catch (err) {
      console.error("Error opening send modal:", err);
      alert("Failed to load campaign");
    }
  }

  function closeSendModal() {
    // Allow closing even during send (runs in background)
    setShowSendModal(false);
    // Don't reset state if still sending - let it continue in background
    if (!campaignSending) {
      setSendModalCampaign(null);
      setSendModalTemplate(null);
      setSendModalStep("preview");
      setCampaignSendResults([]);
    }
  }

  function cancelCampaignSend() {
    campaignAbortRef.current = true;
  }

  async function executeCampaignSend() {
    if (!sendModalCampaign) return;

    setSendModalStep("sending");
    setCampaignSending(true);
    campaignAbortRef.current = false;

    const customers = sendModalCampaign.campaignsWaCustomers;

    // Initialize results
    const initialResults: CampaignSendResult[] = customers.map((c) => ({
      id: c.id,
      phone: c.phone || "",
      firstName: c.firstName || "",
      status: "pending",
    }));
    setCampaignSendResults(initialResults);

    // Update campaign status to sending
    try {
      await fetch(`/api/campaigns-wa/${sendModalCampaign.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sending" }),
      });
    } catch (err) {
      console.error("Failed to update campaign status:", err);
    }

    // Send to each customer
    for (let i = 0; i < customers.length; i++) {
      if (campaignAbortRef.current) break;

      const customer = customers[i];

      // Mark as sending
      setCampaignSendResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "sending" } : r))
      );

      try {
        const res = await fetch(`/api/campaigns-wa/${sendModalCampaign.id}/send-one`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignCustomerId: customer.id }),
        });

        const data = await res.json();

        setCampaignSendResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: data.success ? "success" : "error",
                  error: data.error,
                }
              : r
          )
        );
      } catch (err) {
        setCampaignSendResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error",
                  error: err instanceof Error ? err.message : "Network error",
                }
              : r
          )
        );
      }
    }

    // Update campaign status to completed
    try {
      await fetch(`/api/campaigns-wa/${sendModalCampaign.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
    } catch (err) {
      console.error("Failed to update campaign status:", err);
    }

    setCampaignSending(false);
    loadWaCampaigns();
  }

  const campaignSuccessCount = campaignSendResults.filter((r) => r.status === "success").length;
  const campaignErrorCount = campaignSendResults.filter((r) => r.status === "error").length;

  // Customer table columns for modal
  const customerColumns: Column<Customer>[] = [
    {
      key: "name",
      label: "Customer",
      sticky: true,
      primary: true,
      render: (_, customer) => {
        const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
        return name || "-";
      },
    },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "ordersCount", label: "Orders" },
    {
      key: "totalSpent",
      label: "Total Spent",
      render: (v) => (v ? `£${parseFloat(v as string).toFixed(2)}` : "-"),
    },
    {
      key: "lastOrderAt",
      label: "Last Order",
      render: (v) => formatDate(v as string | null),
    },
    {
      key: "lapse",
      label: "Days Since",
      render: (v) => (v !== null ? `${v} days` : "-"),
    },
    {
      key: "lastWhatsappAt",
      label: "Last WhatsApp",
      render: (v) => formatDate(v as string | null),
    },
  ];

  // ── Manual Send Functions ──────────────────────────

  const template = templates.find((t) => t.name === selectedTemplate);

  const missingColumns = template
    ? template.params.filter(
        (p) => csvData.length > 0 && !(p.name in csvData[0])
      )
    : [];

  const canSend =
    csvData.length > 0 &&
    selectedTemplate &&
    missingColumns.length === 0 &&
    !sending;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResults([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCsv(text);
      setCsvData(rows);
    };
    reader.readAsText(file);
  }

  async function handleSend() {
    if (!template) return;

    setSending(true);
    abortRef.current = false;

    const initialResults: SendResult[] = csvData.map((row) => ({
      phone: row.phone,
      first_name: row.first_name,
      status: "pending",
    }));
    setResults(initialResults);

    for (let i = 0; i < csvData.length; i++) {
      if (abortRef.current) break;

      const row = csvData[i];
      const params = template.params.map((p) => ({ name: p.name, value: row[p.name] || "" }));

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "sending" } : r))
      );

      try {
        const res = await apiFetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: row.phone,
            template_name: template.name,
            params,
          }),
        });

        const data = await res.json();

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: res.ok ? "success" : "error",
                  message: res.ok ? "Sent" : data.details || data.error,
                }
              : r
          )
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error",
                  message:
                    err instanceof Error ? err.message : "Network error",
                }
              : r
          )
        );
      }
    }

    setSending(false);
  }

  function handleStop() {
    abortRef.current = true;
  }

  function handleReset() {
    setCsvData([]);
    setResults([]);
    setFileName("");
    setSelectedTemplate("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  // ── Render ─────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Campaigns</h1>
          {activeTab === "facebook" && (
            <button
              onClick={() => openFbModal()}
              className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80"
            >
              Add Campaign
            </button>
          )}
          {activeTab === "whatsapp" && (
            <button
              onClick={() => openWaModal()}
              className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80"
            >
              Create Campaign
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setActiveTab("facebook")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "facebook"
                ? "border-zinc-900 dark:border-white text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Facebook
          </button>
          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "whatsapp"
                ? "border-zinc-900 dark:border-white text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            WhatsApp
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === "manual"
                ? "border-zinc-900 dark:border-white text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Manual WhatsApp
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* ── Facebook Tab ────────────────────────────── */}
        {activeTab === "facebook" && (
          <div className="pt-4 flex flex-col flex-1 overflow-hidden">
            {fbError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                {fbError}
                <button onClick={() => setFbError("")} className="ml-2 underline">Dismiss</button>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-muted">
                {filteredFbCampaigns.length === fbCampaigns.length
                  ? fbCampaigns.length
                  : `${filteredFbCampaigns.length} of ${fbCampaigns.length}`} campaigns
              </span>

              {/* Search */}
              <input
                type="text"
                placeholder="Search..."
                value={fbSearch}
                onChange={(e) => setFbSearch(e.target.value)}
                className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 w-48"
              />

              {/* Sort */}
              <div className="relative" ref={fbSortModalRef}>
                <button
                  onClick={() => setShowFbSortModal(!showFbSortModal)}
                  className="btn btn-secondary btn-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  Sort
                </button>
                {showFbSortModal && (
                  <div className="dropdown right-0 mt-2 w-56" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3 border-b border-zinc-200 dark:border-zinc-700">
                      <div className="text-sm font-medium mb-2">Sort by</div>
                      <div className="flex flex-col gap-1">
                        {([
                          { value: "campaign", label: "Campaign" },
                          { value: "adGroup", label: "Ad Group" },
                          { value: "utmCampaign", label: "UTM Campaign" },
                          { value: "discountCode", label: "Discount Code" },
                          { value: "status", label: "Status" },
                        ] as const).map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                            <input
                              type="radio"
                              name="fbSortField"
                              checked={fbSortField === opt.value}
                              onChange={() => setFbSortField(opt.value)}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="p-2">
                      <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${fbSortDirection === "asc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        <input type="radio" name="fbSortDir" checked={fbSortDirection === "asc"} onChange={() => setFbSortDirection("asc")} className="sr-only" />
                        <span className="text-sm">Ascending</span>
                      </label>
                      <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${fbSortDirection === "desc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <input type="radio" name="fbSortDir" checked={fbSortDirection === "desc"} onChange={() => setFbSortDirection("desc")} className="sr-only" />
                        <span className="text-sm">Descending</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Filter */}
              <div className="relative" ref={fbFilterDropdownRef}>
                <button
                  onClick={() => setShowFbFilterDropdown(!showFbFilterDropdown)}
                  className="btn btn-secondary btn-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Add filter
                </button>
                {showFbFilterDropdown && (
                  <div className="dropdown right-0 mt-2 w-48 max-h-64 overflow-y-auto">
                    {fbFilterableFields.map((field) => (
                      <button
                        key={String(field.key)}
                        className="dropdown-item"
                        onClick={() => {
                          setFbEditingFilter(field.key);
                          setShowFbFilterDropdown(false);
                          setFbFilterSearch("");
                        }}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Columns */}
              <div className="relative" ref={fbColumnPickerRef}>
                <button
                  onClick={() => setShowFbColumnPicker(!showFbColumnPicker)}
                  className="btn btn-secondary btn-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Columns ({fbVisibleColumns.size})
                </button>
                {showFbColumnPicker && (
                  <div className="dropdown right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto">
                    <div className="p-2 border-b border-zinc-200 dark:border-zinc-700 flex gap-2">
                      <button onClick={showAllFbColumns} className="btn btn-secondary btn-sm flex-1">
                        Show All
                      </button>
                      <button onClick={resetFbColumns} className="btn btn-secondary btn-sm flex-1">
                        Reset
                      </button>
                    </div>
                    <div className="p-2">
                      {fbColumns.filter((c) => c.key !== "actions").map((col) => (
                        <label
                          key={String(col.key)}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={fbVisibleColumns.has(String(col.key))}
                            onChange={() => toggleFbColumn(String(col.key))}
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

            {/* Filter Pills */}
            {fbFilters.length > 0 && (
              <div className="filter-pills-container">
                {fbFilters.map((filter) => (
                  <div key={String(filter.key)} className="filter-pill">
                    <button
                      className="filter-pill-label"
                      onClick={() => { setFbEditingFilter(filter.key); setFbFilterSearch(""); }}
                    >
                      <span className="filter-pill-key">{filter.label}:</span>
                      <span className="filter-pill-values">
                        {filter.values.size <= 2
                          ? Array.from(filter.values).join(", ")
                          : `${filter.values.size} selected`}
                      </span>
                    </button>
                    <button className="filter-pill-remove" onClick={() => removeFbFilter(filter.key)}>×</button>
                  </div>
                ))}
                <button className="filter-clear-all" onClick={() => setFbFilters([])}>Clear all</button>
              </div>
            )}

            {/* Filter Value Modal */}
            {fbEditingFilter && (
              <div className="modal-overlay" onClick={() => { setFbEditingFilter(null); setFbFilterSearch(""); }}>
                <div className="filter-modal" ref={fbFilterModalRef} onClick={(e) => e.stopPropagation()}>
                  <div className="filter-modal-header">
                    <h3 className="filter-modal-title">
                      Filter by {fbFilterableFields.find((f) => f.key === fbEditingFilter)?.label}
                    </h3>
                    <button className="modal-close" onClick={() => { setFbEditingFilter(null); setFbFilterSearch(""); }}>×</button>
                  </div>
                  <div className="filter-modal-search">
                    <input
                      type="text"
                      className="input"
                      placeholder="Search values..."
                      value={fbFilterSearch}
                      onChange={(e) => setFbFilterSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="filter-modal-options">
                    {fbEditingFilterValues.length === 0 ? (
                      <div className="filter-modal-empty">No matching values</div>
                    ) : (
                      fbEditingFilterValues.map((value) => (
                        <label key={value} className="filter-modal-option">
                          <input
                            type="checkbox"
                            checked={getFbFilterValues(fbEditingFilter).has(value)}
                            onChange={() => toggleFbFilterValue(fbEditingFilter, value)}
                          />
                          <span>{value}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="filter-modal-footer">
                    <button className="btn btn-secondary" onClick={() => { setFbEditingFilter(null); setFbFilterSearch(""); }}>Done</button>
                  </div>
                </div>
              </div>
            )}

            {fbLoading ? (
              <p className="text-zinc-500 p-4">Loading...</p>
            ) : (
              <Table
                columns={fbColumns.filter((c) => fbVisibleColumns.has(String(c.key)) || c.key === "actions")}
                data={filteredFbCampaigns}
                rowKey="id"
                emptyMessage="No campaigns yet. Add your first campaign to enable order attribution."
              />
            )}
          </div>
        )}

        {/* ── WhatsApp Tab ────────────────────────────── */}
        {activeTab === "whatsapp" && (
          <div className="pt-4">
            {waLoading ? (
              <p className="text-sm text-zinc-500 p-4">Loading campaigns...</p>
            ) : waCampaigns.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg m-4">
                <p className="text-zinc-500 mb-4">No campaigns yet</p>
                <button
                  onClick={() => openWaModal()}
                  className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80"
                >
                  Create your first campaign
                </button>
              </div>
            ) : (
              <Table
                columns={waColumns}
                data={waCampaigns}
                rowKey="id"
                emptyMessage="No campaigns yet"
              />
            )}
          </div>
        )}

        {/* ── Manual WhatsApp Tab ─────────────────────── */}
        {activeTab === "manual" && (
          <div className="max-w-4xl p-4 h-full overflow-y-auto">
            {/* Template Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Template</label>
              {templatesLoading ? (
                <p className="text-sm text-zinc-500">Loading templates...</p>
              ) : templatesError ? (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                  {templatesError}
                </div>
              ) : (
                <>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    disabled={sending}
                  >
                    <option value="">Select a template...</option>
                    {templates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {template && (
                    <div className="mt-3">
                      <p className="text-sm text-zinc-500 mb-2">
                        Required CSV columns: phone,{" "}
                        {template.params.map((p) => p.name).join(", ")}
                      </p>
                      {template.body && (
                        <div
                          className="max-w-sm rounded-lg p-4"
                          style={{
                            backgroundImage: "url(/whatsapp-bg.png)",
                            backgroundSize: "300px",
                            backgroundRepeat: "repeat",
                          }}
                        >
                          <div className="bg-white rounded-lg p-3 shadow-md relative">
                            {template.header && (
                              <p className="font-bold text-sm text-zinc-900 mb-1">
                                {template.header}
                              </p>
                            )}
                            <p className="text-sm text-zinc-800 whitespace-pre-line">
                              {template.body}
                            </p>
                            <span className="block text-right text-[11px] text-zinc-400 mt-1">
                              {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* CSV Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={sending}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900 hover:file:opacity-80 cursor-pointer"
              />
              {fileName && (
                <p className="text-sm text-zinc-500 mt-1">
                  {fileName} - {csvData.length} rows loaded
                </p>
              )}
            </div>

            {/* Missing columns warning */}
            {missingColumns.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
                CSV is missing required columns:{" "}
                {missingColumns.map((p) => p.name).join(", ")}
              </div>
            )}

            {/* Preview Table */}
            {csvData.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <h2 className="text-sm font-medium mb-2">
                  Preview ({csvData.length} contacts)
                </h2>
                <table className="w-full text-sm border border-zinc-200 dark:border-zinc-700">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800">
                      {Object.keys(csvData[0]).map((header) => (
                        <th
                          key={header}
                          className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-2">
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {csvData.length > 10 && (
                      <tr>
                        <td
                          colSpan={Object.keys(csvData[0]).length}
                          className="px-3 py-2 text-zinc-500 text-center"
                        >
                          ... and {csvData.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Send / Stop / Reset buttons */}
            <div className="flex gap-3 mb-6">
              {!sending ? (
                <>
                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send Campaign ({csvData.length} messages)
                  </button>
                  {results.length > 0 && (
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Reset
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700"
                >
                  Stop Sending
                </button>
              )}
            </div>

            {/* Results Log */}
            {results.length > 0 && (
              <div>
                <h2 className="text-sm font-medium mb-2">
                  Results
                  {(successCount > 0 || errorCount > 0) && (
                    <span className="font-normal text-zinc-500 ml-2">
                      {successCount} sent, {errorCount} failed,{" "}
                      {results.length - successCount - errorCount} remaining
                    </span>
                  )}
                </h2>
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-md max-h-80 overflow-y-auto">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 text-sm border-b last:border-b-0 border-zinc-100 dark:border-zinc-800 ${
                        r.status === "success"
                          ? "bg-green-50 dark:bg-green-950"
                          : r.status === "error"
                            ? "bg-red-50 dark:bg-red-950"
                            : r.status === "sending"
                              ? "bg-blue-50 dark:bg-blue-950"
                              : ""
                      }`}
                    >
                      <span>
                        {r.first_name} ({r.phone})
                      </span>
                      <span
                        className={
                          r.status === "success"
                            ? "text-green-600"
                            : r.status === "error"
                              ? "text-red-600"
                              : r.status === "sending"
                                ? "text-blue-600"
                                : "text-zinc-400"
                        }
                      >
                        {r.status === "pending" && "Pending"}
                        {r.status === "sending" && "Sending..."}
                        {r.status === "success" && "Sent"}
                        {r.status === "error" && (r.message || "Failed")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Facebook Delete Modal ───────────────────── */}
      {fbDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setFbDeleteId(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Delete Campaign?</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setFbDeleteId(null)}
                className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleFbDelete}
                disabled={fbDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {fbDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Facebook Add/Edit Modal ─────────────────── */}
      {showFbModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeFbModal}>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-semibold">{fbIsEditing ? "Edit Campaign" : "Add Campaign"}</h2>
              <button
                onClick={closeFbModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFbSubmit} className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Campaign</label>
                  <input
                    type="text"
                    value={fbForm.campaign}
                    onChange={(e) => updateFbForm("campaign", e.target.value)}
                    placeholder="e.g. Prospecting, CBO"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ad Group</label>
                  <input
                    type="text"
                    value={fbForm.adGroup}
                    onChange={(e) => updateFbForm("adGroup", e.target.value)}
                    placeholder="e.g. Original 50% Off, Broad"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Ad</label>
                  <input
                    type="text"
                    value={fbForm.ad}
                    onChange={(e) => updateFbForm("ad", e.target.value)}
                    placeholder="e.g. Basic Ad, 24 roll, Static image, Orange LP"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>

                {/* Product Search Dropdown */}
                <div className="col-span-2 relative" ref={productDropdownRef}>
                  <label className="block text-sm font-medium mb-1">Product</label>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => {
                      setShowProductDropdown(true);
                      if (products.length === 0) {
                        searchProducts("");
                      }
                    }}
                    placeholder="Search Shopify products..."
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  {showProductDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {loadingProducts ? (
                        <div className="px-3 py-2 text-sm text-zinc-500">Loading...</div>
                      ) : productError ? (
                        <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{productError}</div>
                      ) : products.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-500">No products found</div>
                      ) : (
                        products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => selectProduct(product)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-700 last:border-b-0"
                          >
                            <div className="font-medium">{product.title}</div>
                            <div className="text-xs text-zinc-500">
                              {product.variants.length} variant{product.variants.length !== 1 ? "s" : ""}
                              {product.variants[0]?.sku && ` · ${product.variants[0].sku}`}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Product URL (handle)</label>
                  <input
                    type="text"
                    value={fbForm.productUrl}
                    onChange={(e) => updateFbForm("productUrl", e.target.value)}
                    placeholder="Auto-filled from product selection"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-sm"
                    readOnly
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SKU Suffix</label>
                  <input
                    type="text"
                    value={fbForm.skuSuffix}
                    onChange={(e) => updateFbForm("skuSuffix", e.target.value)}
                    placeholder="e.g. A"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SKUs</label>
                  <input
                    type="text"
                    value={fbForm.skus}
                    onChange={(e) => updateFbForm("skus", e.target.value)}
                    placeholder="Auto-filled from product"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>

                {/* Discount Code Dropdown */}
                <div className="col-span-2 relative" ref={discountDropdownRef}>
                  <label className="block text-sm font-medium mb-1">Discount Code</label>
                  <input
                    type="text"
                    value={discountSearch}
                    onChange={(e) => {
                      setDiscountSearch(e.target.value);
                      setFbForm({ ...fbForm, discountCode: e.target.value });
                      setShowDiscountDropdown(true);
                      setShowCreateDiscount(false);
                    }}
                    onFocus={() => {
                      setShowDiscountDropdown(true);
                      if (discounts.length === 0) {
                        searchDiscounts("");
                      }
                    }}
                    placeholder="Search or create discount code..."
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  {showDiscountDropdown && !showCreateDiscount && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateDiscount(true);
                          setNewDiscountCode(discountSearch);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-b border-zinc-200 dark:border-zinc-600 font-medium"
                      >
                        + Create new discount code
                      </button>
                      {loadingDiscounts ? (
                        <div className="px-3 py-2 text-sm text-zinc-500">Loading...</div>
                      ) : discountError ? (
                        <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{discountError}</div>
                      ) : discounts.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-zinc-500">No existing discounts found</div>
                      ) : (
                        discounts.map((discount) => (
                          <button
                            key={discount.id}
                            type="button"
                            onClick={() => selectDiscount(discount)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-700 last:border-b-0"
                          >
                            <div className="font-medium">{discount.code}</div>
                            <div className="text-xs text-zinc-500">{discount.value}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {showCreateDiscount && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-lg p-4">
                      <h4 className="font-medium text-sm mb-3">Create New Discount</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">Code</label>
                          <input
                            type="text"
                            value={newDiscountCode}
                            onChange={(e) => setNewDiscountCode(e.target.value.toUpperCase())}
                            placeholder="e.g. SAVE50"
                            className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-xs text-zinc-500 mb-1">Type</label>
                            <select
                              value={newDiscountType}
                              onChange={(e) => setNewDiscountType(e.target.value)}
                              className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                            >
                              <option value="percentage">Percentage</option>
                              <option value="fixed">Fixed Amount</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-zinc-500 mb-1">
                              {newDiscountType === "percentage" ? "Percentage" : "Amount (£)"}
                            </label>
                            <input
                              type="number"
                              value={newDiscountValue}
                              onChange={(e) => setNewDiscountValue(e.target.value)}
                              placeholder={newDiscountType === "percentage" ? "e.g. 50" : "e.g. 10.00"}
                              className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                            />
                          </div>
                        </div>
                        {discountError && (
                          <div className="text-xs text-red-600 dark:text-red-400">{discountError}</div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreateDiscount(false);
                              setDiscountError("");
                            }}
                            className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={createDiscount}
                            disabled={creatingDiscount || !newDiscountCode || !newDiscountValue}
                            className="flex-1 px-3 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                          >
                            {creatingDiscount ? "Creating..." : "Create"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">UTM Source</label>
                  <input
                    type="text"
                    value={fbForm.utmSource}
                    onChange={(e) => updateFbForm("utmSource", e.target.value)}
                    placeholder="e.g. facebook"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UTM Medium</label>
                  <input
                    type="text"
                    value={fbForm.utmMedium}
                    onChange={(e) => updateFbForm("utmMedium", e.target.value)}
                    placeholder="e.g. cpc"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UTM Campaign</label>
                  <input
                    type="text"
                    value={fbForm.utmCampaign}
                    onChange={(e) => updateFbForm("utmCampaign", e.target.value)}
                    placeholder="e.g. 50% Original"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UTM Term</label>
                  <input
                    type="text"
                    value={fbForm.utmTerm}
                    onChange={(e) => updateFbForm("utmTerm", e.target.value)}
                    placeholder="e.g. Beige Hero"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Product Template</label>
                  <input
                    type="text"
                    value={fbForm.productTemplate}
                    onChange={(e) => updateFbForm("productTemplate", e.target.value)}
                    placeholder=""
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={fbForm.status}
                    onChange={(e) => updateFbForm("status", e.target.value)}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={closeFbModal}
                  className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fbSaving}
                  className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                >
                  {fbSaving ? "Saving..." : fbIsEditing ? "Update Campaign" : "Save Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── WhatsApp Delete Confirmation Modal ─────────── */}
      {waDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Campaign?</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              This will permanently delete the campaign and all associated customer data. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setWaDeleteId(null)}
                className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleWaDelete}
                disabled={waDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {waDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Create/Edit Campaign Modal ──────────── */}
      {showWaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-semibold">{waIsEditing ? "Edit" : "Create"} WhatsApp Campaign</h2>
              <button
                onClick={closeWaModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleWaSubmit} className="p-6">
              {waError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                  {waError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Campaign Name</label>
                  <input
                    type="text"
                    value={waForm.name}
                    onChange={(e) => setWaForm({ ...waForm, name: e.target.value })}
                    placeholder="e.g. January Sale, Re-engagement"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Template</label>
                  {templatesLoading ? (
                    <p className="text-sm text-zinc-500">Loading templates...</p>
                  ) : templatesError ? (
                    <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                      {templatesError}
                    </div>
                  ) : (
                    <select
                      value={waForm.templateName}
                      onChange={(e) => setWaForm({ ...waForm, templateName: e.target.value })}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                    >
                      <option value="">Select a template...</option>
                      {templates.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={closeWaModal}
                  className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={waSaving || !waForm.name || !waForm.templateName}
                  className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                >
                  {waSaving ? "Saving..." : waIsEditing ? "Update Campaign" : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Customer Selection Modal ─────────────────────── */}
      {showCustomerModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeCustomerModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[90vw] max-w-6xl h-[85vh] flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
              <div>
                <h2 className="text-lg font-semibold">{isEditingCustomers ? "Edit" : "Add"} Customers</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  {selectedCustomers.size > 0
                    ? `${selectedCustomers.size} customer${selectedCustomers.size !== 1 ? "s" : ""} selected`
                    : "Select customers to add to this campaign"}
                </p>
              </div>
              <button
                onClick={closeCustomerModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Controls */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800"
                />
              </div>

              <span className="text-sm text-zinc-500">
                {filteredCustomers.length === customersTotal
                  ? `${customersTotal} customers`
                  : `${filteredCustomers.length} of ${customersTotal} customers`}
              </span>

              {/* Date Range Picker */}
              <DateRangePicker
                dateRange={customerDateRange}
                onDateRangeChange={setCustomerDateRange}
                placeholder="Customer since"
              />

              {/* Sort Button */}
              <div className="relative" ref={customerSortModalRef}>
                <button
                  onClick={() => setShowCustomerSortModal(!showCustomerSortModal)}
                  className="btn btn-secondary btn-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  Sort
                </button>
                {showCustomerSortModal && (
                  <div className="dropdown right-0 mt-2 w-56" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3 border-b border-zinc-200 dark:border-zinc-700">
                      <div className="text-sm font-medium mb-2">Sort by</div>
                      <div className="flex flex-col gap-1">
                        {[
                          { value: "lastOrderAt", label: "Last order" },
                          { value: "createdAt", label: "Customer since" },
                          { value: "totalSpent", label: "Total spent" },
                          { value: "ordersCount", label: "Number of orders" },
                          { value: "lapse", label: "Days since order" },
                        ].map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                            <input
                              type="radio"
                              name="customerSortField"
                              checked={customerSortField === opt.value}
                              onChange={() => setCustomerSortField(opt.value as SortField)}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="p-2">
                      <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${customerSortDirection === "asc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        <input
                          type="radio"
                          name="customerSortDir"
                          checked={customerSortDirection === "asc"}
                          onChange={() => setCustomerSortDirection("asc")}
                          className="sr-only"
                        />
                        <span className="text-sm">Ascending</span>
                      </label>
                      <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${customerSortDirection === "desc" ? "bg-zinc-100 dark:bg-zinc-700" : "hover:bg-zinc-50 dark:hover:bg-zinc-700"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <input
                          type="radio"
                          name="customerSortDir"
                          checked={customerSortDirection === "desc"}
                          onChange={() => setCustomerSortDirection("desc")}
                          className="sr-only"
                        />
                        <span className="text-sm">Descending</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Lapse Filter Button */}
              <div className="relative" ref={customerLapseFilterRef}>
                <button
                  onClick={() => setShowCustomerLapseFilter(!showCustomerLapseFilter)}
                  className={`btn btn-sm ${customerLapseFilter.type ? "btn-primary" : "btn-secondary"}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {customerLapseFilter.type ? "Filtered" : "Days Since Order"}
                </button>
                {showCustomerLapseFilter && (
                  <div className="dropdown right-0 mt-2 w-72" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3">
                      <div className="text-sm font-medium mb-3">Days Since Last Order</div>
                      <div className="flex flex-col gap-2">
                        {[
                          { value: "new", label: `New (≤${lifecycleSettings.newMaxDays} days)` },
                          { value: "due_reorder", label: `Due Reorder (${lifecycleSettings.newMaxDays + 1}-${lifecycleSettings.reorderMaxDays} days)` },
                          { value: "lapsed", label: `Lapsed (${lifecycleSettings.reorderMaxDays + 1}-${lifecycleSettings.lapsedMaxDays} days)` },
                          { value: "lost", label: `Lost (>${lifecycleSettings.lapsedMaxDays} days)` },
                        ].map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                            <input
                              type="radio"
                              name="customerLapseFilter"
                              checked={customerLapseFilter.type === opt.value}
                              onChange={() => setCustomerLapseFilter({ type: opt.value as LapseFilterType })}
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                        ))}
                        <div className="border-t border-zinc-200 dark:border-zinc-700 my-1" />
                        <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                          <input
                            type="radio"
                            name="customerLapseFilter"
                            checked={customerLapseFilter.type === "custom"}
                            onChange={() => {
                              const val = parseInt(customLapseInput) || 0;
                              setCustomerLapseFilter({ type: "custom", customMax: val });
                            }}
                          />
                          <span className="text-sm">Custom: ≤</span>
                          <input
                            type="number"
                            className="input w-16 text-sm"
                            placeholder="days"
                            value={customLapseInput}
                            onChange={(e) => {
                              setCustomLapseInput(e.target.value);
                              const val = parseInt(e.target.value) || 0;
                              if (customerLapseFilter.type === "custom" || e.target.value) {
                                setCustomerLapseFilter({ type: "custom", customMax: val });
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-sm">days</span>
                        </label>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <button
                          className="btn btn-secondary btn-sm flex-1"
                          onClick={() => {
                            setCustomerLapseFilter({ type: null });
                            setCustomLapseInput("");
                          }}
                        >
                          Clear
                        </button>
                        <button
                          className="btn btn-primary btn-sm flex-1"
                          onClick={() => setShowCustomerLapseFilter(false)}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tags Filter Button */}
              <div className="relative" ref={tagsFilterRef}>
                <button
                  onClick={() => setShowTagsFilter(!showTagsFilter)}
                  className={`btn btn-sm ${selectedTags.size > 0 ? "btn-primary" : "btn-secondary"}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  {selectedTags.size > 0 ? `Tags (${selectedTags.size})` : "Tags"}
                </button>
                {showTagsFilter && (
                  <div className="dropdown right-0 mt-2 w-72" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3">
                      <div className="text-sm font-medium mb-3">Filter by Tags</div>
                      <input
                        type="text"
                        className="input w-full text-sm mb-2"
                        placeholder="Search tags..."
                        value={tagsFilterSearch}
                        onChange={(e) => setTagsFilterSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                        {filteredTags.length === 0 ? (
                          <div className="text-sm text-zinc-500 px-2 py-1">No tags found</div>
                        ) : (
                          filteredTags.map((tag) => (
                            <label key={tag} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedTags.has(tag)}
                                onChange={() => {
                                  const newTags = new Set(selectedTags);
                                  if (newTags.has(tag)) {
                                    newTags.delete(tag);
                                  } else {
                                    newTags.add(tag);
                                  }
                                  setSelectedTags(newTags);
                                }}
                              />
                              <span className="text-sm truncate">{tag}</span>
                            </label>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <button
                          className="btn btn-secondary btn-sm flex-1"
                          onClick={() => {
                            setSelectedTags(new Set());
                            setTagsFilterSearch("");
                          }}
                        >
                          Clear
                        </button>
                        <button
                          className="btn btn-primary btn-sm flex-1"
                          onClick={() => setShowTagsFilter(false)}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Orders Filter Button */}
              <div className="relative" ref={ordersFilterRef}>
                <button
                  onClick={() => setShowOrdersFilter(!showOrdersFilter)}
                  className={`btn btn-sm ${ordersFilterMin || ordersFilterMax ? "btn-primary" : "btn-secondary"}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  {ordersFilterMin || ordersFilterMax
                    ? `Orders ${ordersFilterMin || "0"}-${ordersFilterMax || "∞"}`
                    : "Orders"}
                </button>
                {showOrdersFilter && (
                  <div className="dropdown right-0 mt-2 w-56" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3">
                      <div className="text-sm font-medium mb-3">Number of Orders</div>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="number"
                          className="input w-20 text-sm"
                          placeholder="Min"
                          min="0"
                          value={ordersFilterMin}
                          onChange={(e) => setOrdersFilterMin(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-sm text-zinc-500">to</span>
                        <input
                          type="number"
                          className="input w-20 text-sm"
                          placeholder="Max"
                          min="0"
                          value={ordersFilterMax}
                          onChange={(e) => setOrdersFilterMax(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                        <button
                          className="btn btn-secondary btn-sm flex-1"
                          onClick={() => {
                            setOrdersFilterMin("");
                            setOrdersFilterMax("");
                          }}
                        >
                          Clear
                        </button>
                        <button
                          className="btn btn-primary btn-sm flex-1"
                          onClick={() => setShowOrdersFilter(false)}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Show Selected Only Toggle */}
              <button
                onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                className={`btn btn-sm ${showSelectedOnly ? "btn-primary" : "btn-secondary"}`}
              >
                {showSelectedOnly ? "Show All" : "Selected Only"}
              </button>
            </div>

            {/* Filter Pills */}
            {(customerLapseFilter.type || customerDateRange?.from || selectedTags.size > 0 || ordersFilterMin || ordersFilterMax) && (
              <div className="flex items-center gap-2 px-6 py-2 border-b border-zinc-200 dark:border-zinc-700 shrink-0 flex-wrap">
                {customerLapseFilter.type && (
                  <div className="filter-pill">
                    <span className="filter-pill-label">
                      <span className="filter-pill-key">Days:</span>
                      <span className="filter-pill-values">
                        {customerLapseFilter.type === "new" && `≤${lifecycleSettings.newMaxDays}`}
                        {customerLapseFilter.type === "due_reorder" && `${lifecycleSettings.newMaxDays + 1}-${lifecycleSettings.reorderMaxDays}`}
                        {customerLapseFilter.type === "lapsed" && `${lifecycleSettings.reorderMaxDays + 1}-${lifecycleSettings.lapsedMaxDays}`}
                        {customerLapseFilter.type === "lost" && `>${lifecycleSettings.lapsedMaxDays}`}
                        {customerLapseFilter.type === "custom" && `≤${customerLapseFilter.customMax}`}
                      </span>
                    </span>
                    <button
                      className="filter-pill-remove"
                      onClick={() => setCustomerLapseFilter({ type: null })}
                    >
                      ×
                    </button>
                  </div>
                )}
                {customerDateRange?.from && (
                  <div className="filter-pill">
                    <span className="filter-pill-label">
                      <span className="filter-pill-key">Since:</span>
                      <span className="filter-pill-values">
                        {customerDateRange.from.toLocaleDateString()}
                        {customerDateRange.to && ` - ${customerDateRange.to.toLocaleDateString()}`}
                      </span>
                    </span>
                    <button
                      className="filter-pill-remove"
                      onClick={() => setCustomerDateRange(undefined)}
                    >
                      ×
                    </button>
                  </div>
                )}
                {selectedTags.size > 0 && (
                  <div className="filter-pill">
                    <span className="filter-pill-label">
                      <span className="filter-pill-key">Tags:</span>
                      <span className="filter-pill-values">
                        {selectedTags.size <= 2
                          ? Array.from(selectedTags).join(", ")
                          : `${selectedTags.size} selected`}
                      </span>
                    </span>
                    <button
                      className="filter-pill-remove"
                      onClick={() => setSelectedTags(new Set())}
                    >
                      ×
                    </button>
                  </div>
                )}
                {(ordersFilterMin || ordersFilterMax) && (
                  <div className="filter-pill">
                    <span className="filter-pill-label">
                      <span className="filter-pill-key">Orders:</span>
                      <span className="filter-pill-values">
                        {ordersFilterMin || "0"} - {ordersFilterMax || "∞"}
                      </span>
                    </span>
                    <button
                      className="filter-pill-remove"
                      onClick={() => {
                        setOrdersFilterMin("");
                        setOrdersFilterMax("");
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                <button
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  onClick={() => {
                    setCustomerLapseFilter({ type: null });
                    setCustomerDateRange(undefined);
                    setSelectedTags(new Set());
                    setOrdersFilterMin("");
                    setOrdersFilterMax("");
                  }}
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {customersLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-zinc-500">Loading customers...</p>
                </div>
              ) : (
                <Table
                  columns={customerColumns}
                  data={filteredCustomers}
                  rowKey="id"
                  emptyMessage="No customers with phone numbers found."
                  selectable
                  selectedRows={selectedCustomers}
                  onSelectionChange={setSelectedCustomers}
                />
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
              <div className="text-sm text-zinc-500">
                {selectedCustomers.size > 0 && (
                  <span>{selectedCustomers.size} customer{selectedCustomers.size !== 1 ? "s" : ""} selected</span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={closeCustomerModal}
                  className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={addCustomersToCampaign}
                  disabled={addingCustomers || (!isEditingCustomers && selectedCustomers.size === 0)}
                  className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                >
                  {addingCustomers ? "Saving..." : isEditingCustomers ? `Save ${selectedCustomers.size} Customer${selectedCustomers.size !== 1 ? "s" : ""}` : `Add ${selectedCustomers.size} Customer${selectedCustomers.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Campaign Modal ──────────────────────────── */}
      {showSendModal && sendModalCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
              <h2 className="text-lg font-semibold">
                {sendModalStep === "preview" && "Send Campaign"}
                {sendModalStep === "confirm" && "Confirm Send"}
                {sendModalStep === "sending" && (campaignSending ? "Sending..." : "Send Complete")}
              </h2>
              <button
                onClick={closeSendModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* Preview Step */}
              {sendModalStep === "preview" && (
                <>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    You are about to send campaign <strong>&quot;{sendModalCampaign.name}&quot;</strong> to{" "}
                    <strong>{sendModalCampaign.campaignsWaCustomers.length}</strong> customer
                    {sendModalCampaign.campaignsWaCustomers.length !== 1 ? "s" : ""}.
                  </p>

                  {/* Template Preview */}
                  {sendModalTemplate?.body && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-zinc-500 mb-2">Template Preview</p>
                      <div
                        className="max-w-sm rounded-lg p-4"
                        style={{
                          backgroundImage: "url(/whatsapp-bg.png)",
                          backgroundSize: "300px",
                          backgroundRepeat: "repeat",
                        }}
                      >
                        <div className="bg-white rounded-lg p-3 shadow-md relative">
                          {sendModalTemplate.header && (
                            <p className="font-bold text-sm text-zinc-900 mb-1">
                              {sendModalTemplate.header}
                            </p>
                          )}
                          <p className="text-sm text-zinc-800 whitespace-pre-line">
                            {sendModalTemplate.body}
                          </p>
                          <span className="block text-right text-[11px] text-zinc-400 mt-1">
                            {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {!sendModalTemplate && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
                      Template &quot;{sendModalCampaign.templateName}&quot; not found in approved templates.
                    </div>
                  )}
                </>
              )}

              {/* Confirm Step */}
              {sendModalStep === "confirm" && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                    <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Are you sure?</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    This will send WhatsApp messages to {sendModalCampaign.campaignsWaCustomers.length} customer
                    {sendModalCampaign.campaignsWaCustomers.length !== 1 ? "s" : ""}.<br />
                    <strong>This action cannot be undone.</strong>
                  </p>
                </div>
              )}

              {/* Sending Step - Progress */}
              {sendModalStep === "sending" && (
                <>
                  {/* Progress Summary */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>Progress</span>
                      <span className="text-zinc-500">
                        {campaignSuccessCount} sent, {campaignErrorCount} failed,{" "}
                        {campaignSendResults.length - campaignSuccessCount - campaignErrorCount} remaining
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{
                          width: `${((campaignSuccessCount + campaignErrorCount) / campaignSendResults.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Results List */}
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-md max-h-64 overflow-y-auto">
                    {campaignSendResults.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-3 py-2 text-sm border-b last:border-b-0 border-zinc-100 dark:border-zinc-800 ${
                          r.status === "success"
                            ? "bg-green-50 dark:bg-green-950"
                            : r.status === "error"
                              ? "bg-red-50 dark:bg-red-950"
                              : r.status === "sending"
                                ? "bg-blue-50 dark:bg-blue-950"
                                : ""
                        }`}
                      >
                        <span>
                          {r.firstName || "Unknown"} ({r.phone || "No phone"})
                        </span>
                        <span
                          className={
                            r.status === "success"
                              ? "text-green-600"
                              : r.status === "error"
                                ? "text-red-600"
                                : r.status === "sending"
                                  ? "text-blue-600"
                                  : "text-zinc-400"
                          }
                        >
                          {r.status === "success" && "Sent"}
                          {r.status === "error" && (r.error || "Failed")}
                          {r.status === "sending" && "Sending..."}
                          {r.status === "pending" && "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-3 shrink-0">
              {sendModalStep === "preview" && (
                <>
                  <button
                    onClick={closeSendModal}
                    className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setSendModalStep("confirm")}
                    disabled={!sendModalTemplate}
                    className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Send Campaign
                  </button>
                </>
              )}

              {sendModalStep === "confirm" && (
                <>
                  <button
                    onClick={() => setSendModalStep("preview")}
                    className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Back
                  </button>
                  <button
                    onClick={executeCampaignSend}
                    className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                  >
                    Yes, Send Now
                  </button>
                </>
              )}

              {sendModalStep === "sending" && (
                <>
                  {campaignSending ? (
                    <>
                      <button
                        onClick={closeSendModal}
                        className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        Run in Background
                      </button>
                      <button
                        onClick={cancelCampaignSend}
                        className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
                      >
                        Stop Sending
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        closeSendModal();
                        setSendModalCampaign(null);
                        setSendModalTemplate(null);
                        setSendModalStep("preview");
                        setCampaignSendResults([]);
                      }}
                      className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80"
                    >
                      Done
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
