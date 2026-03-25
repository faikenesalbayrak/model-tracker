import path from "node:path";
import { initDatabase, closeDatabase } from "@/lib/monitoring/db";
import { runMigrations } from "@/lib/monitoring/migrate";
import { extractArtificialAnalysisModels } from "@/lib/normalize/artificial-analysis";
import { fetchJsonWithRetry, fetchWithRetry } from "@/lib/fetcher";

const ARTIFICIAL_ANALYSIS_MODELS_URL = "https://artificialanalysis.ai/models";
const SWE_BENCH_LEADERBOARD_URL =
  "https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json";
const EVALPLUS_RESULTS_URL = "https://evalplus.github.io/results.json";

type MaybeNumber = number | null | undefined;

type SweepRow = {
  name?: string;
  resolved?: MaybeNumber;
};

type SweBoard = {
  name?: string;
  results?: SweepRow[];
};

type SweBoardsResponse = {
  leaderboards?: SweBoard[];
};

type EvalPlusEntry = {
  "pass@1"?: {
    mbpp?: MaybeNumber;
    "mbpp+"?: MaybeNumber;
  };
};

type EnrichmentRunResult = {
  snapshotId: string | null;
  scanned: number;
  updated: number;
  aaMatched: number;
  sweVerifiedMatched: number;
  mbppMatched: number;
};

export interface MetadataEnrichmentOptions {
  dbPath?: string;
  schemaPath?: string;
  nowIso?: string;
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

function normalizeScore(value: MaybeNumber): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value >= 0 && value <= 1) return value * 100;
  return value;
}

function defaultDbPath(): string {
  return process.env.MONITORING_DB_PATH?.trim() || path.join(process.cwd(), "data", "monitoring.db");
}

function defaultSchemaPath(): string {
  return process.env.MONITORING_SCHEMA_PATH?.trim() || path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql");
}

function setIfMissing(payload: Record<string, unknown>, key: string, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (payload[key] !== null && payload[key] !== undefined) return false;
  payload[key] = value;
  return true;
}

async function fetchAaEnrichmentMaps(): Promise<{
  byCanonicalKey: Map<string, Record<string, unknown>>;
  byModelOnly: Map<string, Record<string, unknown>>;
}> {
  const { data: html } = await fetchWithRetry<string>(
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
  );

  const models = extractArtificialAnalysisModels(html);
  const byCanonicalKey = new Map<string, Record<string, unknown>>();
  const byModelOnly = new Map<string, Record<string, unknown>>();

  for (const item of models) {
    const modelName = item.short_name || item.name || item.id;
    if (!modelName) continue;
    const vendor = item.model_creators?.name ?? undefined;
    const payload = {
      knowledge_cutoff_date: item.knowledge_cutoff_date ?? null,
      knowledge_cutoff: item.knowledge_cutoff_date ?? null,
      aime: normalizeScore(item.aime),
      aime25: normalizeScore(item.aime25),
      aime_2024: normalizeScore(item.aime),
      aime_2025: normalizeScore(item.aime25),
      livecodebench: normalizeScore(item.livecodebench),
      live_code_bench: normalizeScore(item.livecodebench),
      math_500: normalizeScore(item.math_500),
      ifbench: normalizeScore(item.ifbench),
    } satisfies Record<string, unknown>;

    byCanonicalKey.set(canonicalKey(modelName, vendor), payload);
    byModelOnly.set(canonicalModelOnly(modelName), payload);
  }

  return { byCanonicalKey, byModelOnly };
}

async function fetchSweVerifiedByModel(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data } = await fetchJsonWithRetry<SweBoardsResponse>(
    SWE_BENCH_LEADERBOARD_URL,
    { method: "GET", headers: { Accept: "application/json" } },
    { allowedHosts: ["raw.githubusercontent.com"] },
  );

  const boards = Array.isArray(data.leaderboards) ? data.leaderboards : [];
  for (const board of boards) {
    const name = String(board.name ?? "").toLowerCase();
    if (!name.includes("verified")) continue;
    const rows = Array.isArray(board.results) ? board.results : [];
    for (const row of rows) {
      const modelName = String(row.name ?? "").trim();
      const score = normalizeScore(row.resolved);
      if (!modelName || typeof score !== "number") continue;
      map.set(canonicalModelOnly(modelName), score);
    }
  }

  return map;
}

