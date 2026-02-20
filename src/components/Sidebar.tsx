"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/contexts/OrgContext";

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
  const [role, setRole] = useState<string | null>(null);

  const { currentOrg } = useOrg();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setRole(data?.role ?? "user"))
      .catch(() => setRole("user"));
  }, []);

  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";
  const visibleLinks = navLinks.filter((link) => {
    if ((link as { superAdminOnly?: boolean }).superAdminOnly) return isSuperAdmin;
    if (link.adminOnly) return isAdmin;
    return true;
  });

  return (
    <aside
      className="flex flex-col shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 w-56"
    >
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
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Version */}
      {version && (
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
            Version {version.replace(/^v/, "")}
          </p>
        </div>
      )}
    </aside>
  );
}
