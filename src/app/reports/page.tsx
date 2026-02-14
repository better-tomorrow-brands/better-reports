"use client";

import { useState, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { ShopifyChart } from "@/components/reports/ShopifyChart";
import { AmazonChart } from "@/components/reports/AmazonChart";
import { OverallChart } from "@/components/reports/OverallChart";
import { FacebookAdsChart } from "@/components/reports/FacebookAdsChart";
import { FacebookCampaignsTable } from "@/components/reports/FacebookCampaignsTable";
import { SessionsChart } from "@/components/reports/SessionsChart";
import { TrafficChart } from "@/components/reports/TrafficChart";
import { EcommerceChart } from "@/components/reports/EcommerceChart";

const tabs = [
  { key: "campaigns", label: "Dashboard" },
  { key: "cashflow", label: "Cashflow" },
  { key: "overall", label: "Overall" },
  { key: "amazon", label: "Amazon" },
  { key: "shopify", label: "Shopify" },
  { key: "facebook-ads", label: "Facebook Ads" },
  { key: "sessions", label: "Sessions" },
  { key: "traffic", label: "Traffic" },
  { key: "ecommerce", label: "E-commerce" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function ReportsPage() {
  const { apiFetch } = useOrg();
  const [activeTab, setActiveTab] = useState<TabKey>("campaigns");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiFetch("/api/reports/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || "Sync failed");
      } else {
        setSyncMessage(data.summary);
      }
    } catch {
      setSyncMessage("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 8000);
    }
  }, [apiFetch]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Reports</h1>
          <div className="relative">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {syncing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {syncing ? "Syncing..." : "Sync All"}
            </button>
            {syncMessage && (
              <div className="absolute top-full mt-1 right-0 whitespace-nowrap bg-zinc-800 text-white text-xs px-3 py-1.5 rounded shadow-lg z-50">
                {syncMessage}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap shrink-0 ${
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
        {activeTab === "overall" ? (
          <OverallChart />
        ) : activeTab === "amazon" ? (
          <AmazonChart />
        ) : activeTab === "shopify" ? (
          <ShopifyChart />
        ) : activeTab === "facebook-ads" ? (
          <FacebookAdsChart />
        ) : activeTab === "campaigns" ? (
          <FacebookCampaignsTable />
        ) : activeTab === "sessions" ? (
          <SessionsChart />
        ) : activeTab === "traffic" ? (
          <TrafficChart />
        ) : activeTab === "ecommerce" ? (
          <EcommerceChart />
        ) : (
          tabs
            .filter((tab) => tab.key === activeTab)
            .map((tab) => (
              <div key={tab.key} className="pt-4 text-zinc-500 dark:text-zinc-400">
                {tab.label} — coming soon
              </div>
            ))
        )}
      </div>
    </div>
  );
}
