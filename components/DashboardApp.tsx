"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Languages } from "lucide-react";
import type {
  AAModelRow,
  AiNewsItem,
  FeedState,
  LeaderboardRow,
  Locale,
  PricePoint,
  ReleaseItem,
} from "./dashboard-types";
import { daysAgo, formatLocaleCode } from "./dashboard-utils";
import { CapabilityTierBoard } from "./CapabilityTierBoard";
import { ModelExplorer } from "./ModelExplorer";
import { CountUpStat } from "./ui/CountUpStat";

type DashboardBundle = {
  artificialAnalysis: FeedState<AAModelRow[]>;
  aiNews: FeedState<AiNewsItem[]>;
  leaderboard: FeedState<LeaderboardRow[]>;
  pricing: FeedState<PricePoint[]>;
  releases: FeedState<ReleaseItem[]>;
};

type MonitoringStats = {
  last30Days: number;
  providers: number;
  snapshotAt: string | null;
  sources: number;
  totalModels: number;
};

const copy = {
  en: {
    title: "AI Intelligence Dashboard",
    subtitle:
      "Track fresh model releases, benchmark movement, and price-to-performance in one internal view.",
    updated: "Updated",
    locale: "TR / EN",
    theme: "Theme",
    loading: "Fetching internal feeds",
    sourceRelease: "Hugging Face Hub",
    sourceLeaderboard: "Hugging Face Leaderboard",
    sourcePricing: "Pricing Feed",
    sourceAA: "Artificial Analysis",
    sourceAiNews: "Hacker News (Algolia)",
    overview: "Overview",
    ready: "Snapshot ready",
  },
  tr: {
    title: "AI Intelligence Dashboard",
    subtitle: "",
    updated: "Güncellendi",
    locale: "TR / EN",
    theme: "Tema",
    loading: "İç veri kaynakları alınıyor",
    sourceRelease: "Hugging Face Hub",
    sourceLeaderboard: "Hugging Face Leaderboard",
    sourcePricing: "Fiyat Verisi",
    sourceAA: "Artificial Analysis",
    sourceAiNews: "Hacker News (Algolia)",
    overview: "Genel Bakış",
    ready: "Görünüm hazır",
  },
} as const;

const BRANDED_STYLE = {
  "--tt-red": "#C90C0F",
  "--tt-black": "#000000",
  "--tt-white": "#FFFFFF",
  "--tt-navy": "#000C54",
  "--tt-deep-navy": "#1C1D52",
  "--tt-blue": "#0035D6",
  "--tt-purple": "#1E122F",
  "--tt-pink": "#CB29AC",
} as import("react").CSSProperties;

type DashboardAppProps = {
  showCapabilityTiers?: boolean;
};

export default function DashboardApp({ showCapabilityTiers = false }: DashboardAppProps) {
  return <DashboardShell showCapabilityTiers={showCapabilityTiers} />;
}

