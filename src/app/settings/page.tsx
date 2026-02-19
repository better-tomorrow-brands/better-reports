"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useOrg } from "@/contexts/OrgContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { Eye, EyeOff, Pencil, X } from "lucide-react";

type SettingsTab =
  | "shopify"
  | "meta"
  | "posthog"
  | "amazon"
  | "logistics"
  | "expenses"
  | "preferences";

interface MetaForm {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
}

interface FacebookAdsForm {
  access_token: string;
  ad_account_id: string;
}

interface ShopifyForm {
  client_id: string;
  client_secret: string;
  store_domain: string;
  access_token: string;
  webhook_secret: string;
}

interface LifecycleForm {
  newMaxDays: number;
  reorderMaxDays: number;
  lapsedMaxDays: number;
}

interface PosthogForm {
  api_key: string;
  project_id: string;
  host: string;
}

interface AmazonForm {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  marketplace_id: string;
}

interface AmazonAdsForm {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  profile_id: string;
}

interface ShipBobForm {
  pat: string;
  enabled: boolean;
}

export default function SettingsPage() {
  const { apiFetch, currentOrg } = useOrg();
  const { theme, setTheme } = useTheme();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("shopify");
  const [meta, setMeta] = useState<MetaForm>({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
  });
  const [shopify, setShopify] = useState<ShopifyForm>({
    client_id: "",
    client_secret: "",
    store_domain: "",
    access_token: "",
    webhook_secret: "",
  });
  const [lifecycle, setLifecycle] = useState<LifecycleForm>({
    newMaxDays: 30,
    reorderMaxDays: 60,
    lapsedMaxDays: 90,
  });
  const [posthog, setPosthog] = useState<PosthogForm>({
    api_key: "",
    project_id: "",
    host: "eu.posthog.com",
  });
  const [amazon, setAmazon] = useState<AmazonForm>({
    client_id: "",
    client_secret: "",
    refresh_token: "",
    marketplace_id: "A1F83G8C2ARO7P",
  });
  const [amazonAds, setAmazonAds] = useState<AmazonAdsForm>({
    client_id: "",
    client_secret: "",
    refresh_token: "",
    profile_id: "",
  });
  const [facebookAds, setFacebookAds] = useState<FacebookAdsForm>({
    access_token: "",
    ad_account_id: "",
  });
  const [shipbob, setShipbob] = useState<ShipBobForm>({ pat: "", enabled: false });
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingFacebookAds, setSavingFacebookAds] = useState(false);
  const [backfillingCampaignIds, setBackfillingCampaignIds] = useState(false);
  const [campaignIdBackfillResult, setCampaignIdBackfillResult] = useState<string | null>(null);
  const [fbBackfillStart, setFbBackfillStart] = useState("");
  const [fbBackfillEnd, setFbBackfillEnd] = useState("");
  const [fbBackfilling, setFbBackfilling] = useState(false);
  const [fbBackfillResult, setFbBackfillResult] = useState<string | null>(null);
  const [savingPosthog, setSavingPosthog] = useState(false);
  const [savingShopify, setSavingShopify] = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [savingAmazon, setSavingAmazon] = useState(false);
  const [savingAmazonAds, setSavingAmazonAds] = useState(false);
  const [savingShipbob, setSavingShipbob] = useState(false);
  const [testingAmazon, setTestingAmazon] = useState(false);
  const [testingAmazonAds, setTestingAmazonAds] = useState(false);
  const [amazonTestResult, setAmazonTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [amazonAdsTestResult, setAmazonAdsTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Saved snapshots — track what's persisted so we can detect changes & lock fields
  const [savedMeta, setSavedMeta] = useState<MetaForm>({
    phone_number_id: "",
    waba_id: "",
    access_token: "",
  });
  const [savedPosthog, setSavedPosthog] = useState<PosthogForm>({
    api_key: "",
    project_id: "",
    host: "eu.posthog.com",
  });
  const [savedShopify, setSavedShopify] = useState<ShopifyForm>({
    client_id: "",
    client_secret: "",
    store_domain: "",
    access_token: "",
    webhook_secret: "",
  });
  const [savedAmazon, setSavedAmazon] = useState<AmazonForm>({
    client_id: "",
    client_secret: "",
    refresh_token: "",
    marketplace_id: "A1F83G8C2ARO7P",
  });
  const [savedAmazonAds, setSavedAmazonAds] = useState<AmazonAdsForm>({
    client_id: "",
    client_secret: "",
    refresh_token: "",
    profile_id: "",
  });
  const [savedFacebookAds, setSavedFacebookAds] = useState<FacebookAdsForm>({
    access_token: "",
    ad_account_id: "",
  });
  const [savedShipbob, setSavedShipbob] = useState<ShipBobForm>({ pat: "", enabled: false });

  // Which locked fields are currently unlocked for editing / have their value revealed
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());

  const toggleEditing = useCallback(
    (
      fieldKey: string,
      savedValue: string,
      restoreValue: (val: string) => void,
    ) => {
      setEditingFields((prev) => {
        const next = new Set(prev);
        if (next.has(fieldKey)) {
          // Cancel editing — restore saved value
          next.delete(fieldKey);
          restoreValue(savedValue);
        } else {
          // Start editing — clear the field so user types fresh
          next.add(fieldKey);
          restoreValue("");
        }
        return next;
      });
      // Hide value when toggling edit state
      setVisibleFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    },
    [],
  );

  const toggleVisible = useCallback((fieldKey: string) => {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  }, []);

  // Reset lock/visibility state for a section after save
  const resetFieldStates = useCallback((prefix: string) => {
    setEditingFields((prev) => {
      const next = new Set(
        Array.from(prev).filter((k) => !k.startsWith(prefix)),
      );
      return next;
    });
    setVisibleFields((prev) => {
      const next = new Set(
        Array.from(prev).filter((k) => !k.startsWith(prefix)),
      );
      return next;
    });
  }, []);

  useEffect(() => {
    if (!currentOrg) return;

    // Reset state when org changes so stale values don't persist
    setLoading(true);
    setMessage(null);
    setMeta({ phone_number_id: "", waba_id: "", access_token: "" });
    setSavedMeta({ phone_number_id: "", waba_id: "", access_token: "" });
    setPosthog({ api_key: "", project_id: "", host: "eu.posthog.com" });
    setSavedPosthog({ api_key: "", project_id: "", host: "eu.posthog.com" });
    setShopify({
      client_id: "",
      client_secret: "",
      store_domain: "",
      access_token: "",
      webhook_secret: "",
    });
    setSavedShopify({
      client_id: "",
      client_secret: "",
      store_domain: "",
      access_token: "",
      webhook_secret: "",
    });
    setAmazon({
      client_id: "",
      client_secret: "",
      refresh_token: "",
      marketplace_id: "A1F83G8C2ARO7P",
    });
    setSavedAmazon({
      client_id: "",
      client_secret: "",
      refresh_token: "",
      marketplace_id: "A1F83G8C2ARO7P",
    });
    setAmazonAds({
      client_id: "",
      client_secret: "",
      refresh_token: "",
      profile_id: "",
    });
    setSavedAmazonAds({
      client_id: "",
      client_secret: "",
      refresh_token: "",
      profile_id: "",
    });
    setFacebookAds({ access_token: "", ad_account_id: "" });
    setSavedFacebookAds({ access_token: "", ad_account_id: "" });
    setShipbob({ pat: "", enabled: false });
    setSavedShipbob({ pat: "", enabled: false });
    setEditingFields(new Set());
    setVisibleFields(new Set());

    Promise.all([
      apiFetch("/api/settings").then((res) => res.json()),
      apiFetch("/api/settings/lifecycle").then((res) => res.json()),
      fetch("/api/users/me")
        .then((res) => res.json())
        .catch(() => ({ role: null })),
    ])
      .then(([settingsData, lifecycleData, userData]) => {
        if (settingsData.meta) {
          setMeta(settingsData.meta);
          setSavedMeta(settingsData.meta);
        }
        if (settingsData.posthog) {
          const merged = {
            api_key: "",
            project_id: "",
            host: "eu.posthog.com",
            ...settingsData.posthog,
          };
          setPosthog(merged);
          setSavedPosthog(merged);
        }
        if (settingsData.shopify) {
          setShopify(settingsData.shopify);
          setSavedShopify(settingsData.shopify);
        }
        if (settingsData.amazon) {
          const merged = {
            client_id: "",
            client_secret: "",
            refresh_token: "",
            marketplace_id: "A1F83G8C2ARO7P",
            ...settingsData.amazon,
          };
          setAmazon(merged);
          setSavedAmazon(merged);
        }
        if (settingsData.amazon_ads) {
          const merged = {
            client_id: "",
            client_secret: "",
            refresh_token: "",
            profile_id: "",
            ...settingsData.amazon_ads,
          };
          setAmazonAds(merged);
          setSavedAmazonAds(merged);
        }
        if (settingsData.facebook_ads) {
          setFacebookAds(settingsData.facebook_ads);
          setSavedFacebookAds(settingsData.facebook_ads);
        }
        if (settingsData.shipbob) {
          setShipbob(settingsData.shipbob);
          setSavedShipbob(settingsData.shipbob);
        }
        if (settingsData.preferences?.displayCurrency) {
          setDisplayCurrency(settingsData.preferences.displayCurrency);
        }
        if (lifecycleData && !lifecycleData.error) setLifecycle(lifecycleData);
        if (userData.role) setUserRole(userData.role);
      })
      .catch(() =>
        setMessage({ type: "error", text: "Failed to load settings" }),
      )
      .finally(() => setLoading(false));
  }, [apiFetch, currentOrg]);

  // Handle OAuth redirect result
  useEffect(() => {
    const shopifyParam = searchParams.get("shopify");
    if (shopifyParam === "connected") {
      setMessage({ type: "success", text: "Shopify connected successfully." });
      setActiveTab("shopify");
      // Clean the query param from the URL
      window.history.replaceState({}, "", "/settings");
    } else if (shopifyParam === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      const reasonMessages: Record<string, string> = {
        missing_app_credentials:
          "Save your Client ID and Client Secret before connecting via OAuth.",
        unauthorized: "You must be logged in to connect Shopify.",
        forbidden: "You do not have access to this organisation.",
        missing_params: "Missing required parameters. Please try again.",
        missing_state: "Session expired — please try connecting again.",
        state_mismatch: "Security check failed. Please try connecting again.",
        invalid_hmac:
          "Shopify signature verification failed. Please try again.",
        token_exchange:
          "Failed to exchange authorisation code with Shopify. Check your Client Secret.",
        no_token: "Shopify did not return an access token. Please try again.",
        missing_credentials:
          "App credentials missing. Please save Client ID and Secret first.",
      };
      const text =
        reasonMessages[reason] ??
        `Shopify connection failed (${reason}). Please try again.`;
      setMessage({ type: "error", text });
      setActiveTab("shopify");
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchParams]);

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
        if (reloaded.meta) {
          setMeta(reloaded.meta);
          setSavedMeta(reloaded.meta);
        }
        resetFieldStates("meta.");
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveFacebookAds() {
    setSavingFacebookAds(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facebook_ads: facebookAds }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Facebook Ads settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.facebook_ads) {
          setFacebookAds(reloaded.facebook_ads);
          setSavedFacebookAds(reloaded.facebook_ads);
        }
        resetFieldStates("facebookAds.");
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingFacebookAds(false);
    }
  }

  async function handleSavePosthog() {
    setSavingPosthog(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posthog }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "PostHog settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.posthog) {
          const merged = {
            api_key: "",
            project_id: "",
            host: "eu.posthog.com",
            ...reloaded.posthog,
          };
          setPosthog(merged);
          setSavedPosthog(merged);
        }
        resetFieldStates("posthog.");
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingPosthog(false);
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
        if (reloaded.shopify) {
          setShopify(reloaded.shopify);
          setSavedShopify(reloaded.shopify);
        }
        resetFieldStates("shopify.");
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
        if (reloaded.amazon) {
          setAmazon(reloaded.amazon);
          setSavedAmazon(reloaded.amazon);
        }
        resetFieldStates("amazon.");
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

  async function handleSaveAmazonAds() {
    setSavingAmazonAds(true);
    setMessage(null);

    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amazon_ads: amazonAds }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Amazon Ads settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.amazon_ads) {
          setAmazonAds(reloaded.amazon_ads);
          setSavedAmazonAds(reloaded.amazon_ads);
        }
        resetFieldStates("amazonAds.");
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingAmazonAds(false);
    }
  }

  async function handleSaveShipBob() {
    setSavingShipbob(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipbob }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "ShipBob settings saved" });
        const reload = await apiFetch("/api/settings");
        const reloaded = await reload.json();
        if (reloaded.shipbob) {
          setShipbob(reloaded.shipbob);
          setSavedShipbob(reloaded.shipbob);
        }
        resetFieldStates("shipbob.");
      } else {
        setMessage({ type: "error", text: data.details || data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSavingShipbob(false);
    }
  }

  async function handleTestAmazonAds() {
    setTestingAmazonAds(true);
    setAmazonAdsTestResult(null);

    try {
      const res = await apiFetch("/api/test/amazon-ads");
      const data = await res.json();
      setAmazonAdsTestResult(data);
    } catch {
      setAmazonAdsTestResult({ success: false, message: "Request failed" });
    } finally {
      setTestingAmazonAds(false);
    }
  }

  // Detect unsaved changes per section
  const hasShopifyChanges = (
    ["client_id", "client_secret", "store_domain", "webhook_secret"] as const
  ).some((k) => shopify[k] !== savedShopify[k]);
  const hasFacebookAdsChanges = (
    Object.keys(facebookAds) as (keyof FacebookAdsForm)[]
  ).some((k) => facebookAds[k] !== savedFacebookAds[k]);
  const hasPosthogChanges = (
    Object.keys(posthog) as (keyof PosthogForm)[]
  ).some((k) => posthog[k] !== savedPosthog[k]);
  const hasMetaChanges = (Object.keys(meta) as (keyof MetaForm)[]).some(
    (k) => meta[k] !== savedMeta[k],
  );
  const hasAmazonChanges = (Object.keys(amazon) as (keyof AmazonForm)[]).some(
    (k) => amazon[k] !== savedAmazon[k],
  );
  const hasAmazonAdsChanges = (
    Object.keys(amazonAds) as (keyof AmazonAdsForm)[]
  ).some((k) => amazonAds[k] !== savedAmazonAds[k]);
  const hasShipBobChanges = shipbob.pat !== savedShipbob.pat || shipbob.enabled !== savedShipbob.enabled;

  // Reusable locked-input component
  function LockedInput({
    fieldKey,
    value,
    savedValue,
    onChange,
    placeholder,
    helpText,
    label,
    mono = false,
  }: {
    fieldKey: string;
    value: string;
    savedValue: string;
    onChange: (val: string) => void;
    placeholder: string;
    helpText: React.ReactNode;
    label: string;
    mono?: boolean;
  }) {
    const isLocked = savedValue !== "" && !editingFields.has(fieldKey);
    const isRevealed = visibleFields.has(fieldKey);
    const isEditing = editingFields.has(fieldKey);

    return (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>
        <div className="relative flex items-center gap-1.5">
          <input
            type={isLocked && !isRevealed ? "password" : "text"}
            value={isLocked && !isRevealed ? "••••••••••••" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={isLocked}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            className={`w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-sm ${
              mono ? "font-mono" : ""
            } ${
              isLocked
                ? "bg-zinc-100 dark:bg-zinc-800 opacity-60 cursor-not-allowed"
                : "bg-white dark:bg-zinc-900"
            }`}
          />
          {savedValue !== "" && (
            <div className="flex items-center gap-0.5 shrink-0">
              {isLocked && (
                <button
                  type="button"
                  onClick={() => toggleVisible(fieldKey)}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={isRevealed ? "Hide value" : "Show value"}
                >
                  {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleEditing(fieldKey, savedValue, onChange)}
                className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  isEditing
                    ? "text-amber-500 hover:text-amber-600"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
                title={isEditing ? "Cancel editing" : "Edit value"}
              >
                {isEditing ? <X size={16} /> : <Pencil size={16} />}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-400 mt-1">{helpText}</p>
      </div>
    );
  }

  // ── CSV Import Section ────────────────────────────────────────────────────
  function CsvImportSection({
    orgId,
    apiFetch,
  }: {
    orgId: number | undefined;
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  }) {
    const [file, setFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{
      imported: number;
      failed: number;
      total: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleImport() {
      if (!file || !orgId) return;
      setImporting(true);
      setResult(null);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await apiFetch("/api/orders/import-csv", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.details || data.error || "Import failed");
        } else {
          setResult({
            imported: data.imported,
            failed: data.failed,
            total: data.total,
          });
        }
      } catch {
        setError("Request failed");
      } finally {
        setImporting(false);
      }
    }

    return (
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold mb-1">Import Orders from CSV</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Upload a Shopify orders CSV export to import historical orders beyond
          the 60-day API limit. Export from Shopify Admin → Orders → Export →
          All orders.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">CSV File</label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">
                Choose file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setResult(null);
                    setError(null);
                  }}
                />
              </label>
              <span className="text-sm text-zinc-500">
                {file ? file.name : "No file selected"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50 w-40"
            >
              {importing ? "Importing..." : "Import Orders"}
            </button>
            {result && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {result.imported.toLocaleString()} of{" "}
                {result.total.toLocaleString()} orders imported
                {result.failed > 0 && ` (${result.failed} failed)`}
              </span>
            )}
            {error && (
              <span className="text-sm text-red-600 dark:text-red-400">
                Error: {error}
              </span>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Backfill Section ──────────────────────────────────────────────────────
  function BackfillSection({
    orgId,
    apiFetch,
  }: {
    orgId: number | undefined;
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  }) {
    const [startDate, setStartDate] = useState("2025-01-01");
    const [ordersState, setOrdersState] = useState<{
      running: boolean;
      count: number;
      failed: number;
      done: boolean;
      error: string | null;
    }>({ running: false, count: 0, failed: 0, done: false, error: null });
    const [customersState, setCustomersState] = useState<{
      running: boolean;
      count: number;
      failed: number;
      done: boolean;
      error: string | null;
    }>({ running: false, count: 0, failed: 0, done: false, error: null });

    async function runBackfill(type: "orders" | "customers") {
      if (!orgId) return;
      const setState = type === "orders" ? setOrdersState : setCustomersState;
      setState({
        running: true,
        count: 0,
        failed: 0,
        done: false,
        error: null,
      });

      let cursor: string | null = null;
      let total = 0;
      let totalFailed = 0;

      try {
        while (true) {
          const params = new URLSearchParams({ type });
          if (startDate) params.set("startDate", startDate);
          if (cursor) params.set("cursor", cursor);

          const res = await apiFetch(`/api/backfill/shopify?${params}`);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
          }

          const data = await res.json();
          total += data.upserted ?? 0;
          totalFailed += data.failed ?? 0;
          setState({
            running: true,
            count: total,
            failed: totalFailed,
            done: false,
            error: null,
          });

          if (!data.hasNextPage) break;
          cursor = data.endCursor;
        }
        setState({
          running: false,
          count: total,
          failed: totalFailed,
          done: true,
          error: null,
        });
      } catch (err) {
        setState({
          running: false,
          count: total,
          failed: totalFailed,
          done: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return (
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold mb-1">Data Backfill via API</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Import historical data from Shopify from the selected start date.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Leave empty to import all records.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {(["orders", "customers"] as const).map((type) => {
              const state = type === "orders" ? ordersState : customersState;
              const label = type === "orders" ? "Orders" : "Customers";
              return (
                <div key={type} className="flex items-center gap-3">
                  <button
                    onClick={() => runBackfill(type)}
                    disabled={
                      state.running ||
                      ordersState.running ||
                      customersState.running
                    }
                    className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50 w-40"
                  >
                    {state.running ? `Importing...` : `Backfill ${label}`}
                  </button>
                  <span className="text-sm text-zinc-500">
                    {state.running &&
                      `${state.count.toLocaleString()} ${label.toLowerCase()} imported${state.failed > 0 ? ` (${state.failed} failed)` : ""}`}
                    {state.done && (
                      <span
                        className={
                          state.failed > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-green-600 dark:text-green-400"
                        }
                      >
                        {state.count.toLocaleString()} {label.toLowerCase()}{" "}
                        imported
                        {state.failed > 0 ? `, ${state.failed} failed` : ""}
                      </span>
                    )}
                    {state.error && (
                      <span className="text-red-600 dark:text-red-400">
                        Error: {state.error}
                        {state.count > 0
                          ? ` (${state.count} imported before failure)`
                          : ""}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-6" />

        {/* Tab bar skeleton */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-8 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-t animate-pulse mx-1"
            />
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

  const allTabs: { key: SettingsTab; label: string; superAdminOnly?: boolean }[] = [
    { key: "shopify", label: "Shopify" },
    { key: "meta", label: "Meta" },
    { key: "posthog", label: "PostHog" },
    { key: "amazon", label: "Amazon" },
    { key: "logistics", label: "Logistics", superAdminOnly: true },
    { key: "expenses", label: "Expenses" },
    { key: "preferences", label: "Preferences" },
  ];
  const tabs = allTabs.filter((t) => !t.superAdminOnly || userRole === "super_admin");

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
              Connect your Shopify store using OAuth. Save your credentials
              first, then click &quot;Connect with Shopify&quot; to authorise
              access.
            </p>

            <div className="flex flex-col gap-4">
              <LockedInput
                fieldKey="shopify.store_domain"
                label="Store Domain"
                value={shopify.store_domain}
                savedValue={savedShopify.store_domain}
                onChange={(v) => setShopify({ ...shopify, store_domain: v })}
                placeholder="e.g. yourstore.myshopify.com"
                helpText="Your Shopify store domain (without https://)."
              />

              <LockedInput
                fieldKey="shopify.client_id"
                label="Client ID"
                value={shopify.client_id}
                savedValue={savedShopify.client_id}
                onChange={(v) => setShopify({ ...shopify, client_id: v })}
                placeholder="Client ID from Shopify Partner Dashboard"
                helpText="Partner Dashboard → Apps → [your app] → API credentials."
                mono
              />

              <LockedInput
                fieldKey="shopify.client_secret"
                label="Client Secret"
                value={shopify.client_secret}
                savedValue={savedShopify.client_secret}
                onChange={(v) => setShopify({ ...shopify, client_secret: v })}
                placeholder="shpss_xxxxx"
                helpText="Partner Dashboard → Apps → [your app] → Settings → Secret."
                mono
              />

              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-3">
                <label className="block text-sm font-medium mb-1">
                  Webhook URL
                </label>
                <code className="text-xs break-all">{webhookUrl}</code>
                <p className="text-xs text-zinc-400 mt-2">
                  Register this in Shopify Admin → Settings → Notifications →
                  Webhooks for &quot;Order creation&quot; and &quot;Order
                  update&quot; events (JSON format).
                </p>
              </div>

              <LockedInput
                fieldKey="shopify.webhook_secret"
                label="Webhook Signing Secret"
                value={shopify.webhook_secret}
                savedValue={savedShopify.webhook_secret}
                onChange={(v) => setShopify({ ...shopify, webhook_secret: v })}
                placeholder="e.g. fb0250d6cedb1d64..."
                helpText="Shopify Admin → Settings → Notifications → Webhooks → show the signing secret."
                mono
              />
            </div>

            <button
              onClick={handleSaveShopify}
              disabled={savingShopify || !hasShopifyChanges}
              className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
            >
              {savingShopify ? "Saving..." : "Save"}
            </button>

            <div className="mt-4 flex flex-col gap-3">
              {savedShopify.access_token && (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
                  Connected: {savedShopify.store_domain}
                </div>
              )}
              <button
                onClick={() => {
                  const domain =
                    shopify.store_domain || savedShopify.store_domain;
                  if (!domain || !currentOrg) return;
                  window.location.href = `/api/auth/shopify?shop=${encodeURIComponent(domain)}&orgId=${currentOrg.id}`;
                }}
                disabled={!shopify.store_domain && !savedShopify.store_domain}
                className="self-start px-4 py-2 bg-[#96BF48] hover:bg-[#85a93f] text-white rounded-md text-sm font-medium disabled:opacity-50"
              >
                {savedShopify.access_token
                  ? "Reconnect with Shopify"
                  : "Connect with Shopify"}
              </button>
            </div>
          </section>

          {/* Data Backfill - Super Admin Only */}
          {userRole === "super_admin" && (
            <BackfillSection orgId={currentOrg?.id} apiFetch={apiFetch} />
          )}

          {/* CSV Import - Super Admin Only */}
          {userRole === "super_admin" && (
            <CsvImportSection orgId={currentOrg?.id} apiFetch={apiFetch} />
          )}

          {/* Lifecycle Settings - Super Admin Only */}
          {userRole === "super_admin" && (
            <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
              <h2 className="text-lg font-semibold mb-1">Customer Lifecycle</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Configure the thresholds (in days since last order) for customer
                lifecycle stages.
              </p>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    New Customer (up to X days)
                  </label>
                  <input
                    type="number"
                    value={lifecycle.newMaxDays}
                    onChange={(e) =>
                      setLifecycle({
                        ...lifecycle,
                        newMaxDays: parseInt(e.target.value) || 0,
                      })
                    }
                    min={1}
                    className="w-32 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Customers with ≤{lifecycle.newMaxDays} days since last order
                    (or only 1 order) are &quot;New&quot;.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Due Reorder (up to X days)
                  </label>
                  <input
                    type="number"
                    value={lifecycle.reorderMaxDays}
                    onChange={(e) =>
                      setLifecycle({
                        ...lifecycle,
                        reorderMaxDays: parseInt(e.target.value) || 0,
                      })
                    }
                    min={lifecycle.newMaxDays + 1}
                    className="w-32 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Customers with {lifecycle.newMaxDays + 1}-
                    {lifecycle.reorderMaxDays} days since last order are
                    &quot;Due Reorder&quot;.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Lapsed (up to X days)
                  </label>
                  <input
                    type="number"
                    value={lifecycle.lapsedMaxDays}
                    onChange={(e) =>
                      setLifecycle({
                        ...lifecycle,
                        lapsedMaxDays: parseInt(e.target.value) || 0,
                      })
                    }
                    min={lifecycle.reorderMaxDays + 1}
                    className="w-32 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Customers with {lifecycle.reorderMaxDays + 1}-
                    {lifecycle.lapsedMaxDays} days are &quot;Lapsed&quot;.
                    Beyond {lifecycle.lapsedMaxDays} days = &quot;Lost&quot;.
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
        <div className="flex flex-col gap-6">
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Facebook Ads</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Connect your Facebook Ads account for ad spend, revenue, and ROAS
            reporting.
          </p>

          <div className="flex flex-col gap-4">
            <LockedInput
              fieldKey="facebookAds.access_token"
              label="Access Token"
              value={facebookAds.access_token}
              savedValue={savedFacebookAds.access_token}
              onChange={(v) => setFacebookAds({ ...facebookAds, access_token: v })}
              placeholder="EAAxxxxxxxx..."
              helpText={
                <>
                  A long-lived system user token from{" "}
                  <a
                    href="https://business.facebook.com/settings/system-users"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Meta Business Suite → System Users
                  </a>
                  . Requires{" "}
                  <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    ads_read
                  </code>{" "}
                  permission on the ad account.
                </>
              }
              mono
            />

            <LockedInput
              fieldKey="facebookAds.ad_account_id"
              label="Ad Account ID"
              value={facebookAds.ad_account_id}
              savedValue={savedFacebookAds.ad_account_id}
              onChange={(v) => setFacebookAds({ ...facebookAds, ad_account_id: v })}
              placeholder="act_123456789"
              helpText="Found in Facebook Ads Manager → Account Overview. Include the 'act_' prefix."
              mono
            />
          </div>

          <button
            onClick={handleSaveFacebookAds}
            disabled={savingFacebookAds || !hasFacebookAdsChanges}
            className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {savingFacebookAds ? "Saving..." : "Save"}
          </button>
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Sync Facebook Ads</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Pull Facebook Ads data for a date range directly from the Meta API and store it in the database.
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={fbBackfillStart}
                  onChange={(e) => setFbBackfillStart(e.target.value)}
                  className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={fbBackfillEnd}
                  onChange={(e) => setFbBackfillEnd(e.target.value)}
                  className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setFbBackfilling(true);
                  setFbBackfillResult(null);
                  try {
                    const res = await apiFetch("/api/backfill/facebook", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        start: fbBackfillStart || undefined,
                        end: fbBackfillEnd || undefined,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setFbBackfillResult(
                        `Done — ${data.daysProcessed} days, ${data.totalAds} ads fetched, ${data.totalInserted} rows upserted.`
                      );
                    } else {
                      setFbBackfillResult(`Error: ${data.error ?? "Unknown error"}`);
                    }
                  } catch {
                    setFbBackfillResult("Request failed");
                  } finally {
                    setFbBackfilling(false);
                  }
                }}
                disabled={fbBackfilling}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                {fbBackfilling ? "Syncing..." : "Run Sync"}
              </button>
              {fbBackfillResult && (
                <span className={`text-sm ${fbBackfillResult.startsWith("Error") || fbBackfillResult === "Request failed" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {fbBackfillResult}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Backfill Campaign IDs</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Populates the Meta Campaign ID on existing ad data rows by matching UTM campaign strings to your campaign mappings. Run this once after adding Meta Campaign IDs to your campaigns.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setBackfillingCampaignIds(true);
                setCampaignIdBackfillResult(null);
                try {
                  const res = await apiFetch("/api/backfill/facebook-utm", { method: "POST" });
                  const data = await res.json();
                  setCampaignIdBackfillResult(data.message ?? (res.ok ? "Done" : "Failed"));
                } catch {
                  setCampaignIdBackfillResult("Request failed");
                } finally {
                  setBackfillingCampaignIds(false);
                }
              }}
              disabled={backfillingCampaignIds}
              className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {backfillingCampaignIds ? "Running..." : "Run Backfill"}
            </button>
            {campaignIdBackfillResult && (
              <span className={`text-sm ${campaignIdBackfillResult.toLowerCase().includes("fail") || campaignIdBackfillResult === "Request failed" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{campaignIdBackfillResult}</span>
            )}
          </div>
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Meta / WhatsApp</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Credentials for the WhatsApp Business API and template management.
          </p>

          <div className="flex flex-col gap-4">
            <LockedInput
              fieldKey="meta.phone_number_id"
              label="Phone Number ID"
              value={meta.phone_number_id}
              savedValue={savedMeta.phone_number_id}
              onChange={(v) => setMeta({ ...meta, phone_number_id: v })}
              placeholder="e.g. 998388253356786"
              helpText="Found in Meta Business Suite → WhatsApp → Phone numbers. Used to identify the number messages are sent from."
            />

            <LockedInput
              fieldKey="meta.waba_id"
              label="WhatsApp Business Account ID (WABA ID)"
              value={meta.waba_id}
              savedValue={savedMeta.waba_id}
              onChange={(v) => setMeta({ ...meta, waba_id: v })}
              placeholder="e.g. 123456789012345"
              helpText="Found in Meta Business Suite → WhatsApp Accounts. Used to fetch approved message templates."
            />

            <LockedInput
              fieldKey="meta.access_token"
              label="Access Token"
              value={meta.access_token}
              savedValue={savedMeta.access_token}
              onChange={(v) => setMeta({ ...meta, access_token: v })}
              placeholder="System User token or temporary token"
              helpText={
                <>
                  System User token with{" "}
                  <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    whatsapp_business_messaging
                  </code>{" "}
                  permission. Create one in Meta Business Suite → System Users.
                </>
              }
              mono
            />
          </div>

          <button
            onClick={handleSaveMeta}
            disabled={savingMeta || !hasMetaChanges}
            className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {savingMeta ? "Saving..." : "Save"}
          </button>
        </section>
        </div>
      )}

      {/* ── PostHog Tab ────────────────────────────── */}
      {activeTab === "posthog" && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">PostHog</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Connect your PostHog project for website analytics (sessions,
            traffic sources, purchase funnel).
          </p>

          <div className="flex flex-col gap-4">
            <LockedInput
              fieldKey="posthog.api_key"
              label="API Key"
              value={posthog.api_key}
              savedValue={savedPosthog.api_key}
              onChange={(v) => setPosthog({ ...posthog, api_key: v })}
              placeholder="phx_xxxxx"
              helpText="PostHog → Project Settings → Personal API Keys. Create a key with read access to your project."
              mono
            />

            <LockedInput
              fieldKey="posthog.project_id"
              label="Project ID"
              value={posthog.project_id}
              savedValue={savedPosthog.project_id}
              onChange={(v) => setPosthog({ ...posthog, project_id: v })}
              placeholder="e.g. 39116"
              helpText="PostHog → Project Settings → Project ID (shown at the top of the page)."
            />

            <div>
              <label className="block text-sm font-medium mb-1">Host</label>
              <input
                type="text"
                value={posthog.host}
                onChange={(e) =>
                  setPosthog({ ...posthog, host: e.target.value })
                }
                placeholder="eu.posthog.com"
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-zinc-900 font-mono"
              />
              <p className="text-xs text-zinc-400 mt-1">
                <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                  eu.posthog.com
                </code>{" "}
                for EU cloud,{" "}
                <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                  us.posthog.com
                </code>{" "}
                for US cloud.
              </p>
            </div>
          </div>

          <button
            onClick={handleSavePosthog}
            disabled={savingPosthog || !hasPosthogChanges}
            className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {savingPosthog ? "Saving..." : "Save"}
          </button>
        </section>
      )}

      {/* ── Amazon Tab ────────────────────────────── */}
      {activeTab === "amazon" && (
        <div className="flex flex-col gap-6">
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold mb-1">Amazon SP-API</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Connect your Amazon Seller account for sales, traffic and
              financial reporting.
            </p>

            <div className="flex flex-col gap-4">
              <LockedInput
                fieldKey="amazon.client_id"
                label="Client ID"
                value={amazon.client_id}
                savedValue={savedAmazon.client_id}
                onChange={(v) => setAmazon({ ...amazon, client_id: v })}
                placeholder="amzn1.application-oa2-client.xxxxx"
                helpText={
                  <>
                    From Seller Central → Apps &amp; Services → Develop Apps →
                    your app → LWA credentials.
                  </>
                }
                mono
              />

              <LockedInput
                fieldKey="amazon.client_secret"
                label="Client Secret"
                value={amazon.client_secret}
                savedValue={savedAmazon.client_secret}
                onChange={(v) => setAmazon({ ...amazon, client_secret: v })}
                placeholder="Client secret from Amazon developer console"
                helpText="LWA client secret — shown once when you create the app. Store it securely."
                mono
              />

              <LockedInput
                fieldKey="amazon.refresh_token"
                label="Refresh Token"
                value={amazon.refresh_token}
                savedValue={savedAmazon.refresh_token}
                onChange={(v) => setAmazon({ ...amazon, refresh_token: v })}
                placeholder="Atzr|xxxxx"
                helpText={
                  <>
                    Generated when the seller authorizes your app via the SP-API
                    OAuth flow (starts with{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                      Atzr|
                    </code>
                    ).
                  </>
                }
                mono
              />

              <LockedInput
                fieldKey="amazon.marketplace_id"
                label="Marketplace ID"
                value={amazon.marketplace_id}
                savedValue={savedAmazon.marketplace_id}
                onChange={(v) => setAmazon({ ...amazon, marketplace_id: v })}
                placeholder="A1F83G8C2ARO7P"
                helpText={
                  <>
                    UK:{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                      A1F83G8C2ARO7P
                    </code>{" "}
                    &nbsp; DE:{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                      A1PA6795UKMFR9
                    </code>{" "}
                    &nbsp; US:{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                      ATVPDKIKX0DER
                    </code>
                  </>
                }
              />
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSaveAmazon}
                disabled={savingAmazon || !hasAmazonChanges}
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

          {/* ── Amazon Ads API ──────────────────────── */}
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold mb-1">Amazon Ads API</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Connect your Amazon Advertising account for Sponsored Products
              campaign data.
            </p>

            <div className="flex flex-col gap-4">
              <LockedInput
                fieldKey="amazonAds.client_id"
                label="Client ID"
                value={amazonAds.client_id}
                savedValue={savedAmazonAds.client_id}
                onChange={(v) => setAmazonAds({ ...amazonAds, client_id: v })}
                placeholder="amzn1.application-oa2-client.xxxxx"
                helpText="From the Amazon Ads developer console — this is a separate app from the SP-API."
                mono
              />

              <LockedInput
                fieldKey="amazonAds.client_secret"
                label="Client Secret"
                value={amazonAds.client_secret}
                savedValue={savedAmazonAds.client_secret}
                onChange={(v) =>
                  setAmazonAds({ ...amazonAds, client_secret: v })
                }
                placeholder="Client secret from Amazon Ads app"
                helpText="LWA client secret for your Amazon Ads application."
                mono
              />

              <LockedInput
                fieldKey="amazonAds.refresh_token"
                label="Refresh Token"
                value={amazonAds.refresh_token}
                savedValue={savedAmazonAds.refresh_token}
                onChange={(v) =>
                  setAmazonAds({ ...amazonAds, refresh_token: v })
                }
                placeholder="Atzr|xxxxx"
                helpText="Generated via the Amazon Ads OAuth flow. Separate from the SP-API refresh token."
                mono
              />

              <LockedInput
                fieldKey="amazonAds.profile_id"
                label="Profile ID"
                value={amazonAds.profile_id}
                savedValue={savedAmazonAds.profile_id}
                onChange={(v) => setAmazonAds({ ...amazonAds, profile_id: v })}
                placeholder="e.g. 366822873177837"
                helpText="Your Amazon Advertising profile ID. Found via the Profiles API or in the Ads console URL."
              />
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSaveAmazonAds}
                disabled={savingAmazonAds || !hasAmazonAdsChanges}
                className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                {savingAmazonAds ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleTestAmazonAds}
                disabled={testingAmazonAds}
                className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {testingAmazonAds ? "Testing..." : "Test Connection"}
              </button>
            </div>

            {amazonAdsTestResult && (
              <div
                className={`mt-3 p-3 rounded-md text-sm ${
                  amazonAdsTestResult.success
                    ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
                }`}
              >
                {amazonAdsTestResult.message}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Logistics Tab (Super Admin Only) ───────── */}
      {activeTab === "logistics" && (
        <div className="flex flex-col gap-6">
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
            <h2 className="text-lg font-semibold mb-1">ShipBob</h2>
            <p className="text-sm text-zinc-500 mb-5">
              Connect ShipBob as a 3PL integration to sync fulfilment inventory snapshots. Only enable for organisations using ShipBob.
            </p>

            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer mb-5">
              <div
                onClick={() => setShipbob({ ...shipbob, enabled: !shipbob.enabled })}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                  shipbob.enabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 transition-transform ${
                    shipbob.enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-medium">Enable ShipBob integration</p>
                <p className="text-xs text-zinc-400">
                  When enabled, inventory page shows ShipBob quantities and the daily sync cron runs for this org.
                </p>
              </div>
            </label>

            {/* PAT — only shown when enabled */}
            {shipbob.enabled && (
              <div className="flex flex-col gap-4">
                <LockedInput
                  fieldKey="shipbob.pat"
                  label="Personal Access Token"
                  value={shipbob.pat}
                  savedValue={savedShipbob.pat}
                  onChange={(v) => setShipbob({ ...shipbob, pat: v })}
                  placeholder="ShipBob PAT from developer settings"
                  helpText="Generate in ShipBob Developer Portal → Personal Access Tokens. Requires inventory read access."
                  mono
                />
              </div>
            )}

            <button
              onClick={handleSaveShipBob}
              disabled={savingShipbob || !hasShipBobChanges}
              className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
            >
              {savingShipbob ? "Saving..." : "Save"}
            </button>
          </section>
        </div>
      )}

      {/* ── Expenses Tab ────────────────────────────── */}
      {activeTab === "expenses" && (
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">Expenses</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Track recurring and one-off business expenses for profitability
            reporting.
          </p>
          <p className="text-sm text-zinc-400">
            Coming soon — expense categories and recurring costs will be
            configured here.
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

          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium mb-2">
                Display Currency
              </label>
              <p className="text-xs text-zinc-400 mb-2">
                Used as the fallback symbol for orders with no currency
                recorded. The currency symbol shown in reports and scorecards.
              </p>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                className="border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm w-48"
              >
                {[
                  ["GBP", "£ GBP"],
                  ["USD", "$ USD"],
                  ["EUR", "€ EUR"],
                  ["CAD", "CA$ CAD"],
                  ["AUD", "A$ AUD"],
                  ["NZD", "NZ$ NZD"],
                  ["CHF", "CHF"],
                  ["JPY", "¥ JPY"],
                  ["SEK", "kr SEK"],
                  ["NOK", "kr NOK"],
                  ["DKK", "kr DKK"],
                ].map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  setSavingPreferences(true);
                  try {
                    const res = await apiFetch("/api/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        preferences: { displayCurrency },
                      }),
                    });
                    if (res.ok)
                      setMessage({
                        type: "success",
                        text: "Preferences saved.",
                      });
                    else
                      setMessage({
                        type: "error",
                        text: "Failed to save preferences.",
                      });
                  } finally {
                    setSavingPreferences(false);
                  }
                }}
                disabled={savingPreferences}
                className="mt-5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                {savingPreferences ? "Saving..." : "Save"}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">
                Appearance
              </label>
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
                          option === "dark"
                            ? "bg-zinc-900"
                            : option === "light"
                              ? "bg-white"
                              : "bg-gradient-to-r from-white to-zinc-900"
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
          </div>
        </section>
      )}
    </div>
  );
}
