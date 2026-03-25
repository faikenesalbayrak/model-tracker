"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("tt-theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem("tt-theme", next);
  }

  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden />;
  }

  return (
    <button
      type="button"
      aria-label={theme === "light" ? "Koyu temaya geç" : "Açık temaya geç"}
      onClick={toggle}
      className="group relative flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-card)",
        color: "var(--text-muted)",
      }}
    >
      <span
        className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: "var(--accent-muted)" }}
        aria-hidden
      />
      <Sun
        aria-hidden
        className="absolute h-3.5 w-3.5 transition-all duration-200"
        style={{
          opacity: theme === "dark" ? 1 : 0,
          transform: theme === "dark" ? "scale(1) rotate(0deg)" : "scale(0.7) rotate(45deg)",
        }}
      />
      <Moon
        aria-hidden
        className="absolute h-3.5 w-3.5 transition-all duration-200"
        style={{
          opacity: theme === "light" ? 1 : 0,
          transform: theme === "light" ? "scale(1) rotate(0deg)" : "scale(0.7) rotate(-45deg)",
        }}
      />
    </button>
  );
}