function DashboardShell({ showCapabilityTiers }: { showCapabilityTiers: boolean }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [activeSection, setActiveSection] = useState("general");
  const [feeds, setFeeds] = useState<DashboardBundle>(() => makeInitialFeeds());
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats | null>(null);

  useEffect(() => {
    let alive = true;
    const sourceLabels = copy.en;

    async function run() {
      setFeeds((current) => ({
        ...current,
        artificialAnalysis: { ...current.artificialAnalysis, data: [], loading: true, error: null },
        aiNews: { ...current.aiNews, data: [], loading: true, error: null },
        leaderboard: { ...current.leaderboard, data: [], loading: true, error: null },
        pricing: { ...current.pricing, data: [], loading: true, error: null },
        releases: { ...current.releases, data: [], loading: true, error: null },
      }));

      const releasesPromise = loadFeed(
        "releases",
        "/api/releases",
        [],
        sourceLabels.sourceRelease,
        parseReleasesFeed,
      );
      const leaderboardPromise = loadFeed(
        "leaderboard",
        "/api/leaderboard",
        [],
        sourceLabels.sourceLeaderboard,
        parseLeaderboardFeed,
      );
      const pricingPromise = loadFeed(
        "pricing",
        "/api/pricing",
        [],
        sourceLabels.sourcePricing,
        parsePricingFeed,
      );
      const aaPromise = loadFeed(
        "artificial-analysis",
        "/api/monitoring/leaderboard?category=general_llm",
        [],
        sourceLabels.sourceAA,
        parseAAModelsFeed,
        45_000,
      );
      const aiNewsPromise = loadFeed(
        "ai-news",
        "/api/ai-news",
        [],
        sourceLabels.sourceAiNews,
        parseAiNewsFeed,
      );
      const monitoringStatsPromise = requestJson("/api/monitoring/stats", 20_000)
        .then((payload) => parseMonitoringStats(payload))
        .catch(() => null);

      void releasesPromise.then((releases) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, releases }));
      });
      void leaderboardPromise.then((leaderboard) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, leaderboard }));
      });
      void pricingPromise.then((pricing) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, pricing }));
      });
      void aaPromise.then((artificialAnalysis) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, artificialAnalysis }));
      });
      void aiNewsPromise.then((aiNews) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, aiNews }));
      });
      void monitoringStatsPromise.then((stats) => {
        if (!alive || !stats) return;
        setMonitoringStats(stats);
      });
    }

    void run();

    return () => {
      alive = false;
    };
  }, []);

  const fallbackSourceCount = new Set([
    feeds.releases.sourceLabel,
    feeds.leaderboard.sourceLabel,
    feeds.pricing.sourceLabel,
    feeds.artificialAnalysis.sourceLabel,
  ]).size;
  const fallbackStats = useMemo<MonitoringStats>(() => {
    const nowTs = Date.parse(feeds.artificialAnalysis.lastSuccessAt);
    return {
      totalModels: feeds.artificialAnalysis.data.length,
      last30Days: feeds.artificialAnalysis.data.filter((row) => {
        if (!row.releaseDate) return false;
        const parsed = Date.parse(row.releaseDate);
        return Number.isFinite(nowTs) && Number.isFinite(parsed) && nowTs - parsed <= 30 * 24 * 60 * 60 * 1000;
      }).length,
      providers: new Set(
        feeds.artificialAnalysis.data
          .map((row) => row.lab.trim())
          .filter(Boolean),
      ).size,
      sources: fallbackSourceCount,
      snapshotAt: feeds.artificialAnalysis.lastSuccessAt,
    };
  }, [fallbackSourceCount, feeds.artificialAnalysis.data, feeds.artificialAnalysis.lastSuccessAt]);

  const statCards = monitoringStats ?? fallbackStats;

  return (
    <div
      className="min-h-full transition-colors duration-300"
      style={{ color: "var(--text)" }}
    >
      <HeaderControlsPortal>
        <LocaleToggle locale={locale} setLocale={setLocale} />
      </HeaderControlsPortal>

      <main className="mx-auto flex w-full max-w-none flex-col gap-5 overflow-hidden px-4 pb-4 sm:px-6 lg:px-8">
        <ModelExplorer
          aaModels={feeds.artificialAnalysis.data}
          aaModelsLoading={feeds.artificialAnalysis.loading}
          aiNews={feeds.aiNews.data}
          last30DaysCount={statCards.last30Days}
          locale={locale}
          modelCount={statCards.totalModels}
          providerCount={statCards.providers}
          sourceCount={statCards.sources}
          onSectionChange={setActiveSection}
        />
        {showCapabilityTiers && activeSection === "general" ? (
          <CapabilityTierBoard
            items={feeds.artificialAnalysis.data}
            locale={locale}
          />
        ) : null}
      </main>
    </div>
  );
}

function HeaderControlsPortal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!mounted) {
    return null;
  }

  const target = document.getElementById("dashboard-header-controls");
  if (!target) {
    return null;
  }

  return createPortal(children, target);
}

function LocaleToggle({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full p-1"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-card)",
      }}
    >
      {(["en", "tr"] as const).map((value) => (
        <button
          key={value}
          aria-pressed={locale === value}
          className="rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-all duration-150"
          style={{
            background: locale === value ? "var(--accent)" : "transparent",
            color: locale === value ? "#fff" : "var(--text-muted)",
          }}
          onClick={() => setLocale(value)}
          type="button"
        >
          {formatLocaleCode(value)}
        </button>
      ))}
      <span className="sr-only">{locale === "tr" ? "Dil seçici" : "Language selector"}</span>
      <Languages className="sr-only h-4 w-4" />
    </div>
  );
}

