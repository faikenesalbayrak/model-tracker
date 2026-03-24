import type { ReactNode } from "react";
import { AlertTriangle, Clock3, CloudOff, LoaderCircle } from "lucide-react";
import { isStale, formatLastUpdated } from "./dashboard-utils";
import type { Locale } from "./dashboard-types";

type SectionFrameProps = {
  children: ReactNode;
  description: string;
  error: string | null;
  lastSuccessAt: string;
  locale: Locale;
  loading?: boolean;
  sourceLabel: string;
  title: string;
};

const copy = {
  en: {
    lastUpdated: "Last updated",
    offline: "Offline cache",
    stale: "Stale",
    loading: "Loading",
    cacheNotice: "Showing cached data until the API returns.",
    staleNotice: "This section is older than 7 days.",
  },
  tr: {
    lastUpdated: "Son güncelleme",
    offline: "Önbellek verisi",
    stale: "Eski veri",
    loading: "Yükleniyor",
    cacheNotice: "API dönene kadar önbellekteki veri gösteriliyor.",
    staleNotice: "Bu bölüm 7 günden eski.",
  },
} as const;

export function SectionFrame({
  children,
  description,
  error,
  lastSuccessAt,
  locale,
  loading = false,
  sourceLabel,
  title,
}: SectionFrameProps) {
  const strings = copy[locale];
  const stale = isStale(lastSuccessAt);

  return (
    <section className="animate-enter relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition dark:border-white/10 dark:bg-slate-950/80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,12,15,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(0,12,84,0.10),transparent_32%)]" />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[0.68rem] font-semibold tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {sourceLabel}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <Badge tone="neutral">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {strings.loading}
              </Badge>
            ) : null}
            {error ? (
              <Badge tone="amber">
                <CloudOff className="h-3.5 w-3.5" />
                {strings.offline}
              </Badge>
            ) : null}
            {stale ? (
              <Badge tone="rose">
                <AlertTriangle className="h-3.5 w-3.5" />
                {strings.stale}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span suppressHydrationWarning className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 font-medium tabular-nums dark:border-white/10 dark:bg-white/5">
            <Clock3 className="h-3.5 w-3.5" />
            {strings.lastUpdated}: {formatLastUpdated(lastSuccessAt, locale)}
          </span>
          {error ? (
            <span className="rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {strings.cacheNotice}
            </span>
          ) : null}
          {stale ? (
            <span className="rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1.5 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              {strings.staleNotice}
            </span>
          ) : null}
        </div>
        <div className="relative">{children}</div>
      </div>
    </section>
  );
}

type BadgeProps = {
  children: ReactNode;
  tone: "neutral" | "amber" | "rose";
};

function Badge({ children, tone }: BadgeProps) {
  const toneClass = {
    neutral:
      "border-slate-200/80 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
    amber:
      "border-amber-200/80 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    rose: "border-rose-200/80 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