async function fetchMbppByModel(): Promise<Map<string, { mbpp?: number; mbppPlus?: number }>> {
  const map = new Map<string, { mbpp?: number; mbppPlus?: number }>();
  const { data } = await fetchJsonWithRetry<Record<string, EvalPlusEntry>>(
    EVALPLUS_RESULTS_URL,
    { method: "GET", headers: { Accept: "application/json" } },
    { allowedHosts: ["evalplus.github.io"] },
  );

  for (const [modelName, entry] of Object.entries(data ?? {})) {
    const pass1 = entry?.["pass@1"];
    const mbpp = normalizeScore(pass1?.mbpp);
    const mbppPlus = normalizeScore(pass1?.["mbpp+"]);
    if (typeof mbpp !== "number" && typeof mbppPlus !== "number") continue;
    map.set(canonicalModelOnly(modelName), {
      mbpp: typeof mbpp === "number" ? mbpp : undefined,
      mbppPlus: typeof mbppPlus === "number" ? mbppPlus : undefined,
    });
  }

  return map;
}

export async function runGeneralLlmMetadataEnrichment(
  options: MetadataEnrichmentOptions = {},
): Promise<EnrichmentRunResult> {
  const db = initDatabase(options.dbPath ?? defaultDbPath());
  try {
    runMigrations(options.schemaPath ?? defaultSchemaPath(), db);
    const snapshot = db.prepare(`
      SELECT id
      FROM leaderboard_snapshots
      WHERE category = 'general_llm'
      ORDER BY snapshot_at DESC, source_priority ASC
      LIMIT 1
    `).get() as { id: string } | undefined;

    if (!snapshot) {
      return {
        snapshotId: null,
        scanned: 0,
        updated: 0,
        aaMatched: 0,
        sweVerifiedMatched: 0,
        mbppMatched: 0,
      };
    }

    const [aaMaps, sweVerifiedByModel, mbppByModel] = await Promise.all([
      fetchAaEnrichmentMaps(),
      fetchSweVerifiedByModel().catch(() => new Map<string, number>()),
      fetchMbppByModel().catch(() => new Map<string, { mbpp?: number; mbppPlus?: number }>()),
    ]);

    const rows = db.prepare(`
      SELECT id, model_name, vendor, canonical_model_key, payload_json
      FROM leaderboard_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
    `).all(snapshot.id) as Array<{
      id: string;
      model_name: string;
      vendor: string | null;
      canonical_model_key: string;
      payload_json: string | null;
    }>;

    const updateStmt = db.prepare(`
      UPDATE leaderboard_entries
      SET payload_json = @payloadJson
      WHERE id = @id
    `);

    let updated = 0;
    let aaMatched = 0;
    let sweVerifiedMatched = 0;
    let mbppMatched = 0;

    for (const row of rows) {
      const payload = row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : {};
      const modelOnlyKey = canonicalModelOnly(row.model_name);
      const canonical = canonicalKey(row.model_name, row.vendor ?? undefined);
      const aaPayload =
        aaMaps.byCanonicalKey.get(row.canonical_model_key) ??
        aaMaps.byCanonicalKey.get(canonical) ??
        aaMaps.byModelOnly.get(modelOnlyKey);

      let changed = false;

      if (aaPayload) {
        aaMatched += 1;
        for (const [key, value] of Object.entries(aaPayload)) {
          changed = setIfMissing(payload, key, value) || changed;
        }
      }

      const sweVerified = sweVerifiedByModel.get(modelOnlyKey);
      if (typeof sweVerified === "number") {
        sweVerifiedMatched += 1;
        changed = setIfMissing(payload, "swe_bench_verified", sweVerified) || changed;
      }

      const mbpp = mbppByModel.get(modelOnlyKey);
      if (mbpp) {
        mbppMatched += 1;
        changed = setIfMissing(payload, "mbpp", mbpp.mbpp) || changed;
        changed = setIfMissing(payload, "mbpp_plus", mbpp.mbppPlus) || changed;
      }

      if (changed) {
        updateStmt.run({
          id: row.id,
          payloadJson: JSON.stringify(payload),
        });
        updated += 1;
      }
    }

    return {
      snapshotId: snapshot.id,
      scanned: rows.length,
      updated,
      aaMatched,
      sweVerifiedMatched,
      mbppMatched,
    };
  } finally {
    closeDatabase(db);
  }
}