function StatCard({
  label,
  meta,
  value,
}: {
  label: string;
  meta?: string;
  value: number;
}) {
  return (
    <div
      className="panel-interactive flex min-w-0 flex-1 flex-col rounded-xl px-4 py-3 sm:px-5 sm:py-4"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-card)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-2 text-3xl font-bold sm:text-4xl"
        style={{ color: "var(--text)" }}
      >
        <CountUpStat value={value} />
      </div>
      {meta ? (
        <div
          className="mt-1 max-w-[14rem] truncate text-[11px]"
          style={{ color: "var(--text-faint)" }}
          title={meta}
        >
          {meta}
        </div>
      ) : null}
    </div>
  );
}


function makeInitialFeeds(): DashboardBundle {
  return {
    artificialAnalysis: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceAA,
    },
    aiNews: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceAiNews,
    },
    releases: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceRelease,
    },
    leaderboard: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceLeaderboard,
    },
    pricing: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourcePricing,
    },
  };
}

async function loadFeed<T>(
  feedName: string,
  url: string,
  fallback: T,
  sourceLabel: string,
  normalize: (payload: unknown) => T | null,
  timeoutMs = 15_000,
): Promise<FeedState<T>> {
  try {
    const payload = await requestJson(url, timeoutMs);
    const normalized = normalize(payload);

    if (!normalized) {
      throw new Error("Invalid payload");
    }

    return {
      data: normalized,
      error: null,
      lastSuccessAt: extractPayloadTimestamp(payload) ?? extractFallbackTimestamp(fallback),
      loading: false,
      sourceLabel,
    };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : "Internal feed unavailable.",
      lastSuccessAt: extractFallbackTimestamp(fallback),
      loading: false,
      sourceLabel,
    };
  }
}

async function requestJson(url: string, timeoutMs = 15_000) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === maxAttempts) {
          throw new Error(`HTTP ${response.status}`);
        }

        await delay(backoffDelay(attempt));
        continue;
      }

      return response.json();
    } catch (error) {
      const shouldRetry = attempt < maxAttempts;

      if (!shouldRetry) {
        throw error;
      }

      await delay(backoffDelay(attempt));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error("Request failed");
}

function parseReleasesFeed(payload: unknown) {
  const data = extractList(payload, ["items", "releases", "data", "results"]);
  const normalized = data.map(normalizeReleaseItem).filter(Boolean) as ReleaseItem[];

  return normalized.length ? normalized : null;
}

function parseLeaderboardFeed(payload: unknown) {
  const data = extractList(payload, ["items", "rows", "data", "results"]);
  const normalized = data.map(normalizeLeaderboardItem).filter(Boolean) as LeaderboardRow[];

  return normalized.length ? normalized : null;
}

function parsePricingFeed(payload: unknown) {
  const data = extractList(payload, ["items", "points", "data", "results"]);
  const normalized = data.map(normalizePriceItem).filter(Boolean) as PricePoint[];

  return normalized.length ? normalized : null;
}

function parseAAModelsFeed(payload: unknown) {
  const data = extractList(payload, ["items", "rows", "data", "results"]);
  const normalized = data.map(normalizeAAModelItem).filter(Boolean) as AAModelRow[];
  return normalized.length ? normalized : null;
}

function parseAiNewsFeed(payload: unknown) {
  const data = extractList(payload, ["items", "news", "rows", "data", "results"]);
  const normalized = data.map(normalizeAiNewsItem).filter(Boolean) as AiNewsItem[];
  return normalized.length ? normalized : null;
}

function parseMonitoringStats(payload: unknown): MonitoringStats | null {
  if (!isRecord(payload)) {
    return null;
  }

  const totalModels = pickNumber(payload, ["totalModels"], -1);
  const last30Days = pickNumber(payload, ["last30Days"], -1);
  const providers = pickNumber(payload, ["providers"], -1);
  const sources = pickNumber(payload, ["sources"], -1);

  if (totalModels < 0 || last30Days < 0 || providers < 0 || sources < 0) {
    return null;
  }

  return {
    totalModels,
    last30Days,
    providers,
    sources,
    snapshotAt: pickString(payload, ["snapshotAt"], "") || null,
  };
}

