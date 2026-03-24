import { canonicalRecordId, normalizeLabName } from "@/lib/canonical-map";
import { buildConfidence, createRecord, stampRecords } from "@/lib/normalize/common";
import type { NormalizedRecord } from "@/lib/types";

// OpenRouter /api/v1/models response shape
export interface OpenRouterModel {
  id?: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;   // USD per token (string)
    completion?: string;
    input_cache_read?: string;
  };
}

export interface OpenRouterResponse {
  data?: OpenRouterModel[];
}

// Kept for backwards-compat (Artificial Analysis) — unused once OpenRouter is active
export interface ArtificialAnalysisResponse {
  data?: Array<{
    id?: string;
    name?: string;
    slug?: string;
    model_creator?: { id?: string; name?: string; slug?: string };
    pricing?: {
      price_1m_blended_3_to_1?: number;
      price_1m_input_tokens?: number;
      price_1m_output_tokens?: number;
    };
    evaluations?: Record<string, number>;
    median_output_tokens_per_second?: number;
    median_time_to_first_token_seconds?: number;
    median_time_to_first_answer_token?: number;
  }>;
}

function extractLabFromOpenRouterId(id: string): string | null {
  const owner = id.split("/")[0] ?? "";
  return normalizeLabName(owner);
}

function toPrice1m(perTokenStr: string | undefined): number | null {
  if (!perTokenStr) return null;
  const val = parseFloat(perTokenStr);
  if (!Number.isFinite(val) || val < 0) return null;
  return val * 1_000_000;
}

export function normalizeOpenRouterData(
  response: OpenRouterResponse,
  lastSuccessAt: string,
): NormalizedRecord[] {
  const models = response.data ?? [];

  const records = models
    .map((model) => {
      const id = model.id ?? "";
      const lab = extractLabFromOpenRouterId(id);
      if (!lab) return null;

      const inputPrice = toPrice1m(model.pricing?.prompt);
      const outputPrice = toPrice1m(model.pricing?.completion);
      // blended 3:1 input/output ratio
      const blended =
        inputPrice !== null && outputPrice !== null
          ? (inputPrice * 3 + outputPrice) / 4
          : inputPrice ?? outputPrice;

      if (blended === null) return null;

      const modelSlug = id.split("/").slice(1).join("/") || id;
      const title = model.name ?? modelSlug;

      return createRecord({
        id: canonicalRecordId(lab, id, "pricing"),
        kind: "pricing",
        lab,
        source: "pricing_feed",
        metric: "price_per_1m",
        value: Math.round(blended * 1000) / 1000,
        title,
        subtitle: lab,
        url: undefined,
        timestamp: model.created
          ? new Date(model.created * 1000).toISOString()
          : lastSuccessAt,
        confidence: buildConfidence({ hasFreshTimestamp: Boolean(model.created) }),
        last_success_at: lastSuccessAt,
        payload: {
          model_id: id,
          context_length: model.context_length ?? null,
          price_1m_input: inputPrice,
          price_1m_output: outputPrice,
          price_1m_blended: blended,
        },
      });
    })
    .filter((record): record is NormalizedRecord => Boolean(record));

  return stampRecords(records, lastSuccessAt);
}

// Legacy Artificial Analysis normalizer (kept but unused)
export function normalizePricingData(
  response: ArtificialAnalysisResponse,
  lastSuccessAt: string,
): NormalizedRecord[] {
  const models = response.data ?? [];
  const records = models
    .map((model) => {
      const lab =
        normalizeLabName(model.model_creator?.name ?? model.model_creator?.slug ?? "") ??
        (model.model_creator?.name ?? "Unknown");
      const modelName = model.name ?? model.slug ?? model.id ?? "Unknown model";
      const price =
        model.pricing?.price_1m_blended_3_to_1 ??
        model.pricing?.price_1m_input_tokens ??
        null;
      if (price === null) return null;

      return createRecord({
        id: canonicalRecordId(lab, modelName, "pricing"),
        kind: "pricing",
        lab,
        source: "pricing_feed",
        metric: "price_per_1m",
        value: price,
        title: modelName,
        subtitle: lab,
        url: undefined,
        timestamp: lastSuccessAt,
        confidence: buildConfidence({ hasFreshTimestamp: true }),
        last_success_at: lastSuccessAt,
        payload: {
          model_id: model.id ?? null,
          slug: model.slug ?? null,
          creator: model.model_creator ?? null,
          evaluations: model.evaluations ?? {},
          median_output_tokens_per_second: model.median_output_tokens_per_second ?? null,
          median_time_to_first_token_seconds: model.median_time_to_first_token_seconds ?? null,
          median_time_to_first_answer_token: model.median_time_to_first_answer_token ?? null,
          price_1m_input_tokens: model.pricing?.price_1m_input_tokens ?? null,
          price_1m_output_tokens: model.pricing?.price_1m_output_tokens ?? null,
        },
      });
    })
    .filter((record): record is NormalizedRecord => Boolean(record));

  return stampRecords(records, lastSuccessAt);
}
