"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PageTitle from "@/components/PageTitle";
import { usePageContext } from "@/contexts/PageContext";

export default function AppShell({ children }: { children: React.ReactNode }) {
  // This component stays mounted across navigation
  usePathname(); // Subscribe to route changes

  const { title, subtitle, actions } = usePageContext();

  return (
    <>
      {/* Full-width PageTitle */}
      <PageTitle title={title} subtitle={subtitle} actions={actions} />

      {/* Sidebar + Content (below PageTitle) */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-black">
          {children}
        </div>
      </div>
    </>
  );
}
