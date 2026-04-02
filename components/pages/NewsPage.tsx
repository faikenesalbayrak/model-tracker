"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AiNewsItem, Locale } from "@/components/dashboard-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNewsBento } from "@/lib/news-bento";
import { sanitizeNewsDescription } from "@/lib/news-display";

export type NewsSection = "overview" | "ai" | "aviation" | "regulations" | "releases";

const copy = {
  en: {
    empty: "No news records available.",
    loading: "Loading news...",
    readMore: "Open Story",
  },
  tr: {
    empty: "Haber kaydı bulunamadı.",
    loading: "Haberler yükleniyor...",
    readMore: "Haberi Aç",
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

function toGridStyle(item: { colStart: number; rowStart: number; colSpan: number; rowSpan: number }): CSSProperties {
  return {
    "--news-col": `${item.colStart} / span ${item.colSpan}`,
    "--news-row": `${item.rowStart} / span ${item.rowSpan}`,
  } as CSSProperties;
}

function fallbackDescription(item: AiNewsItem, locale: Locale): string {
  const fromPayload = sanitizeNewsDescription(item.description ?? null);
  if (fromPayload) return fromPayload;
  const fromLegacy = sanitizeNewsDescription(item.timeAgo ?? null);
  if (fromLegacy) return fromLegacy;
  return locale === "tr" ? "Detaylar için haberi açabilirsiniz." : "Open the story for full details.";
}

function sourceLabel(item: AiNewsItem): string {
  const sourceDisplay = (item.sourceDisplay ?? "").trim();
  if (sourceDisplay) return sourceDisplay;
  return item.source;
}

function makeLoadingItems(count: number): AiNewsItem[] {
  return Array.from({ length: count }).map((_, idx) => ({
    id: `skeleton-${idx}`,
    title: `Loading ${idx + 1}`,
    link: "#",
    source: "Loading",
    publishedAt: "2026-01-01T00:00:00.000Z",
    timeAgo: null,
    imageUrl: null,
    description: null,
    publisher: null,
    sourceDisplay: "",
  }));
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
  const loadingBento = useMemo(() => buildNewsBento(makeLoadingItems(12)), []);

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
        <div
          aria-label={strings.loading}
          className="grid grid-cols-1 gap-3 md:grid-cols-6 md:auto-rows-[8.25rem] md:grid-flow-dense"
        >
          {loadingBento.map((item) => (
            <Skeleton
              key={item.id}
              className="col-span-1 border md:[grid-column:var(--news-col)] md:[grid-row:var(--news-row)]"
              style={{ ...toGridStyle(item), borderColor: "var(--border)", background: "var(--surface-subtle)" }}
            />
          ))}
        </div>
      ) : bentoItems.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{strings.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6 md:auto-rows-[8.25rem] md:grid-flow-dense">
          {bentoItems.map((item) => {
            const imageUrl = item.imageUrl && item.imageUrl.trim().length > 0 ? item.imageUrl : null;
            const description = fallbackDescription(item, locale);
            return (
              <Card
                key={item.id}
                className="col-span-1 overflow-hidden md:[grid-column:var(--news-col)] md:[grid-row:var(--news-row)]"
                style={{
                  ...toGridStyle(item),
                  borderColor: "var(--border-strong)",
                  background: "var(--surface-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="h-1 w-full" style={{ background: "var(--accent)" }} />

                <CardHeader className="space-y-3 pb-2">
                  <div className="overflow-hidden rounded-[var(--radius-item)] border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={item.title}
                        className="h-28 w-full object-cover md:h-32"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className="h-28 w-full md:h-32"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--accent-muted) 0%, var(--surface) 52%, var(--navy-tint) 100%)",
                        }}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
                    <Badge
                      className="max-w-[75%] truncate"
                      style={{
                        borderColor: "var(--accent)",
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                      }}
                      title={sourceLabel(item)}
                    >
                      {sourceLabel(item)}
                    </Badge>
                    <span className="tabular-nums">{formatDate(item.publishedAt, locale)}</span>
                  </div>

                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold leading-snug underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ color: "var(--text)" }}
                  >
                    {item.title}
                  </a>
                </CardHeader>

                <CardContent>
                  <p className="text-xs" style={descriptionStyle}>
                    {description}
                  </p>
                </CardContent>

                <CardFooter className="mt-auto flex items-center justify-between gap-2 pt-0">
                  <span className="truncate text-[11px]" style={{ color: "var(--text-muted)" }} title={item.publisher ?? item.source}>
                    {item.publisher ? `${locale === "tr" ? "Kaynak" : "Publisher"}: ${item.publisher}` : item.source}
                  </span>

                  <Button
                    className="border"
                    style={{
                      borderColor: "var(--accent)",
                      background: "var(--accent)",
                      color: "#fff",
                    }}
                    aria-label={strings.readMore}
                    onClick={() => window.open(item.link, "_blank", "noopener,noreferrer")}
                  >
                    {strings.readMore}
                  </Button>
                </CardFooter>
              </Card>
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

const descriptionStyle: CSSProperties = {
  color: "var(--text-faint)",
  display: "-webkit-box",
  WebkitLineClamp: 4,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  lineHeight: 1.45,
};