function normalizeReleaseItem(value: unknown): ReleaseItem | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: pickString(value, ["id", "slug", "name"], crypto.randomUUID()),
    lab: pickString(value, ["lab", "provider", "organization"], "Unknown"),
    model: pickString(value, ["model", "name", "title"], "Unknown model"),
    releasedAt: pickString(value, ["releasedAt", "publishedAt", "date"], new Date().toISOString()),
    summary: pickString(value, ["summary", "description", "body"], "No summary available."),
    url: pickString(value, ["url", "href", "link"], "https://huggingface.co"),
  };
}

function normalizeLeaderboardItem(value: unknown): LeaderboardRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: pickString(value, ["id", "slug", "name"], crypto.randomUUID()),
    arc: pickNumber(value, ["arc", "ARC", "arc_score"], 0),
    hellaswag: pickNumber(value, ["hellaswag", "HellaSwag"], 0),
    humaneval: pickNumber(value, ["humaneval", "humanEval", "HumanEval"], 0),
    lab: pickString(value, ["lab", "provider", "organization"], "Unknown"),
    mmlu: pickNumber(value, ["mmlu", "MMLU"], 0),
    model: pickString(value, ["model", "name", "title"], "Unknown model"),
    openSource: pickBoolean(value, ["openSource", "open_source", "isOpenSource"]),
    parameters: pickString(value, ["parameters", "params", "parameterCount"], "Unknown"),
    releasedAt: pickString(value, ["releasedAt", "publishedAt", "date"], new Date().toISOString()),
    mtBench: pickNumber(value, ["mtBench", "mt_bench", "MT-Bench"], 0),
  };
}

function normalizePriceItem(value: unknown): PricePoint | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: pickString(value, ["id", "slug", "name"], crypto.randomUUID()),
    lab: pickString(value, ["lab", "provider", "organization"], "Unknown"),
    model: pickString(value, ["model", "name", "title"], "Unknown model"),
    params: pickNumber(value, ["params", "parameters", "parameterCount"], 0),
    pricePer1m: pickNumber(value, ["pricePer1m", "pricePer1mTokens", "price"], 0),
    score: pickNumber(value, ["score", "value", "mmlu", "humaneval"], 0),
  };
}

