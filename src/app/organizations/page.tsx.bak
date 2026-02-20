"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface OrgRow {
  id: number;
  name: string;
  slug: string;
}

export default function OrganizationsPage() {
  const router = useRouter();

  const [allOrgs, setAllOrgs] = useState<OrgRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const fetchAllOrgs = useCallback(async () => {
    setOrgsLoading(true);
    try {
      const res = await fetch("/api/organizations");
      const data = await res.json();
      setAllOrgs(data.orgs ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load organizations" });
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllOrgs();
  }, [fetchAllOrgs]);

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setMessage(null);
    try {
      const slug = newOrgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim(), slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to create org" });
        return;
      }
      setNewOrgName("");
      setMessage({ type: "success", text: `"${data.org.name}" created` });
      fetchAllOrgs();
    } catch {
      setMessage({ type: "error", text: "Failed to create org" });
    } finally {
      setCreatingOrg(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Organizations</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage organizations and their members</p>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-md text-sm border ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Create org */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-5">
        <h2 className="text-base font-semibold mb-3">New Organization</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()}
            placeholder="Organization name"
            className="flex-1 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
          />
          <button
            onClick={handleCreateOrg}
            disabled={creatingOrg || !newOrgName.trim()}
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {creatingOrg ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      {/* Org list */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        {orgsLoading ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-4 w-36 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-1.5" />
                <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : allOrgs.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">No organizations yet</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {allOrgs.map((org) => (
              <button
                key={org.id}
                onClick={() => router.push(`/organizations/${org.id}`)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{org.name}</span>
                  <span className="text-xs text-zinc-400 ml-2">{org.slug}</span>
                </div>
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
