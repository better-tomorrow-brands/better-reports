"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface Org {
  id: number;
  name: string;
  slug: string;
  role: string; // user's role within this org
}

interface OrgContextValue {
  orgs: Org[];
  currentOrg: Org | null;
  setCurrentOrg: (org: Org) => void;
  isLoading: boolean;
  /** fetch() wrapper that automatically injects X-Org-Id header */
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  currentOrg: null,
  setCurrentOrg: () => {},
  isLoading: true,
  apiFetch: (url, options) => fetch(url, options),
});

const STORAGE_KEY = "better-reports:org-id";

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Org | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.ok ? r.json() : { orgs: [] })
      .then(({ orgs: fetchedOrgs }: { orgs: Org[] }) => {
        if (!fetchedOrgs?.length) {
          setIsLoading(false);
          return;
        }
        setOrgs(fetchedOrgs);

        // Restore previously selected org, fall back to first
        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = savedId
          ? fetchedOrgs.find((o) => o.id === Number(savedId))
          : null;
        setCurrentOrgState(saved ?? fetchedOrgs[0]);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const setCurrentOrg = useCallback((org: Org) => {
    setCurrentOrgState(org);
    localStorage.setItem(STORAGE_KEY, String(org.id));
  }, []);

  const apiFetch = useCallback((url: string, options?: RequestInit): Promise<Response> => {
    return fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        ...(currentOrg ? { "X-Org-Id": String(currentOrg.id) } : {}),
      },
    });
  }, [currentOrg]);

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, setCurrentOrg, isLoading, apiFetch }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
