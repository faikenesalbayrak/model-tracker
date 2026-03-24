"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useLayoutEffect, useMemo } from "react";

type ThemeSetting = "light";
type ResolvedTheme = "light";

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setTheme: (value: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
function applyLightThemeToDocument() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add("light");
}

export function Providers({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    applyLightThemeToDocument();
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme: "light",
      resolvedTheme: "light",
      setTheme: () => {
        applyLightThemeToDocument();
      },
    }),
    [],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within Providers");
  }
  return context;
}
