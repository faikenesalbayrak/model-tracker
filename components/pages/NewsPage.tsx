"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AiNewsItem, Locale } from "@/components/dashboard-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNewsBento } from "@/lib/news-bento";
import type { ScoredNewsItem } from "@/lib/news-bento";
import { sanitizeNewsDescription, sanitizeNewsLabel } from "@/lib/news-display";

export type NewsSection = "overview" | "ai" | "aviation" | "regulations" | "releases";

type TimeRange = "today" | "7d" | "30d" | "all";
type ImageFilter = "all" | "photo" | "logo" | "none";
type SortMode = "newest" | "importance";

const copy = {
  en: {
    empty: "No news records available.",
    loading: "Loading news...",
    readMore: "Open Story",
    search: "Search headlines",
    source: "Source",
    time: "Time",
    image: "Image",
    sort: "Sort",
    reset: "Reset",
    today: "Today",
    week: "7d",
    month: "30d",
    all: "All",
  },
  tr: {
    empty: "Haber kaydı bulunamadı.",
    loading: "Haberler yükleniyor...",
    readMore: "Haberi Aç",
    search: "Başlık ara",
    source: "Kaynak",
    time: "Zaman",
    image: "Görsel",
    sort: "Sıralama",
    reset: "Sıfırla",
    today: "Bugün",
    week: "7g",
    month: "30g",
    all: "Tümü",
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

function toGridStyle(item: { colSpan: number; rowSpan: number }, measuredRowSpan?: number): CSSProperties {
  return {
    "--news-col-span": String(item.colSpan),
    "--news-row-span": String(measuredRowSpan ?? item.rowSpan),
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
  const sourceDisplay = sanitizeNewsLabel(item.sourceDisplay) ?? "";
  if (sourceDisplay) return sourceDisplay;
  return sanitizeNewsLabel(item.source) ?? item.source;
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
    imageKind: "none",
    description: null,
    publisher: null,
    sourceDisplay: "",
    importanceScore: 0,
  }));
}

function parseDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function isWithinRange(item: AiNewsItem, range: TimeRange): boolean {
  if (range === "all") return true;
  const ts = parseDate(item.publishedAt);
  if (!ts) return false;
  const now = Date.now();
  if (range === "today") return now - ts <= 24 * 60 * 60 * 1000;
  if (range === "7d") return now - ts <= 7 * 24 * 60 * 60 * 1000;
  return now - ts <= 30 * 24 * 60 * 60 * 1000;
}

function isImageMatch(item: AiNewsItem, filter: ImageFilter): boolean {
  if (filter === "all") return true;
  const kind = item.imageKind ?? "none";
  if (filter === "photo") return kind === "photo";
  if (filter === "logo") return kind === "logo";
  return kind === "none";
}

function mediaAspect(item: ScoredNewsItem): string {
  if (item.imageKind === "logo" || item.imageKind === "none") return "4 / 1";
  if (item.variant === "hero") return "16 / 7";
  if (item.variant === "tall") return "4 / 3";
  return "16 / 9";
}

function titleLineClamp(item: ScoredNewsItem): number {
  if (item.variant === "hero" || item.variant === "tall") return 3;
  return 2;
}

function descriptionLineClamp(item: ScoredNewsItem): number {
  if (item.rowSpan >= 5) return 6;
  if (item.rowSpan >= 4) return 5;
  if (item.rowSpan >= 3) return 4;
  return 3;
}

