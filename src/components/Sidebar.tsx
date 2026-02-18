"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { PanelLeftClose, PanelLeftOpen, ChevronDown, Check, Building2 } from "lucide-react";
import { useOrg, Org } from "@/contexts/OrgContext";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/orders", label: "Orders", adminOnly: true },
  { href: "/customers", label: "Customers", adminOnly: true },
  { href: "/products", label: "Products", adminOnly: true },
  { href: "/inventory", label: "Inventory", adminOnly: true },
  { href: "/campaigns", label: "Campaigns", adminOnly: true },
  { href: "/users", label: "Users", adminOnly: true },
  { href: "/organizations", label: "Organizations", superAdminOnly: true },
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
  const orgMenuRef = useRef<HTMLDivElement>(null);

  const { orgs, currentOrg, setCurrentOrg } = useOrg();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setRole(data?.role ?? "user"))
      .catch(() => setRole("user"));
  }, []);

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
      className={`flex flex-col shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 transition-all duration-200 ${
        isOpen ? "w-56" : "w-14"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4">
        {isOpen && (
          <Link href="/" className="font-semibold text-lg px-2">
            Better Reports
          </Link>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? (
            <PanelLeftClose size={18} />
          ) : (
            <PanelLeftOpen size={18} />
          )}
        </button>
      </div>

      {/* Org Switcher */}
      {showOrgSwitcher && (
        <div className="px-3 pb-2" ref={orgMenuRef}>
          {isOpen ? (
            <div className="relative">
              <button
                onClick={() => setOrgMenuOpen(!orgMenuOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <span className="truncate">{currentOrg?.name ?? "Select org"}</span>
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
      <nav className="flex flex-col gap-1 px-3 text-sm flex-1">
        {visibleLinks.map((link) => {
          const isActive = link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-md whitespace-nowrap overflow-hidden transition-colors ${
                !isOpen ? "text-center" : ""
              } ${
                isActive
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
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
        <p className="text-xs text-zinc-400 px-5 pb-2">
          Version {version.replace(/^v/, "")}
        </p>
      )}

      {/* Footer */}
      <div className="px-3 py-4 border-t border-zinc-200 dark:border-zinc-800">
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
