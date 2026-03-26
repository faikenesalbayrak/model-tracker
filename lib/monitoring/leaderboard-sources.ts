import {
  extractArtificialAnalysisModels,
  extractArtificialAnalysisArenaPage,
  extractArtificialAnalysisSttPage,
  type ArtificialAnalysisArenaEntry,
} from "@/lib/normalize/artificial-analysis";
import { fetchJsonWithRetry, fetchWithRetry } from "@/lib/fetcher";
import type { LeaderboardV2Response } from "@/lib/normalize/leaderboard";
import type {
  AdapterContext,
  LeaderboardAdapter,
  LeaderboardCategory,
  NormalizedLeaderboardEntry,
  SourceRegistryItem,
} from "@/lib/monitoring/contracts";
import { LEADERBOARD_CATEGORIES, SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import { HF_DATASETS_SEARCH_API, HF_LEADERBOARD_V2_DATASET, LAB_HF_ORGS, PWC_API_BASE } from "@/lib/sources";

const ARTIFICIAL_ANALYSIS_MODELS_URL = "https://artificialanalysis.ai/models";
const AA_IMAGE_TEXT_TO_IMAGE_URL = "https://artificialanalysis.ai/image/leaderboard/text-to-image";
const AA_IMAGE_EDITING_URL = "https://artificialanalysis.ai/image/leaderboard/editing";
const AA_VIDEO_TEXT_TO_VIDEO_URL = "https://artificialanalysis.ai/video/leaderboard/text-to-video";
const AA_VIDEO_IMAGE_TO_VIDEO_URL = "https://artificialanalysis.ai/video/leaderboard/image-to-video";
const AA_TTS_URL = "https://artificialanalysis.ai/text-to-speech/leaderboard";
const AA_STT_URL = "https://artificialanalysis.ai/speech-to-text";
const MTEB_DATASET = "mteb/leaderboard";
const HF_DATASETS_VIEWER_BASE = "https://datasets-server.huggingface.co/rows";
const LLM_STATS_IMAGE_URL = "https://llm-stats.com/leaderboards/best-ai-for-image-generation";
const LLM_STATS_VIDEO_URL = "https://llm-stats.com/leaderboards/best-ai-for-video-generation";
const ZEROEVAL_CATEGORY_BENCHMARKS_URL = "https://api.zeroeval.com/leaderboard/categories";
const ZEROEVAL_MAGIA_ARENAS_URL = "https://api.zeroeval.com/magia/arenas";
const LIVEBENCH_CHANGELOG_URL = "https://raw.githubusercontent.com/LiveBench/LiveBench/main/changelog.md";
const LIVEBENCH_TABLE_BASE_URL = "https://livebench.ai";
const LIVEBENCH_FALLBACK_RELEASES = [
  "2026-01-08",
  "2025-12-23",
  "2025-11-25",
  "2025-05-30",
  "2025-04-25",
  "2025-04-02",
  "2024-11-25",
  "2024-08-31",
  "2024-07-26",
  "2024-06-24",
];

type EnrichmentMaps = {
  gpqaByModel: Map<string, number>;
  mmluByModel: Map<string, number>;
  sweByModel: Map<string, number>;
  sweVerifiedByModel: Map<string, number>;
};

type LlmStatsTopModel = {
  model_id: string;
  name: string;
  organization?: string | null;
  elo_score?: number | null;
  total_votes?: number | null;
  win_rate?: number | null;
  rank?: number | null;
  announcement_date?: string | null;
  throughput_cps?: number | null;
  input_price?: number | null;
  output_price?: number | null;
  avg_generation_price?: number | null;
  priced_generations?: number | null;
  is_open_source?: boolean | null;
};

type ZeroEvalTopModel = {
  rank?: number;
  model_id: string;
  model_name: string;
  organization_id?: string | null;
  organization_name?: string | null;
  benchmark_score?: number | null;
  normalized_score?: number | null;
  verified?: boolean;
};

type ZeroEvalBenchmark = {
  benchmark_id: string;
  name: string;
  model_count?: number | null;
  max_score?: number | null;
  top_models: ZeroEvalTopModel[];
};

type ZeroEvalCategoryResponse = {
  category?: {
    category_id?: string;
    name?: string;
  };
  benchmarks?: ZeroEvalBenchmark[];
};

type MagiaArenaLeaderboardEntry = {
  model_id?: string;
  model_name?: string;
  organization?: string | null;
  conservative_rating?: number | null;
  matches_played?: number | null;
  win_rate?: number | null;
  announcement_date?: string | null;
  throughput_cps?: number | null;
  input_price?: number | null;
  output_price?: number | null;
  avg_generation_price?: number | null;
  priced_generations?: number | null;
  is_open_source?: boolean | null;
};

type MagiaArenaLeaderboardResponse = {
  leaderboard?: MagiaArenaLeaderboardEntry[];
};

type LiveBenchCategories = Record<string, string[]>;

type LiveBenchSnapshot = {
  releaseDate: string;
  csvText: string;
  categories: LiveBenchCategories;
};

function normalizeBenchmarkScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}

function normalizePriceValue(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 ? value : null;
}

function normalizePositiveValue(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 ? value : null;
}

function resolveArenaScore(conservativeRating: number | null | undefined, winRate: number | null | undefined): number | null {
  const conservative = normalizePositiveValue(conservativeRating);
  if (typeof conservative === "number") return conservative;
  return normalizePositiveValue(winRate);
}

function decodeEscapedJsonString(value: string): string {
  return value
    .replaceAll('\\"', '"')
    .replaceAll("\\/", "/")
    .replaceAll("\\n", " ")
    .replaceAll("\\t", " ")
    .replaceAll("\\\\", "\\");
}

function canonicalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canonicalModelOnly(modelName: string): string {
  return canonicalize(modelName);
}

function canonicalKey(modelName: string, vendor?: string): string {
  const normalizedModel = canonicalize(modelName);
  const normalizedVendor = canonicalize(vendor ?? "unknown");
  return `${normalizedVendor}:${normalizedModel}`;
}

function inferVendorFromModelId(modelId: string): string | undefined {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return undefined;
  const mappings: Array<[RegExp, string]> = [
    [/^gpt|^chatgpt|^o[134]/, "OpenAI"],
    [/^claude/, "Anthropic"],
    [/^gemini/, "Google"],
    [/^deepseek/, "DeepSeek"],
    [/^qwen|^qwq/, "Alibaba"],
    [/^grok/, "xAI"],
    [/^llama|^meta-llama/, "Meta"],
    [/^mistral|^mixtral/, "Mistral"],
    [/^command/, "Cohere"],
    [/^kimi/, "Moonshot AI"],
    [/^phi/, "Microsoft"],
  ];
  for (const [pattern, vendor] of mappings) {
    if (pattern.test(normalized)) return vendor;
  }
  return undefined;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((item) => item.trim());
}

function parseCsvTable(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0) return [];

  const rows: Array<Record<string, string>> = [];
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = values[index] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseLiveBenchReleaseDates(changelogText: string): string[] {
  const matches = [...changelogText.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const date of matches) {
    if (seen.has(date)) continue;
    seen.add(date);
    ordered.push(date);
  }
  return ordered;
}