export function NewsPage({ locale, section = "overview" }: { locale: Locale; section?: NewsSection }) {
  const [items, setItems] = useState<AiNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [source, setSource] = useState(() => params.get("source") ?? "all");
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    const value = params.get("time");
    if (value === "today" || value === "7d" || value === "30d" || value === "all") return value;
    return "all";
  });
  const [imageFilter, setImageFilter] = useState<ImageFilter>(() => {
    const value = params.get("image");
    if (value === "all" || value === "photo" || value === "logo" || value === "none") return value;
    return "all";
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const value = params.get("sort");
    return value === "importance" ? "importance" : "newest";
  });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [measuredSpans, setMeasuredSpans] = useState<Record<string, number>>({});

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

  useEffect(() => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("q", search.trim()); else query.delete("q");
    if (source !== "all") query.set("source", source); else query.delete("source");
    if (timeRange !== "all") query.set("time", timeRange); else query.delete("time");
    if (imageFilter !== "all") query.set("image", imageFilter); else query.delete("image");
    if (sortMode !== "newest") query.set("sort", sortMode); else query.delete("sort");
    const next = query.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [imageFilter, pathname, router, search, sortMode, source, timeRange]);

  const strings = copy[locale];
  const sectionCopy = sectionText(locale, section);

  const sourceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) values.add(sourceLabel(item));
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.filter((item) => {
      const sourceText = sourceLabel(item);
      const haystack = `${item.title} ${item.description ?? ""} ${sourceText}`.toLowerCase();
      const searchMatch = !q || haystack.includes(q);
      const sourceMatch = source === "all" || sourceText === source;
      const timeMatch = isWithinRange(item, timeRange);
      const imageMatch = isImageMatch(item, imageFilter);
      return searchMatch && sourceMatch && timeMatch && imageMatch;
    });

    rows.sort((left, right) => {
      if (sortMode === "importance") {
        const iLeft = typeof left.importanceScore === "number" ? left.importanceScore : 0;
        const iRight = typeof right.importanceScore === "number" ? right.importanceScore : 0;
        if (iRight !== iLeft) return iRight - iLeft;
      }
      return parseDate(right.publishedAt) - parseDate(left.publishedAt);
    });
    return rows;
  }, [imageFilter, items, search, sortMode, source, timeRange]);

  const bentoItems = useMemo(() => buildNewsBento(filtered), [filtered]);
  const loadingBento = useMemo(() => buildNewsBento(makeLoadingItems(12)), []);

  const measureMasonry = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const style = window.getComputedStyle(grid);
    const rowHeight = Number.parseFloat(style.getPropertyValue("grid-auto-rows")) || 8;
    const rowGap = Number.parseFloat(style.getPropertyValue("row-gap")) || 12;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-news-card-id]"));
    if (cards.length === 0) return;

    const next: Record<string, number> = {};
    for (const card of cards) {
      const id = card.dataset.newsCardId;
      if (!id) continue;
      const height = card.getBoundingClientRect().height;
      const span = Math.max(2, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
      next[id] = span;
    }
    setMeasuredSpans((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === next[key])) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    const frame = window.requestAnimationFrame(measureMasonry);
    const grid = gridRef.current;
    if (!grid) return () => window.cancelAnimationFrame(frame);

    const observer = new ResizeObserver(() => measureMasonry());
    observer.observe(grid);
    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-news-card-id]"));
    for (const card of cards) observer.observe(card);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bentoItems, loading, measureMasonry]);

  const resetFilters = () => {
    setSearch("");
    setSource("all");
    setTimeRange("all");
    setImageFilter("all");
    setSortMode("newest");
  };

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{sectionCopy.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sectionCopy.subtitle}</p>
      </div>

      <div
        className="mb-4 grid grid-cols-1 gap-2 rounded-[var(--radius-card)] border p-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
        style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={strings.search}
          className="h-9 rounded-[var(--radius-item)] border px-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />

        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="h-9 rounded-[var(--radius-item)] border px-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          aria-label={strings.source}
        >
          {sourceOptions.map((option) => (
            <option key={option} value={option}>{option === "all" ? strings.all : option}</option>
          ))}
        </select>

        <select
          value={timeRange}
          onChange={(event) => setTimeRange(event.target.value as TimeRange)}
          className="h-9 rounded-[var(--radius-item)] border px-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          aria-label={strings.time}
        >
          <option value="all">{strings.all}</option>
          <option value="today">{strings.today}</option>
          <option value="7d">{strings.week}</option>
          <option value="30d">{strings.month}</option>
        </select>

        <select
          value={imageFilter}
          onChange={(event) => setImageFilter(event.target.value as ImageFilter)}
          className="h-9 rounded-[var(--radius-item)] border px-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          aria-label={strings.image}
        >
          <option value="all">{strings.all}</option>
          <option value="photo">Photo</option>
          <option value="logo">Logo</option>
          <option value="none">None</option>
        </select>

        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as SortMode)}
          className="h-9 rounded-[var(--radius-item)] border px-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          aria-label={strings.sort}
        >
          <option value="newest">Newest</option>
          <option value="importance">Importance</option>
        </select>

        <Button
          className="h-9"
          style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--surface)" }}
          onClick={resetFilters}
        >
          {strings.reset}
        </Button>
      </div>

      {loading ? (
        <div
          aria-label={strings.loading}
          className="grid grid-cols-1 gap-3 md:grid-cols-6 md:auto-rows-[8px] md:grid-flow-dense"
        >
          {loadingBento.map((item) => (
            <Skeleton
              key={item.id}
              className="col-span-1 border md:[grid-column:span_var(--news-col-span)] md:[grid-row-end:span_var(--news-row-span)]"
              style={{ ...toGridStyle(item), borderColor: "var(--border)", background: "var(--surface-subtle)" }}
            />
          ))}
        </div>
      ) : bentoItems.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{strings.empty}</p>
      ) : (
        <div ref={gridRef} className="grid grid-cols-1 gap-3 md:grid-cols-6 md:auto-rows-[8px] md:grid-flow-dense">
          {bentoItems.map((item) => {
            const imageUrl = item.imageUrl && item.imageUrl.trim().length > 0 ? item.imageUrl : null;
            const description = fallbackDescription(item, locale);
            const isLogoLike = item.imageKind === "logo" || item.imageKind === "none";
            const cleanPublisher = sanitizeNewsLabel(item.publisher);
            const cleanSource = sanitizeNewsLabel(item.source) ?? item.source;
            return (
              <Card
                key={item.id}
                data-news-card-id={item.id}
                className="col-span-1 flex h-fit min-h-0 flex-col overflow-hidden md:[grid-column:span_var(--news-col-span)] md:[grid-row-end:span_var(--news-row-span)]"
                style={{
                  ...toGridStyle(item, measuredSpans[item.id]),
                  borderColor: "var(--border-strong)",
                  background: "var(--surface-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="h-1 w-full" style={{ background: "var(--accent)" }} />

                <CardHeader className="space-y-2 pb-2">
                  <div className="overflow-hidden rounded-[var(--radius-item)] border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={item.title}
                        className={`w-full ${isLogoLike ? "object-contain p-2" : "object-cover"}`}
                        style={{ aspectRatio: mediaAspect(item) }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className="w-full"
                        style={{
                          aspectRatio: mediaAspect(item),
                          background:
                            "linear-gradient(135deg, var(--accent-muted) 0%, var(--surface) 52%, var(--navy-tint) 100%)",
                        }}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
                    <Badge
                      className="max-w-[68%] truncate"
                      style={{
                        borderColor: "var(--accent)",
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                      }}
                      title={sourceLabel(item)}
                    >
                      {sourceLabel(item)}
                    </Badge>
                    <span
                      className="tabular-nums rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: "rgba(0,0,0,0.08)", color: "var(--text)" }}
                    >
                      {formatDate(item.publishedAt, locale)}
                    </span>
                  </div>

                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold leading-snug underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{ color: "var(--text)", ...clampStyle(titleLineClamp(item), 1.3) }}
                  >
                    {item.title}
                  </a>
                </CardHeader>

                <CardContent className="min-h-0 flex-1">
                  <p className="text-xs" style={clampStyle(descriptionLineClamp(item), 1.46)}>
                    {description}
                  </p>
                </CardContent>

                <CardFooter className="mt-auto flex items-center justify-between gap-2 pt-0">
                  <span
                    className="truncate text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                    title={cleanPublisher ?? cleanSource}
                  >
                    {cleanPublisher
                      ? `${locale === "tr" ? "Kaynak" : "Publisher"}: ${cleanPublisher}`
                      : cleanSource}
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

function clampStyle(lines: number, lineHeight = 1.35): CSSProperties {
  return {
    color: "var(--text-faint)",
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    lineHeight,
  };
}
