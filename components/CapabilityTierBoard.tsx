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

// TT brand türevli tier renkleri
const tierConfig: Record<(typeof TIERS)[number], { bg: string; text: string; label: string }> = {
  S: { bg: "#C90C0F",      text: "#fff",     label: "S" },
  A: { bg: "#0035D6",      text: "#fff",     label: "A" },
  B: { bg: "#000C54",      text: "#fff",     label: "B" },
  C: { bg: "#1C1D52",      text: "#c4c6e8",  label: "C" },
  D: { bg: "rgba(0,12,84,0.15)", text: "var(--text-muted)", label: "D" },
};

const copy = {
  en: {
    title: "Capability Tiers",
    subtitle: "Theme-aligned model bands by selected capability.",
    empty: "No scored models found for this capability.",
    tabs: { overall: "Overall", coding: "Coding", agentic: "Agentic", chat: "Chat", reasoning: "Reasoning" },
    sizes: { sm: "Small", md: "Medium", lg: "Large" },
    context: "ctx",
  },
  tr: {
    title: "Yetenek Katmanları",
    subtitle: "Seçili yeteneğe göre tema uyumlu model bantları.",
    empty: "Bu yetenek için puanlanmış model bulunamadı.",
    tabs: { overall: "Overall", coding: "Coding", agentic: "Agentic", chat: "Chat", reasoning: "Reasoning" },
    sizes: { sm: "Küçük", md: "Orta", lg: "Büyük" },
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
        if (!matchesSizeMode(item, sizeMode)) return null;
        const score = pickScore(item, capability);
        return score === null ? null : { item, score };
      })
      .filter(Boolean) as Array<{ item: AAModelRow; score: number }>;

    scored.sort((a, b) => b.score - a.score);
    const total = scored.length;
    const buckets: Record<(typeof TIERS)[number], Array<{ item: AAModelRow; score: number }>> = {
      S: [], A: [], B: [], C: [], D: [],
    };

    scored.forEach((entry, index) => {
      const ratio = (index + 1) / total;
      const tier = ratio <= 0.2 ? "S" : ratio <= 0.4 ? "A" : ratio <= 0.6 ? "B" : ratio <= 0.8 ? "C" : "D";
      if (buckets[tier].length < MAX_PER_TIER) buckets[tier].push(entry);
    });

    return buckets;
  }, [items, capability, sizeMode]);

  return (
    <section
      className="rounded-[var(--radius-panel)]"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-card)",
        boxShadow: "var(--shadow-md)",
        padding: "1.25rem",
      }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            {strings.title}
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {strings.subtitle}
          </p>
        </div>
        {/* Size toggle */}
        <div
          className="inline-flex rounded-xl p-1"
          style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
        >
          {(["sm", "md", "lg"] as const).map((value) => (
            <button
              key={value}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
              style={{
                background: sizeMode === value ? "var(--text)" : "transparent",
                color: sizeMode === value ? "var(--surface)" : "var(--text-muted)",
              }}
              onClick={() => setSizeMode(value)}
              type="button"
            >
              {strings.sizes[value]}
            </button>
          ))}
        </div>
      </div>

      {/* Capability tabs */}
      <div
        className="mb-3 inline-flex flex-wrap rounded-xl p-1"
        style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
      >
        {(["overall", "coding", "agentic", "chat", "reasoning"] as const).map((value) => (
          <button
            key={value}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
            style={{
              background: capability === value ? "var(--accent)" : "transparent",
              color: capability === value ? "#fff" : "var(--text-muted)",
            }}
            onClick={() => setCapability(value)}
            type="button"
          >
            {strings.tabs[value]}
          </button>
        ))}
      </div>

      {Object.values(grouped).every((row) => row.length === 0) ? (
        <div
          className="rounded-xl p-6 text-sm"
          style={{
            border: "1px dashed var(--border-strong)",
            background: "var(--surface-subtle)",
            color: "var(--text-muted)",
          }}
        >
          {strings.empty}
        </div>
      ) : (
        <div className="space-y-2">
          {TIERS.map((tier) => {
            const cfg = tierConfig[tier];
            return (
              <div key={tier} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
                <div
                  className="grid min-h-[3rem] place-items-center rounded-xl text-2xl font-bold"
                  style={{ background: cfg.bg, color: cfg.text }}
                >
                  {cfg.label}
                </div>
                <div
                  className="min-h-[3rem] rounded-xl p-2"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {grouped[tier].map(({ item }) => (
                      <article
                        key={item.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs"
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--surface-card)",
                          color: "var(--text)",
                        }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ background: tier === "D" ? "var(--text-muted)" : cfg.bg }}
                        />
                        <span className="font-semibold">{item.model}</span>
                        <span style={{ color: "var(--text-faint)" }}>
                          {formatContextMeta(item.contextWindowTokens, strings.context)}
                        </span>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
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
  if (typeof ctx !== "number" || !Number.isFinite(ctx)) return sizeMode === "md";
  if (sizeMode === "sm") return ctx <= 128_000;
  if (sizeMode === "md") return ctx > 128_000 && ctx <= 512_000;
  return ctx > 512_000;
}

function formatContextMeta(value: number | null, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value >= 1_000_000) return `${label} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${label} ${Math.round(value / 1_000)}K`;
  return `${label} ${value}`;
}
