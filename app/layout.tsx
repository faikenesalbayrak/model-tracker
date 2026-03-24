import type { Metadata } from "next";
import localFont from "next/font/local";
import type { CSSProperties } from "react";
import "./globals.css";
import { brandThemeCssVars } from "@/lib/theme";
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
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${gilmer.variable} h-full antialiased`}
      style={brandThemeCssVars as CSSProperties}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
