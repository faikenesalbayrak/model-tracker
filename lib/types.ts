export const SOURCE_KEYS = [
  "hf_hub",
  "hf_leaderboard",
  "pwc",
  "pricing_feed",
  "github_public",
  "semantic_scholar_public",
  "arxiv_public",
  "crossref_public",
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];

export const RECORD_KINDS = [
  "release",
  "leaderboard",
  "benchmark",
  "pricing",
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

export const METRIC_KEYS = [
  "mmlu",
  "humaneval",
  "arc",
  "hellaswag",
  "mtbench",
  "price_per_1m",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const ROUTE_KEYS = [
  "releases",
  "leaderboard",
  "benchmarks",
  "pricing",
  "github_releases",
  "semantic_scholar",
  "arxiv",
  "crossref",
] as const;

export type RouteKey = (typeof ROUTE_KEYS)[number];

export const ERROR_KEYS = [
  "timeout",
  "rate_limit",
  "upstream_error",
  "validation_error",
  "parse_error",
  "redirect",
  "missing_key",
  "unknown",
] as const;

export type ErrorKey = (typeof ERROR_KEYS)[number];

export interface ApiErrorMeta {
  kind: ErrorKey;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
  upstreamUrl?: string;
  detail?: string;
  attempts?: number;
}

export interface NormalizedRecord {
  id: string;
  kind: RecordKind;
  lab: string;
  source: SourceKey;
  metric?: MetricKey;
  value: number | string | null;
  title: string;
  subtitle?: string;
  url?: string;
  timestamp: string;
  confidence: ConfidenceLevel;
  last_success_at: string;
  payload: Record<string, unknown>;
}

export interface ApiEnvelope {
  route: RouteKey;
  generated_at: string;
  last_success_at: string;
  stale: boolean;
  source: SourceKey;
  data: NormalizedRecord[];
  error: ApiErrorMeta | null;
  note?: string;
}
