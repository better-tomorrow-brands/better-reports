"use client";

import { createContext, useContext, ReactNode, useState } from "react";

interface PageContextType {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  setPageInfo: (info: { title: string; subtitle?: string; actions?: ReactNode }) => void;
}

const PageContext = createContext<PageContextType | null>(null);

export function PageProvider({ children }: { children: ReactNode }) {
  const [pageInfo, setPageInfo] = useState({
    title: "",
    subtitle: undefined as string | undefined,
    actions: undefined as ReactNode | undefined,
  });

  return (
    <PageContext.Provider value={{ ...pageInfo, setPageInfo }}>
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
