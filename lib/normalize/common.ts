import { REVALIDATE_SECONDS } from "@/lib/sources";
import type {
  ApiEnvelope,
  ConfidenceLevel,
  NormalizedRecord,
  RouteKey,
  SourceKey,
} from "@/lib/types";

export interface RecordInit extends Omit<NormalizedRecord, "id"> {
  id?: string;
}

export function createRecord(record: RecordInit): NormalizedRecord {
  return {
    ...record,
    id: record.id ?? `${record.kind}:${record.lab}:${record.title}`.toLowerCase(),
  };
}

export function stampRecords(
  records: NormalizedRecord[],
  lastSuccessAt: string,
): NormalizedRecord[] {
  return records.map((record) => ({
    ...record,
    last_success_at: lastSuccessAt,
  }));
}

export function buildEnvelope(params: {
  route: RouteKey;
  source: SourceKey;
  generatedAt: string;
  lastSuccessAt: string;
  data: NormalizedRecord[];
  error: ApiEnvelope["error"];
  stale?: boolean;
  note?: string;
}): ApiEnvelope {
  const stale = params.stale ?? isStale(params.lastSuccessAt, params.route);
  return {
    route: params.route,
    source: params.source,
    generated_at: params.generatedAt,
    last_success_at: params.lastSuccessAt,
    stale,
    data: params.data,
    error: params.error,
    ...(params.note ? { note: params.note } : {}),
  };
}

export function isStale(lastSuccessAt: string, route: RouteKey): boolean {
  const last = Date.parse(lastSuccessAt);
  if (!Number.isFinite(last)) {
    return true;
  }

  return Date.now() - last > REVALIDATE_SECONDS[route] * 1000;
}

export function fallbackEnvelope(params: {
  route: RouteKey;
  source: SourceKey;
  generatedAt: string;
  error: ApiEnvelope["error"];
  note?: string;
}): ApiEnvelope {
  return {
    route: params.route,
    source: params.source,
    generated_at: params.generatedAt,
    last_success_at: params.generatedAt,
    stale: true,
    data: [],
    error: params.error,
    ...(params.note ? { note: params.note } : {}),
  };
}

export function buildConfidence(
  flags: { hasFreshTimestamp?: boolean; hasSummary?: boolean; fallback?: boolean },
): ConfidenceLevel {
  if (flags.fallback) {
    return "low";
  }

  if (flags.hasFreshTimestamp && flags.hasSummary) {
    return "high";
  }

  if (flags.hasFreshTimestamp) {
    return "medium";
  }

  return "low";
}
