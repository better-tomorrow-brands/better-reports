"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  // This component stays mounted across navigation
  // The pathname hook triggers re-render but Sidebar stays mounted
  usePathname(); // Subscribe to route changes to keep component alive

  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
