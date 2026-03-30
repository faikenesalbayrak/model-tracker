"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiNewsItem, Locale } from "@/components/dashboard-types";

export type NewsSection = "overview" | "ai" | "aviation" | "regulations" | "releases";

const copy = {
  en: {
    empty: "No news records available.",
    loading: "Loading news...",
  },
  tr: {
    empty: "Haber kaydı bulunamadı.",
    loading: "Haberler yükleniyor...",
  },
} as const;

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
  const sorted = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    [items],
  );

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
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{strings.empty}</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => (
            <article
              key={item.id}
              className="rounded-xl px-4 py-3"
              style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
            >
              <a href={item.link} target="_blank" rel="noreferrer" className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {item.title}
              </a>
              <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                {item.source} · {new Date(item.publishedAt).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
