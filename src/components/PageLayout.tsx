"use client";

import { useEffect } from "react";
import { usePageContext } from "@/contexts/PageContext";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageLayout({ title, subtitle, actions, children }: PageLayoutProps) {
  const { setPageInfo } = usePageContext();

  useEffect(() => {
    setPageInfo({ title, subtitle, actions });
  }, [title, subtitle, actions, setPageInfo]);

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      {children}
    </div>
  );
}
