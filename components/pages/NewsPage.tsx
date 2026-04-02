"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AiNewsItem, Locale } from "@/components/dashboard-types";
import { buildNewsBento, layoutClassForVariant, variantForIndex } from "@/lib/news-bento";

export type NewsSection = "overview" | "ai" | "aviation" | "regulations" | "releases";

const copy = {
  en: {
    empty: "No news records available.",
    loading: "Loading news...",
    readMore: "Open story",
  },
  tr: {
    empty: "Haber kaydı bulunamadı.",
    loading: "Haberler yükleniyor...",
    readMore: "Haberi aç",
  },
} as const;

const ACCENT_PALETTES: Array<{ top: string; wash: string; badge: string }> = [
  { top: "linear-gradient(90deg,#22d3ee,#3b82f6)", wash: "linear-gradient(135deg, rgba(34,211,238,.12), rgba(59,130,246,.08))", badge: "rgba(34,211,238,.18)" },
  { top: "linear-gradient(90deg,#38bdf8,#14b8a6)", wash: "linear-gradient(135deg, rgba(56,189,248,.12), rgba(20,184,166,.08))", badge: "rgba(56,189,248,.18)" },
  { top: "linear-gradient(90deg,#f59e0b,#f97316)", wash: "linear-gradient(135deg, rgba(245,158,11,.12), rgba(249,115,22,.08))", badge: "rgba(245,158,11,.18)" },
  { top: "linear-gradient(90deg,#a78bfa,#6366f1)", wash: "linear-gradient(135deg, rgba(167,139,250,.12), rgba(99,102,241,.08))", badge: "rgba(167,139,250,.18)" },
  { top: "linear-gradient(90deg,#fb7185,#ef4444)", wash: "linear-gradient(135deg, rgba(251,113,133,.12), rgba(239,68,68,.08))", badge: "rgba(251,113,133,.18)" },
  { top: "linear-gradient(90deg,#84cc16,#22c55e)", wash: "linear-gradient(135deg, rgba(132,204,22,.12), rgba(34,197,94,.08))", badge: "rgba(132,204,22,.18)" },
];

function sectionText(locale: Locale, section: NewsSection) {
  const map = {
    en: {
      overview: {
        title: "AI News",
        subtitle: "Dedicated news stream separated from the model overview.",
      },
      ai: {
        title: "AI News · AI",
        subtitle: "AI ecosystem headlines and platform updates.",
      },
      aviation: {
        title: "AI News · Aviation",
        subtitle: "Aviation-focused AI transformation and industry use-cases.",
      },
      regulations: {
        title: "AI News · Regulations",
        subtitle: "Policy, governance, compliance, and regulation developments.",
      },
      releases: {
        title: "AI News · Releases",
        subtitle: "New product and model release announcements.",
      },
    },
    tr: {
      overview: {
        title: "AI News",
        subtitle: "Model overview'den ayrılmış özel haber akışı.",
      },
      ai: {
        title: "AI News · AI",
        subtitle: "AI ekosistemi gündemi ve platform güncellemeleri.",
      },
      aviation: {
        title: "AI News · Aviation",
        subtitle: "Havacılık odaklı AI dönüşümü ve kullanım senaryoları.",
      },
      regulations: {
        title: "AI News · Regulations",
        subtitle: "Politika, yönetişim, uyumluluk ve regülasyon gelişmeleri.",
      },
      releases: {
        title: "AI News · Releases",
        subtitle: "Yeni ürün ve model duyuruları.",
      },
    },
  } as const;

  return map[locale][section];
}

export function NewsPage({ locale, section = "overview" }: { locale: Locale; section?: NewsSection }) {
  const [items, setItems] = useState<AiNewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void fetch("/api/ai-news", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ data?: AiNewsItem[]; items?: AiNewsItem[] } | AiNewsItem[]>)
      .then((payload) => {
        if (!alive) return;
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(payload.items)
              ? payload.items
              : [];
        setItems(rows);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const strings = copy[locale];
  const sectionCopy = sectionText(locale, section);
  const bentoItems = useMemo(() => buildNewsBento(items), [items]);

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{sectionCopy.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sectionCopy.subtitle}</p>
      </div>

      {loading ? (
        <div aria-label={strings.loading} className="grid grid-cols-1 gap-3 md:grid-cols-6 md:auto-rows-[8.75rem]">
          {Array.from({ length: 10 }).map((_, idx) => {
            const variant = variantForIndex(idx);
            return (
              <div
                key={idx}
                className={`${layoutClassForVariant(variant)} animate-pulse rounded-[var(--radius-card)]`}
                style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
              />
            );
          })}
        </div>
      ) : bentoItems.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{strings.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6 md:auto-rows-[8.75rem]">
          {bentoItems.map((item) => {
            const palette = ACCENT_PALETTES[item.accentIndex % ACCENT_PALETTES.length];
            return (
              <a
                key={item.id}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className={`${item.layoutClass} group relative block overflow-hidden rounded-[var(--radius-card)] border p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70`}
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--surface-subtle)",
                  backgroundImage: palette.wash,
                }}
                aria-label={item.title}
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: palette.top }} />

                <div className="mb-2 flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
                  <span
                    className="inline-flex max-w-[70%] truncate rounded-full px-2 py-0.5"
                    style={{ background: palette.badge, color: "var(--text-muted)" }}
                  >
                    {item.source}
                  </span>
                  <span className="tabular-nums">{formatDate(item.publishedAt, locale)}</span>
                </div>

                <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>
                  {item.title}
                </h3>

                <p className="mt-2 hidden text-xs sm:block" style={summaryClampStyle}>
                  {item.timeAgo ?? (locale === "tr" ? "Yeni haber" : "Fresh story")}
                </p>

                <span className="mt-3 inline-flex text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {strings.readMore}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
    month: "short",
    day: "2-digit",
  });
}

const summaryClampStyle: CSSProperties = {
  color: "var(--text-faint)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
