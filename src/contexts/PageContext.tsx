"use client";

import { createContext, useContext, ReactNode } from "react";

interface PageContextType {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

const PageContext = createContext<PageContextType | null>(null);

export function PageProvider({
  title,
  subtitle,
  actions,
  children
}: PageContextType & { children: ReactNode }) {
  return (
    <PageContext.Provider value={{ title, subtitle, actions }}>
      {children}
    </PageContext.Provider>
  );
}

export function usePageContext() {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error("usePageContext must be used within PageProvider");
  }
  return context;
}
