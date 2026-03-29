import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  LeaderboardCategory,
  NormalizedLeaderboardEntry,
  NormalizedNewsEntry,
  SourceType,
} from "@/lib/monitoring/contracts";
import type {
  LeaderboardChangeEvent,
  MonitorRunStatus,
  MonitorRunType,
} from "@/lib/monitoring/run-types";
import type { LatestCategorySnapshotRef, SnapshotRef } from "@/lib/monitoring/repositories";

export interface InsertRunInput {
  runType: MonitorRunType;
  status: MonitorRunStatus;
  startedAt: string;
  completedAt?: string;
  summaryJson?: string;
  errorMessage?: string;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fromJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as Record<string, unknown>;
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function fromJsonArray(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as string[];
  }
  if (Array.isArray(value)) {
    return value as string[];
  }
  return undefined;
}

type LeaderboardDomain = "llm" | "vlm" | "tts" | "stt" | "embeddings";

function domainForCategory(category: LeaderboardCategory): LeaderboardDomain {
  if (category === "general_llm") return "llm";
  if (category === "image_generation" || category === "video_generation") return "vlm";
  if (category === "text_to_speech") return "tts";
  if (category === "speech_to_text") return "stt";
  return "embeddings";
}

function currentTableForCategory(category: LeaderboardCategory): string {
  return `${domainForCategory(category)}_current`;
}

function historyTableForCategory(category: LeaderboardCategory): string {
  return `${domainForCategory(category)}_history`;
}

export class PostgresMonitoringRepository {
  constructor(private readonly db: PoolClient) {}

  async insertRun(input: InsertRunInput): Promise<string> {
    const id = randomUUID();
    await this.db.query(
      `
      INSERT INTO public.monitor_runs (id, run_type, status, started_at, completed_at, summary_json, error_message)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        id,
        input.runType,
        input.status,
        input.startedAt,
        input.completedAt ?? null,
        input.summaryJson ?? null,
        input.errorMessage ?? null,
      ],
    );
    return id;
  }

  async updateRun(
    id: string,
    status: MonitorRunStatus,
    completedAt: string,
    summary?: unknown,
    errorMessage?: string,
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE public.monitor_runs
      SET status = $2,
          completed_at = $3,
          summary_json = $4::jsonb,
          error_message = $5
      WHERE id = $1
      `,
      [id, status, completedAt, summary ? toJson(summary) : null, errorMessage ?? null],
    );
  }

  async getLatestLeaderboardSnapshot(
    category: LeaderboardCategory,
    sourceName: string,
  ): Promise<SnapshotRef | null> {
    const currentTable = currentTableForCategory(category);
    const rows = await this.db.query<{
      rank: number;
      source_model_id: string | null;
      canonical_model_key: string;
      model_name: string;
      vendor: string | null;
      score: number | null;
      score_unit: string | null;
      model_url: string | null;
      payload_json: unknown;
    }>(
      `
      SELECT rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json
      FROM public.${currentTable}
      WHERE category = $1 AND source_name = $2
      ORDER BY rank ASC
      `,
      [category, sourceName],
    );

    if (rows.rowCount === 0) {
      return null;
    }

    const entries: NormalizedLeaderboardEntry[] = rows.rows.map((row) => ({
      rank: row.rank,
      sourceModelId: row.source_model_id ?? undefined,
      canonicalModelKey: row.canonical_model_key,
      modelName: row.model_name,
      vendor: row.vendor ?? undefined,
      score: typeof row.score === "number" ? row.score : undefined,
      scoreUnit: row.score_unit ?? undefined,
      modelUrl: row.model_url ?? undefined,
      payload: fromJsonObject(row.payload_json),
    }));

    return { snapshotId: `${category}:${sourceName}`, entries };
  }

