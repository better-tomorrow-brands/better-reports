"use client";

import { useState } from "react";
import { ShopifyChart } from "@/components/reports/ShopifyChart";
import { AmazonChart } from "@/components/reports/AmazonChart";
import { FacebookAdsChart } from "@/components/reports/FacebookAdsChart";
import { FacebookCampaignsTable } from "@/components/reports/FacebookCampaignsTable";

const tabs = [
  { key: "campaigns", label: "Dashboard" },
  { key: "cashflow", label: "Cashflow" },
  { key: "amazon", label: "Amazon" },
  { key: "shopify", label: "Shopify" },
  { key: "facebook-ads", label: "Facebook Ads" },
  { key: "sessions", label: "Sessions" },
  { key: "traffic", label: "Traffic" },
  { key: "ecommerce", label: "E-commerce" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("campaigns");

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Reports</h1>
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
        {activeTab === "amazon" ? (
          <AmazonChart />
        ) : activeTab === "shopify" ? (
          <ShopifyChart />
        ) : activeTab === "facebook-ads" ? (
          <FacebookAdsChart />
        ) : activeTab === "campaigns" ? (
          <FacebookCampaignsTable />
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
