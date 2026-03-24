import { useMemo, useState } from "react";
import type { AAModelRow, Locale } from "./dashboard-types";

type CapabilityKey = "overall" | "coding" | "agentic" | "chat" | "reasoning";
type SizeMode = "sm" | "md" | "lg";

type CapabilityTierBoardProps = {
  items: AAModelRow[];
  locale: Locale;
};

const TIERS = ["S", "A", "B", "C", "D"] as const;
const MAX_PER_TIER = 5;

const tierColors: Record<(typeof TIERS)[number], string> = {
  S: "bg-red-500",
  A: "bg-orange-500",
  B: "bg-amber-400",
  C: "bg-emerald-400",
  D: "bg-blue-500",
};

const copy = {
  en: {
    title: "Capability Tiers",
    subtitle: "Theme-aligned model bands by selected capability.",
    empty: "No scored models found for this capability.",
    tabs: {
      overall: "Overall",
      coding: "Coding",
      agentic: "Agentic",
      chat: "Chat",
      reasoning: "Reasoning",
    },
    sizes: {
      sm: "Small",
      md: "Medium",
      lg: "Large",
    },
    context: "ctx",
  },
  tr: {
    title: "Yetenek Katmanları",
    subtitle: "Seçili yeteneğe göre tema uyumlu model bantları.",
    empty: "Bu yetenek için puanlanmış model bulunamadı.",
    tabs: {
      overall: "Overall",
      coding: "Coding",
      agentic: "Agentic",
      chat: "Chat",
      reasoning: "Reasoning",
    },
    sizes: {
      sm: "Küçük",
      md: "Orta",
      lg: "Büyük",
    },
    context: "ctx",
  },
} as const;

export function CapabilityTierBoard({ items, locale }: CapabilityTierBoardProps) {
  const strings = copy[locale];
  const [capability, setCapability] = useState<CapabilityKey>("overall");
  const [sizeMode, setSizeMode] = useState<SizeMode>("lg");

  const grouped = useMemo(() => {
    const scored = items
      .map((item) => {
        if (!matchesSizeMode(item, sizeMode)) {
          return null;
        }
        const score = pickScore(item, capability);
        return score === null ? null : { item, score };
      })
      .filter(Boolean) as Array<{ item: AAModelRow; score: number }>;

    scored.sort((left, right) => right.score - left.score);
    const total = scored.length;
    const buckets: Record<(typeof TIERS)[number], Array<{ item: AAModelRow; score: number }>> = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
    };

    scored.forEach((entry, index) => {
      const ratio = (index + 1) / total;
      const tier =
        ratio <= 0.2
          ? "S"
          : ratio <= 0.4
            ? "A"
            : ratio <= 0.6
              ? "B"
              : ratio <= 0.8
                ? "C"
                : "D";
      if (buckets[tier].length < MAX_PER_TIER) {
        buckets[tier].push(entry);
      }
    });

    return buckets;
  }, [items, capability, sizeMode]);

  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{strings.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{strings.subtitle}</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200/80 bg-white p-1 dark:border-white/10 dark:bg-white/5">
          {(["sm", "md", "lg"] as const).map((value) => (
            <button
              key={value}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${sizeMode === value
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              onClick={() => setSizeMode(value)}
              type="button"
            >
              {strings.sizes[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 inline-flex flex-wrap rounded-xl border border-slate-200/80 bg-white p-1 dark:border-white/10 dark:bg-white/5">
        {(["overall", "coding", "agentic", "chat", "reasoning"] as const).map((value) => (
          <button
            key={value}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${capability === value
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            onClick={() => setCapability(value)}
            type="button"
          >
            {strings.tabs[value]}
          </button>
        ))}
      </div>

      {Object.values(grouped).every((row) => row.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          {strings.empty}
        </div>
      ) : (
        <div className="space-y-2">
          {TIERS.map((tier) => (
            <div key={tier} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
              <div className={`grid min-h-[56px] place-items-center rounded-xl text-3xl font-bold text-slate-950 ${tierColors[tier]}`}>
                {tier}
              </div>
              <div className="min-h-[56px] rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-wrap gap-2">
                  {grouped[tier].map(({ item }) => (
                    <article
                      key={item.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100"
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--tt-blue)]" />
                      <span className="font-semibold">{item.model}</span>
                      <span className="text-slate-500 dark:text-slate-400">{formatContextMeta(item.contextWindowTokens, strings.context)}</span>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function pickScore(item: AAModelRow, capability: CapabilityKey): number | null {
  if (capability === "overall") return item.intelligenceIndex;
  if (capability === "coding") return item.codingIndex;
  if (capability === "agentic") return item.agenticIndex;
  if (capability === "chat") return item.mmluPro ?? item.intelligenceIndex;
  if (capability === "reasoning") return item.terminalBenchHard ?? item.gpqa;
  return null;
}

function matchesSizeMode(item: AAModelRow, sizeMode: SizeMode) {
  const ctx = item.contextWindowTokens;
  if (typeof ctx !== "number" || !Number.isFinite(ctx)) {
    return sizeMode === "md";
  }

  if (sizeMode === "sm") {
    return ctx <= 128_000;
  }
  if (sizeMode === "md") {
    return ctx > 128_000 && ctx <= 512_000;
  }
  return ctx > 512_000;
}

function formatContextMeta(value: number | null, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  if (value >= 1_000_000) return `${label} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${label} ${Math.round(value / 1_000)}K`;
  return `${label} ${value}`;
}
