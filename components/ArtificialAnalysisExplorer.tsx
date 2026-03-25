import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionFrame } from "./SectionFrame";
import type { AAModelRow, Locale } from "./dashboard-types";

type SortKey =
  | "intelligenceIndex"
  | "pricePer1m"
  | "outputTokensPerSecond"
  | "ttftSeconds"
  | "contextWindowTokens";

type Props = {
  error: string | null;
  items: AAModelRow[];
  lastSuccessAt: string;
  locale: Locale;
  loading?: boolean;
  sourceLabel: string;
};

const copy = {
  en: {
    tableTitle: "Model Comparison",
    empty: "No model data available.",
    search: "Search model or provider",
    all: "All",
    openOnly: "Open weights only",
    proprietaryOnly: "Proprietary only",
    reasoningOnly: "Reasoning only",
    sortBy: "Sort by",
    asc: "Asc",
    desc: "Desc",
    cards: {
      intelligence: "Top Intelligence",
      speed: "Fastest Output",
      price: "Lowest Price",
      latency: "Lowest Latency",
      context: "Largest Context",
    },
    headers: {
      model: "Model",
      lab: "Provider",
      intelligence: "Intelligence",
      coding: "Coding",
      agentic: "Agentic",
      price: "$/1M",
      speed: "Tok/s",
      ttft: "Latency (s)",
      context: "Context",
      openness: "Open",
      reasoning: "Reasoning",
      release: "Release",
    },
  },
  tr: {
    tableTitle: "Model Karşılaştırma",
    empty: "Model verisi bulunamadı.",
    search: "Model veya sağlayıcı ara",
    all: "Tümü",
    openOnly: "Sadece açık ağırlıklar",
    proprietaryOnly: "Sadece kapalı kaynak",
    reasoningOnly: "Sadece akıl yürütme",
    sortBy: "Sıralama",
    asc: "Artan",
    desc: "Azalan",
    cards: {
      intelligence: "En Yüksek Intelligence",
      speed: "En Hızlı Çıktı",
      price: "En Düşük Fiyat",
      latency: "En Düşük Gecikme",
      context: "En Büyük Context",
    },
    headers: {
      model: "Model",
      lab: "Sağlayıcı",
      intelligence: "Intelligence",
      coding: "Coding",
      agentic: "Agentic",
      price: "$/1M",
      speed: "Tok/s",
      ttft: "Gecikme (sn)",
      context: "Context",
      openness: "Açıklık",
      reasoning: "Akıl Yürütme",
      release: "Yayın",
    },
  },
} as const;

