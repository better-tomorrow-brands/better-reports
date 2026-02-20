"use client";

import { createContext, useContext, ReactNode, useState } from "react";

interface PageInfo {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

interface PageContextType extends PageInfo {
  setPageInfo: (info: PageInfo) => void;
}

const PageContext = createContext<PageContextType | null>(null);

export function PageProvider({ children }: { children: ReactNode }) {
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    title: "",
    subtitle: undefined,
    actions: undefined,
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
