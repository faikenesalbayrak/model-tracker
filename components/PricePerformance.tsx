import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useSyncExternalStore } from "react";
import type { Locale, PricePoint } from "./dashboard-types";
import { formatCompactNumber, formatCurrency } from "./dashboard-utils";
import { SectionFrame } from "./SectionFrame";

type PricePerformanceProps = {
  error: string | null;
  items: PricePoint[];
  lastSuccessAt: string;
  locale: Locale;
  loading?: boolean;
  sourceLabel: string;
};

const copy = {
  en: {
    empty: "Price data is not available yet.",
    subtitle: "Smaller bubbles represent leaner models; x-axis uses 1M token pricing.",
  },
  tr: {
    empty: "Fiyat verisi henüz hazır değil.",
    subtitle: "Küçük baloncuklar daha hafif modelleri temsil eder; x ekseni 1M token fiyatıdır.",
  },
} as const;

export function PricePerformance({
  error,
  items,
  lastSuccessAt,
  locale,
  loading = false,
  sourceLabel,
}: PricePerformanceProps) {
  const strings = copy[locale];
  const isClient = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <SectionFrame
      description={
        locale === "tr"
          ? "Fiyat ve skor ilişkisini tek grafikte inceleyin."
          : "Inspect price and score together in one scatter plot."
      }
      error={error}
      lastSuccessAt={lastSuccessAt}
      locale={locale}
      loading={loading}
      sourceLabel={sourceLabel}
      title={locale === "tr" ? "Fiyat / Performans" : "Price / Performance"}
    >
      {!isClient || loading ? (
        <ChartSkeleton />
      ) : items.length === 0 ? (
        <EmptyState message={strings.empty} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
          <div className="panel-interactive overflow-x-auto rounded-[var(--radius-card)] border border-slate-200/70 bg-white/80 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5">
            <div className="min-w-[860px]">
              <ScatterChart margin={{ top: 12, right: 18, bottom: 12, left: 8 }} width={860} height={340}>
                <CartesianGrid strokeDasharray="4 6" stroke="rgba(148,163,184,0.25)" />
                <XAxis
                  dataKey="pricePer1m"
                  name="Price"
                  tickFormatter={(value) => formatCurrency(Number(value), locale)}
                  type="number"
                  axisLine={false}
                />
                <YAxis
                  dataKey="score"
                  name="Score"
                  tickFormatter={(value) => formatCompactNumber(Number(value), locale)}
                  type="number"
                  axisLine={false}
                />
                <ZAxis dataKey="params" range={[80, 360]} />
                <Tooltip content={<ScatterTooltip locale={locale} />} cursor={{ strokeDasharray: "4 4" }} />
                <Scatter data={items} fill="var(--tt-red)" fillOpacity={0.78} />
              </ScatterChart>
            </div>
          </div>
          {/* Mobile scroll hint */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-[var(--radius-card)] bg-gradient-to-l from-white/60 to-transparent dark:from-slate-950/60 md:hidden" />
          </div>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{strings.subtitle}</p>
        </div>
      )}
    </SectionFrame>
  );
}

type ScatterTooltipProps = {
  active?: boolean;
  locale: Locale;
  payload?: Array<{ payload: PricePoint }>;
};

function ScatterTooltip({ active, payload, locale }: ScatterTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload as PricePoint;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-slate-950">
      <div className="font-semibold text-slate-950 dark:text-white">{point.model}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{point.lab}</div>
      <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
        {locale === "tr" ? "Fiyat" : "Price"}: {formatCurrency(point.pricePer1m, locale)}
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-200">
        {locale === "tr" ? "Skor" : "Score"}: {formatCompactNumber(point.score, locale)}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-[clamp(200px,40vh,360px)] animate-pulse rounded-[var(--radius-card)] border border-slate-200/70 bg-slate-100/90 shadow-[0_14px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/5" />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200/70 bg-slate-50 p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {message}
    </div>
  );
}
