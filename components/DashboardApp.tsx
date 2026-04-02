"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AAModelRow,
  AiNewsItem,
  FeedState,
  LeaderboardRow,
  Locale,
  PricePoint,
  ReleaseItem,
} from "./dashboard-types";
import { daysAgo } from "./dashboard-utils";
import { CapabilityTierBoard } from "./CapabilityTierBoard";
import { ModelExplorer, type SectionKey } from "./ModelExplorer";

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
    sourceRelease: "Hugging Face Hub",
    sourceLeaderboard: "Hugging Face Leaderboard",
    sourcePricing: "Pricing Feed",
    sourceAA: "Artificial Analysis",
    sourceAiNews: "Hacker News (Algolia)",
  },
  tr: {
    sourceRelease: "Hugging Face Hub",
    sourceLeaderboard: "Hugging Face Leaderboard",
    sourcePricing: "Fiyat Verisi",
    sourceAA: "Artificial Analysis",
    sourceAiNews: "Hacker News (Algolia)",
  },
} as const;

export type DashboardAppProps = {
  locale: Locale;
  initialSection?: SectionKey;
  lockSection?: boolean;
  showCapabilityTiers?: boolean;
  showSectionTabs?: boolean;
};

export default function DashboardApp({
  locale,
  initialSection = "general",
  lockSection = false,
  showCapabilityTiers = false,
  showSectionTabs = true,
}: DashboardAppProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>(initialSection);
  const [feeds, setFeeds] = useState<DashboardBundle>(() => makeInitialFeeds());
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats | null>(null);
  const [monitoringStatsLoading, setMonitoringStatsLoading] = useState(initialSection === "general");

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    let alive = true;
    const sourceLabels = copy[locale];

    async function run() {
      setFeeds((current) => ({
        ...current,
        artificialAnalysis: { ...current.artificialAnalysis, data: [], loading: true, error: null },
        aiNews: { ...current.aiNews, data: [], loading: initialSection === "general", error: null },
        leaderboard: { ...current.leaderboard, data: [], loading: false, error: null },
        pricing: { ...current.pricing, data: [], loading: false, error: null },
        releases: { ...current.releases, data: [], loading: false, error: null },
      }));

      if (initialSection === "general") {
        setMonitoringStatsLoading(true);
      } else {
        setMonitoringStatsLoading(false);
      }

      const aaPromise = loadFeed(
        "artificial-analysis",
        "/api/monitoring/leaderboard?category=general_llm",
        [],
        sourceLabels.sourceAA,
        parseAAModelsFeed,
        45_000,
      );

      const aiNewsPromise =
        initialSection === "general"
          ? loadFeed(
              "ai-news",
              "/api/ai-news",
              [],
              sourceLabels.sourceAiNews,
              parseAiNewsFeed,
            )
          : Promise.resolve({
              data: [] as AiNewsItem[],
              error: null,
              lastSuccessAt: new Date().toISOString(),
              loading: false,
              sourceLabel: sourceLabels.sourceAiNews,
            } satisfies FeedState<AiNewsItem[]>);

      const monitoringStatsPromise =
        initialSection === "general"
          ? requestJson("/api/monitoring/stats", 20_000)
              .then((payload) => parseMonitoringStats(payload))
              .catch(() => null)
          : Promise.resolve(null);

      void aaPromise.then((artificialAnalysis) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, artificialAnalysis }));
      });

      void aiNewsPromise.then((aiNews) => {
        if (!alive) return;
        setFeeds((current) => ({ ...current, aiNews }));
      });

      void monitoringStatsPromise
        .then((stats) => {
          if (!alive) return;
          if (stats) {
            setMonitoringStats(stats);
          }
        })
        .finally(() => {
          if (!alive) return;
          setMonitoringStatsLoading(false);
        });
    }

    void run();

    return () => {
      alive = false;
    };
  }, [initialSection, locale]);

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
      sources: 0,
      snapshotAt: feeds.artificialAnalysis.lastSuccessAt,
    };
  }, [feeds.artificialAnalysis.data, feeds.artificialAnalysis.lastSuccessAt]);

  const statCards = monitoringStats ?? fallbackStats;

  return (
    <div className="min-h-full transition-colors duration-300" style={{ color: "var(--text)" }}>
      <main className="mx-auto flex w-full max-w-none flex-col gap-5 overflow-hidden px-4 pb-4 sm:px-6 lg:px-8">
        <ModelExplorer
          key={`${initialSection}-${lockSection ? "locked" : "free"}`}
          aaModels={feeds.artificialAnalysis.data}
          aaModelsLoading={feeds.artificialAnalysis.loading}
          aiNews={feeds.aiNews.data}
          aiNewsLoading={feeds.aiNews.loading}
          last30DaysCount={statCards.last30Days}
          locale={locale}
          modelCount={statCards.totalModels}
          providerCount={statCards.providers}
          sourceCount={statCards.sources}
          onSectionChange={setActiveSection}
          initialSection={initialSection}
          statsLoading={monitoringStatsLoading}
          showSectionTabs={showSectionTabs}
        />
        {showCapabilityTiers && activeSection === "general" ? (
          <CapabilityTierBoard items={feeds.artificialAnalysis.data} locale={locale} />
        ) : null}
      </main>
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
      loading: false,
      sourceLabel: copy.en.sourceRelease,
    },
    leaderboard: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: false,
      sourceLabel: copy.en.sourceLeaderboard,
    },
    pricing: {
      data: [],
      error: null,
      lastSuccessAt: daysAgo(1),
      loading: false,
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
    console.error(`Feed load failed: ${feedName}`, error);
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

function parseAAModelsFeed(payload: unknown) {
  const data = extractList(payload, ["items", "rows", "data", "results"]);
  const normalized = data.map(normalizeAAModelItem).filter(Boolean) as AAModelRow[];
  return normalized;
}

function parseAiNewsFeed(payload: unknown) {
  const data = extractList(payload, ["items", "news", "rows", "data", "results"]);
  const normalized = data.map(normalizeAiNewsItem).filter(Boolean) as AiNewsItem[];
  return normalized;
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
  const normalizePositiveValue = (val: number | null): number | null => {
    if (typeof val !== "number" || !Number.isFinite(val)) return null;
    return val > 0 ? val : null;
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
    sourceDisplay: pickString(value, ["sourceDisplay"], "") || undefined,
    publisher: pickString(value, ["publisher"], "") || null,
    description: pickString(value, ["description", "summary"], "") || null,
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