  async getLatestCategorySnapshot(category: LeaderboardCategory): Promise<LatestCategorySnapshotRef | null> {
    const currentTable = currentTableForCategory(category);
    const snapshot = await this.db.query<{ id: string; source_name: string; snapshot_at: string }>(
      `
      SELECT source_name, observed_at AS snapshot_at
      FROM public.${currentTable}
      WHERE category = $1
      ORDER BY observed_at DESC, source_priority ASC
      LIMIT 1
      `,
      [category],
    );

    if (snapshot.rowCount === 0) {
      return null;
    }

    const row = snapshot.rows[0];
    const entriesQuery = await this.db.query<{
      rank: number;
      source_model_id: string | null;
      canonical_model_key: string;
      model_name: string;
      vendor: string | null;
      score: number | null;
      score_unit: string | null;
      model_url: string | null;
      payload_json: unknown;
    }>(
      `
      SELECT rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json
      FROM public.${currentTable}
      WHERE category = $1 AND source_name = $2
      ORDER BY rank ASC
      `,
      [category, row.source_name],
    );

    const entries: NormalizedLeaderboardEntry[] = entriesQuery.rows.map((entry) => ({
      rank: entry.rank,
      sourceModelId: entry.source_model_id ?? undefined,
      canonicalModelKey: entry.canonical_model_key,
      modelName: entry.model_name,
      vendor: entry.vendor ?? undefined,
      score: typeof entry.score === "number" ? entry.score : undefined,
      scoreUnit: entry.score_unit ?? undefined,
      modelUrl: entry.model_url ?? undefined,
      payload: fromJsonObject(entry.payload_json),
    }));

    return {
      snapshotId: `${category}:${row.source_name}`,
      sourceName: row.source_name,
      snapshotAt: row.snapshot_at,
      entries,
    };
  }

  async getLatestSourceNamesByCategory(): Promise<string[]> {
    const names = new Set<string>();
    for (const category of ["general_llm", "image_generation", "video_generation", "text_to_speech", "speech_to_text", "embeddings"] as const) {
      const row = await this.db.query<{ source_name: string }>(
        `
        SELECT source_name
        FROM public.${currentTableForCategory(category)}
        WHERE category = $1
        ORDER BY observed_at DESC, source_priority ASC
        LIMIT 1
        `,
        [category],
      );
      if (row.rowCount && row.rows[0].source_name) {
        names.add(row.rows[0].source_name);
      }
    }
    return [...names];
  }

  async insertLeaderboardSnapshot(
    runId: string,
    category: LeaderboardCategory,
    sourceName: string,
    sourcePriority: number,
    snapshotAt: string,
    entries: NormalizedLeaderboardEntry[],
  ): Promise<string> {
    const snapshotId = randomUUID();
    const currentTable = currentTableForCategory(category);
    const historyTable = historyTableForCategory(category);

    for (const entry of entries) {
      await this.db.query(
        `
        INSERT INTO public.${currentTable}
        (id, category, source_name, source_priority, rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json, observed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, NOW(), NOW())
        ON CONFLICT (category, source_name, canonical_model_key) DO UPDATE SET
          source_priority = EXCLUDED.source_priority,
          rank = EXCLUDED.rank,
          source_model_id = EXCLUDED.source_model_id,
          model_name = EXCLUDED.model_name,
          vendor = EXCLUDED.vendor,
          score = EXCLUDED.score,
          score_unit = EXCLUDED.score_unit,
          model_url = EXCLUDED.model_url,
          payload_json = EXCLUDED.payload_json,
          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
        `,
        [
          randomUUID(),
          category,
          sourceName,
          sourcePriority,
          entry.rank,
          entry.sourceModelId ?? null,
          entry.canonicalModelKey,
          entry.modelName,
          entry.vendor ?? null,
          typeof entry.score === "number" ? entry.score : null,
          entry.scoreUnit ?? null,
          entry.modelUrl ?? null,
          entry.payload ? toJson(entry.payload) : null,
          snapshotAt,
        ],
      );

      await this.db.query(
        `
        INSERT INTO public.${historyTable}
        (id, run_id, category, source_name, source_priority, rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json, observed_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW())
        `,
        [
          randomUUID(),
          runId,
          category,
          sourceName,
          sourcePriority,
          entry.rank,
          entry.sourceModelId ?? null,
          entry.canonicalModelKey,
          entry.modelName,
          entry.vendor ?? null,
          typeof entry.score === "number" ? entry.score : null,
          entry.scoreUnit ?? null,
          entry.modelUrl ?? null,
          entry.payload ? toJson(entry.payload) : null,
          snapshotAt,
        ],
      );
    }

    const keys = entries.map((item) => item.canonicalModelKey);
    if (keys.length > 0) {
      await this.db.query(
        `
        DELETE FROM public.${currentTable}
        WHERE category = $1
          AND source_name = $2
          AND canonical_model_key <> ALL($3::text[])
        `,
        [category, sourceName, keys],
      );
    } else {
      await this.db.query(
        `
        DELETE FROM public.${currentTable}
        WHERE category = $1 AND source_name = $2
        `,
        [category, sourceName],
      );
    }

    return snapshotId;
  }

