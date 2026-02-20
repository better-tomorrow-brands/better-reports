"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { PanelLeftClose, PanelLeftOpen, ChevronDown, Check, Building2 } from "lucide-react";
import { useOrg, Org } from "@/contexts/OrgContext";
import { getTierDisplayName, type Subscription } from "@/lib/plans";

const navLinks = [
  { href: "/reports", label: "Reports" },
  { href: "/orders", label: "Orders", adminOnly: true },
  { href: "/customers", label: "Customers", adminOnly: true },
  { href: "/products", label: "Products", adminOnly: true },
  { href: "/campaigns", label: "Campaigns", adminOnly: true },
  { href: "/creatives", label: "Creatives", adminOnly: true },
  { href: "/users", label: "Users", adminOnly: true },
  { href: "/organizations", label: "Organizations", superAdminOnly: true },
  { href: "/subscriptions", label: "Subscriptions", superAdminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
];

const version = process.env.NEXT_PUBLIC_APP_VERSION;

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);

  // Collapse sidebar on narrow screens after hydration
  useEffect(() => {
    setIsOpen(window.innerWidth >= 768);
  }, []);
  const [role, setRole] = useState<string | null>(null);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const orgMenuRef = useRef<HTMLDivElement>(null);

  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setRole(data?.role ?? "user"))
      .catch(() => setRole("user"));
  }, []);

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

  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";
  const visibleLinks = navLinks.filter((link) => {
    if ((link as { superAdminOnly?: boolean }).superAdminOnly) return isSuperAdmin;
    if (link.adminOnly) return isAdmin;
    return true;
  });
  const showOrgSwitcher = orgs.length > 0;

  function handleSelectOrg(org: Org) {
    setCurrentOrg(org);
    setOrgMenuOpen(false);
  }

  return (
    <aside
      className={`flex flex-col shrink-0 border-r border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 transition-all duration-200 ${
        isOpen ? "w-56" : "w-14"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200 dark:border-zinc-700">
        {isOpen && (
          <Link href="/" className="font-semibold text-base px-2">
            Better Reports
          </Link>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? (
            <PanelLeftClose size={16} />
          ) : (
            <PanelLeftOpen size={16} />
          )}
        </button>
      </div>

      {/* Org Switcher */}
      {showOrgSwitcher && (
        <div className="px-2 py-2 border-b border-zinc-200 dark:border-zinc-700" ref={orgMenuRef}>
          {isOpen ? (
            <div className="relative">
              <button
                onClick={() => setOrgMenuOpen(!orgMenuOpen)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                  <span className="truncate">{currentOrg?.name ?? "Select org"}</span>
                  {subscription && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                        subscription.tier === "free"
                          ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
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
                </div>
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition-transform ${orgMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {orgMenuOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => handleSelectOrg(org)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <span className="truncate">{org.name}</span>
                      {currentOrg?.id === org.id && (
                        <Check size={13} className="shrink-0 text-zinc-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Collapsed: show org initial as icon button
            <button
              onClick={() => setIsOpen(true)}
              className="w-full flex justify-center items-center py-2 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={currentOrg?.name ?? "Select org"}
            >
              <Building2 size={16} />
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 py-2 text-sm flex-1">
        {visibleLinks.map((link) => {
          const isActive = link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-2.5 py-1.5 rounded text-xs whitespace-nowrap overflow-hidden transition-colors ${
                !isOpen ? "text-center" : ""
              } ${
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
              title={!isOpen ? link.label : undefined}
            >
              {isOpen ? link.label : link.label[0]}
            </Link>
          );
        })}
      </nav>

      {/* Version */}
      {isOpen && version && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-500 px-4 pb-2">
          Version {version.replace(/^v/, "")}
        </p>
      )}

      {/* Footer */}
      <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-700">
        <div className={isOpen ? "px-2" : "flex justify-center"}>
          <UserButton
            showName={isOpen}
            appearance={{
              elements: {
                userButtonBox: "text-zinc-900 dark:text-zinc-100",
                userButtonOuterIdentifier: "text-zinc-900 dark:text-zinc-100",
              },
            }}
          />
        </div>
      </div>
    </aside>
  );
}
