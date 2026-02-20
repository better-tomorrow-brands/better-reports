"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { getTierDisplayName, type PlanTier } from "@/lib/plans";

interface OrgSubscription {
  orgId: number;
  orgName: string;
  tier: PlanTier | null;
  status: string | null;
  maxUsers: number | null;
  maxDataSources: number | null;
  maxAccounts: number | null;
  dataRefreshInterval: string | null;
}

export default function SubscriptionsPage() {
  const { apiFetch } = useOrg();
  const [subscriptions, setSubscriptions] = useState<OrgSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<PlanTier>("free");

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    try {
      const res = await apiFetch("/api/subscriptions/all");
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to load subscriptions" });
    } finally {
      setLoading(false);
    }
  }

  async function updateTier(orgId: number, tier: PlanTier) {
    try {
      const res = await apiFetch("/api/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, tier }),
      });

      if (!res.ok) throw new Error("Failed to update tier");

      setMessage({ type: "success", text: "Tier updated successfully" });
      setEditingOrgId(null);
      await loadSubscriptions();
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded mb-2 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Subscriptions Management</h1>

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

      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold">Organization</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Current Plan</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Status</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Limits</th>
              <th className="text-left px-4 py-3 text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {subscriptions.map((sub) => (
              <tr key={sub.orgId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                <td className="px-4 py-3 text-sm font-medium">{sub.orgName}</td>
                <td className="px-4 py-3">
                  {editingOrgId === sub.orgId ? (
                    <select
                      value={selectedTier}
                      onChange={(e) => setSelectedTier(e.target.value as PlanTier)}
                      className="border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-sm"
                    >
                      <option value="free">Free (Default)</option>
                      <option value="free_trial">Free Trial (Early Adopters)</option>
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        !sub.tier || sub.tier === "free"
                          ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                          : sub.tier === "free_trial"
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200"
                          : sub.tier === "enterprise"
                          ? "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200"
                          : "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200"
                      }`}
                    >
                      {sub.tier ? getTierDisplayName(sub.tier) : "No Plan"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="capitalize">{sub.status || "—"}</span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {sub.tier ? (
                    <div>
                      {sub.maxUsers ?? "∞"} users · {sub.maxDataSources ?? "∞"} sources ·{" "}
                      {sub.maxAccounts ?? "∞"} accounts · {sub.dataRefreshInterval || "weekly"}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingOrgId === sub.orgId ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateTier(sub.orgId, selectedTier)}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingOrgId(null)}
                        className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 text-sm rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingOrgId(sub.orgId);
                        setSelectedTier(sub.tier || "free");
                      }}
                      className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm rounded-md hover:bg-amber-200 dark:hover:bg-amber-900/50"
                    >
                      Change Plan
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {subscriptions.length === 0 && (
          <div className="text-center py-12 text-zinc-400 text-sm">
            No organizations found.
          </div>
        )}
      </section>
    </div>
  );
}
