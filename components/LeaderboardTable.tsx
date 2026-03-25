"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { ColumnTooltipLabel } from "./ColumnTooltipLabel";
import type { LeaderboardRow, Locale } from "./dashboard-types";
import { formatCompactNumber } from "./dashboard-utils";
import { SectionFrame } from "./SectionFrame";

type SortKey =
  | "model"
  | "lab"
  | "mmlu"
  | "humaneval"
  | "mtBench"
  | "arc"
  | "hellaswag"
  | "releasedAt";

type LeaderboardTableProps = {
  error: string | null;
  items: LeaderboardRow[];
  lastSuccessAt: string;
  locale: Locale;
  loading?: boolean;
  sourceLabel: string;
};

const copy = {
  en: {
    empty: "Leaderboard data is not available yet.",
    headers: {
      model: "Model",
      lab: "Lab",
      params: "Parameters",
      mmlu: "MMLU",
      humaneval: "HumanEval",
      mtBench: "MT-Bench",
      arc: "ARC",
      hellaswag: "HellaSwag",
      releasedAt: "Released",
      openSource: "Open",
    },
  },
  tr: {
    empty: "Sıralama verisi henüz hazır değil.",
    headers: {
      model: "Model",
      lab: "Laboratuvar",
      params: "Parametre",
      mmlu: "MMLU",
      humaneval: "HumanEval",
      mtBench: "MT-Bench",
      arc: "ARC",
      hellaswag: "HellaSwag",
      releasedAt: "Çıkış",
      openSource: "Açık",
    },
  },
} as const;

const headerHints = {
  en: {
    model: "Model name and version listed in the benchmark feed.",
    lab: "Model creator lab or provider.",
    params: "Approximate parameter size reported by the source.",
    mmlu: "General knowledge and reasoning benchmark score.",
    humaneval: "Code generation accuracy benchmark score.",
    mtBench: "Multi-turn dialogue quality benchmark score.",
    arc: "Reasoning over challenge questions benchmark score.",
    hellaswag: "Commonsense completion benchmark score.",
    releasedAt: "Public release date of the model version.",
    openSource: "Whether the model weights are publicly available.",
  },
  tr: {
    model: "Benchmark akışında listelenen model adı ve sürümü.",
    lab: "Modeli geliştiren laboratuvar veya sağlayıcı.",
    params: "Kaynağın verdiği yaklaşık parametre boyutu.",
    mmlu: "Genel bilgi ve akıl yürütme benchmark skoru.",
    humaneval: "Kod üretim doğruluğu benchmark skoru.",
    mtBench: "Çok turlu diyalog kalitesi benchmark skoru.",
    arc: "Zorlayıcı soru çözümü benchmark skoru.",
    hellaswag: "Sağduyu tamamlama benchmark skoru.",
    releasedAt: "Model sürümünün kamuya açık çıkış tarihi.",
    openSource: "Model ağırlıklarının herkese açık olup olmadığı.",
  },
} as const;

export function LeaderboardTable({
  error,
  items,
  lastSuccessAt,
  locale,
  loading = false,
  sourceLabel,
}: LeaderboardTableProps) {
  const strings = copy[locale];
  const hints = headerHints[locale];
  const [sortKey, setSortKey] = useState<SortKey>("mmlu");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const sorted = [...items].sort((left, right) => {
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return leftValue - rightValue;
      }

      return String(leftValue).localeCompare(String(rightValue));
    });

    return direction === "asc" ? sorted : sorted.reverse();
  }, [direction, items, sortKey]);

  return (
    <SectionFrame
      description={
        locale === "tr"
          ? "Seçili benchmark'ları tek tabloda kıyaslayın."
          : "Compare the selected benchmarks in one sortable table."
      }
      error={error}
      lastSuccessAt={lastSuccessAt}
      locale={locale}
      loading={loading}
      sourceLabel={sourceLabel}
      title={locale === "tr" ? "Sıralama" : "Leaderboard"}
    >
      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState message={strings.empty} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-slate-200/70 bg-white/80 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-[0.68rem] tracking-[0.18em] text-slate-500 backdrop-blur dark:bg-slate-950/90 dark:text-slate-400">
              <tr>
                {[
                  ["model", strings.headers.model],
                  ["lab", strings.headers.lab],
                  ["params", strings.headers.params],
                  ["mmlu", strings.headers.mmlu],
                  ["humaneval", strings.headers.humaneval],
                  ["mtBench", strings.headers.mtBench],
                  ["arc", strings.headers.arc],
                  ["hellaswag", strings.headers.hellaswag],
                  ["releasedAt", strings.headers.releasedAt],
                  ["openSource", strings.headers.openSource],
                ].map(([key, label]) => (
                  <th key={key} className="border-b border-slate-200/70 px-4 py-3 text-[0.68rem] font-semibold dark:border-white/10">
                    {key === "openSource" ? (
                      <ColumnTooltipLabel center description={hints.openSource} label={label} />
                    ) : (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none dark:hover:bg-white/10 dark:hover:text-white"
                        onClick={() => handleSortClick(key as SortKey, sortKey, direction, setSortKey, setDirection)}
                        type="button"
                      >
                        <ColumnTooltipLabel
                          description={hints[key as keyof typeof hints]}
                          label={label}
                        />
                        {renderSortIcon(key as SortKey, sortKey, direction)}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 transition last:border-none hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-950 dark:text-white">{row.model}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.lab}</td>
                  <td className="px-4 py-4 text-slate-600 tabular-nums dark:text-slate-300">{row.parameters}</td>
                  {metricCells.map((metric) => (
                    <td key={metric} className="px-4 py-4">
                      <MetricBar value={row[metric]} locale={locale} />
                    </td>
                  ))}
                  <td className="px-4 py-4 text-slate-600 tabular-nums dark:text-slate-300">
                    {row.releasedAt.slice(0, 10)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${
                        row.openSource
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                          : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                      }`}
                    >
                      {row.openSource ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Rocket className="h-3.5 w-3.5" />
          {locale === "tr"
            ? "Başlıklar tıklanarak sıralama değiştirilebilir."
            : "Click a heading to change sorting."}
        </span>
      </div>
    </SectionFrame>
  );
}

const metricCells = ["mmlu", "humaneval", "mtBench", "arc", "hellaswag"] as const;

function handleSortClick(
  nextKey: SortKey,
  currentKey: SortKey,
  currentDirection: "asc" | "desc",
  setSortKey: (value: SortKey) => void,
  setDirection: (value: "asc" | "desc") => void,
) {
  if (nextKey === currentKey) {
    setDirection(currentDirection === "asc" ? "desc" : "asc");
    return;
  }

  setSortKey(nextKey);
  setDirection("desc");
}

function renderSortIcon(key: SortKey, sortKey: SortKey, direction: "asc" | "desc") {
  if (key !== sortKey) {
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />;
  }

  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

function MetricBar({ locale, value }: { locale: Locale; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
        <span>{formatCompactNumber(value, locale)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--tt-red),var(--tt-blue))]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-12 animate-pulse rounded-2xl bg-slate-100/90 dark:bg-white/5"
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
