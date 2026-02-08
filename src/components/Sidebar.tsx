"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const navLinks = [
  { href: "/reports", label: "Reports" },
  { href: "/orders", label: "Orders", adminOnly: true },
  { href: "/customers", label: "Customers", adminOnly: true },
  { href: "/inventory", label: "Inventory", adminOnly: true },
  { href: "/campaigns", label: "Campaigns", adminOnly: true },
  { href: "/users", label: "Users", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
];

const version = process.env.NEXT_PUBLIC_APP_VERSION;

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setRole(data?.role ?? "user"))
      .catch(() => setRole("user"));
  }, []);

  const isAdmin = role === "admin" || role === "super_admin";
  const visibleLinks = navLinks.filter((link) => !link.adminOnly || isAdmin);

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

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 text-sm flex-1">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap overflow-hidden ${
              !isOpen ? "text-center" : ""
            }`}
            title={!isOpen ? link.label : undefined}
          >
            {isOpen ? link.label : link.label[0]}
          </Link>
        ))}
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
          <UserButton showName={isOpen} />
        </div>
      </div>
    </aside>
  );
}
