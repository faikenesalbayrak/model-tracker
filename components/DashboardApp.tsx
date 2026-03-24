"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Languages,
  Monitor,
  MoonStar,
  RefreshCcw,
  Sparkles,
  SunMedium,
} from "lucide-react";
import { fallbackBenchmarks, fallbackLeaderboard, fallbackPricing, fallbackReleases } from "./dashboard-data";
import type {
  BenchmarkPoint,
  FeedState,
  LeaderboardRow,
  Locale,
  PricePoint,
  ReleaseItem,
} from "./dashboard-types";
import { daysAgo, formatLocaleCode } from "./dashboard-utils";
import { HeroReleases } from "./HeroReleases";
import { LeaderboardTable } from "./LeaderboardTable";
import { PricePerformance } from "./PricePerformance";
import { SotaChart } from "./SotaChart";

import logoDark from "../style/logos/tt-dark-horizontal-single.png";
import logoLight from "../style/logos/tt-light-horizontal-single.png";

type DashboardBundle = {
  benchmarks: FeedState<BenchmarkPoint[]>;
  leaderboard: FeedState<LeaderboardRow[]>;
  pricing: FeedState<PricePoint[]>;
  releases: FeedState<ReleaseItem[]>;
};

const copy = {
  en: {
    title: "AI Intelligence Dashboard",
    subtitle:
      "Track fresh model releases, benchmark movement, and price-to-performance in one internal view.",
    locale: "TR / EN",
    theme: "Theme",
    refresh: "Refresh",
    loading: "Fetching internal feeds",
    sourceRelease: "Hugging Face Hub",
    sourceLeaderboard: "Hugging Face Leaderboard",
    sourceBenchmarks: "Papers With Code",
    sourcePricing: "Pricing Feed",
    overview: "Overview",
    ready: "Snapshot ready",
    safeMode: "Resilient fallback stays visible when upstream APIs slow down.",
  },
  tr: {
    title: "AI Intelligence Dashboard",
    subtitle:
      "Yeni model release'lerini, benchmark hareketlerini ve fiyat/performans görünümünü tek ekranda izleyin.",
    locale: "TR / EN",
    theme: "Tema",
    refresh: "Yenile",
    loading: "İç veri kaynakları alınıyor",
    sourceRelease: "Hugging Face Hub",
    sourceLeaderboard: "Hugging Face Leaderboard",
    sourceBenchmarks: "Papers With Code",
    sourcePricing: "Fiyat Verisi",
    overview: "Genel Bakış",
    ready: "Gorunum hazir",
    safeMode: "Ust API yavasladiginda dayanikli fallback gorunur kalir.",
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

export default function DashboardApp() {
  return <DashboardShell />;
}

function DashboardShell() {
  const [locale, setLocale] = useState<Locale>("en");
  const [refreshTick, setRefreshTick] = useState(0);
  const strings = copy[locale];
  const [feeds, setFeeds] = useState<DashboardBundle>(() => makeInitialFeeds());

  useEffect(() => {
    let alive = true;

    async function run() {
      setFeeds((current) => ({
        ...current,
        benchmarks: { ...current.benchmarks, loading: true, error: null },
        leaderboard: { ...current.leaderboard, loading: true, error: null },
        pricing: { ...current.pricing, loading: true, error: null },
        releases: { ...current.releases, loading: true, error: null },
      }));

      const [releases, leaderboard, benchmarks, pricing] = await Promise.all([
        loadFeed("releases", "/api/releases", fallbackReleases, strings.sourceRelease, parseReleasesFeed),
        loadFeed(
          "leaderboard",
          "/api/leaderboard",
          fallbackLeaderboard,
          strings.sourceLeaderboard,
          parseLeaderboardFeed,
        ),
        loadFeed(
          "benchmarks",
          "/api/benchmarks",
          fallbackBenchmarks,
          strings.sourceBenchmarks,
          parseBenchmarksFeed,
        ),
        loadFeed("pricing", "/api/pricing", fallbackPricing, strings.sourcePricing, parsePricingFeed),
      ]);

      if (!alive) {
        return;
      }

      setFeeds({ releases, leaderboard, benchmarks, pricing });
    }

    void run();

    return () => {
      alive = false;
    };
  }, [refreshTick, strings.sourceBenchmarks, strings.sourceLeaderboard, strings.sourcePricing, strings.sourceRelease]);

  const totals = useMemo(
    () => ({
      releases: feeds.releases.data.length,
      leaderboard: feeds.leaderboard.data.length,
      benchmarks: feeds.benchmarks.data.length,
      pricing: feeds.pricing.data.length,
    }),
    [feeds],
  );

  const hasAnyLoading =
    feeds.releases.loading ||
    feeds.leaderboard.loading ||
    feeds.benchmarks.loading ||
    feeds.pricing.loading;

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,12,15,0.16),transparent_25%),radial-gradient(circle_at_top_right,rgba(0,12,84,0.14),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-950 transition-colors duration-300 dark:bg-[radial-gradient(circle_at_top_left,rgba(201,12,15,0.18),transparent_25%),radial-gradient(circle_at_top_right,rgba(0,12,84,0.18),transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-white"
      style={BRANDED_STYLE}
    >
      <header className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:pt-10">
        <div className="animate-enter relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(201,12,15,0.08),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(0,53,214,0.08),transparent_26%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="panel-interactive overflow-hidden rounded-2xl border border-slate-200/70 bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-slate-950">
                  <Image
                    alt="Turkish Technology logo"
                    className="hidden h-8 w-auto dark:block"
                    priority
                    src={logoDark}
                  />
                  <Image
                    alt="Turkish Technology logo"
                    className="h-8 w-auto dark:hidden"
                    priority
                    src={logoLight}
                  />
                </div>
                <span className="rounded-full border border-[color:var(--tt-red)]/20 bg-[color:var(--tt-red)]/10 px-3 py-1.5 text-xs font-semibold tracking-[0.22em] text-[color:var(--tt-red)]">
                  {strings.overview}
                </span>
                <span className="rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {hasAnyLoading ? strings.loading : strings.ready}
                </span>
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
                {strings.title}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                {strings.subtitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 animate-enter animate-enter-delay-1">
              <StatCard label={locale === "tr" ? "Release" : "Releases"} value={totals.releases} />
              <StatCard label={locale === "tr" ? "Leaderboard" : "Leaderboard"} value={totals.leaderboard} />
              <StatCard label={locale === "tr" ? "Benchmark" : "Benchmarks"} value={totals.benchmarks} />
              <StatCard label={locale === "tr" ? "Fiyat" : "Pricing"} value={totals.pricing} />
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/70 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle locale={locale} setLocale={setLocale} />
              <ThemeToggle locale={locale} />
              <button
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[color:var(--tt-red)]/30 hover:bg-[color:var(--tt-red)]/5 hover:text-slate-950 focus-visible:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() => setRefreshTick((value) => value + 1)}
                type="button"
              >
                <RefreshCcw className={`h-4 w-4 ${hasAnyLoading ? "animate-spin" : ""}`} />
                {strings.refresh}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="h-4 w-4 text-[color:var(--tt-red)]" />
              <span>{strings.safeMode}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8">
        <HeroReleases
          error={feeds.releases.error}
          items={feeds.releases.data}
          lastSuccessAt={feeds.releases.lastSuccessAt}
          locale={locale}
          loading={feeds.releases.loading}
          sourceLabel={feeds.releases.sourceLabel}
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <LeaderboardTable
            error={feeds.leaderboard.error}
            items={feeds.leaderboard.data}
            lastSuccessAt={feeds.leaderboard.lastSuccessAt}
            locale={locale}
            loading={feeds.leaderboard.loading}
            sourceLabel={feeds.leaderboard.sourceLabel}
          />
          <SotaChart
            error={feeds.benchmarks.error}
            items={feeds.benchmarks.data}
            lastSuccessAt={feeds.benchmarks.lastSuccessAt}
            locale={locale}
            loading={feeds.benchmarks.loading}
            sourceLabel={feeds.benchmarks.sourceLabel}
          />
        </div>
        <PricePerformance
          error={feeds.pricing.error}
          items={feeds.pricing.data}
          lastSuccessAt={feeds.pricing.lastSuccessAt}
          locale={locale}
          loading={feeds.pricing.loading}
          sourceLabel={feeds.pricing.sourceLabel}
        />
      </main>
    </div>
  );
}

function LocaleToggle({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-slate-200/80 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
      {(["en", "tr"] as const).map((value) => (
        <button
          key={value}
          aria-pressed={locale === value}
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${locale === value
              ? "bg-[color:var(--tt-red)] text-white shadow"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            }`}
          onClick={() => setLocale(value)}
          type="button"
        >
          {formatLocaleCode(value)}
        </button>
      ))}
      <span className="sr-only">Language selector</span>
      <Languages className="sr-only h-4 w-4" />
    </div>
  );
}

function ThemeToggle({ locale }: { locale: Locale }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const canToggle = typeof resolvedTheme === "string";
  const isDark = resolvedTheme === "dark";
  const label = !mounted
    ? locale === "tr"
      ? "Tema"
      : "Theme"
    : isDark
      ? locale === "tr"
        ? "Acik"
        : "Light"
      : locale === "tr"
        ? "Koyu"
        : "Dark";

  return (
    <button
      aria-label="Theme toggle"
      aria-pressed={mounted ? isDark : false}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[color:var(--tt-red)]/30 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10 dark:hover:text-white"
      onClick={() => {
        if (!mounted || !canToggle) return;
        setTheme(isDark ? "light" : "dark");
      }}
      type="button"
    >
      {!mounted ? (
        <Monitor className="h-4 w-4" />
      ) : isDark ? (
        <SunMedium className="h-4 w-4" />
      ) : (
        <MoonStar className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel-interactive min-w-[120px] rounded-3xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="text-[0.68rem] font-semibold tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}

function makeInitialFeeds(): DashboardBundle {
  return {
    releases: {
      data: fallbackReleases,
      error: null,
      lastSuccessAt: fallbackReleases[0]?.releasedAt ?? daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceRelease,
    },
    leaderboard: {
      data: fallbackLeaderboard,
      error: null,
      lastSuccessAt: fallbackLeaderboard[0]?.releasedAt ?? daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceLeaderboard,
    },
    benchmarks: {
      data: fallbackBenchmarks,
      error: null,
      lastSuccessAt: fallbackBenchmarks[0]?.date ?? daysAgo(1),
      loading: true,
      sourceLabel: copy.en.sourceBenchmarks,
    },
    pricing: {
      data: fallbackPricing,
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
): Promise<FeedState<T>> {
  try {
    const payload = await requestJson(url);
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

async function requestJson(url: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

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

function parseBenchmarksFeed(payload: unknown) {
  const data = extractList(payload, ["items", "points", "data", "results"]);
  const normalized = data.map(normalizeBenchmarkItem).filter(Boolean) as BenchmarkPoint[];

  return normalized.length ? normalized : null;
}

function parsePricingFeed(payload: unknown) {
  const data = extractList(payload, ["items", "points", "data", "results"]);
  const normalized = data.map(normalizePriceItem).filter(Boolean) as PricePoint[];

  return normalized.length ? normalized : null;
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

function normalizeBenchmarkItem(value: unknown): BenchmarkPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: pickString(value, ["id", "slug", "name"], crypto.randomUUID()),
    date: pickString(value, ["date", "releasedAt", "publishedAt"], new Date().toISOString()),
    lab: pickString(value, ["lab", "provider", "organization"], "Unknown"),
    model: pickString(value, ["model", "name", "title"], "Unknown model"),
    record: pickBoolean(value, ["record", "isRecord", "best"]),
    score: pickNumber(value, ["score", "value", "mmlu", "humaneval"], 0),
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
      const parsed = Number(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
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