function normalizeAAModelItem(value: unknown): AAModelRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const model = pickString(value, ["short_name", "name", "model"], "Unknown model");
  const lab = pickString(value, ["lab", "provider", "organization", "creator"], "Unknown");
  const creator = isRecord(value.model_creators) ? value.model_creators : null;
  const timescaleData = isRecord(value.timescaleData) ? value.timescaleData : null;
  const endToEnd = isRecord(value.end_to_end_response_time_metrics)
    ? value.end_to_end_response_time_metrics
    : null;
  const openWeights = pickBoolean(value, ["is_open_weights", "is_open_source", "openSource", "open_weights"]);
  const reasoning = pickBoolean(value, ["reasoning_model", "reasoning"]);
  const releaseDate = pickString(value, ["release_date", "releasedAt", "date"], "");
  const hostsUrl = pickString(value, ["hosts_url", "model_url", "url"], "");
  const modelUrl =
    hostsUrl.startsWith("http")
      ? hostsUrl
      : hostsUrl
        ? `https://artificialanalysis.ai${hostsUrl}`
        : null;

  const normalizeBenchmarkScore = (score: number | null): number | null => {
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    if (score <= 0) return null;
    if (score >= 0 && score <= 1) return score * 100;
    return score;
  };
  const normalizePositiveValue = (value: number | null): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value > 0 ? value : null;
  };

  const gpqa = normalizeBenchmarkScore(pickNullableNumber(value, ["gpqa"]));
  const mmluPro = normalizeBenchmarkScore(pickNullableNumber(value, ["mmlu_pro", "mmluPro"]));
  const terminalBenchHard = normalizeBenchmarkScore(
    pickNullableNumber(value, ["terminalbench_hard", "terminalBenchHard"]),
  );
  const sweBench = normalizeBenchmarkScore(
    pickNullableNumber(value, ["swe_bench", "sweBench", "swebench", "swe_bench_verified", "swebench_verified"]),
  );

  return {
    id: pickString(value, ["id", "slug", "name"], crypto.randomUUID()),
    model,
    lab: pickString(creator ?? value, ["name", "lab", "provider"], lab),
    intelligenceIndex: normalizePositiveValue(pickNullableNumber(value, ["intelligence_index"])),
    codingIndex: normalizePositiveValue(pickNullableNumber(value, ["coding_index"])),
    agenticIndex: normalizePositiveValue(pickNullableNumber(value, ["agentic_index"])),
    gpqa,
    mmluPro,
    terminalBenchHard,
    sweBench,
    pricePer1m: normalizePositiveValue(pickNullableNumber(value, ["price_1m_blended_3_to_1"])),
    inputPricePer1m: normalizePositiveValue(pickNullableNumber(value, ["price_1m_input_tokens"])),
    outputPricePer1m: normalizePositiveValue(pickNullableNumber(value, ["price_1m_output_tokens"])),
    outputTokensPerSecond: normalizePositiveValue(
      pickNullableNumber(value, ["output_tokens_per_second", "outputTokensPerSecond"])
      ?? pickNullableNumber(timescaleData ?? {}, ["median_output_speed"]),
    ),
    ttftSeconds: normalizePositiveValue(
      pickNullableNumber(value, ["ttft_seconds", "ttftSeconds"])
      ?? pickNullableNumber(timescaleData ?? {}, ["median_time_to_first_chunk"]),
    ),
    endToEndSeconds: normalizePositiveValue(
      pickNullableNumber(value, ["end_to_end_seconds", "endToEndSeconds"])
      ?? pickNullableNumber(endToEnd ?? {}, ["total_time"]),
    ),
    contextWindowTokens: normalizePositiveValue(pickNullableNumber(value, ["context_window_tokens"])),
    openWeights,
    reasoning,
    releaseDate: releaseDate || null,
    modelUrl,
  };
}

function normalizeAiNewsItem(value: unknown): AiNewsItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const link = pickString(value, ["link", "url", "href"], "");
  if (!link) {
    return null;
  }

  return {
    id: pickString(value, ["id"], link),
    title: pickString(value, ["title", "name"], "Untitled"),
    link,
    source: pickString(value, ["source", "publisher"], "Hacker News"),
    publishedAt: pickString(value, ["publishedAt", "pubDate", "date"], new Date().toISOString()),
    timeAgo: pickString(value, ["timeAgo"], "") || null,
    imageUrl: pickString(value, ["imageUrl", "image", "thumbnail", "image_url"], "") || null,
  };
}

function extractList(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (isRecord(candidate)) {
      const nested = candidate.items ?? candidate.data ?? candidate.results ?? candidate.points;
      if (Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return [];
}

function extractPayloadTimestamp(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const timestamp = pickString(payload, [
    "last_success_at",
    "lastSuccessAt",
    "updated_at",
    "updatedAt",
    "timestamp",
  ], "");

  return timestamp || null;
}

function extractFallbackTimestamp<T>(fallback: T) {
  if (Array.isArray(fallback) && fallback.length > 0) {
    const first = fallback[0] as Record<string, unknown>;
    return (
      pickString(first, ["lastSuccessAt", "releasedAt", "date"], "") ||
      new Date().toISOString()
    );
  }

  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(
  value: Record<string, unknown>,
  keys: string[],
  fallback: string,
) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return fallback;
}

function pickNumber(value: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed.length) {
        continue;
      }
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function pickNullableNumber(value: Record<string, unknown>, keys: string[]) {
  const parsed = pickNumber(value, keys, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickBoolean(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "boolean") {
      return candidate;
    }
    if (typeof candidate === "string") {
      if (candidate.toLowerCase() === "true") {
        return true;
      }
      if (candidate.toLowerCase() === "false") {
        return false;
      }
    }
  }

  return false;
}

function backoffDelay(attempt: number) {
  const base = 300 * 2 ** (attempt - 1);
  return base + Math.round(Math.random() * 120);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
