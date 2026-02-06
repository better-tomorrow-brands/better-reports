"use client";

import { useState, useEffect } from "react";

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

export default function SettingsPage() {
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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingShopify, setSavingShopify] = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((res) => res.json()),
      fetch("/api/settings/lifecycle").then((res) => res.json()),
      fetch("/api/users/me").then((res) => res.json()).catch(() => ({ role: null })),
    ])
      .then(([settingsData, lifecycleData, userData]) => {
        if (settingsData.meta) setMeta(settingsData.meta);
        if (settingsData.shopify) setShopify(settingsData.shopify);
        if (lifecycleData && !lifecycleData.error) setLifecycle(lifecycleData);
        if (userData.role) setUserRole(userData.role);
      })
      .catch(() => setMessage({ type: "error", text: "Failed to load settings" }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveMeta() {
    setSavingMeta(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Meta settings saved" });
        const reload = await fetch("/api/settings");
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
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopify }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Shopify settings saved" });
        const reload = await fetch("/api/settings");
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
      const res = await fetch("/api/settings/lifecycle", {
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/shopify/orders`
      : "https://app.better-tomorrow.co/api/webhooks/shopify/orders";

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

      {/* Shopify Section */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-6">
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
              Admin API access token from your Shopify custom app.
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
              Found in Shopify Admin → Settings → Notifications → Webhooks (at the bottom).
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-3">
            <label className="block text-sm font-medium mb-1">Webhook URL</label>
            <code className="text-xs break-all">{webhookUrl}</code>
            <p className="text-xs text-zinc-400 mt-2">
              Add this URL in Shopify Admin → Settings → Notifications → Webhooks for &quot;Order creation&quot; and &quot;Order update&quot; events.
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

      {/* Meta / WhatsApp Section */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-6">
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
              Used to send WhatsApp messages. Found in Meta Business Suite → WhatsApp → Phone numbers.
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
              Used to fetch message templates. Found in Meta Business Suite → WhatsApp Accounts.
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
              Meta System User token with whatsapp_business_messaging permission.
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

      {/* Lifecycle Settings - Super Admin Only */}
      {userRole === "super_admin" && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-6">
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
  );
}
