"use client";

import { useState, useEffect, useRef } from "react";
import { Table, Column } from "@/components/Table";

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
  const [activeTab, setActiveTab] = useState<"facebook" | "whatsapp" | "manual">("facebook");

  // ── Facebook State ─────────────────────────────────
  const [fbCampaigns, setFbCampaigns] = useState<FbCampaign[]>([]);
  const [fbLoading, setFbLoading] = useState(true);
  const [fbError, setFbError] = useState("");
  const [showFbModal, setShowFbModal] = useState(false);
  const [fbSaving, setFbSaving] = useState(false);
  const [fbForm, setFbForm] = useState<FbFormData>(emptyFbForm);
  const [fbIsEditing, setFbIsEditing] = useState(false);

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

  // ── WhatsApp Campaigns State ───────────────────────
  const [waCampaigns, setWaCampaigns] = useState<WaCampaign[]>([]);
  const [waLoading, setWaLoading] = useState(true);

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
    { key: "productName", label: "Product" },
    { key: "skus", label: "SKUs", className: "font-mono text-xs" },
    { key: "discountCode", label: "Discount" },
    { key: "utmSource", label: "UTM Source" },
    {
      key: "status",
      label: "Status",
      render: (value) => <StatusBadge status={value as string | null} type="fb" />,
    },
    {
      key: "actions",
      label: "",
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openFbModal(row);
            }}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFbDeleteId(row.id);
            }}
            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  const waColumns: Column<WaCampaign>[] = [
    { key: "name", label: "Name", sticky: true, primary: true },
    { key: "templateName", label: "Template" },
    { key: "customerCount", label: "Customers" },
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
      render: () => (
        <button className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          •••
        </button>
      ),
    },
  ];

  // ── Load Data ──────────────────────────────────────

  useEffect(() => {
    loadFbCampaigns();
    loadWaCampaigns();
    loadTemplates();
  }, []);

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
      const res = await fetch("/api/campaigns");
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
      const res = await fetch("/api/campaigns-wa");
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
      const res = await fetch("/api/whatsapp/templates");
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
      const res = await fetch(`/api/shopify/products?search=${encodeURIComponent(query)}`);
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
      const res = await fetch(`/api/shopify/discounts?search=${encodeURIComponent(query)}`);
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
      const res = await fetch("/api/shopify/discounts", {
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
      const res = await fetch("/api/campaigns", {
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
      const res = await fetch(`/api/campaigns?id=${fbDeleteId}`, {
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
        const res = await fetch("/api/whatsapp/send", {
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
            <button className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80">
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
          <div className="pt-4">
            {fbError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                {fbError}
                <button onClick={() => setFbError("")} className="ml-2 underline">Dismiss</button>
              </div>
            )}

            {fbLoading ? (
              <p className="text-zinc-500 p-4">Loading...</p>
            ) : (
              <Table
                columns={fbColumns}
                data={fbCampaigns}
                rowKey="id"
                emptyMessage="No campaigns yet. Add your first campaign to enable order attribution."
              />
            )}
          </div>
        )}

        {/* ── WhatsApp Tab ────────────────────────────── */}
        {activeTab === "whatsapp" && (
          <div>
            {waLoading ? (
              <p className="text-sm text-zinc-500 p-4">Loading campaigns...</p>
            ) : waCampaigns.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg m-4">
                <p className="text-zinc-500 mb-4">No campaigns yet</p>
                <button className="px-4 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80">
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
          <div className="max-w-4xl p-4">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
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
    </div>
  );
}
