import type { Metadata } from "next";
import localFont from "next/font/local";
import type { CSSProperties } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { brandThemeCssVars } from "@/lib/theme";
import { Providers } from "@/components/Providers";
import { AppChrome } from "@/components/AppChrome";

const gilmer = localFont({
  src: [
    { path: "../style/fonts/Gilmer Light.otf", weight: "300", style: "normal" },
    { path: "../style/fonts/Gilmer Regular.otf", weight: "400", style: "normal" },
    { path: "../style/fonts/Gilmer Medium.otf", weight: "500", style: "normal" },
    { path: "../style/fonts/Gilmer Bold.otf", weight: "700", style: "normal" },
    { path: "../style/fonts/Gilmer Heavy.otf", weight: "800", style: "normal" },
  ],
  variable: "--font-gilmer",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Intelligence Dashboard",
  description: "Turkish Technology için yapay zeka model, agent ve benchmark takibi.",
  icons: {
    icon: "/icon.png?v=20260325",
    shortcut: "/favicon.ico?v=20260325",
    apple: "/apple-icon.png?v=20260325",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${gilmer.variable} h-full antialiased light`}
      style={brandThemeCssVars as CSSProperties}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <Providers>
          <AppChrome>{children}</AppChrome>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
