import { extractArtificialAnalysisModels } from "@/lib/normalize/artificial-analysis";
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
const LLM_STATS_IMAGE_URL = "https://llm-stats.com/leaderboards/best-ai-for-image-generation";
const LLM_STATS_VIDEO_URL = "https://llm-stats.com/leaderboards/best-ai-for-video-generation";
const ZEROEVAL_CATEGORY_BENCHMARKS_URL = "https://api.zeroeval.com/leaderboard/categories";
const ZEROEVAL_MAGIA_ARENAS_URL = "https://api.zeroeval.com/magia/arenas";

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
          },
        } satisfies NormalizedLeaderboardEntry;
      });
    return rankEntries(rows);
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

const LEADERBOARD_ADAPTERS: Record<string, LeaderboardAdapter> = {
  [artificialAnalysisAdapter.sourceName]: artificialAnalysisAdapter,
  [llmStatsImageGenerationAdapter.sourceName]: llmStatsImageGenerationAdapter,
  [llmStatsVideoGenerationAdapter.sourceName]: llmStatsVideoGenerationAdapter,
  [llmStatsTextToSpeechAdapter.sourceName]: llmStatsTextToSpeechAdapter,
  [llmStatsSpeechToTextAdapter.sourceName]: llmStatsSpeechToTextAdapter,
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