export function ArtificialAnalysisExplorer({
  error,
  items,
  lastSuccessAt,
  locale,
  loading = false,
  sourceLabel,
}: Props) {
  const strings = copy[locale];
  const [query, setQuery] = useState("");
  const [openFilter, setOpenFilter] = useState<"all" | "open" | "closed">("all");
  const [reasoningOnly, setReasoningOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("intelligenceIndex");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((row) => {
      const matchesQuery =
        q.length === 0 ||
        row.model.toLowerCase().includes(q) ||
        row.lab.toLowerCase().includes(q);
      const matchesOpen =
        openFilter === "all" ||
        (openFilter === "open" ? row.openWeights : !row.openWeights);
      const matchesReasoning = !reasoningOnly || row.reasoning;

      return matchesQuery && matchesOpen && matchesReasoning;
    });

    rows.sort((a, b) => compareNullable(a[sortKey], b[sortKey], direction));
    return rows;
  }, [direction, items, openFilter, query, reasoningOnly, sortKey]);

  const topCards = useMemo(
    () => ({
      intelligence: bestBy(items, "intelligenceIndex", "desc"),
      speed: bestBy(items, "outputTokensPerSecond", "desc"),
      price: bestBy(items, "pricePer1m", "asc"),
      latency: bestBy(items, "ttftSeconds", "asc"),
      context: bestBy(items, "contextWindowTokens", "desc"),
    }),
    [items],
  );

  return (
    <SectionFrame
      description={
        locale === "tr"
          ? "Artificial Analysis modellerini canlı metriklerle karşılaştırın."
          : "Compare Artificial Analysis models with live benchmark metrics."
      }
      error={error}
      lastSuccessAt={lastSuccessAt}
      locale={locale}
      loading={loading}
      sourceLabel={sourceLabel}
      title={strings.tableTitle}
    >
      {loading ? (
        <div className="h-48 animate-pulse rounded-3xl bg-slate-100/80 dark:bg-white/5" />
      ) : items.length === 0 ? (
        <EmptyState message={strings.empty} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TopCard item={topCards.intelligence} label={strings.cards.intelligence} locale={locale} metric="intelligence" />
            <TopCard item={topCards.speed} label={strings.cards.speed} locale={locale} metric="speed" />
            <TopCard item={topCards.price} label={strings.cards.price} locale={locale} metric="price" />
            <TopCard item={topCards.latency} label={strings.cards.latency} locale={locale} metric="latency" />
            <TopCard item={topCards.context} label={strings.cards.context} locale={locale} metric="context" />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5 xl:col-span-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={strings.search}
                value={query}
              />
            </label>

            <select
              className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              onChange={(event) => setOpenFilter(event.target.value as "all" | "open" | "closed")}
              value={openFilter}
            >
              <option value="all">{strings.all}</option>
              <option value="open">{strings.openOnly}</option>
              <option value="closed">{strings.proprietaryOnly}</option>
            </select>

            <select
              className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              value={sortKey}
            >
              <option value="intelligenceIndex">{strings.sortBy}: {strings.headers.intelligence}</option>
              <option value="pricePer1m">{strings.sortBy}: {locale === "tr" ? "Fiyat" : "Price"}</option>
              <option value="outputTokensPerSecond">{strings.sortBy}: {locale === "tr" ? "Hız" : "Speed"}</option>
              <option value="ttftSeconds">{strings.sortBy}: {locale === "tr" ? "Gecikme" : "Latency"}</option>
              <option value="contextWindowTokens">{strings.sortBy}: {strings.headers.context}</option>
            </select>

            <button
              className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              onClick={() => setDirection((current) => (current === "asc" ? "desc" : "asc"))}
              type="button"
            >
              {direction === "asc" ? strings.asc : strings.desc}
            </button>

            <button
              className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              onClick={() => setReasoningOnly((current) => !current)}
              type="button"
            >
              {reasoningOnly ? strings.reasoningOnly : strings.all}
            </button>
          </div>

          <div className="relative">
          <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 dark:border-white/10 dark:bg-white/5">
            <table className="min-w-[1280px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-[0.14em] text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">{strings.headers.model}</th>
                  <th className="px-3 py-2">{strings.headers.lab}</th>
                  <th className="px-3 py-2">{strings.headers.intelligence}</th>
                  <th className="px-3 py-2">{strings.headers.coding}</th>
                  <th className="px-3 py-2">{strings.headers.agentic}</th>
                  <th className="px-3 py-2">{strings.headers.price}</th>
                  <th className="px-3 py-2">{strings.headers.speed}</th>
                  <th className="px-3 py-2">{strings.headers.ttft}</th>
                  <th className="px-3 py-2">{strings.headers.context}</th>
                  <th className="px-3 py-2">{strings.headers.openness}</th>
                  <th className="px-3 py-2">{strings.headers.reasoning}</th>
                  <th className="px-3 py-2">{strings.headers.release}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-white/10">
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>{row.model}</span>
                        {row.modelUrl ? (
                          <a
                            className="inline-flex text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                            href={row.modelUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.lab}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatNumber(row.intelligenceIndex, 2)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatNumber(row.codingIndex, 2)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatNumber(row.agenticIndex, 2)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatCurrency(row.pricePer1m)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatNumber(row.outputTokensPerSecond, 1)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatNumber(row.ttftSeconds, 2)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatContext(row.contextWindowTokens)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.openWeights ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No")}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.reasoning ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No")}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.releaseDate?.slice(0, 10) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile scroll hint */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-white/60 to-transparent dark:from-slate-950/60 md:hidden" />
          </div>
        </div>
      )}
    </SectionFrame>
  );
}

function TopCard({
  item,
  label,
  locale,
  metric,
}: {
  item: AAModelRow | null;
  label: string;
  locale: Locale;
  metric: "intelligence" | "speed" | "price" | "latency" | "context";
}) {
  const value =
    metric === "intelligence"
      ? formatNumber(item?.intelligenceIndex ?? null, 2)
      : metric === "speed"
        ? formatNumber(item?.outputTokensPerSecond ?? null, 1)
        : metric === "price"
          ? formatCurrency(item?.pricePer1m ?? null)
          : metric === "latency"
            ? formatNumber(item?.ttftSeconds ?? null, 2)
            : formatContext(item?.contextWindowTokens ?? null);

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{item?.model ?? (locale === "tr" ? "Yok" : "N/A")}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{item?.lab ?? "-"}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
    </article>
  );
}

function bestBy(items: AAModelRow[], key: keyof AAModelRow, dir: "asc" | "desc"): AAModelRow | null {
  const sorted = [...items].sort((a, b) => compareNullable(a[key], b[key], dir));
  return sorted[0] ?? null;
}

function compareNullable(left: unknown, right: unknown, direction: "asc" | "desc"): number {
  const leftNumber = typeof left === "number" && Number.isFinite(left) ? left : null;
  const rightNumber = typeof right === "number" && Number.isFinite(right) ? right : null;
  if (leftNumber === null && rightNumber === null) return 0;
  if (leftNumber === null) return 1;
  if (rightNumber === null) return -1;
  if (direction === "asc") return leftNumber - rightNumber;
  return rightNumber - leftNumber;
}

function formatNumber(value: number | null, digits: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function formatContext(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200/70 bg-slate-50 p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {message}
    </div>
  );
}