async function fetchLiveBenchReleaseCandidates(): Promise<string[]> {
  try {
    const { data } = await fetchWithRetry<string>(
      LIVEBENCH_CHANGELOG_URL,
      {
        method: "GET",
        headers: {
          Accept: "text/plain",
          "User-Agent": "model-tracker-monitoring/1.0",
        },
      },
      async (response) => response.text(),
      { allowedHosts: ["raw.githubusercontent.com"] },
    );
    const parsed = parseLiveBenchReleaseDates(data);
    if (parsed.length > 0) {
      const merged = [...parsed, ...LIVEBENCH_FALLBACK_RELEASES];
      return [...new Set(merged)];
    }
  } catch {
    // fall back to known release dates
  }
  return LIVEBENCH_FALLBACK_RELEASES;
}

async function fetchLiveBenchSnapshot(): Promise<LiveBenchSnapshot> {
  const releases = await fetchLiveBenchReleaseCandidates();
  let lastError: unknown = null;

  for (const releaseDate of releases) {
    const releaseToken = releaseDate.replaceAll("-", "_");
    const tableUrl = `${LIVEBENCH_TABLE_BASE_URL}/table_${releaseToken}.csv`;
    const categoriesUrl = `${LIVEBENCH_TABLE_BASE_URL}/categories_${releaseToken}.json`;

    try {
      const [tableResult, categoriesResult] = await Promise.all([
        fetchWithRetry<string>(
          tableUrl,
          {
            method: "GET",
            headers: {
              Accept: "text/csv",
              "User-Agent": "model-tracker-monitoring/1.0",
            },
          },
          async (response) => response.text(),
          { allowedHosts: ["livebench.ai"] },
        ),
        fetchJsonWithRetry<LiveBenchCategories>(
          categoriesUrl,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "User-Agent": "model-tracker-monitoring/1.0",
            },
          },
          { allowedHosts: ["livebench.ai"] },
        ),
      ]);

      const csvText = tableResult.data;
      const categories = categoriesResult.data;
      if (typeof csvText !== "string" || !csvText.includes("model,")) {
        throw new Error(`LiveBench CSV format invalid for release ${releaseDate}`);
      }
      if (!categories || typeof categories !== "object") {
        throw new Error(`LiveBench categories format invalid for release ${releaseDate}`);
      }

      return {
        releaseDate,
        csvText,
        categories,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Could not fetch a valid LiveBench snapshot.");
}

function entriesFromLiveBenchSnapshot(snapshot: LiveBenchSnapshot): NormalizedLeaderboardEntry[] {
  const rows = parseCsvTable(snapshot.csvText);
  const categories = snapshot.categories;
  const categoryColumnsByName = Object.entries(categories)
    .map(([name, columns]) => [name, Array.isArray(columns) ? columns : []] as const)
    .filter((entry) => entry[1].length > 0);

  const entries = rows
    .map((row) => {
      const sourceModelId = String(row.model ?? "").trim();
      if (!sourceModelId) return null;

      const categoryScores: Record<string, number> = {};
      for (const [categoryName, columns] of categoryColumnsByName) {
        const numeric = columns
          .map((column) => toNumber(row[column]))
          .filter((value): value is number => typeof value === "number");
        if (numeric.length === 0) continue;
        categoryScores[categoryName] = numeric.reduce((sum, score) => sum + score, 0) / numeric.length;
      }

      const categoryValues = Object.values(categoryScores);
      const globalAverage =
        categoryValues.length > 0
          ? categoryValues.reduce((sum, score) => sum + score, 0) / categoryValues.length
          : null;
      if (typeof globalAverage !== "number" || !Number.isFinite(globalAverage)) {
        return null;
      }

      const vendor = inferVendorFromModelId(sourceModelId);
      return {
        rank: 0,
        sourceModelId,
        canonicalModelKey: canonicalKey(sourceModelId, vendor),
        modelName: sourceModelId,
        vendor,
        score: globalAverage,
        scoreUnit: "livebench:global_average",
        payload: {
          livebench_release_date: snapshot.releaseDate,
          ...Object.fromEntries(
            Object.entries(categoryScores).map(([name, value]) => [
              `livebench_${canonicalize(name)}_average`,
              value,
            ]),
          ),
        },
      } satisfies NormalizedLeaderboardEntry;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return rankEntries(entries);
}

function buildHfSearchUrl(query: string): string {
  const url = new URL(HF_DATASETS_SEARCH_API);
  url.searchParams.set("dataset", HF_LEADERBOARD_V2_DATASET);
  url.searchParams.set("config", "default");
  url.searchParams.set("split", "train");
  url.searchParams.set("query", query);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", "8");
  return url.toString();
}

type BenchRow = { model: string; score: number; boardName?: string };

function normalizeBenchRows(raw: unknown): BenchRow[] {
  const mapRow = (item: Record<string, unknown>, boardName?: string): BenchRow | null => {
    const model = String(item.model ?? item.model_name ?? item.name ?? "").trim();
    const scoreRaw = item.score ?? item.value ?? item.resolved;
    const score = typeof scoreRaw === "number" ? scoreRaw : Number(scoreRaw ?? NaN);
    if (!model || !Number.isFinite(score)) return null;
    if (boardName) {
      return { model, score, boardName };
    }
    return { model, score };
  };

  if (Array.isArray(raw)) {
    return raw
      .map((x) => (x && typeof x === "object" ? mapRow(x as Record<string, unknown>) : null))
      .filter((x): x is BenchRow => x !== null);
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const nested = record.results ?? record.items ?? record.data;
    if (Array.isArray(nested)) {
      return normalizeBenchRows(nested);
    }
    const leaderboards = record.leaderboards;
    if (Array.isArray(leaderboards)) {
      const acc: BenchRow[] = [];
      for (const board of leaderboards) {
        if (!board || typeof board !== "object") continue;
        const boardName = String((board as Record<string, unknown>).name ?? "").trim() || undefined;
        const boardResults = (board as Record<string, unknown>).results;
        if (Array.isArray(boardResults)) {
          acc.push(
            ...boardResults
              .map((row) => (row && typeof row === "object" ? mapRow(row as Record<string, unknown>, boardName) : null))
              .filter((row): row is BenchRow => row !== null),
          );
        }
      }
      return acc;
    }
  }

  return [];
}

async function fetchHfRows(): Promise<Array<Record<string, unknown>>> {
  const orgs = Object.values(LAB_HF_ORGS).flat();
  const settled = await Promise.allSettled(
    orgs.map(async (org) => {
      const { data } = await fetchJsonWithRetry<LeaderboardV2Response>(
        buildHfSearchUrl(org),
        { method: "GET", headers: { Accept: "application/json" } },
        { allowedHosts: ["datasets-server.huggingface.co"] },
      );
      return (data.rows ?? []).map((r) => (r.row ?? {}) as Record<string, unknown>);
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<Array<Record<string, unknown>>> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

async function fetchSweRows(): Promise<Array<{ model: string; score: number; boardName?: string }>> {
  const sweGithubUrls = [
    "https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json",
    "https://raw.githubusercontent.com/swe-bench/swe-bench.github.io/master/data/leaderboards.json",
    "https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/main/data/leaderboards.json",
    "https://raw.githubusercontent.com/swe-bench/swe-bench.github.io/main/data/leaderboards.json",
  ];
  const sweGithubSettled = await Promise.allSettled(
    sweGithubUrls.map(async (url) => {
      const { data } = await fetchJsonWithRetry<unknown>(
        url,
        { method: "GET", headers: { Accept: "application/json" } },
        { allowedHosts: ["raw.githubusercontent.com"] },
      );
      return normalizeBenchRows(data);
    }),
  );
  for (const rowSet of sweGithubSettled) {
    if (rowSet.status === "fulfilled" && rowSet.value.length > 0) {
      return rowSet.value;
    }
  }

  const aliases = ["swe-bench", "swebench", "swe-bench-verified", "swebench-verified"];
  const urls = aliases.flatMap((alias) => [
    `${PWC_API_BASE}/sota/?benchmark=${encodeURIComponent(alias)}`,
    `${PWC_API_BASE}/sota/${encodeURIComponent(alias)}`,
  ]);

  const settled = await Promise.allSettled(
    urls.map(async (url) => {
      const { data } = await fetchJsonWithRetry<unknown>(
        url,
        { method: "GET", headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" } },
        { allowedHosts: ["paperswithcode.com"] },
      );
      return normalizeBenchRows(data);
    }),
  );

  for (const r of settled) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      return r.value;
    }
  }
  return [];
}

function buildEnrichmentMaps(
  hfRows: Array<Record<string, unknown>>,
  sweRows: Array<{ model: string; score: number; boardName?: string }>,
): EnrichmentMaps {
  const gpqaByModel = new Map<string, number>();
  const mmluByModel = new Map<string, number>();
  const sweByModel = new Map<string, number>();
  const sweVerifiedByModel = new Map<string, number>();

  for (const row of hfRows) {
    const model = String(row.fullname ?? row.eval_name ?? row.model ?? row.name ?? "").trim();
    if (!model) continue;
    const key = canonicalModelOnly(model);
    const gpqa = normalizeBenchmarkScore(Number((row.GPQA ?? row.gpqa) as number));
    const mmlu = normalizeBenchmarkScore(Number((row["MMLU-PRO"] ?? row.mmlu_pro) as number));
    if (typeof gpqa === "number") gpqaByModel.set(key, gpqa);
    if (typeof mmlu === "number") mmluByModel.set(key, mmlu);
  }

  for (const row of sweRows) {
    const key = canonicalModelOnly(row.model);
    const swe = normalizeBenchmarkScore(row.score);
    if (typeof swe === "number") {
      sweByModel.set(key, swe);
      if ((row.boardName ?? "").toLowerCase().includes("verified")) {
        sweVerifiedByModel.set(key, swe);
      }
    }
  }

  return { gpqaByModel, mmluByModel, sweByModel, sweVerifiedByModel };
}

function lookupEnrichedScore(map: Map<string, number>, modelName: string): number | null {
  const key = canonicalModelOnly(modelName);
  if (map.has(key)) return map.get(key) ?? null;
  // relaxed fallback: partial token overlap
  const tokens = key.split("_").filter((t) => t.length >= 2).slice(0, 6);
  for (const [candidate, value] of map.entries()) {
    const hits = tokens.filter((t) => candidate.includes(t)).length;
    if (hits >= Math.min(3, Math.max(1, Math.floor(tokens.length / 2)))) {
      return value;
    }
  }
  return null;
}

function rankEntries(entries: NormalizedLeaderboardEntry[]): NormalizedLeaderboardEntry[] {
  const deduped = new Map<string, NormalizedLeaderboardEntry>();
  for (const entry of entries) {
    const prev = deduped.get(entry.canonicalModelKey);
    if (!prev) {
      deduped.set(entry.canonicalModelKey, entry);
      continue;
    }
    const prevScore = prev.score ?? Number.NEGATIVE_INFINITY;
    const currScore = entry.score ?? Number.NEGATIVE_INFINITY;
    if (currScore > prevScore) {
      deduped.set(entry.canonicalModelKey, entry);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function extractTopModelsFromLlmStatsHtml(html: string): LlmStatsTopModel[] {
  const patterns = [
    /"topModels":(\[[\s\S]*?\])(?:,\s*"|}\])/,
    /\\"topModels\\":(\[[\s\S]*?\])(?:,\\"|}\])/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const rawArray = match[1];
    const candidates = [rawArray, decodeEscapedJsonString(rawArray)];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is LlmStatsTopModel => Boolean(item && typeof item === "object" && "model_id" in (item as Record<string, unknown>)))
            .map((item) => item);
        }
      } catch {
        // continue
      }
    }
  }

  return [];
}

function entriesFromLlmStatsTopModels(
  models: LlmStatsTopModel[],
  category: LeaderboardCategory,
): NormalizedLeaderboardEntry[] {
  const rows = models
    .map((item) => {
      const modelName = String(item.name ?? item.model_id ?? "").trim();
      const vendor = String(item.organization ?? "").trim() || undefined;
      if (!modelName) return null;
      const score = normalizePositiveValue(item.elo_score ?? null);
      return {
        rank: 0,
        sourceModelId: item.model_id,
        canonicalModelKey: canonicalKey(modelName, vendor),
        modelName,
        vendor,
        score: score ?? undefined,
        scoreUnit: `${category}:arena_elo`,
        modelUrl: item.model_id ? `https://llm-stats.com/models/${item.model_id}` : undefined,
        payload: {
          rank: item.rank ?? null,
          total_votes: normalizePositiveValue(item.total_votes ?? null),
          win_rate: normalizePositiveValue(item.win_rate ?? null),
          release_date: item.announcement_date ?? null,
          output_tokens_per_second: normalizePositiveValue(item.throughput_cps ?? null),
          price_1m_input_tokens: normalizePriceValue(item.input_price ?? null),
          price_1m_output_tokens: normalizePriceValue(item.output_price ?? null),
          price_1m_blended_3_to_1: normalizePriceValue(item.avg_generation_price ?? null),
          is_open_source: item.is_open_source ?? null,
          priced_generations: normalizePositiveValue(item.priced_generations ?? null),
        },
      } satisfies NormalizedLeaderboardEntry;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return rankEntries(rows);
}

async function fetchZeroEvalCategoryBenchmarks(categorySlug: string): Promise<ZeroEvalCategoryResponse> {
  const url = `${ZEROEVAL_CATEGORY_BENCHMARKS_URL}/${encodeURIComponent(categorySlug)}/benchmarks?top_n=100`;
  const { data } = await fetchJsonWithRetry<ZeroEvalCategoryResponse>(
    url,
    { method: "GET", headers: { Accept: "application/json" } },
    { allowedHosts: ["api.zeroeval.com"] },
  );
  return data;
}

async function fetchMagiaArenaLeaderboard(arenaName: string, limit = 300): Promise<MagiaArenaLeaderboardResponse> {
  const { data } = await fetchJsonWithRetry<MagiaArenaLeaderboardResponse>(
    `${ZEROEVAL_MAGIA_ARENAS_URL}/${encodeURIComponent(arenaName)}/leaderboard?limit=${limit}&offset=0`,
    { method: "GET", headers: { Accept: "application/json" } },
    { allowedHosts: ["api.zeroeval.com"] },
  );
  return data;
}

function entriesFromZeroEvalBenchmarks(
  response: ZeroEvalCategoryResponse,
  category: LeaderboardCategory,
): NormalizedLeaderboardEntry[] {
  const benchmarks = Array.isArray(response.benchmarks) ? response.benchmarks : [];
  const bucket = new Map<
    string,
    {
      modelId: string;
      modelName: string;
      vendor?: string;
      scoreSum: number;
      hits: number;
      bestRank: number;
    }
  >();

  for (const benchmark of benchmarks) {
    const models = Array.isArray(benchmark.top_models) ? benchmark.top_models : [];
    for (const model of models) {
      const modelId = String(model.model_id ?? "").trim();
      const modelName = String(model.model_name ?? model.model_id ?? "").trim();
      if (!modelId || !modelName) continue;
      const normalizedScore = normalizeBenchmarkScore(model.normalized_score ?? model.benchmark_score ?? null);
      if (typeof normalizedScore !== "number") continue;
      const key = canonicalKey(modelName, model.organization_name ?? model.organization_id ?? undefined);
      const prev = bucket.get(key);
      if (!prev) {
        bucket.set(key, {
          modelId,
          modelName,
          vendor: (model.organization_name ?? model.organization_id ?? undefined) || undefined,
          scoreSum: normalizedScore,
          hits: 1,
          bestRank: typeof model.rank === "number" ? model.rank : Number.POSITIVE_INFINITY,
        });
      } else {
        prev.scoreSum += normalizedScore;
        prev.hits += 1;
        const rank = typeof model.rank === "number" ? model.rank : Number.POSITIVE_INFINITY;
        prev.bestRank = Math.min(prev.bestRank, rank);
      }
    }
  }

  const rows: NormalizedLeaderboardEntry[] = [...bucket.entries()].map(([canonicalModelKey, row]) => {
    const avg = row.hits > 0 ? row.scoreSum / row.hits : null;
    return {
      rank: 0,
      sourceModelId: row.modelId,
      canonicalModelKey,
      modelName: row.modelName,
      vendor: row.vendor,
      score: avg ?? undefined,
      scoreUnit: `${category}:avg_normalized_score`,
      modelUrl: row.modelId ? `https://llm-stats.com/models/${row.modelId}` : undefined,
      payload: {
        coverage_benchmarks: row.hits,
        best_rank_seen: Number.isFinite(row.bestRank) ? row.bestRank : null,
      },
    };
  });

  return rankEntries(rows);
}

function entriesFromMagiaArenaLeaderboard(
  response: MagiaArenaLeaderboardResponse,
  category: LeaderboardCategory,
): NormalizedLeaderboardEntry[] {
  const rows = (Array.isArray(response.leaderboard) ? response.leaderboard : [])
    .map((item) => {
      const modelId = String(item.model_id ?? "").trim();
      const modelName = String(item.model_name ?? item.model_id ?? "").trim();
      const vendor = String(item.organization ?? "").trim() || undefined;
      if (!modelId || !modelName) return null;

      const score = resolveArenaScore(item.conservative_rating ?? null, item.win_rate ?? null);
      return {
        rank: 0,
        sourceModelId: modelId,
        canonicalModelKey: canonicalKey(modelName, vendor),
        modelName,
        vendor,
        score: score ?? undefined,
        scoreUnit: `${category}:conservative_rating`,
        modelUrl: `https://llm-stats.com/models/${modelId}`,
        payload: {
          matches_played: normalizePositiveValue(item.matches_played ?? null),
          win_rate: normalizePositiveValue(item.win_rate ?? null),
          release_date: item.announcement_date ?? null,
          output_tokens_per_second: normalizePositiveValue(item.throughput_cps ?? null),
          price_1m_input_tokens: normalizePriceValue(item.input_price ?? null),
          price_1m_output_tokens: normalizePriceValue(item.output_price ?? null),
          price_1m_blended_3_to_1: normalizePriceValue(item.avg_generation_price ?? null),
          is_open_source: item.is_open_source ?? null,
          priced_generations: normalizePositiveValue(item.priced_generations ?? null),
        },
      } satisfies NormalizedLeaderboardEntry;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return rankEntries(rows);
}

function entriesFromCombinedMagiaArenas(
  rowsByArena: Record<string, MagiaArenaLeaderboardResponse>,
  category: LeaderboardCategory,
): NormalizedLeaderboardEntry[] {
  const bucket = new Map<
    string,
    {
      modelId: string;
      modelName: string;
      vendor?: string;
      conservativeScoreSum: number;
      hits: number;
      textToModalityScoreSum: number;
      textToModalityHits: number;
      imageToModalityScoreSum: number;
      imageToModalityHits: number;
      bestPrice: number | null;
      inputPrice: number | null;
      outputPrice: number | null;
      throughput: number | null;
      releaseDate: string | null;
      openSource: boolean | null;
    }
  >();

  for (const [arenaName, response] of Object.entries(rowsByArena)) {
    const rows = Array.isArray(response.leaderboard) ? response.leaderboard : [];
    for (const item of rows) {
      const modelId = String(item.model_id ?? "").trim();
      const modelName = String(item.model_name ?? item.model_id ?? "").trim();
      if (!modelId || !modelName) continue;

      const vendor = String(item.organization ?? "").trim() || undefined;
      const key = canonicalKey(modelName, vendor);
      const conservative = resolveArenaScore(item.conservative_rating ?? null, item.win_rate ?? null);
      const arenaPrice = normalizePriceValue(item.avg_generation_price ?? null);
      const arenaInputPrice = normalizePriceValue(item.input_price ?? null);
      const arenaOutputPrice = normalizePriceValue(item.output_price ?? null);
      const arenaThroughput = normalizePositiveValue(item.throughput_cps ?? null);

      const prev = bucket.get(key);
      if (!prev) {
        bucket.set(key, {
          modelId,
          modelName,
          vendor,
          conservativeScoreSum: typeof conservative === "number" ? conservative : 0,
          hits: typeof conservative === "number" ? 1 : 0,
          textToModalityScoreSum: 0,
          textToModalityHits: 0,
          imageToModalityScoreSum: 0,
          imageToModalityHits: 0,
          bestPrice: arenaPrice,
          inputPrice: arenaInputPrice,
          outputPrice: arenaOutputPrice,
          throughput: arenaThroughput,
          releaseDate: item.announcement_date ?? null,
          openSource: item.is_open_source ?? null,
        });
      } else {
        if (typeof conservative === "number") {
          prev.conservativeScoreSum += conservative;
          prev.hits += 1;
        }
        if (prev.bestPrice === null || (typeof arenaPrice === "number" && arenaPrice < prev.bestPrice)) {
          prev.bestPrice = arenaPrice;
        }
        if (prev.inputPrice === null || (typeof arenaInputPrice === "number" && arenaInputPrice < prev.inputPrice)) {
          prev.inputPrice = arenaInputPrice;
        }
        if (prev.outputPrice === null || (typeof arenaOutputPrice === "number" && arenaOutputPrice < prev.outputPrice)) {
          prev.outputPrice = arenaOutputPrice;
        }
        if (prev.throughput === null || (typeof arenaThroughput === "number" && arenaThroughput > prev.throughput)) {
          prev.throughput = arenaThroughput;
        }
      }

      const entry = bucket.get(key);
      if (entry) {
        entry.releaseDate = entry.releaseDate ?? item.announcement_date ?? null;
        entry.openSource = entry.openSource ?? item.is_open_source ?? null;
        if (typeof conservative === "number" && arenaName.includes("text-to-")) {
          entry.textToModalityScoreSum += conservative;
          entry.textToModalityHits += 1;
        }
        if (typeof conservative === "number" && arenaName.includes("image-to-")) {
          entry.imageToModalityScoreSum += conservative;
          entry.imageToModalityHits += 1;
        }
      }
    }
  }

  const entries: NormalizedLeaderboardEntry[] = [...bucket.values()].map((row) => {
    const score = row.hits > 0 ? row.conservativeScoreSum / row.hits : null;
    return {
      rank: 0,
      sourceModelId: row.modelId,
      canonicalModelKey: canonicalKey(row.modelName, row.vendor),
      modelName: row.modelName,
      vendor: row.vendor,
      score: score ?? undefined,
      scoreUnit: `${category}:avg_conservative_rating`,
      modelUrl: `https://llm-stats.com/models/${row.modelId}`,
      payload: {
        release_date: row.releaseDate,
        output_tokens_per_second: row.throughput,
        price_1m_blended_3_to_1: row.bestPrice,
        price_1m_input_tokens: row.inputPrice,
        price_1m_output_tokens: row.outputPrice,
        is_open_source: row.openSource,
        ...(category === "image_generation"
          ? {
              image_gen_score:
                row.textToModalityHits > 0
                  ? row.textToModalityScoreSum / row.textToModalityHits
                  : null,
              image_edit_score:
                row.imageToModalityHits > 0
                  ? row.imageToModalityScoreSum / row.imageToModalityHits
                  : null,
            }
          : {}),
        ...(category === "video_generation"
          ? {
              video_gen_score:
                row.textToModalityHits > 0
                  ? row.textToModalityScoreSum / row.textToModalityHits
                  : null,
              image_to_video_score:
                row.imageToModalityHits > 0
                  ? row.imageToModalityScoreSum / row.imageToModalityHits
                  : null,
            }
          : {}),
      },
    };
  });

  return rankEntries(entries);
}

type AAModelLike = ReturnType<typeof extractArtificialAnalysisModels>[number];

function nameOf(item: AAModelLike): string {
  return item.short_name || item.name || item.id;
}

function scoreOf(item: AAModelLike): number | undefined {
  return typeof item.intelligence_index === "number" ? item.intelligence_index : undefined;
}

function categoryFilter(item: AAModelLike, category: LeaderboardCategory): boolean {
  const name = nameOf(item).toLowerCase();

  switch (category) {
    case "general_llm":
      return true;
    case "image_generation":
      return item.input_modality_image === true || (typeof item.price_per_1k_1mp_images === "number" && item.price_per_1k_1mp_images > 0);
    case "video_generation":
      return item.input_modality_video === true;
    case "text_to_speech":
      return item.output_modality_speech === true || /tts|text.?to.?speech|voice/.test(name);
    case "speech_to_text":
      return item.input_modality_speech === true || /asr|speech.?to.?text|transcrib/.test(name);
    case "embeddings":
      return /embed|embedding|retrieval|rerank/.test(name);
    default:
      return false;
  }
}

function fallbackFilter(category: LeaderboardCategory): (item: AAModelLike) => boolean {
  if (category === "embeddings") {
    return (item) => item.input_modality_text === true || item.output_modality_text === true;
  }
  return () => true;
}

const artificialAnalysisAdapter: LeaderboardAdapter = {
  sourceName: "artificial_analysis_models_page",
  sourceType: "leaderboard",
  categories: ["general_llm"],
  priority: 10,
  async fetchRaw(_ctx: AdapterContext): Promise<unknown> {
    const [aaHtml, hfRows, sweRows] = await Promise.all([
      fetchWithRetry<string>(
        ARTIFICIAL_ANALYSIS_MODELS_URL,
        {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "model-tracker-monitoring/1.0",
          },
        },
        async (response) => response.text(),
        { allowedHosts: ["artificialanalysis.ai"] },
      ).then((r) => r.data),
      fetchHfRows().catch(() => []),
      fetchSweRows().catch(() => []),
    ]);

    return { aaHtml, hfRows, sweRows };
  },
  async normalizeTop10(raw: unknown, category: LeaderboardCategory): Promise<NormalizedLeaderboardEntry[]> {
    const rawRecord = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const html = String(rawRecord.aaHtml ?? raw ?? "");
    const hfRows = Array.isArray(rawRecord.hfRows) ? (rawRecord.hfRows as Array<Record<string, unknown>>) : [];
    const sweRows = Array.isArray(rawRecord.sweRows)
      ? (rawRecord.sweRows as Array<{ model: string; score: number; boardName?: string }>)
      : [];
    const enrichment = buildEnrichmentMaps(hfRows, sweRows);
    const parsed = extractArtificialAnalysisModels(html);

    let filtered = parsed.filter((item) => categoryFilter(item, category));
    if (filtered.length === 0) {
      filtered = parsed.filter(fallbackFilter(category));
    }

    const rows = filtered
      .filter((item) => typeof scoreOf(item) === "number" && Number.isFinite(scoreOf(item)))
      .map((item) => {
        const modelName = nameOf(item);
        const vendor = item.model_creators?.name ?? undefined;
        const gpqaEnriched = lookupEnrichedScore(enrichment.gpqaByModel, modelName);
        const mmluEnriched = lookupEnrichedScore(enrichment.mmluByModel, modelName);
        const sweEnriched = lookupEnrichedScore(enrichment.sweByModel, modelName);
        const sweVerifiedEnriched = lookupEnrichedScore(enrichment.sweVerifiedByModel, modelName);
        return {
          rank: 0,
          sourceModelId: item.id,
          canonicalModelKey: canonicalKey(modelName, vendor),
          modelName,
          vendor,
          score: scoreOf(item),
          scoreUnit:
            category === "general_llm"
              ? "intelligence_index"
              : `${category}:intelligence_index`,
          modelUrl: item.model_url ?? item.hosts_url ?? undefined,
          payload: {
            intelligence_index: item.intelligence_index,
            coding_index: item.coding_index,
            agentic_index: item.agentic_index,
            gpqa: normalizeBenchmarkScore(item.gpqa) ?? normalizeBenchmarkScore(gpqaEnriched),
            mmlu_pro: normalizeBenchmarkScore(item.mmlu_pro) ?? normalizeBenchmarkScore(mmluEnriched),
            terminalbench_hard: normalizeBenchmarkScore(item.terminalbench_hard),
            aime: normalizeBenchmarkScore(item.aime),
            aime25: normalizeBenchmarkScore(item.aime25),
            aime_2024: normalizeBenchmarkScore(item.aime),
            aime_2025: normalizeBenchmarkScore(item.aime25),
            livecodebench: normalizeBenchmarkScore(item.livecodebench),
            live_code_bench: normalizeBenchmarkScore(item.livecodebench),
            math_500: normalizeBenchmarkScore(item.math_500),
            ifbench: normalizeBenchmarkScore(item.ifbench),
            release_date: item.release_date,
            knowledge_cutoff_date: item.knowledge_cutoff_date,
            knowledge_cutoff: item.knowledge_cutoff_date,
            context_window_tokens: normalizePositiveValue(item.context_window_tokens),
            price_1m_blended_3_to_1: normalizePriceValue(item.price_1m_blended_3_to_1),
            price_1m_input_tokens: normalizePriceValue(item.price_1m_input_tokens),
            price_1m_output_tokens: normalizePriceValue(item.price_1m_output_tokens),
            output_tokens_per_second: normalizePositiveValue(item.timescaleData?.median_output_speed),
            ttft_seconds: normalizePositiveValue(item.timescaleData?.median_time_to_first_chunk),
            end_to_end_seconds: normalizePositiveValue(item.end_to_end_response_time_metrics?.total_time),
            swe_bench: normalizeBenchmarkScore(sweEnriched),
            swe_bench_verified: normalizeBenchmarkScore(sweVerifiedEnriched),
            input_modality_image: item.input_modality_image,
            input_modality_video: item.input_modality_video,
            input_modality_speech: item.input_modality_speech,
            output_modality_speech: item.output_modality_speech,
            is_open_weights: item.is_open_weights,
            reasoning_model: item.reasoning_model,
          },
        } satisfies NormalizedLeaderboardEntry;
      });
    return rankEntries(rows);
  },
};

const liveBenchGeneralLlmAdapter: LeaderboardAdapter = {
  sourceName: "livebench_general_llm",
  sourceType: "leaderboard",
  categories: ["general_llm"],
  priority: 20,
  async fetchRaw(): Promise<unknown> {
    return fetchLiveBenchSnapshot();
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const snapshot = (raw && typeof raw === "object" ? (raw as LiveBenchSnapshot) : null);
    if (!snapshot?.csvText || !snapshot.categories || !snapshot.releaseDate) {
      return [];
    }
    return entriesFromLiveBenchSnapshot(snapshot);
  },
};

const llmStatsImageGenerationAdapter: LeaderboardAdapter = {
  sourceName: "llm_stats_image_generation",
  sourceType: "leaderboard",
  categories: ["image_generation"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const [textToImage, imageToImage] = await Promise.all([
      fetchMagiaArenaLeaderboard("text-to-image", 300),
      fetchMagiaArenaLeaderboard("image-to-image", 300),
    ]);
    return {
      textToImage,
      imageToImage,
    };
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return entriesFromCombinedMagiaArenas(
      {
        "text-to-image": (record.textToImage as MagiaArenaLeaderboardResponse) ?? {},
        "image-to-image": (record.imageToImage as MagiaArenaLeaderboardResponse) ?? {},
      },
      "image_generation",
    );
  },
};

const llmStatsVideoGenerationAdapter: LeaderboardAdapter = {
  sourceName: "llm_stats_video_generation",
  sourceType: "leaderboard",
  categories: ["video_generation"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const [textToVideo, imageToVideo] = await Promise.all([
      fetchMagiaArenaLeaderboard("text-to-video", 300),
      fetchMagiaArenaLeaderboard("image-to-video", 300),
    ]);
    return {
      textToVideo,
      imageToVideo,
    };
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return entriesFromCombinedMagiaArenas(
      {
        "text-to-video": (record.textToVideo as MagiaArenaLeaderboardResponse) ?? {},
        "image-to-video": (record.imageToVideo as MagiaArenaLeaderboardResponse) ?? {},
      },
      "video_generation",
    );
  },
};

function makeZeroEvalCategoryAdapter(
  sourceName: string,
  category: LeaderboardCategory,
  zeroEvalCategorySlug: string,
): LeaderboardAdapter {
  return {
    sourceName,
    sourceType: "leaderboard",
    categories: [category],
    priority: 10,
    async fetchRaw(): Promise<unknown> {
      return fetchZeroEvalCategoryBenchmarks(zeroEvalCategorySlug);
    },
    async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
      const response = (raw && typeof raw === "object" ? (raw as ZeroEvalCategoryResponse) : {}) as ZeroEvalCategoryResponse;
      return entriesFromZeroEvalBenchmarks(response, category);
    },
  };
}

const llmStatsTextToSpeechAdapter: LeaderboardAdapter = {
  sourceName: "llm_stats_text_to_speech",
  sourceType: "leaderboard",
  categories: ["text_to_speech"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const { data } = await fetchJsonWithRetry<MagiaArenaLeaderboardResponse>(
      `${ZEROEVAL_MAGIA_ARENAS_URL}/text-to-speech/leaderboard?limit=200&offset=0`,
      { method: "GET", headers: { Accept: "application/json" } },
      { allowedHosts: ["api.zeroeval.com"] },
    );
    return data;
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const response = (raw && typeof raw === "object" ? (raw as MagiaArenaLeaderboardResponse) : {}) as MagiaArenaLeaderboardResponse;
    return entriesFromMagiaArenaLeaderboard(response, "text_to_speech");
  },
};
const llmStatsSpeechToTextAdapter: LeaderboardAdapter = {
  sourceName: "llm_stats_speech_to_text",
  sourceType: "leaderboard",
  categories: ["speech_to_text"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    return fetchMagiaArenaLeaderboard("speech-to-text", 300);
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const response = (raw && typeof raw === "object" ? (raw as MagiaArenaLeaderboardResponse) : {}) as MagiaArenaLeaderboardResponse;
    return entriesFromMagiaArenaLeaderboard(response, "speech_to_text");
  },
};
const llmStatsEmbeddingsAdapter = makeZeroEvalCategoryAdapter(
  "llm_stats_embeddings",
  "embeddings",
  "search",
);

// ─── AA Leaderboard page fetch helper ────────────────────────────────────────

async function fetchAaLeaderboardPageHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["artificialanalysis.ai", "www.artificialanalysis.ai"].includes(parsed.hostname)) {
    throw new Error(`Disallowed AA leaderboard host: ${parsed.hostname}`);
  }
  const { data } = await fetchWithRetry<string>(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "model-tracker-monitoring/1.0",
      },
    },
    async (response) => response.text(),
    { allowedHosts: ["artificialanalysis.ai", "www.artificialanalysis.ai"] },
  );
  return data;
}

// Convert AA arena entries to NormalizedLeaderboardEntry.
// score = elo rating (higher = better).
function aaArenaEntriesToLeaderboard(
  entries: ArtificialAnalysisArenaEntry[],
  scoreUnit: string,
  subScoreKey?: string,
): NormalizedLeaderboardEntry[] {
  const rows = entries.map((item) => {
    const vendor = item.vendorName ?? undefined;
    const payload: Record<string, unknown> = {};
    if (subScoreKey) payload[subScoreKey] = item.elo;
    if (item.winRate !== null) payload.win_rate = item.winRate;
    if (item.appearances !== null) payload.matches_played = item.appearances;
    if (item.released !== null) payload.release_date = item.released;
    if (item.pricePer1kImages !== null) payload.price_per_1k_images = item.pricePer1kImages;
    if (item.pricePerMinute !== null) payload.price_per_minute = item.pricePerMinute;
    if (item.pricePer1mCharacters !== null) payload.price_per_1m_chars = item.pricePer1mCharacters;

    return {
      rank: 0,
      sourceModelId: item.id,
      canonicalModelKey: canonicalKey(item.name, vendor),
      modelName: item.name,
      vendor,
      score: item.elo,
      scoreUnit,
      payload,
    } satisfies NormalizedLeaderboardEntry;
  });

  return rankEntries(rows);
}

// Merge two leaderboard sets by canonicalModelKey, averaging elo scores.
function mergeAaArenaLeaderboards(
  aEntries: NormalizedLeaderboardEntry[],
  bEntries: NormalizedLeaderboardEntry[],
  category: LeaderboardCategory,
  combinedScoreUnit: string,
  aSubKey: string,
  bSubKey: string,
): NormalizedLeaderboardEntry[] {
  const bucket = new Map<
    string,
    { base: NormalizedLeaderboardEntry; aScore: number | null; bScore: number | null }
  >();

  for (const entry of aEntries) {
    bucket.set(entry.canonicalModelKey, { base: entry, aScore: entry.score ?? null, bScore: null });
  }
  for (const entry of bEntries) {
    const prev = bucket.get(entry.canonicalModelKey);
    if (prev) {
      prev.bScore = entry.score ?? null;
    } else {
      bucket.set(entry.canonicalModelKey, { base: entry, aScore: null, bScore: entry.score ?? null });
    }
  }

  const merged: NormalizedLeaderboardEntry[] = [...bucket.values()].map(({ base, aScore, bScore }) => {
    const scores = [aScore, bScore].filter((s): s is number => s !== null);
    const combined = scores.length > 0 ? scores.reduce((acc, s) => acc + s, 0) / scores.length : null;
    return {
      rank: 0,
      sourceModelId: base.sourceModelId,
      canonicalModelKey: base.canonicalModelKey,
      modelName: base.modelName,
      vendor: base.vendor,
      score: combined ?? undefined,
      scoreUnit: combinedScoreUnit,
      payload: {
        ...(base.payload ?? {}),
        ...(aScore !== null ? { [aSubKey]: aScore } : {}),
        ...(bScore !== null ? { [bSubKey]: bScore } : {}),
        ...(category === "image_generation" ? { image_gen_score: aScore, image_edit_score: bScore } : {}),
        ...(category === "video_generation" ? { video_gen_score: aScore, image_to_video_score: bScore } : {}),
      },
    };
  });

  return rankEntries(merged);
}

// ─── AA Image Generation adapter ─────────────────────────────────────────────

const aaImageLeaderboardAdapter: LeaderboardAdapter = {
  sourceName: "aa_image_text_to_image",
  sourceType: "leaderboard",
  categories: ["image_generation"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const [textToImageResult, editingResult] = await Promise.allSettled([
      fetchAaLeaderboardPageHtml(AA_IMAGE_TEXT_TO_IMAGE_URL),
      fetchAaLeaderboardPageHtml(AA_IMAGE_EDITING_URL),
    ]);
    return {
      textToImageHtml: textToImageResult.status === "fulfilled" ? textToImageResult.value : "",
      editingHtml: editingResult.status === "fulfilled" ? editingResult.value : "",
    };
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const t2iHtml = String(record.textToImageHtml ?? "");
    const editHtml = String(record.editingHtml ?? "");

    if (!t2iHtml && !editHtml) {
      throw new Error("aa_image_text_to_image: no HTML fetched from either leaderboard page");
    }

    const t2iArena = t2iHtml ? extractArtificialAnalysisArenaPage(t2iHtml) : [];
    const editArena = editHtml ? extractArtificialAnalysisArenaPage(editHtml) : [];

    const t2iEntries = aaArenaEntriesToLeaderboard(t2iArena, "aa:image_generation:text_to_image", "image_gen_score");
    const editEntries = aaArenaEntriesToLeaderboard(editArena, "aa:image_generation:editing", "image_edit_score");

    if (t2iEntries.length === 0 && editEntries.length === 0) {
      throw new Error("aa_image_text_to_image: parsed 0 models from both leaderboard pages");
    }
    if (t2iEntries.length === 0) return rankEntries(editEntries.map((e) => ({ ...e, scoreUnit: "aa:image_generation:blended" })));
    if (editEntries.length === 0) return rankEntries(t2iEntries.map((e) => ({ ...e, scoreUnit: "aa:image_generation:blended" })));

    return mergeAaArenaLeaderboards(t2iEntries, editEntries, "image_generation", "aa:image_generation:blended", "image_gen_score", "image_edit_score");
  },
};

// ─── AA Video Generation adapter ─────────────────────────────────────────────

const aaVideoLeaderboardAdapter: LeaderboardAdapter = {
  sourceName: "aa_video_text_to_video",
  sourceType: "leaderboard",
  categories: ["video_generation"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const [t2vResult, i2vResult] = await Promise.allSettled([
      fetchAaLeaderboardPageHtml(AA_VIDEO_TEXT_TO_VIDEO_URL),
      fetchAaLeaderboardPageHtml(AA_VIDEO_IMAGE_TO_VIDEO_URL),
    ]);
    return {
      textToVideoHtml: t2vResult.status === "fulfilled" ? t2vResult.value : "",
      imageToVideoHtml: i2vResult.status === "fulfilled" ? i2vResult.value : "",
    };
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const t2vHtml = String(record.textToVideoHtml ?? "");
    const i2vHtml = String(record.imageToVideoHtml ?? "");

    if (!t2vHtml && !i2vHtml) {
      throw new Error("aa_video_text_to_video: no HTML fetched from either leaderboard page");
    }

    const t2vArena = t2vHtml ? extractArtificialAnalysisArenaPage(t2vHtml) : [];
    const i2vArena = i2vHtml ? extractArtificialAnalysisArenaPage(i2vHtml) : [];

    const t2vEntries = aaArenaEntriesToLeaderboard(t2vArena, "aa:video_generation:text_to_video", "video_gen_score");
    const i2vEntries = aaArenaEntriesToLeaderboard(i2vArena, "aa:video_generation:image_to_video", "image_to_video_score");

    if (t2vEntries.length === 0 && i2vEntries.length === 0) {
      throw new Error("aa_video_text_to_video: parsed 0 models from both leaderboard pages");
    }
    if (t2vEntries.length === 0) return rankEntries(i2vEntries.map((e) => ({ ...e, scoreUnit: "aa:video_generation:blended" })));
    if (i2vEntries.length === 0) return rankEntries(t2vEntries.map((e) => ({ ...e, scoreUnit: "aa:video_generation:blended" })));

    return mergeAaArenaLeaderboards(t2vEntries, i2vEntries, "video_generation", "aa:video_generation:blended", "video_gen_score", "image_to_video_score");
  },
};

// ─── AA TTS adapter ───────────────────────────────────────────────────────────

const aaTtsAdapter: LeaderboardAdapter = {
  sourceName: "aa_tts",
  sourceType: "leaderboard",
  categories: ["text_to_speech"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    return fetchAaLeaderboardPageHtml(AA_TTS_URL);
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const html = String(raw ?? "");
    const arenaEntries = extractArtificialAnalysisArenaPage(html);
    const entries = aaArenaEntriesToLeaderboard(arenaEntries, "aa:text_to_speech:elo");
    if (entries.length === 0) {
      throw new Error("aa_tts: parsed 0 models from TTS leaderboard page");
    }
    return entries;
  },
};

// ─── AA STT adapter ───────────────────────────────────────────────────────────

const aaSttAdapter: LeaderboardAdapter = {
  sourceName: "aa_stt",
  sourceType: "leaderboard",
  categories: ["speech_to_text"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    return fetchAaLeaderboardPageHtml(AA_STT_URL);
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const html = String(raw ?? "");
    const sttEntries = extractArtificialAnalysisSttPage(html);
    if (sttEntries.length === 0) {
      throw new Error("aa_stt: parsed 0 models from STT page (word_error_rate not found)");
    }
    const rows = sttEntries.map((item) => {
      const vendor = inferVendorFromModelId(item.name);
      return {
        rank: 0,
        sourceModelId: item.id,
        canonicalModelKey: canonicalKey(item.name, vendor),
        modelName: item.name,
        vendor,
        score: item.accuracyScore,
        scoreUnit: "aa:speech_to_text:accuracy",
        payload: {
          word_error_rate: item.wordErrorRate,
          ...(item.pricePerMinute !== null ? { price_per_minute: item.pricePerMinute } : {}),
        },
      } satisfies NormalizedLeaderboardEntry;
    });
    return rankEntries(rows);
  },
};

// ─── MTEB Embeddings adapter ──────────────────────────────────────────────────

type MtebLeaderboardRow = {
  model?: string;
  model_name?: string;
  average_score?: number | null;
  main_score?: number | null;
  mteb_avg?: number | null;
  [key: string]: unknown;
};

type HfDatasetsViewerResponse = {
  rows?: Array<{ row?: Record<string, unknown>; row_idx?: number }>;
  num_rows_total?: number;
};

async function fetchMtebLeaderboardRows(): Promise<MtebLeaderboardRow[]> {
  // Try known MTEB leaderboard configs in priority order.
  const attempts: Array<{ config: string; split: string }> = [
    { config: "default", split: "test" },
    { config: "default", split: "train" },
    { config: "all", split: "test" },
    { config: "all", split: "train" },
  ];

  for (const { config, split } of attempts) {
    const url = new URL(HF_DATASETS_VIEWER_BASE);
    url.searchParams.set("dataset", MTEB_DATASET);
    url.searchParams.set("config", config);
    url.searchParams.set("split", split);
    url.searchParams.set("offset", "0");
    url.searchParams.set("length", "200");

    try {
      const { data } = await fetchJsonWithRetry<HfDatasetsViewerResponse>(
        url.toString(),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "model-tracker-monitoring/1.0",
          },
        },
        { allowedHosts: ["datasets-server.huggingface.co"] },
      );
      const rows = (Array.isArray(data.rows) ? data.rows : [])
        .map((r) => r.row)
        .filter((r): r is Record<string, unknown> => Boolean(r));
      if (rows.length > 0) {
        return rows as MtebLeaderboardRow[];
      }
    } catch {
      // try next config
    }
  }

  return [];
}

function normalizeMtebRows(rows: MtebLeaderboardRow[]): NormalizedLeaderboardEntry[] {
  const entries = rows
    .map((row) => {
      const modelName = String(row.model_name ?? row.model ?? "").trim();
      if (!modelName) return null;

      // score: prefer average_score > main_score > mteb_avg > any field ending with _score/_avg
      let score: number | null = null;
      for (const key of ["average_score", "main_score", "mteb_avg", "mteb_average"]) {
        const v = row[key];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          score = v;
          break;
        }
      }
      if (score === null) {
        for (const [key, val] of Object.entries(row)) {
          if ((key.endsWith("_score") || key.endsWith("_avg") || key.endsWith("_average")) && typeof val === "number" && Number.isFinite(val) && val > 0) {
            score = val;
            break;
          }
        }
      }
      if (score === null) return null;

      // Normalize 0–1 scale to 0–100
      if (score > 0 && score <= 1) score = score * 100;

      const vendor = String(row.vendor ?? row.organization ?? row.org ?? "").trim() || undefined;
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        if (key === "model" || key === "model_name") continue;
        if ((typeof val === "number" && Number.isFinite(val)) || typeof val === "string") {
          payload[key] = val;
        }
      }

      return {
        rank: 0,
        sourceModelId: modelName,
        canonicalModelKey: canonicalKey(modelName, vendor),
        modelName,
        vendor,
        score,
        scoreUnit: "mteb:embeddings:average",
        payload,
      } satisfies NormalizedLeaderboardEntry;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return rankEntries(entries);
}

const mtebEmbeddingsAdapter: LeaderboardAdapter = {
  sourceName: "mteb_embeddings",
  sourceType: "leaderboard",
  categories: ["embeddings"],
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const rows = await fetchMtebLeaderboardRows();
    return { rows };
  },
  async normalizeTop10(raw: unknown): Promise<NormalizedLeaderboardEntry[]> {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const rows = Array.isArray(record.rows) ? (record.rows as MtebLeaderboardRow[]) : [];
    if (rows.length === 0) {
      throw new Error("mteb_embeddings: no rows returned from MTEB leaderboard dataset");
    }
    const entries = normalizeMtebRows(rows);
    if (entries.length === 0) {
      throw new Error("mteb_embeddings: parsed 0 valid entries from MTEB dataset rows");
    }
    return entries;
  },
};

const LEADERBOARD_ADAPTERS: Record<string, LeaderboardAdapter> = {
  [artificialAnalysisAdapter.sourceName]: artificialAnalysisAdapter,
  [liveBenchGeneralLlmAdapter.sourceName]: liveBenchGeneralLlmAdapter,
  // Image generation
  [aaImageLeaderboardAdapter.sourceName]: aaImageLeaderboardAdapter,
  [llmStatsImageGenerationAdapter.sourceName]: llmStatsImageGenerationAdapter,
  // Video generation
  [aaVideoLeaderboardAdapter.sourceName]: aaVideoLeaderboardAdapter,
  [llmStatsVideoGenerationAdapter.sourceName]: llmStatsVideoGenerationAdapter,
  // TTS
  [aaTtsAdapter.sourceName]: aaTtsAdapter,
  [llmStatsTextToSpeechAdapter.sourceName]: llmStatsTextToSpeechAdapter,
  // STT
  [aaSttAdapter.sourceName]: aaSttAdapter,
  [llmStatsSpeechToTextAdapter.sourceName]: llmStatsSpeechToTextAdapter,
  // Embeddings
  [mtebEmbeddingsAdapter.sourceName]: mtebEmbeddingsAdapter,
  [llmStatsEmbeddingsAdapter.sourceName]: llmStatsEmbeddingsAdapter,
};

function isActiveSource(item: SourceRegistryItem): boolean {
  return item.sourceType === "leaderboard" && item.status === "enabled";
}

export function getActiveLeaderboardSources(category: LeaderboardCategory): LeaderboardAdapter[] {
  return SOURCE_REGISTRY
    .filter(isActiveSource)
    .filter((item) => item.categories?.includes(category))
    .map((item) => LEADERBOARD_ADAPTERS[item.sourceName])
    .filter((adapter): adapter is LeaderboardAdapter => Boolean(adapter))
    .sort((a, b) => a.priority - b.priority);
}
