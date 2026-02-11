"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  // Read persisted preference on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  // Apply .dark class whenever theme changes
  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(t: Theme) {
      if (t === "dark") {
        root.classList.add("dark");
      } else if (t === "light") {
        root.classList.remove("dark");
      } else {
        // system — follow OS preference
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        prefersDark ? root.classList.add("dark") : root.classList.remove("dark");
      }
    }

    applyTheme(theme);

    // Keep in sync with OS changes when on "system"
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) =>
        e.matches ? root.classList.add("dark") : root.classList.remove("dark");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
