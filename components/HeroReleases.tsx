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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="panel-interactive group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)]"
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface-subtle)",
              }}
            >
              {/* Top accent gradient */}
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{
                  background: "linear-gradient(90deg, var(--accent) 0%, var(--tt-blue) 50%, transparent 100%)",
                  opacity: 0.6,
                }}
              />
              <div className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p
                      className="inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em]"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface-card)",
                        color: "var(--text-faint)",
                      }}
                    >
                      {item.lab}
                    </p>
                    <h3
                      className="mt-2 text-base font-semibold tracking-tight leading-snug"
                      style={{ color: "var(--text)" }}
                    >
                      {item.model}
                    </h3>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold tabular-nums"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface-card)",
                      color: "var(--text-faint)",
                    }}
                  >
                    #{formatCompactNumber(index + 1, locale)}
                  </span>
                </div>
                <p
                  className="line-clamp-3 flex-1 text-xs leading-5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.summary}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-1 text-[0.65rem] font-semibold"
                    style={{
                      background: "var(--text)",
                      color: "var(--surface)",
                    }}
                  >
                    {strings.released}: {item.releasedAt.slice(0, 10)}
                  </span>
                  <a
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold transition-all duration-150"
                    href={item.url}
                    rel="noreferrer"
                    target="_blank"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface-card)",
                      color: "var(--text-muted)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                      (e.currentTarget as HTMLElement).style.color = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    }}
                  >
                    {locale === "tr" ? "Model sayfası" : "Open page"}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-64 animate-pulse rounded-3xl"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface-subtle)",
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-3xl border-dashed p-8 text-sm"
      style={{
        border: "1px dashed var(--border-strong)",
        background: "var(--surface-subtle)",
        color: "var(--text-muted)",
      }}
    >
      {message}
    </div>
  );
}
