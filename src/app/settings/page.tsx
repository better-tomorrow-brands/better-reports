"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";

type SettingsTab = "shopify" | "meta" | "amazon" | "expenses" | "preferences";

interface MetaForm {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
}

interface ShopifyForm {
  store_domain: string;
  access_token: string;
  webhook_secret: string;
}

interface LifecycleForm {
  newMaxDays: number;
  reorderMaxDays: number;
  lapsedMaxDays: number;
}

interface AmazonForm {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  marketplace_id: string;
}

export default function SettingsPage() {
  const { apiFetch, currentOrg } = useOrg();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("shopify");
  const [meta, setMeta] = useState<MetaForm>({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
  });
  const [shopify, setShopify] = useState<ShopifyForm>({
    store_domain: "",
    access_token: "",
    webhook_secret: "",
  });
  const [lifecycle, setLifecycle] = useState<LifecycleForm>({
    newMaxDays: 30,
    reorderMaxDays: 60,
    lapsedMaxDays: 90,
  });
  const [amazon, setAmazon] = useState<AmazonForm>({
    client_id: "",
    client_secret: "",
    refresh_token: "",
    marketplace_id: "A1F83G8C2ARO7P",
  });
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingShopify, setSavingShopify] = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [savingAmazon, setSavingAmazon] = useState(false);
  const [testingAmazon, setTestingAmazon] = useState(false);
  const [amazonTestResult, setAmazonTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    Promise.all([
      apiFetch("/api/settings").then((res) => res.json()),
      apiFetch("/api/settings/lifecycle").then((res) => res.json()),
      fetch("/api/users/me").then((res) => res.json()).catch(() => ({ role: null })),
    ])
      .then(([settingsData, lifecycleData, userData]) => {
        if (settingsData.meta) setMeta(settingsData.meta);
        if (settingsData.shopify) setShopify(settingsData.shopify);
        if (settingsData.amazon) setAmazon({ ...amazon, ...settingsData.amazon });
        if (lifecycleData && !lifecycleData.error) setLifecycle(lifecycleData);
        if (userData.role) setUserRole(userData.role);
      })
      .catch(() => setMessage({ type: "error", text: "Failed to load settings" }))
      .finally(() => setLoading(false));
  }, [apiFetch, currentOrg]);

  async function handleSaveMeta() {
    setSavingMeta(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Meta settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.meta) setMeta(reloaded.meta);
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveShopify() {
    setSavingShopify(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopify }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Shopify settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.shopify) setShopify(reloaded.shopify);
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingShopify(false);
    }
  }

  async function handleSaveLifecycle() {
    setSavingLifecycle(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/settings/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lifecycle),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Lifecycle settings saved" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingLifecycle(false);
    }
  }

  async function handleSaveAmazon() {
    setSavingAmazon(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amazon }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Amazon settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.amazon) setAmazon(reloaded.amazon);
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingAmazon(false);
    }
  }

  async function handleTestAmazon() {
    setTestingAmazon(true);
    setAmazonTestResult(null);

    try {
      const res = await apiFetch("/api/test/amazon");
      const data = await res.json();
      setAmazonTestResult(data);
    } catch {
      setAmazonTestResult({ success: false, message: "Request failed" });
    } finally {
      setTestingAmazon(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-6" />

        {/* Tab bar skeleton */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-t animate-pulse mx-1" />
          ))}
        </div>

        {/* Form section skeleton */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-1" />
          <div className="h-3.5 w-72 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse mb-5" />

          <div className="flex flex-col gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-2" />
                <div className="h-9 w-full bg-zinc-100 dark:bg-zinc-800 rounded-md animate-pulse" />
                <div className="h-3 w-64 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse mt-1.5" />
              </div>
            ))}
          </div>

          <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-700 rounded-md animate-pulse mt-6" />
        </div>
      </div>
    );
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/shopify/orders`
      : "https://app.better-tomorrow.co/api/webhooks/shopify/orders";

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "shopify", label: "Shopify" },
    { key: "meta", label: "Meta" },
    { key: "amazon", label: "Amazon" },
    { key: "expenses", label: "Expenses" },
    { key: "preferences", label: "Preferences" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {message && (
        <div
          className={`mb-4 p-3 rounded-md text-sm ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-6">
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

      {/* ── Shopify Tab ────────────────────────────── */}
      {activeTab === "shopify" && (
        <div className="flex flex-col gap-6">
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold mb-1">Shopify</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Connect your Shopify store to receive order data.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Store Domain</label>
                <input
                  type="text"
                  value={shopify.store_domain}
                  onChange={(e) => setShopify({ ...shopify, store_domain: e.target.value })}
                  placeholder="e.g. yourstore.myshopify.com"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Your Shopify store domain (without https://).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Access Token</label>
                <input
                  type="password"
                  value={shopify.access_token}
                  onChange={(e) => setShopify({ ...shopify, access_token: e.target.value })}
                  placeholder="shpat_xxxxx"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm font-mono"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Admin API access token from your Shopify custom app. In Shopify Admin → Apps → Develop apps → your app → API credentials.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Webhook Signing Secret</label>
                <input
                  type="password"
                  value={shopify.webhook_secret}
                  onChange={(e) => setShopify({ ...shopify, webhook_secret: e.target.value })}
                  placeholder="Webhook signing secret from Shopify"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm font-mono"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Found in Shopify Admin → Settings → Notifications → Webhooks (at the bottom of the page).
                </p>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-3">
                <label className="block text-sm font-medium mb-1">Webhook URL</label>
                <code className="text-xs break-all">{webhookUrl}</code>
                <p className="text-xs text-zinc-400 mt-2">
                  Add this URL in Shopify Admin → Settings → Notifications → Webhooks for &quot;Order creation&quot; and &quot;Order update&quot; events (JSON format).
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveShopify}
              disabled={savingShopify}
              className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
            >
              {savingShopify ? "Saving..." : "Save"}
            </button>
          </section>

          {/* Lifecycle Settings - Super Admin Only */}
          {userRole === "super_admin" && (
            <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
              <h2 className="text-lg font-semibold mb-1">Customer Lifecycle</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Configure the thresholds (in days since last order) for customer lifecycle stages.
              </p>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">New Customer (up to X days)</label>
                  <input
                    type="number"
                    value={lifecycle.newMaxDays}
                    onChange={(e) => setLifecycle({ ...lifecycle, newMaxDays: parseInt(e.target.value) || 0 })}
                    min={1}
                    className="w-32 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Customers with ≤{lifecycle.newMaxDays} days since last order (or only 1 order) are &quot;New&quot;.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Due Reorder (up to X days)</label>
                  <input
                    type="number"
                    value={lifecycle.reorderMaxDays}
                    onChange={(e) => setLifecycle({ ...lifecycle, reorderMaxDays: parseInt(e.target.value) || 0 })}
                    min={lifecycle.newMaxDays + 1}
                    className="w-32 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Customers with {lifecycle.newMaxDays + 1}-{lifecycle.reorderMaxDays} days since last order are &quot;Due Reorder&quot;.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Lapsed (up to X days)</label>
                  <input
                    type="number"
                    value={lifecycle.lapsedMaxDays}
                    onChange={(e) => setLifecycle({ ...lifecycle, lapsedMaxDays: parseInt(e.target.value) || 0 })}
                    min={lifecycle.reorderMaxDays + 1}
                    className="w-32 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Customers with {lifecycle.reorderMaxDays + 1}-{lifecycle.lapsedMaxDays} days are &quot;Lapsed&quot;. Beyond {lifecycle.lapsedMaxDays} days = &quot;Lost&quot;.
                  </p>
                </div>
              </div>

              <button
                onClick={handleSaveLifecycle}
                disabled={savingLifecycle}
                className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                {savingLifecycle ? "Saving..." : "Save"}
              </button>
            </section>
          )}
        </div>
      )}

      {/* ── Meta Tab ────────────────────────────── */}
      {activeTab === "meta" && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Meta / WhatsApp</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Credentials for the WhatsApp Business API and template management.
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number ID</label>
              <input
                type="text"
                value={meta.phone_number_id}
                onChange={(e) => setMeta({ ...meta, phone_number_id: e.target.value })}
                placeholder="e.g. 998388253356786"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Found in Meta Business Suite → WhatsApp → Phone numbers. Used to identify the number messages are sent from.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                WhatsApp Business Account ID (WABA ID)
              </label>
              <input
                type="text"
                value={meta.waba_id}
                onChange={(e) => setMeta({ ...meta, waba_id: e.target.value })}
                placeholder="e.g. 123456789012345"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Found in Meta Business Suite → WhatsApp Accounts. Used to fetch approved message templates.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Access Token</label>
              <input
                type="password"
                value={meta.access_token}
                onChange={(e) => setMeta({ ...meta, access_token: e.target.value })}
                placeholder="System User token or temporary token"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm font-mono"
              />
              <p className="text-xs text-zinc-400 mt-1">
                System User token with <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">whatsapp_business_messaging</code> permission. Create one in Meta Business Suite → System Users.
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveMeta}
            disabled={savingMeta}
            className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {savingMeta ? "Saving..." : "Save"}
          </button>
        </section>
      )}

      {/* ── Amazon Tab ────────────────────────────── */}
      {activeTab === "amazon" && (
        <div className="flex flex-col gap-6">
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold mb-1">Amazon SP-API</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Connect your Amazon Seller account for sales, traffic and financial reporting.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client ID</label>
                <input
                  type="text"
                  value={amazon.client_id}
                  onChange={(e) => setAmazon({ ...amazon, client_id: e.target.value })}
                  placeholder="amzn1.application-oa2-client.xxxxx"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm font-mono"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  From Seller Central → Apps &amp; Services → Develop Apps → your app → LWA credentials.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Client Secret</label>
                <input
                  type="password"
                  value={amazon.client_secret}
                  onChange={(e) => setAmazon({ ...amazon, client_secret: e.target.value })}
                  placeholder="Client secret from Amazon developer console"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm font-mono"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  LWA client secret — shown once when you create the app. Store it securely.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Refresh Token</label>
                <input
                  type="password"
                  value={amazon.refresh_token}
                  onChange={(e) => setAmazon({ ...amazon, refresh_token: e.target.value })}
                  placeholder="Atzr|xxxxx"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm font-mono"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Generated when the seller authorizes your app via the SP-API OAuth flow (starts with <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">Atzr|</code>).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Marketplace ID</label>
                <input
                  type="text"
                  value={amazon.marketplace_id}
                  onChange={(e) => setAmazon({ ...amazon, marketplace_id: e.target.value })}
                  placeholder="A1F83G8C2ARO7P"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  UK: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">A1F83G8C2ARO7P</code> &nbsp;
                  DE: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">A1PA6795UKMFR9</code> &nbsp;
                  US: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">ATVPDKIKX0DER</code>
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSaveAmazon}
                disabled={savingAmazon}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                {savingAmazon ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleTestAmazon}
                disabled={testingAmazon}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {testingAmazon ? "Testing..." : "Test Connection"}
              </button>
            </div>

            {amazonTestResult && (
              <div
                className={`mt-3 p-3 rounded-md text-sm ${
                  amazonTestResult.success
                    ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
                }`}
              >
                {amazonTestResult.message}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Expenses Tab ────────────────────────────── */}
      {activeTab === "expenses" && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Expenses</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Track recurring and one-off business expenses for profitability reporting.
          </p>
          <p className="text-sm text-zinc-400">
            Coming soon — expense categories and recurring costs will be configured here.
          </p>
        </section>
      )}

      {/* ── Preferences Tab ────────────────────────────── */}
      {activeTab === "preferences" && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Preferences</h2>
          <p className="text-sm text-zinc-500 mb-5">
            Personalise how the app looks and behaves for you.
          </p>

          <div>
            <label className="block text-sm font-medium mb-3">Appearance</label>
            <div className="flex gap-3">
              {(["light", "system", "dark"] as Theme[]).map((option) => {
                const labels: Record<Theme, string> = {
                  light: "Light",
                  system: "System",
                  dark: "Dark",
                };
                const isActive = theme === option;
                return (
                  <button
                    key={option}
                    onClick={() => setTheme(option)}
                    className={`flex-1 flex flex-col items-center gap-2 px-3 py-4 rounded-lg border text-sm font-medium transition-colors ${
                      isActive
                        ? "border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {/* Preview swatch */}
                    <span
                      className={`w-12 h-8 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden flex ${
                        option === "dark" ? "bg-zinc-900" : option === "light" ? "bg-white" : "bg-gradient-to-r from-white to-zinc-900"
                      }`}
                    />
                    {labels[option]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-400 mt-3">
              {theme === "system"
                ? "Follows your operating system's light/dark setting."
                : theme === "dark"
                ? "Always use the dark theme."
                : "Always use the light theme."}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
