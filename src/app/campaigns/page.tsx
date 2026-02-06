"use client";

import { useState, useEffect, useRef } from "react";

interface Campaign {
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

interface FormData {
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

const emptyForm: FormData = {
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);

  // Product search state
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const productSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Discount search state
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
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadCampaigns();
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

  async function loadCampaigns() {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCampaigns(data.campaigns || []);
      }
    } catch {
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

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
        setForm({ ...form, discountCode: data.code });
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

    setForm({
      ...form,
      productName: product.title,
      productUrl: product.handle,
      skus: skus,
    });
    setProductSearch(product.title);
    setShowProductDropdown(false);
  }

  function selectDiscount(discount: ShopifyDiscount) {
    setForm({ ...form, discountCode: discount.code });
    setDiscountSearch(discount.code);
    setShowDiscountDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch("/api/campaigns", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok) {
        closeModal();
        loadCampaigns();
      } else {
        setError(data.error || "Failed to save campaign");
      }
    } catch {
      setError("Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns?id=${deleteId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteId(null);
        loadCampaigns();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete campaign");
      }
    } catch {
      setError("Failed to delete campaign");
    } finally {
      setDeleting(false);
    }
  }

  function updateForm(field: keyof FormData, value: string) {
    setForm({ ...form, [field]: value });
  }

  function openModal(campaign?: Campaign) {
    if (campaign) {
      setIsEditing(true);
      setForm({
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
      setIsEditing(false);
      setForm(emptyForm);
      setProductSearch("");
      setDiscountSearch("");
    }
    setProductError("");
    setDiscountError("");
    setProducts([]);
    setDiscounts([]);
    setShowCreateDiscount(false);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setIsEditing(false);
    setForm(emptyForm);
    setProductSearch("");
    setDiscountSearch("");
    setShowCreateDiscount(false);
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Campaigns</h1>
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <button
          onClick={() => openModal()}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80"
        >
          Add Campaign
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {campaigns.length === 0 ? (
        <p className="text-zinc-500">
          No campaigns yet. Add your first campaign to enable order attribution.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-zinc-200 dark:border-zinc-700">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800">
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">Campaign</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">Ad Group</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">Product</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">SKUs</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">Discount</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">UTM Source</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">Status</th>
                <th className="text-left px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="px-3 py-2">{c.campaign || "-"}</td>
                  <td className="px-3 py-2">{c.adGroup || "-"}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate" title={c.productName || ""}>
                    {c.productName || "-"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{c.skus || "-"}</td>
                  <td className="px-3 py-2">{c.discountCode || "-"}</td>
                  <td className="px-3 py-2">{c.utmSource || "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        c.status === "active"
                          ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {c.status || "active"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openModal(c)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Campaign?</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-semibold">{isEditing ? "Edit Campaign" : "Add Campaign"}</h2>
              <button
                onClick={closeModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Campaign</label>
                  <input
                    type="text"
                    value={form.campaign}
                    onChange={(e) => updateForm("campaign", e.target.value)}
                    placeholder="e.g. Prospecting, CBO"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ad Group</label>
                  <input
                    type="text"
                    value={form.adGroup}
                    onChange={(e) => updateForm("adGroup", e.target.value)}
                    placeholder="e.g. Original 50% Off, Broad"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Ad</label>
                  <input
                    type="text"
                    value={form.ad}
                    onChange={(e) => updateForm("ad", e.target.value)}
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
                    value={form.productUrl}
                    onChange={(e) => updateForm("productUrl", e.target.value)}
                    placeholder="Auto-filled from product selection"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-sm"
                    readOnly
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SKU Suffix</label>
                  <input
                    type="text"
                    value={form.skuSuffix}
                    onChange={(e) => updateForm("skuSuffix", e.target.value)}
                    placeholder="e.g. A"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SKUs</label>
                  <input
                    type="text"
                    value={form.skus}
                    onChange={(e) => updateForm("skus", e.target.value)}
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
                      setForm({ ...form, discountCode: e.target.value });
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
                    value={form.utmSource}
                    onChange={(e) => updateForm("utmSource", e.target.value)}
                    placeholder="e.g. facebook"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UTM Medium</label>
                  <input
                    type="text"
                    value={form.utmMedium}
                    onChange={(e) => updateForm("utmMedium", e.target.value)}
                    placeholder="e.g. cpc"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UTM Campaign</label>
                  <input
                    type="text"
                    value={form.utmCampaign}
                    onChange={(e) => updateForm("utmCampaign", e.target.value)}
                    placeholder="e.g. 50% Original"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UTM Term</label>
                  <input
                    type="text"
                    value={form.utmTerm}
                    onChange={(e) => updateForm("utmTerm", e.target.value)}
                    placeholder="e.g. Beige Hero"
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Product Template</label>
                  <input
                    type="text"
                    value={form.productTemplate}
                    onChange={(e) => updateForm("productTemplate", e.target.value)}
                    placeholder=""
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => updateForm("status", e.target.value)}
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
                  onClick={closeModal}
                  className="px-4 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                >
                  {saving ? "Saving..." : isEditing ? "Update Campaign" : "Save Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
