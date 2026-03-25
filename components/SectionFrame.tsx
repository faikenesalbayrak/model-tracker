import type { ReactNode } from "react";
import { AlertTriangle, Clock3, CloudOff, LoaderCircle } from "lucide-react";
import { isStale, formatLastUpdated } from "./dashboard-utils";
import type { Locale } from "./dashboard-types";
import { DotPattern } from "./ui/DotPattern";

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
    <section
      className="animate-enter relative overflow-hidden rounded-2xl p-4 sm:p-6"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-card)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      {/* Very subtle dot pattern */}
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className="opacity-[0.02]"
        style={{ color: "var(--tt-navy)" }}
      />
      {/* Top accent line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, var(--accent) 0%, var(--tt-blue) 40%, transparent 100%)",
          opacity: 0.4,
        }}
      />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p
              className="inline-flex rounded-full px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.22em]"
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface-subtle)",
                color: "var(--text-faint)",
              }}
            >
              {sourceLabel}
            </p>
            <h2
              className="mt-2.5 text-[clamp(1.4rem,2vw,2rem)] font-semibold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              {title}
            </h2>
            <p
              className="mt-2 max-w-2xl text-sm leading-6"
              style={{ color: "var(--text-muted)" }}
            >
              {description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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

        <div
          className="h-px"
          style={{ background: "linear-gradient(90deg, var(--border-strong) 0%, transparent 100%)" }}
        />

        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span
            suppressHydrationWarning
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium tabular-nums"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
            }}
          >
            <Clock3 className="h-3.5 w-3.5" style={{ color: "var(--text-faint)" }} />
            {strings.lastUpdated}: {formatLastUpdated(lastSuccessAt, locale)}
          </span>
          {error ? (
            <span
              className="rounded-full px-3 py-1.5 font-medium"
              style={{
                border: "1px solid rgba(217,119,6,0.3)",
                background: "rgba(217,119,6,0.08)",
                color: "#92400e",
              }}
            >
              {strings.cacheNotice}
            </span>
          ) : null}
          {stale ? (
            <span
              className="rounded-full px-3 py-1.5 font-medium"
              style={{
                border: "1px solid rgba(201,12,15,0.2)",
                background: "var(--accent-muted)",
                color: "var(--accent)",
              }}
            >
              {strings.staleNotice}
            </span>
          ) : null}
        </div>

        <div className="relative pt-1">{children}</div>
      </div>
    </section>
  );
}

type BadgeProps = {
  children: ReactNode;
  tone: "neutral" | "amber" | "rose";
};

function Badge({ children, tone }: BadgeProps) {
  const styles: Record<typeof tone, React.CSSProperties> = {
    neutral: {
      border: "1px solid var(--border)",
      background: "var(--surface-subtle)",
      color: "var(--text-muted)",
    },
    amber: {
      border: "1px solid rgba(217,119,6,0.3)",
      background: "rgba(217,119,6,0.08)",
      color: "#92400e",
    },
    rose: {
      border: "1px solid rgba(201,12,15,0.2)",
      background: "var(--accent-muted)",
      color: "var(--accent)",
    },
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}
