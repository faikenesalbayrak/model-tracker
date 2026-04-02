"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ui/ThemeToggleClient";

const SUPPORTED_LOCALES = ["tr", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

type NavItem = { label: string; href: string };

function resolveLocale(pathname: string): Locale {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg === "en" ? "en" : "tr";
}

function swapLocale(pathname: string, locale: Locale): string {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) {
    return `/${locale}/overview`;
  }
  if (SUPPORTED_LOCALES.includes(segs[0] as Locale)) {
    segs[0] = locale;
    return `/${segs.join("/")}`;
  }
  return `/${locale}/${segs.join("/")}`;
}

function topLinks(locale: Locale) {
  return {
    overview: `/${locale}/overview`,
    modelsRoot: `/${locale}/models/overview`,
    newsRoot: `/${locale}/news`,
    models: [
      { label: "LLM", href: `/${locale}/models/llm` },
      { label: "Image", href: `/${locale}/models/image` },
      { label: "Video", href: `/${locale}/models/video` },
      { label: "TTS", href: `/${locale}/models/tts` },
      { label: "STT", href: `/${locale}/models/stt` },
      { label: "Embeddings", href: `/${locale}/models/embeddings` },
    ] satisfies NavItem[],
    news: [
      { label: "AI", href: `/${locale}/news/ai` },
      { label: "Aviation", href: `/${locale}/news/aviation` },
      { label: "Regulations", href: `/${locale}/news/regulations` },
      { label: "Releases", href: `/${locale}/news/releases` },
    ] satisfies NavItem[],
  };
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, locale: Locale, group: "models" | "agents" | "news"): boolean {
  return pathname === `/${locale}/${group}` || pathname.startsWith(`/${locale}/${group}/`);
}

function SubNavGroup({
  title,
  rootHref,
  items,
  pathname,
  active,
}: {
  title: string;
  rootHref: string;
  items: NavItem[];
  pathname: string;
  active: boolean;
}) {
  const rootActive = active || isActive(pathname, rootHref);
  const hasItems = items.length > 0;
  const isExpanded = hasItems && rootActive;
  const [isHovering, setIsHovering] = useState(false);
  const showItems = hasItems && (isExpanded || isHovering);

  return (
    <div
      className="group inline-flex h-12 flex-none items-center rounded-[var(--radius-panel)] px-2 py-1.5 transition-all duration-300"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        border: "1px solid rgba(148,163,184,0.3)",
        background: rootActive ? "rgba(255,255,255,0.08)" : "transparent",
      }}
    >
      <Link
        href={rootHref}
        className="relative inline-flex h-9 min-w-[7.5rem] items-center justify-center overflow-hidden rounded-[var(--radius-panel)] px-4 py-1.5 text-base font-semibold leading-none tracking-[0.02em] transition-all duration-200"
        style={{
          color: rootActive ? "#fff" : "rgba(226,232,240,0.88)",
          background: "transparent",
          border: rootActive ? "1px solid rgba(125,211,252,0.25)" : "1px solid transparent",
          boxShadow: rootActive ? "inset 0 -3px 0 rgba(34,211,238,0.95)" : "none",
          colorScheme: "dark",
          transform: "none",
        }}
      >
        <span className="relative z-10">{title}</span>
      </Link>
      {hasItems ? (
        <div
          className="grid items-center overflow-hidden transition-all duration-300 ease-out"
          style={{
            gridTemplateColumns: showItems ? "1fr" : "0fr",
            marginLeft: showItems ? "0.375rem" : "0",
            opacity: showItems ? 1 : 0,
          }}
        >
          <div className="inline-flex items-center gap-1.5 overflow-hidden">
            {items.map((item) => {
              const itemActive = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`subnav-chip inline-flex h-9 shrink-0 min-w-[5.5rem] items-center justify-center whitespace-nowrap rounded-[var(--radius-panel)] px-4 py-1.5 text-sm font-semibold leading-none transition-all duration-200 ${
                    itemActive ? "subnav-chip-active" : ""
                  }`}
                  style={{
                    background: itemActive
                      ? "linear-gradient(135deg, rgba(14,165,233,0.32) 0%, rgba(56,189,248,0.28) 55%, rgba(59,130,246,0.26) 100%)"
                      : "transparent",
                    border: itemActive ? "1px solid rgba(125,211,252,0.5)" : "1px solid transparent",
                    colorScheme: "dark",
                    color: itemActive ? "#fff" : "rgba(226,232,240,0.88)",
                    transform: "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const locale = resolveLocale(pathname);
  const links = useMemo(() => topLinks(locale), [locale]);
  const currentYear = new Date().getFullYear();
  const modelsActive = isGroupActive(pathname, locale, "models");
  const newsActive = isGroupActive(pathname, locale, "news");

  return (
    <>
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
        <div className="mx-auto w-full max-w-none px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <Link href={`/${locale}/overview`} className="inline-flex shrink-0 items-center">
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

            <span
              className="truncate text-center text-sm font-bold tracking-tight sm:text-base"
              style={{ color: "var(--text)" }}
            >
              AI Intelligence Dashboard
            </span>

            <div className="flex items-center justify-end gap-2">
              <div className="inline-flex rounded-full p-1" style={{ border: "1px solid var(--border)", background: "var(--surface-card)" }}>
                <Link
                  href={swapLocale(pathname, "tr")}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200"
                  style={{
                    background: locale === "tr" ? "var(--accent)" : "transparent",
                    color: locale === "tr" ? "#fff" : "var(--text-muted)",
                  }}
                >
                  TR
                </Link>
                <Link
                  href={swapLocale(pathname, "en")}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200"
                  style={{
                    background: locale === "en" ? "var(--accent)" : "transparent",
                    color: locale === "en" ? "#fff" : "var(--text-muted)",
                  }}
                >
                  EN
                </Link>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <nav
        className="mx-4 mb-5 mt-[-0.25rem] overflow-hidden rounded-[var(--radius-panel)] bg-slate-950 px-4 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.12)] sm:mx-6 lg:mx-8"
        style={{ borderRadius: "var(--radius-panel)" }}
      >
        <div className="hide-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto">
          <SubNavGroup
            title="Overview"
            rootHref={links.overview}
            items={[]}
            pathname={pathname}
            active={isActive(pathname, links.overview)}
          />
          <SubNavGroup title="Models" rootHref={links.modelsRoot} items={links.models} pathname={pathname} active={modelsActive} />
          <SubNavGroup title="News" rootHref={links.newsRoot} items={links.news} pathname={pathname} active={newsActive} />
        </div>
      </nav>

      <div className="flex-1">{children}</div>

      <footer
        className="mx-4 mb-4 mt-0 rounded-[var(--radius-panel)] sm:mx-6 lg:mx-8"
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
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Akıllı Otomasyon Müdürlüğü
            </p>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              © {currentYear} Turkish Technology
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
