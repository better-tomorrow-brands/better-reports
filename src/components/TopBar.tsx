"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Search, Bell, ChevronRight } from "lucide-react";
import { useOrg, Org } from "@/contexts/OrgContext";
import { getTierDisplayName, type Subscription } from "@/lib/plans";
import { useState, useEffect, useRef } from "react";

export default function TopBar() {
  const pathname = usePathname();
  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  // Fetch subscription for current org
  useEffect(() => {
    if (!currentOrg?.id) {
      setSubscription(null);
      return;
    }

    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setSubscription(data?.subscription ?? null))
      .catch(() => setSubscription(null));
  }, [currentOrg?.id]);

  // Close org dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) {
        setOrgMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectOrg(org: Org) {
    setCurrentOrg(org);
    setOrgMenuOpen(false);
  }

  // Generate breadcrumbs from pathname
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, index) => ({
    label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "),
    href: "/" + pathSegments.slice(0, index + 1).join("/"),
  }));

  return (
    <header className="h-14 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center px-4 gap-4">
      {/* Left: Logo + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <div className="font-semibold text-sm">Better Reports</div>
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.href} className="flex items-center gap-1.5">
                <ChevronRight size={12} className="text-zinc-400 dark:text-zinc-600" />
                <span className={index === breadcrumbs.length - 1 ? "text-zinc-900 dark:text-zinc-100 font-medium" : ""}>
                  {crumb.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Search, Org Selector, Alerts, User */}
      <div className="ml-auto flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-64 pl-8 pr-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 rounded border border-zinc-200 dark:border-zinc-600">
            ⌘K
          </kbd>
        </div>

        {/* Org Selector */}
        {orgs.length > 0 && (
          <div className="relative" ref={orgMenuRef}>
            <button
              onClick={() => setOrgMenuOpen(!orgMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <span className="truncate max-w-32">{currentOrg?.name ?? "Select org"}</span>
              {subscription && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                    subscription.tier === "free"
                      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                      : subscription.tier === "free_trial"
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : subscription.tier === "enterprise"
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                      : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  }`}
                >
                  {getTierDisplayName(subscription.tier)}
                </span>
              )}
            </button>

            {orgMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 z-50 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSelectOrg(org)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <span className="truncate">{org.name}</span>
                    {currentOrg?.id === org.id && (
                      <span className="text-purple-600 dark:text-purple-400">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alerts */}
        <button className="p-1.5 rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <Bell size={16} />
        </button>

        {/* User */}
        <UserButton
          appearance={{
            elements: {
              userButtonBox: "text-zinc-900 dark:text-zinc-100",
              userButtonOuterIdentifier: "text-zinc-900 dark:text-zinc-100",
              avatarBox: "w-7 h-7",
            },
          }}
        />
      </div>
    </header>
  );
}
