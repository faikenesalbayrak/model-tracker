import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { CSSProperties } from "react";
import "./globals.css";
import { brandThemeCssVars } from "@/lib/theme";
import { BrandLogo } from "@/components/BrandLogo";
import { Providers } from "@/components/Providers";

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
          <header className="app-sticky-header sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
            <div className="mx-auto flex w-full max-w-none items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="inline-flex items-center">
                <span className="sr-only">Turkish Technology Home</span>
                <BrandLogo
                  variant="dark-horizontal-stacked"
                  width={140}
                  className="hidden h-6 w-auto dark:block"
                  alt="Turkish Technology"
                />
                <BrandLogo
                  variant="light-horizontal-stacked"
                  width={140}
                  className="h-6 w-auto dark:hidden"
                  alt="Turkish Technology"
                />
              </Link>
              <div
                id="dashboard-header-controls"
                className="flex items-center gap-2"
              />
            </div>
          </header>
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-200/70 bg-white/70 py-6 dark:border-white/10 dark:bg-slate-950/70">
            <div className="mx-auto flex w-full max-w-none flex-col gap-2 px-4 text-sm text-slate-600 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 dark:text-slate-300">
              <p>LLM Dashboard by Turkish Technology</p>
              <p>{year} - Akıllı Otomasyon Müdürlüğü</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
