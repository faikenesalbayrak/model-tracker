import { canonicalRecordId, normalizeLabName } from "@/lib/canonical-map";
import { buildConfidence, createRecord, stampRecords } from "@/lib/normalize/common";
import type { MetricKey, NormalizedRecord } from "@/lib/types";

export interface BenchmarkPoint {
  model: string;
  lab: string;
  score: number;
  timestamp: string;
  rank?: number;
  sourceUrl?: string;
}

const BENCHMARK_ALIASES: Record<MetricKey, string[]> = {
  mmlu: [
    "mmlu",
    "multi-task-language-understanding-on-mmlu",
    "mmlu-on-mmlu-5-shots",
    "leaderboard_mmlu_pro",
  ],
  humaneval: [
    "humaneval",
    "human-eval",
    "code-generation-on-humaneval",
    "humaneval-on-humaneval-1",
  ],
  arc: [
    "arc",
    "ai2-reasoning-challenge-on-arc",
    "arc-on-arc",
  ],
  hellaswag: [
    "hellaswag",
    "commonsense-reasoning-on-hellaswag",
    "hellaswag-on-hellaswag",
  ],
  mtbench: [
    "mt-bench",
    "mtbench",
    "mt_bench",
    "mt-bench-on-mt-bench",
  ],
  price_per_1m: [
    "price",
  ],
};

const OFFLINE_FALLBACK: Record<MetricKey, BenchmarkPoint[]> = {
  mmlu: [
    { model: "OpenAI GPT-4o", lab: "OpenAI", score: 88.2, timestamp: "2025-02-01T00:00:00.000Z", rank: 1 },
    { model: "Claude 3.7 Sonnet", lab: "Anthropic", score: 86.4, timestamp: "2025-01-24T00:00:00.000Z", rank: 2 },
    { model: "Gemini 2.0 Pro", lab: "Google DeepMind", score: 85.9, timestamp: "2025-01-18T00:00:00.000Z", rank: 3 },
  ],
  humaneval: [
    { model: "DeepSeek Coder", lab: "DeepSeek", score: 91.5, timestamp: "2025-02-05T00:00:00.000Z", rank: 1 },
    { model: "Qwen2.5 Coder", lab: "Alibaba (Qwen)", score: 90.1, timestamp: "2025-01-28T00:00:00.000Z", rank: 2 },
    { model: "GPT-4o", lab: "OpenAI", score: 88.7, timestamp: "2025-01-15T00:00:00.000Z", rank: 3 },
  ],
  arc: [
    { model: "Claude 3.7 Sonnet", lab: "Anthropic", score: 92.1, timestamp: "2025-02-02T00:00:00.000Z", rank: 1 },
    { model: "GPT-4o", lab: "OpenAI", score: 91.8, timestamp: "2025-01-23T00:00:00.000Z", rank: 2 },
    { model: "Gemini 2.0 Pro", lab: "Google DeepMind", score: 90.6, timestamp: "2025-01-12T00:00:00.000Z", rank: 3 },
  ],
  hellaswag: [
    { model: "Llama 3.3 70B", lab: "Meta AI", score: 93.4, timestamp: "2025-02-06T00:00:00.000Z", rank: 1 },
    { model: "Qwen2.5 72B", lab: "Alibaba (Qwen)", score: 92.7, timestamp: "2025-01-20T00:00:00.000Z", rank: 2 },
    { model: "Mistral Large", lab: "Mistral AI", score: 91.2, timestamp: "2025-01-09T00:00:00.000Z", rank: 3 },
  ],
  mtbench: [
    { model: "Claude 3.7 Sonnet", lab: "Anthropic", score: 9.4, timestamp: "2025-02-04T00:00:00.000Z", rank: 1 },
    { model: "GPT-4o", lab: "OpenAI", score: 9.2, timestamp: "2025-01-19T00:00:00.000Z", rank: 2 },
    { model: "Gemini 2.0 Pro", lab: "Google DeepMind", score: 9.0, timestamp: "2025-01-11T00:00:00.000Z", rank: 3 },
  ],
  price_per_1m: [
    { model: "GPT-4o mini", lab: "OpenAI", score: 0.15, timestamp: "2025-02-05T00:00:00.000Z", rank: 1 },
  ],
};