  async insertLeaderboardChanges(
    runId: string,
    category: LeaderboardCategory,
    sourceName: string,
    changes: LeaderboardChangeEvent[],
  ): Promise<number> {
    let inserted = 0;

    for (const change of changes) {
      const result = await this.db.query(
        `
        INSERT INTO public.leaderboard_changes
        (id, run_id, category, source_name, change_type, canonical_model_key, model_name, vendor, rank_before, rank_after, score_before, score_after, event_fingerprint, details_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
        ON CONFLICT (event_fingerprint) DO NOTHING
        `,
        [
          randomUUID(),
          runId,
          category,
          sourceName,
          change.changeType,
          change.canonicalModelKey,
          change.modelName,
          change.vendor ?? null,
          change.rankBefore ?? null,
          change.rankAfter ?? null,
          change.scoreBefore ?? null,
          change.scoreAfter ?? null,
          change.eventFingerprint,
          toJson(change),
        ],
      );

      inserted += result.rowCount ?? 0;
    }

    return inserted;
  }

  async insertNewsSnapshot(
    runId: string,
    sourceName: string,
    snapshotAt: string,
    entries: NormalizedNewsEntry[],
  ): Promise<string> {
    const snapshotId = randomUUID();

    for (const row of entries) {
      await this.db.query(
        `
        INSERT INTO public.news_current
        (id, source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json, observed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, NOW(), NOW())
        ON CONFLICT (source_name, canonical_url) DO UPDATE SET
          title = EXCLUDED.title,
          published_at = EXCLUDED.published_at,
          author_or_outlet = EXCLUDED.author_or_outlet,
          summary = EXCLUDED.summary,
          topic_tags_json = EXCLUDED.topic_tags_json,
          importance_score = EXCLUDED.importance_score,
          payload_json = EXCLUDED.payload_json,
          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
        `,
        [
          randomUUID(),
          row.sourceName,
          row.canonicalUrl,
          row.title,
          row.publishedAt ?? null,
          row.authorOrOutlet ?? null,
          row.summary ?? null,
          row.topicTags ? toJson(row.topicTags) : null,
          typeof row.importanceScore === "number" ? row.importanceScore : null,
          row.payload ? toJson(row.payload) : null,
          snapshotAt,
        ],
      );

      await this.db.query(
        `
        INSERT INTO public.news_history
        (id, run_id, source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json, observed_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12, NOW())
        `,
        [
          randomUUID(),
          runId,
          row.sourceName,
          row.canonicalUrl,
          row.title,
          row.publishedAt ?? null,
          row.authorOrOutlet ?? null,
          row.summary ?? null,
          row.topicTags ? toJson(row.topicTags) : null,
          typeof row.importanceScore === "number" ? row.importanceScore : null,
          row.payload ? toJson(row.payload) : null,
          snapshotAt,
        ],
      );
    }

    const urls = entries.map((entry) => entry.canonicalUrl);
    if (urls.length > 0) {
      await this.db.query(
        `
        DELETE FROM public.news_current
        WHERE source_name = $1
          AND canonical_url <> ALL($2::text[])
        `,
        [sourceName, urls],
      );
    } else {
      await this.db.query(`DELETE FROM public.news_current WHERE source_name = $1`, [sourceName]);
    }

    return snapshotId;
  }

  async pruneNewsData(retentionDays: number): Promise<{ entriesDeleted: number; snapshotsDeleted: number }> {
    const safeDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 30;
    const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

    const deletedEntries = await this.db.query<{ count: string }>(
      `
      WITH deleted AS (
        DELETE FROM public.news_history
        WHERE observed_at < $1
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted
      `,
      [cutoffIso],
    );

    return {
      entriesDeleted: Number(deletedEntries.rows[0]?.count ?? "0"),
      snapshotsDeleted: 0,
    };
  }

  async pruneHistoryData(retentionDays: number): Promise<void> {
    const safeDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 30;
    const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    for (const table of ["llm_history", "vlm_history", "tts_history", "stt_history", "embeddings_history", "news_history"] as const) {
      await this.db.query(`DELETE FROM public.${table} WHERE observed_at < $1`, [cutoffIso]);
    }
  }

