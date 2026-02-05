"use client";

import { useState, useEffect } from "react";

interface MetaForm {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
}

export default function SettingsPage() {
  const [meta, setMeta] = useState<MetaForm>({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.meta) {
          setMeta(data.meta);
        }
      })
      .catch(() => setMessage({ type: "error", text: "Failed to load settings" }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings saved" });
        // Reload to get masked token
        const reload = await fetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.meta) setMeta(reloaded.meta);
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
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

      {/* Meta / WhatsApp Section */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-1">Meta / WhatsApp</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Credentials for the WhatsApp Business API and template management.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Phone Number ID
            </label>
            <input
              type="text"
              value={meta.phone_number_id}
              onChange={(e) => setMeta({ ...meta, phone_number_id: e.target.value })}
              placeholder="e.g. 998388253356786"
              className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Used to send WhatsApp messages. Found in Meta Business Suite &gt; WhatsApp &gt; Phone numbers.
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
              Used to fetch message templates. Found in Meta Business Suite &gt; WhatsApp Accounts.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Access Token
            </label>
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
          onClick={handleSave}
          disabled={saving}
          className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </section>
    </div>
  );
}