export function normalizeBenchmarkName(value: string | null | undefined): MetricKey {
  const normalized = (value ?? "mmlu").trim().toLowerCase();
  if (normalized.includes("human")) return "humaneval";
  if (normalized.includes("arc")) return "arc";
  if (normalized.includes("hellaswag") || normalized.includes("swag")) return "hellaswag";
  if (normalized.includes("bench")) return "mtbench";
  if (normalized.includes("price")) return "price_per_1m";
  return "mmlu";
}

export function getBenchmarkAliases(metric: MetricKey): string[] {
  return BENCHMARK_ALIASES[metric];
}

function scoreFromBenchResult(result: Record<string, unknown>): number | null {
  const numeric = Object.entries(result)
    .filter(([key, value]) => !key.toLowerCase().includes("stderr") && typeof value === "number")
    .map(([, value]) => value as number);
  return numeric[0] ?? null;
}

export function normalizeBenchmarkPoints(params: {
  metric: MetricKey;
  results: Array<Record<string, unknown>>;
  generatedAt: string;
  lastSuccessAt: string;
}): NormalizedRecord[] {
  const records = params.results
    .map((item, index) => {
      const model = String(item.model ?? item.model_name ?? item.name ?? "unknown/model");
      const lab = normalizeLabName(String(item.lab ?? item.organization ?? item.creator ?? model.split("/")[0] ?? ""));
      if (!lab) {
        return null;
      }

      const score = typeof item.score === "number"
        ? item.score
        : typeof item.value === "number"
          ? item.value
          : scoreFromBenchResult(item) ?? null;
      if (score === null) {
        return null;
      }

      const timestamp = typeof item.timestamp === "string"
        ? item.timestamp
        : typeof item.date === "string"
          ? item.date
          : params.generatedAt;

      return createRecord({
        id: canonicalRecordId(lab, model, params.metric),
        kind: "benchmark",
        lab,
        source: "pwc",
        metric: params.metric,
        value: score,
        title: model,
        subtitle: lab,
        url: typeof item.sourceUrl === "string" ? item.sourceUrl : undefined,
        timestamp,
        confidence: item.fallback ? "low" : buildConfidence({
          hasFreshTimestamp: true,
        }),
        last_success_at: params.lastSuccessAt,
        payload: {
          rank: typeof item.rank === "number" ? item.rank : index + 1,
          benchmark: params.metric,
          fallback: Boolean(item.fallback),
          source_name: item.source_name ?? null,
        },
      });
    })
    .filter((record): record is NormalizedRecord => Boolean(record));

  return stampRecords(records, params.lastSuccessAt);
}

export function offlineBenchmarkFallback(
  metric: MetricKey,
  generatedAt: string,
): BenchmarkPoint[] {
  return OFFLINE_FALLBACK[metric].map((item) => ({
    ...item,
    timestamp: item.timestamp ?? generatedAt,
  }));
}

export function pointsToRecords(
  metric: MetricKey,
  points: BenchmarkPoint[],
  generatedAt: string,
  lastSuccessAt: string,
  fallback = false,
): NormalizedRecord[] {
  return stampRecords(
    points.map((point, index) => createRecord({
      id: canonicalRecordId(point.lab, point.model, `${metric}:${point.rank ?? index + 1}`),
      kind: "benchmark",
      lab: point.lab,
      source: "pwc",
      metric,
      value: point.score,
      title: point.model,
      subtitle: point.lab,
      url: point.sourceUrl,
      timestamp: point.timestamp ?? generatedAt,
      confidence: fallback ? "low" : buildConfidence({ hasFreshTimestamp: true }),
      last_success_at: lastSuccessAt,
      payload: {
        rank: point.rank ?? index + 1,
        benchmark: metric,
        fallback,
      },
    })),
    lastSuccessAt,
  );
}
