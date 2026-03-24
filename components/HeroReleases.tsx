import { ArrowUpRight } from "lucide-react";
import type { Locale, ReleaseItem } from "./dashboard-types";
import { formatCompactNumber } from "./dashboard-utils";
import { SectionFrame } from "./SectionFrame";

type HeroReleasesProps = {
  error: string | null;
  items: ReleaseItem[];
  lastSuccessAt: string;
  locale: Locale;
  loading?: boolean;
  sourceLabel: string;
};

const copy = {
  en: {
    empty: "No new releases found yet.",
    released: "Released",
  },
  tr: {
    empty: "Henüz yeni yayın bulunamadı.",
    released: "Yayınlanma",
  },
} as const;

export function HeroReleases({
  error,
  items,
  lastSuccessAt,
  locale,
  loading = false,
  sourceLabel,
}: HeroReleasesProps) {
  const strings = copy[locale];

  return (
    <SectionFrame
      description={
        locale === "tr"
          ? "Son yayımlanan modellerin kısa kart görünümü."
          : "A compact card view of the latest model releases."
      }
      error={error}
      lastSuccessAt={lastSuccessAt}
      locale={locale}
      loading={loading}
      sourceLabel={sourceLabel}
      title={locale === "tr" ? "Yeni Yayınlar" : "New Releases"}
    >
      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState message={strings.empty} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="panel-interactive group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/70 bg-white/80 p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/[0.08]"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[color:var(--tt-red)] via-[color:var(--tt-blue)] to-transparent opacity-70" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[0.65rem] font-semibold tracking-[0.18em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    {item.lab}
                  </p>
                  <h3 className="mt-3 text-[1.35rem] font-semibold tracking-tight text-slate-950 dark:text-white">
                    {item.model}
                  </h3>
                </div>
                <span className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[0.65rem] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  #{formatCompactNumber(index + 1, locale)}
                </span>
              </div>
              <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {item.summary}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-slate-950">
                  {strings.released}: {item.releasedAt.slice(0, 10)}
                </span>
                <a
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:border-[color:var(--tt-red)]/30 hover:bg-[color:var(--tt-red)]/5 hover:text-slate-950 focus-visible:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                  href={item.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {locale === "tr" ? "Model sayfasına git" : "Open model page"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionFrame>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-64 animate-pulse rounded-3xl border border-slate-200/70 bg-slate-100/90 dark:border-white/10 dark:bg-white/5"
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200/70 bg-slate-50 p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {message}
    </div>
  );
}
