import { canonicalRecordId, normalizeLabName, resolveLabFromModelId } from "@/lib/canonical-map";
import { buildConfidence, createRecord, stampRecords } from "@/lib/normalize/common";
import type { NormalizedRecord } from "@/lib/types";

// HF Datasets Viewer row shape for open-llm-leaderboard/contents
export interface LeaderboardV2Row {
  eval_name?: string;
  fullname?: string;           // e.g. "meta-llama/Meta-Llama-3-8B-Instruct"
  "Average \u2b06\ufe0f"?: number; // Average ⬆️
  "#Params (B)"?: number;
  "MMLU-PRO"?: number;
  "MMLU-PRO Raw"?: number;
  BBH?: number;
  "BBH Raw"?: number;
  "MATH Lvl 5"?: number;
  "MATH Lvl 5 Raw"?: number;
  GPQA?: number;
  "GPQA Raw"?: number;
  MUSR?: number;
  "MUSR Raw"?: number;
  IFEval?: number;
  "IFEval Raw"?: number;
  "Upload To Hub Date"?: string;
  "Submission Date"?: string;
  Architecture?: string;
  "Hub License"?: string;
  "Hub \u2764\ufe0f"?: number;  // Hub ❤️
  Flagged?: boolean;
  MoE?: boolean;
}

export interface LeaderboardV2Response {
  rows?: Array<{ row_idx?: number; row?: LeaderboardV2Row }>;
  num_rows_total?: number;
}

// Legacy shape (kept for type compat)
export interface LeaderboardFile {
  results?: Record<string, Record<string, unknown>>;
  config?: {
    model?: string;
    model_args?: string;
    model_num_parameters?: number;
  };
  model_name?: string;
  model_name_sanitized?: string;
  model_source?: string;
  date?: number;
}

export interface LeaderboardSibling {
  rfilename?: string;
}

function parseDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const d = Date.parse(value);
  return Number.isFinite(d) ? new Date(d).toISOString() : fallback;
}

export function buildLeaderboardRecordsV2(params: {
  rows: LeaderboardV2Row[];
  lastSuccessAt: string;
}): NormalizedRecord[] {
  const records = params.rows
    .map((row) => {
      const fullname = row.fullname ?? row.eval_name ?? "";
      const lab = resolveLabFromModelId(fullname) ?? normalizeLabName(fullname.split("/")[0] ?? "");
      if (!lab) return null;

      const avgScore = row["Average \u2b06\ufe0f"] ?? null;
      const mmluPro = row["MMLU-PRO"] ?? null;
      const modelSlug = fullname.split("/").pop() ?? fullname;
      const timestamp = parseDate(
        row["Upload To Hub Date"] ?? row["Submission Date"],
        params.lastSuccessAt,
      );

      return createRecord({
        id: canonicalRecordId(lab, fullname, "leaderboard"),
        kind: "leaderboard",
        lab,
        source: "hf_leaderboard",
        metric: "mmlu",
        value: mmluPro ?? avgScore,
        title: modelSlug,
        subtitle: lab,
        url: `https://huggingface.co/${fullname}`,
        timestamp,
        confidence: buildConfidence({
          hasFreshTimestamp: Boolean(row["Upload To Hub Date"] ?? row["Submission Date"]),
          hasSummary: avgScore !== null,
        }),
        last_success_at: params.lastSuccessAt,
        payload: {
          model_id: fullname,
          params_b: row["#Params (B)"] ?? null,
          average: avgScore,
          mmlu_pro: mmluPro,
          bbh: row.BBH ?? null,
          math_lvl5: row["MATH Lvl 5"] ?? null,
          gpqa: row.GPQA ?? null,
          musr: row.MUSR ?? null,
          ifeval: row.IFEval ?? null,
          architecture: row.Architecture ?? null,
          license: row["Hub License"] ?? null,
          is_moe: row.MoE ?? false,
          flagged: row.Flagged ?? false,
        },
      });
    })
    .filter((record): record is NormalizedRecord => Boolean(record));

  return stampRecords(records, params.lastSuccessAt);
}

// Legacy builder kept for backwards-compat
export function buildLeaderboardRecords(params: {
  models: LeaderboardFile[];
  lastSuccessAt: string;
}): NormalizedRecord[] {
  return stampRecords([], params.lastSuccessAt);
}

// Legacy helper kept for backwards-compat
export function selectLatestSiblingFiles(
  siblings: LeaderboardSibling[],
  limit: number,
): string[] {
  void limit;
  void siblings;
  return [];
}
