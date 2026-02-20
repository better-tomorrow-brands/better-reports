"use client";

import { PageProvider } from "@/contexts/PageContext";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageLayout({ title, subtitle, actions, children }: PageLayoutProps) {
  return (
    <PageProvider title={title} subtitle={subtitle} actions={actions}>
      {/* Content only - PageTitle is rendered by AppShell using context */}
      <div className="flex-1 min-w-0 overflow-auto">
        {children}
      </div>
    </PageProvider>
  );
}
