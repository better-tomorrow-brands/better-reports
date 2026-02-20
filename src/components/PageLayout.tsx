"use client";

import PageTitle from "@/components/PageTitle";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageLayout({ title, subtitle, actions, children }: PageLayoutProps) {
  return (
    <>
      {/* Full-width PageTitle */}
      <PageTitle title={title} subtitle={subtitle} actions={actions} />

      {/* Content Area (Sidebar is in AppShell) */}
      <div className="flex-1 min-w-0 bg-white dark:bg-black overflow-auto">
        {children}
      </div>
    </>
  );
}
