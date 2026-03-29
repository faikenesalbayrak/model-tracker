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
  WeeklyDigestItem,
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
    const snapshot = await this.db.query<{ id: string }>(
      `
      SELECT id
      FROM public.leaderboard_snapshots
      WHERE category = $1 AND source_name = $2
      ORDER BY snapshot_at DESC
      LIMIT 1
      `,
      [category, sourceName],
    );

    if (snapshot.rowCount === 0) {
      return null;
    }

    const snapshotId = snapshot.rows[0].id;
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
      FROM public.leaderboard_entries
      WHERE snapshot_id = $1
      ORDER BY rank ASC
      `,
      [snapshotId],
    );

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

    return { snapshotId, entries };
  }

  async getLatestCategorySnapshot(category: LeaderboardCategory): Promise<LatestCategorySnapshotRef | null> {
    const snapshot = await this.db.query<{ id: string; source_name: string; snapshot_at: string }>(
      `
      SELECT id, source_name, snapshot_at
      FROM public.leaderboard_snapshots
      WHERE category = $1
      ORDER BY snapshot_at DESC, source_priority ASC
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
      FROM public.leaderboard_entries
      WHERE snapshot_id = $1
      ORDER BY rank ASC
      `,
      [row.id],
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
      snapshotId: row.id,
      sourceName: row.source_name,
      snapshotAt: row.snapshot_at,
      entries,
    };
  }

  async getLatestSourceNamesByCategory(): Promise<string[]> {
    const rows = await this.db.query<{ source_name: string }>(`
      SELECT source_name
      FROM (
        SELECT
          source_name,
          category,
          ROW_NUMBER() OVER (
            PARTITION BY category
            ORDER BY snapshot_at DESC, source_priority ASC
          ) AS rn
        FROM public.leaderboard_snapshots
      ) ranked
      WHERE rn = 1
    `);

    return rows.rows.map((row) => row.source_name);
  }

  async insertLeaderboardSnapshot(
    runId: string,
    category: LeaderboardCategory,
    sourceName: string,
    sourcePriority: number,
    snapshotAt: string,
    entries: NormalizedLeaderboardEntry[],
    rawPayload?: unknown,
  ): Promise<string> {
    const snapshotId = randomUUID();

    await this.db.query(
      `
      INSERT INTO public.leaderboard_snapshots
      (id, run_id, category, source_name, source_priority, snapshot_at, top_n, raw_payload_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [snapshotId, runId, category, sourceName, sourcePriority, snapshotAt, entries.length, rawPayload ? toJson(rawPayload) : null],
    );

    for (const entry of entries) {
      await this.db.query(
        `
        INSERT INTO public.leaderboard_entries
        (id, snapshot_id, rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        `,
        [
          randomUUID(),
          snapshotId,
          entry.rank,
          entry.sourceModelId ?? null,
          entry.canonicalModelKey,
          entry.modelName,
          entry.vendor ?? null,
          typeof entry.score === "number" ? entry.score : null,
          entry.scoreUnit ?? null,
          entry.modelUrl ?? null,
          entry.payload ? toJson(entry.payload) : null,
        ],
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
    rawPayload?: unknown,
  ): Promise<string> {
    const snapshotId = randomUUID();

    await this.db.query(
      `
      INSERT INTO public.news_snapshots (id, run_id, source_name, snapshot_at, raw_payload_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [snapshotId, runId, sourceName, snapshotAt, rawPayload ? toJson(rawPayload) : null],
    );

    for (const row of entries) {
      await this.db.query(
        `
        INSERT INTO public.news_entries
        (id, snapshot_id, source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.news_entries existing
          WHERE existing.source_name = $3
            AND existing.canonical_url = $4
        )
        `,
        [
          randomUUID(),
          snapshotId,
          row.sourceName,
          row.canonicalUrl,
          row.title,
          row.publishedAt ?? null,
          row.authorOrOutlet ?? null,
          row.summary ?? null,
          row.topicTags ? toJson(row.topicTags) : null,
          typeof row.importanceScore === "number" ? row.importanceScore : null,
          row.payload ? toJson(row.payload) : null,
        ],
      );
    }

    return snapshotId;
  }

  async pruneNewsData(retentionDays: number): Promise<{ entriesDeleted: number; snapshotsDeleted: number }> {
    const safeDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 90;
    const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

    const deletedEntries = await this.db.query<{ count: string }>(
      `
      WITH deleted AS (
        DELETE FROM public.news_entries
        WHERE COALESCE(published_at, created_at) < $1
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted
      `,
      [cutoffIso],
    );

    const deletedSnapshots = await this.db.query<{ count: string }>(`
      WITH deleted AS (
        DELETE FROM public.news_snapshots s
        WHERE NOT EXISTS (
          SELECT 1 FROM public.news_entries e WHERE e.snapshot_id = s.id
        )
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted
    `);

    return {
      entriesDeleted: Number(deletedEntries.rows[0]?.count ?? "0"),
      snapshotsDeleted: Number(deletedSnapshots.rows[0]?.count ?? "0"),
    };
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
      FROM public.news_entries
      WHERE (published_at IS NOT NULL AND published_at >= $1 AND published_at < $2)
         OR (published_at IS NULL AND created_at >= $1 AND created_at < $2)
      ORDER BY COALESCE(published_at, created_at) DESC
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

  async insertWeeklyDigest(
    runId: string,
    windowStartIso: string,
    windowEndIso: string,
    generatedAt: string,
    items: WeeklyDigestItem[],
  ): Promise<string> {
    const digestRow = await this.db.query<{ id: string }>(
      `
      INSERT INTO public.weekly_digests (id, run_id, window_start, window_end, generated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (window_start, window_end) DO UPDATE SET generated_at = EXCLUDED.generated_at
      RETURNING id
      `,
      [randomUUID(), runId, windowStartIso, windowEndIso, generatedAt],
    );
    const digestId = digestRow.rows[0].id;

    for (const item of items) {
      await this.db.query(
        `
        INSERT INTO public.weekly_digest_items
        (id, digest_id, rank, canonical_url, title, source_name, published_at, importance_score, summary)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (digest_id, rank) DO NOTHING
        `,
        [
          randomUUID(),
          digestId,
          item.rank,
          item.canonicalUrl,
          item.title,
          item.sourceName,
          item.publishedAt ?? null,
          item.importanceScore ?? null,
          item.summary ?? null,
        ],
      );
    }

    return digestId;
  }

  async insertNotificationLog(params: {
    runId?: string;
    notificationType: "top10_alert" | "weekly_digest";
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
