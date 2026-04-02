"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiNewsItem, Locale } from "@/components/dashboard-types";
import { Button } from "@/components/ui/button";

const copy = {
  en: {
    title: "News Overview",
    subtitle: "A quick pulse of source health, daily volume, and the most important stories.",
    total: "Total News",
    sources: "Active Sources",
    today: "Today",
    withImage: "With Image",
    top5: "Top 5 Important Headlines",
    sourceMix: "Source Mix",
    trend: "Today / 7d Trend",
    open: "Open",
    loading: "Loading...",
  },
  tr: {
    title: "News Overview",
    subtitle: "Kaynak sağlığı, günlük hacim ve en önemli haberlerin hızlı özeti.",
    total: "Toplam Haber",
    sources: "Aktif Kaynak",
    today: "Bugün",
    withImage: "Görselli",
    top5: "En Önemli 5 Haber",
    sourceMix: "Kaynak Dağılımı",
    trend: "Bugün / 7g Trend",
    open: "Aç",
    loading: "Yükleniyor...",
  },
} as const;
const OVERVIEW_REFERENCE_TS = Date.now();

function parseDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "short", day: "2-digit" });
}

function sourceLabel(item: AiNewsItem): string {
  return (item.sourceDisplay ?? item.source).trim();
}

function percent(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function NewsOverviewPage({ locale }: { locale: Locale }) {
  const strings = copy[locale];
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

  const stats = useMemo(() => {
    const total = items.length;
    const withImage = items.filter((item) => item.imageKind === "photo").length;
    const today = items.filter((item) => OVERVIEW_REFERENCE_TS - parseDate(item.publishedAt) <= 24 * 60 * 60 * 1000).length;
    const sevenDays = items.filter((item) => OVERVIEW_REFERENCE_TS - parseDate(item.publishedAt) <= 7 * 24 * 60 * 60 * 1000).length;
    const sourceSet = new Set(items.map((item) => item.sourceName ?? item.source));
    return { total, withImage, today, sevenDays, sources: sourceSet.size };
  }, [items]);

  const top5 = useMemo(() => {
    return [...items]
      .sort((left, right) => {
        const l = typeof left.importanceScore === "number" ? left.importanceScore : 0;
        const r = typeof right.importanceScore === "number" ? right.importanceScore : 0;
        if (r !== l) return r - l;
        return parseDate(right.publishedAt) - parseDate(left.publishedAt);
      })
      .slice(0, 5);
  }, [items]);

  const sourceMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = sourceLabel(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  return (
    <section
      className="w-full overflow-hidden rounded-[var(--radius-panel)] p-5"
      style={{ border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{strings.title}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{strings.subtitle}</p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>{strings.loading}</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={strings.total} value={String(stats.total)} />
            <StatCard label={strings.sources} value={String(stats.sources)} />
            <StatCard label={strings.today} value={String(stats.today)} />
            <StatCard label={strings.withImage} value={percent(stats.withImage, stats.total)} />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}>
              <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{strings.top5}</h3>
              <div className="space-y-2">
                {top5.map((item) => (
                  <article key={item.id} className="rounded-[var(--radius-item)] border p-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px]" style={{ color: "var(--accent)" }}>{sourceLabel(item)}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                        {formatDate(item.publishedAt, locale)}
                      </span>
                    </div>
                    <p className="mb-2 text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>{item.title}</p>
                    <Button
                      className="h-8 border px-2 py-0 text-xs"
                      style={{ borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }}
                      onClick={() => window.open(item.link, "_blank", "noopener,noreferrer")}
                    >
                      {strings.open}
                    </Button>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}>
                <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{strings.sourceMix}</h3>
                <div className="space-y-2">
                  {sourceMix.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between gap-2 rounded-[var(--radius-item)] border px-2 py-1.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                      <span className="truncate text-xs" style={{ color: "var(--text)" }}>{name}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}>
                <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{strings.trend}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[var(--radius-item)] border p-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{strings.today}</p>
                    <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>{stats.today}</p>
                  </div>
                  <div className="rounded-[var(--radius-item)] border p-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>7d</p>
                    <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>{stats.sevenDays}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-subtle)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}