  async getNewsEntriesInWindow(windowStartIso: string, windowEndIso: string): Promise<NormalizedNewsEntry[]> {
    const rows = await this.db.query<{
      source_name: string;
      canonical_url: string;
      title: string;
      published_at: string | null;
      author_or_outlet: string | null;
      summary: string | null;
      topic_tags_json: unknown;
      importance_score: number | null;
      payload_json: unknown;
    }>(
      `
      SELECT source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json
      FROM public.news_current
      WHERE (published_at IS NOT NULL AND published_at >= $1 AND published_at < $2)
         OR (published_at IS NULL AND observed_at >= $1 AND observed_at < $2)
      ORDER BY COALESCE(published_at, observed_at) DESC
      `,
      [windowStartIso, windowEndIso],
    );

    return rows.rows.map((row) => ({
      sourceName: row.source_name,
      canonicalUrl: row.canonical_url,
      title: row.title,
      publishedAt: row.published_at ?? undefined,
      authorOrOutlet: row.author_or_outlet ?? undefined,
      summary: row.summary ?? undefined,
      topicTags: fromJsonArray(row.topic_tags_json),
      importanceScore: typeof row.importance_score === "number" ? row.importance_score : undefined,
      payload: fromJsonObject(row.payload_json),
    }));
  }

  async insertNotificationLog(params: {
    runId?: string;
    notificationType: "top10_alert";
    category?: string;
    sourceName?: string;
    dedupeKey: string;
    recipient: string;
    subject: string;
    status: "queued" | "sent" | "failed";
    messageId?: string;
    errorMessage?: string;
    sentAt?: string;
  }): Promise<void> {
    await this.db.query(
      `
      INSERT INTO public.notification_log
      (id, run_id, notification_type, category, source_name, dedupe_key, recipient, subject, status, message_id, error_message, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (dedupe_key) DO NOTHING
      `,
      [
        randomUUID(),
        params.runId ?? null,
        params.notificationType,
        params.category ?? null,
        params.sourceName ?? null,
        params.dedupeKey,
        params.recipient,
        params.subject,
        params.status,
        params.messageId ?? null,
        params.errorMessage ?? null,
        params.sentAt ?? null,
      ],
    );
  }

  async upsertSourceHealth(params: {
    sourceName: string;
    sourceType: SourceType;
    enabled?: boolean;
    lastCheckedAt?: string;
    lastSuccessAt?: string;
    success?: boolean;
    latencyMs?: number;
    lastErrorMessage?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const success = params.success === true;

    await this.db.query(
      `
      INSERT INTO public.source_health
      (source_name, source_type, enabled, last_checked_at, last_success_at, consecutive_failures, total_successes, total_failures, avg_latency_ms, last_error_message, updated_at)
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT(source_name) DO UPDATE SET
        source_type = EXCLUDED.source_type,
        enabled = EXCLUDED.enabled,
        last_checked_at = EXCLUDED.last_checked_at,
        last_success_at = COALESCE(EXCLUDED.last_success_at, source_health.last_success_at),
        consecutive_failures = CASE
          WHEN $12 THEN 0
          ELSE source_health.consecutive_failures + 1
        END,
        total_successes = source_health.total_successes + CASE WHEN $12 THEN 1 ELSE 0 END,
        total_failures = source_health.total_failures + CASE WHEN $12 THEN 0 ELSE 1 END,
        avg_latency_ms = CASE
          WHEN $13::double precision IS NULL THEN source_health.avg_latency_ms
          WHEN source_health.avg_latency_ms IS NULL THEN $13::double precision
          ELSE ((source_health.avg_latency_ms * 0.8) + ($13::double precision * 0.2))
        END,
        last_error_message = CASE
          WHEN $12 THEN NULL
          ELSE $14
        END,
        updated_at = $11
      `,
      [
        params.sourceName,
        params.sourceType,
        params.enabled === false ? false : true,
        params.lastCheckedAt ?? now,
        success ? (params.lastSuccessAt ?? now) : params.lastSuccessAt ?? null,
        success ? 0 : 1,
        success ? 1 : 0,
        success ? 0 : 1,
        typeof params.latencyMs === "number" ? params.latencyMs : null,
        success ? null : (params.lastErrorMessage ?? null),
        now,
        success,
        typeof params.latencyMs === "number" ? params.latencyMs : null,
        success ? null : (params.lastErrorMessage ?? null),
      ],
    );
  }
}
