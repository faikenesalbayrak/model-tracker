import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useSyncExternalStore } from "react";
import type { BenchmarkPoint, Locale } from "./dashboard-types";
import { formatCompactNumber } from "./dashboard-utils";
import { SectionFrame } from "./SectionFrame";

type SotaChartProps = {
  error: string | null;
  items: BenchmarkPoint[];
  lastSuccessAt: string;
  locale: Locale;
  loading?: boolean;
  sourceLabel: string;
};

const copy = {
  en: {
    empty: "Benchmark history is not available yet.",
    subtitle: "Records are marked with a glow to distinguish them from ordinary points.",
  },
  tr: {
    empty: "Benchmark geçmişi henüz hazır değil.",
    subtitle: "Rekor noktalar diğerlerinden ayrışacak şekilde vurgulanır.",
  },
} as const;

export function SotaChart({
  error,
  items,
  lastSuccessAt,
  locale,
  loading = false,
  sourceLabel,
}: SotaChartProps) {
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
          ? "Seçili benchmark için rekorların zaman içindeki akışı."
          : "The progression of benchmark records over time."
      }
      error={error}
      lastSuccessAt={lastSuccessAt}
      locale={locale}
      loading={loading}
      sourceLabel={sourceLabel}
      title={locale === "tr" ? "SOTA Zaman Çizelgesi" : "SOTA Timeline"}
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
              <AreaChart data={items} width={860} height={320}>
                <defs>
                  <linearGradient id="sotaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--tt-red)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--tt-blue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="rgba(148,163,184,0.25)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => String(value).slice(0, 10)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => formatCompactNumber(Number(value), locale)} />
                <Tooltip content={<ChartTooltip locale={locale} />} />
                <Area
                  dataKey="score"
                  fill="url(#sotaGradient)"
                  stroke="var(--tt-red)"
                  strokeWidth={2.5}
                  type="monotone"
                />
              </AreaChart>
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

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  locale: Locale;
  payload?: Array<{ payload: BenchmarkPoint }>;
};

function ChartTooltip({ active, label, payload, locale }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload as BenchmarkPoint;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm shadow-[0_18px_40px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-slate-950">
      <div className="font-semibold text-slate-950 dark:text-white">{point.model}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{point.lab}</div>
      <div className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        {locale === "tr" ? "Skor" : "Score"}: {formatCompactNumber(point.score, locale)}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{String(label).slice(0, 10)}</div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-[clamp(200px,38vh,340px)] animate-pulse rounded-[var(--radius-card)] border border-slate-200/70 bg-slate-100/90 shadow-[0_14px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/5" />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200/70 bg-slate-50 p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {message}
    </div>
  );
}
