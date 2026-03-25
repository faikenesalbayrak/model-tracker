import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { CSSProperties } from "react";
import "./globals.css";
import { brandThemeCssVars } from "@/lib/theme";
import { BrandLogo } from "@/components/BrandLogo";
import { Providers } from "@/components/Providers";
import { ThemeToggle } from "@/components/ui/ThemeToggleClient";

const gilmer = localFont({
  src: [
    {
      path: "../style/fonts/Gilmer Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../style/fonts/Gilmer Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../style/fonts/Gilmer Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../style/fonts/Gilmer Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../style/fonts/Gilmer Heavy.otf",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-gilmer",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Intelligence Dashboard",
  description:
    "Turkish Technology için yapay zeka model, benchmark ve fiyat-performans takibi.",
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();

  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${gilmer.variable} h-full antialiased light`}
      style={brandThemeCssVars as CSSProperties}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <Providers>
          <header
            className="app-sticky-header sticky top-2 z-40 mx-4 mb-5 rounded-[var(--radius-panel)] sm:mx-6 lg:mx-8"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-card)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div className="mx-auto grid w-full max-w-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="inline-flex shrink-0 items-center justify-self-start">
                <span className="sr-only">Turkish Technology Home</span>
                <BrandLogo
                  variant="dark-horizontal-stacked"
                  width={130}
                  className="hidden h-6 w-auto dark:block"
                  alt="Turkish Technology"
                />
                <BrandLogo
                  variant="light-horizontal-stacked"
                  width={130}
                  className="h-6 w-auto dark:hidden"
                  alt="Turkish Technology"
                />
              </Link>
              <span className="truncate text-center text-sm font-bold tracking-tight sm:text-base" style={{ color: "var(--text)" }}>
                LLM Dashboard
              </span>
              <div className="flex items-center justify-self-end gap-2">
                <div
                  id="dashboard-header-controls"
                  className="flex items-center gap-2"
                />
                <ThemeToggle />
              </div>
            </div>
          </header>

          <div className="flex-1">{children}</div>

          <footer
            className="mx-4 mt-0 mb-4 rounded-[var(--radius-panel)] sm:mx-6 lg:mx-8"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-card)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div className="mx-auto flex w-full max-w-none flex-col items-start gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <BrandLogo
                variant="dark-horizontal-stacked"
                width={110}
                className="hidden h-5 w-auto dark:block"
                alt="Turkish Technology"
              />
              <BrandLogo
                variant="light-horizontal-stacked"
                width={110}
                className="h-5 w-auto dark:hidden"
                alt="Turkish Technology"
              />
              <div className="flex flex-col gap-0.5 lg:items-end">
                <p
                  className="text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  LLM Dashboard — Akıllı Otomasyon Müdürlüğü
                </p>
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  © {year} Turkish Technology
                </p>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
