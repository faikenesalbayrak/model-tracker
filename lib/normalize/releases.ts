import { canonicalRecordId, normalizeLabName } from "@/lib/canonical-map";
import { buildConfidence, createRecord, stampRecords } from "@/lib/normalize/common";
import type { NormalizedRecord } from "@/lib/types";

interface HfModelCard {
  id?: string;
  modelId?: string;
  lastModified?: string;
  createdAt?: string;
  pipeline_tag?: string;
  tags?: string[];
  likes?: number;
  downloads?: number;
  cardData?: {
    summary?: string;
    description?: string;
    language?: string | string[];
  } | null;
}

function extractTitle(modelId: string): string {
  return modelId.split("/").pop() ?? modelId;
}

function extractSummary(cardData: HfModelCard["cardData"]): string | undefined {
  if (!cardData) {
    return undefined;
  }

  const candidate = cardData.summary ?? cardData.description;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  return undefined;
}

export function normalizeReleases(
  models: HfModelCard[],
  lastSuccessAt: string,
): NormalizedRecord[] {
  const records = models
    .map((model) => {
      const modelId = model.modelId ?? model.id ?? "";
      const lab = normalizeLabName(modelId.split("/")[0] ?? "");
      if (!lab) {
        return null;
      }

      const title = extractTitle(modelId);
      const releaseTimestamp = model.createdAt ?? model.lastModified ?? lastSuccessAt;
      const summary = extractSummary(model.cardData);

      return createRecord({
        id: canonicalRecordId(lab, modelId, "release"),
        kind: "release",
        lab,
        source: "hf_hub",
        value: summary ?? releaseTimestamp,
        metric: undefined,
        title,
        subtitle: lab,
        url: `https://huggingface.co/${modelId}`,
        timestamp: new Date(releaseTimestamp).toISOString(),
        confidence: buildConfidence({
          hasFreshTimestamp: Boolean(model.createdAt ?? model.lastModified),
          hasSummary: Boolean(summary),
        }),
        last_success_at: lastSuccessAt,
        payload: {
          model_id: modelId,
          release_date: releaseTimestamp,
          summary: summary ?? null,
          tags: model.tags ?? [],
          likes: model.likes ?? 0,
          downloads: model.downloads ?? 0,
          pipeline_tag: model.pipeline_tag ?? null,
        },
      });
    })
    .filter((record): record is NormalizedRecord => Boolean(record));

  return stampRecords(records, lastSuccessAt);
}

export function filterRecentReleases(
  records: NormalizedRecord[],
  generatedAt: string,
  days = 7,
): NormalizedRecord[] {
  const cutoff = Date.parse(generatedAt) - days * 24 * 60 * 60 * 1000;
  return records.filter((record) => Date.parse(record.timestamp) >= cutoff);
}

export type { HfModelCard };
