import { randomUUID } from "node:crypto";
import type { MonitoringDatabase } from "@/lib/monitoring/db";
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

export interface InsertRunInput {
  runType: MonitorRunType;
  status: MonitorRunStatus;
  startedAt: string;
  completedAt?: string;
  summaryJson?: string;
  errorMessage?: string;
}

export interface SnapshotRef {
  snapshotId: string;
  entries: NormalizedLeaderboardEntry[];
}

export interface LatestCategorySnapshotRef extends SnapshotRef {
  sourceName: string;
  snapshotAt: string;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export class MonitoringRepository {
  constructor(private readonly db: MonitoringDatabase) {}

  insertRun(input: InsertRunInput): string {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO monitor_runs (id, run_type, status, started_at, completed_at, summary_json, error_message)
      VALUES (@id, @runType, @status, @startedAt, @completedAt, @summaryJson, @errorMessage)
    `);
    stmt.run({
      id,
      runType: input.runType,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? null,
      summaryJson: input.summaryJson ?? null,
      errorMessage: input.errorMessage ?? null,
    });
    return id;
  }

  updateRun(
    id: string,
    status: MonitorRunStatus,
    completedAt: string,
    summary?: unknown,
    errorMessage?: string,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE monitor_runs
      SET status = @status,
          completed_at = @completedAt,
          summary_json = @summaryJson,
          error_message = @errorMessage
      WHERE id = @id
    `);
    stmt.run({
      id,
      status,
      completedAt,
      summaryJson: summary ? toJson(summary) : null,
      errorMessage: errorMessage ?? null,
    });
  }

  getLatestLeaderboardSnapshot(
    category: LeaderboardCategory,
    sourceName: string,
  ): SnapshotRef | null {
    const snapshot = this.db.prepare(`
      SELECT id
      FROM leaderboard_snapshots
      WHERE category = ? AND source_name = ?
      ORDER BY snapshot_at DESC
      LIMIT 1
    `).get(category, sourceName) as { id: string } | undefined;

    if (!snapshot) {
      return null;
    }

    const rows = this.db.prepare(`
      SELECT rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json
      FROM leaderboard_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
    `).all(snapshot.id) as Array<{
      rank: number;
      source_model_id: string | null;
      canonical_model_key: string;
      model_name: string;
      vendor: string | null;
      score: number | null;
      score_unit: string | null;
      model_url: string | null;
      payload_json: string | null;
    }>;

    const entries: NormalizedLeaderboardEntry[] = rows.map((row) => ({
      rank: row.rank,
      sourceModelId: row.source_model_id ?? undefined,
      canonicalModelKey: row.canonical_model_key,
      modelName: row.model_name,
      vendor: row.vendor ?? undefined,
      score: typeof row.score === "number" ? row.score : undefined,
      scoreUnit: row.score_unit ?? undefined,
      modelUrl: row.model_url ?? undefined,
      payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined,
    }));

    return { snapshotId: snapshot.id, entries };
  }

  getLatestCategorySnapshot(category: LeaderboardCategory): LatestCategorySnapshotRef | null {
    const snapshot = this.db.prepare(`
      SELECT id, source_name, snapshot_at
      FROM leaderboard_snapshots
      WHERE category = ?
      ORDER BY snapshot_at DESC, source_priority ASC
      LIMIT 1
    `).get(category) as { id: string; source_name: string; snapshot_at: string } | undefined;

    if (!snapshot) {
      return null;
    }

    const rows = this.db.prepare(`
      SELECT rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json
      FROM leaderboard_entries
      WHERE snapshot_id = ?
      ORDER BY rank ASC
    `).all(snapshot.id) as Array<{
      rank: number;
      source_model_id: string | null;
      canonical_model_key: string;
      model_name: string;
      vendor: string | null;
      score: number | null;
      score_unit: string | null;
      model_url: string | null;
      payload_json: string | null;
    }>;

    const entries: NormalizedLeaderboardEntry[] = rows.map((row) => ({
      rank: row.rank,
      sourceModelId: row.source_model_id ?? undefined,
      canonicalModelKey: row.canonical_model_key,
      modelName: row.model_name,
      vendor: row.vendor ?? undefined,
      score: typeof row.score === "number" ? row.score : undefined,
      scoreUnit: row.score_unit ?? undefined,
      modelUrl: row.model_url ?? undefined,
      payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined,
    }));

    return {
      snapshotId: snapshot.id,
      sourceName: snapshot.source_name,
      snapshotAt: snapshot.snapshot_at,
      entries,
    };
  }

  getLatestSourceNamesByCategory(): string[] {
    const rows = this.db.prepare(`
      SELECT source_name
      FROM (
        SELECT
          source_name,
          category,
          ROW_NUMBER() OVER (
            PARTITION BY category
            ORDER BY snapshot_at DESC, source_priority ASC
          ) AS rn
        FROM leaderboard_snapshots
      )
      WHERE rn = 1
    `).all() as Array<{ source_name: string }>;

    return rows.map((row) => row.source_name);
  }

  insertLeaderboardSnapshot(
    runId: string,
    category: LeaderboardCategory,
    sourceName: string,
    sourcePriority: number,
    snapshotAt: string,
    entries: NormalizedLeaderboardEntry[],
    rawPayload?: unknown,
  ): string {
    const snapshotId = randomUUID();
    const snapshotStmt = this.db.prepare(`
      INSERT INTO leaderboard_snapshots (id, run_id, category, source_name, source_priority, snapshot_at, top_n, raw_payload_json)
      VALUES (@id, @runId, @category, @sourceName, @sourcePriority, @snapshotAt, @topN, @rawPayloadJson)
    `);
    snapshotStmt.run({
      id: snapshotId,
      runId,
      category,
      sourceName,
      sourcePriority,
      snapshotAt,
      topN: entries.length,
      rawPayloadJson: rawPayload ? toJson(rawPayload) : null,
    });

    const entryStmt = this.db.prepare(`
      INSERT INTO leaderboard_entries
      (id, snapshot_id, rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json)
      VALUES
      (@id, @snapshotId, @rank, @sourceModelId, @canonicalModelKey, @modelName, @vendor, @score, @scoreUnit, @modelUrl, @payloadJson)
    `);

    const tx = this.db.transaction((batch: NormalizedLeaderboardEntry[]) => {
      for (const entry of batch) {
        entryStmt.run({
          id: randomUUID(),
          snapshotId,
          rank: entry.rank,
          sourceModelId: entry.sourceModelId ?? null,
          canonicalModelKey: entry.canonicalModelKey,
          modelName: entry.modelName,
          vendor: entry.vendor ?? null,
          score: typeof entry.score === "number" ? entry.score : null,
          scoreUnit: entry.scoreUnit ?? null,
          modelUrl: entry.modelUrl ?? null,
          payloadJson: entry.payload ? toJson(entry.payload) : null,
        });
      }
    });
    tx(entries);

    return snapshotId;
  }

  insertLeaderboardChanges(
    runId: string,
    category: LeaderboardCategory,
    sourceName: string,
    changes: LeaderboardChangeEvent[],
  ): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO leaderboard_changes
      (id, run_id, category, source_name, change_type, canonical_model_key, model_name, vendor, rank_before, rank_after, score_before, score_after, event_fingerprint, details_json)
      VALUES
      (@id, @runId, @category, @sourceName, @changeType, @canonicalModelKey, @modelName, @vendor, @rankBefore, @rankAfter, @scoreBefore, @scoreAfter, @eventFingerprint, @detailsJson)
    `);

    let inserted = 0;
    for (const change of changes) {
      const info = stmt.run({
        id: randomUUID(),
        runId,
        category,
        sourceName,
        changeType: change.changeType,
        canonicalModelKey: change.canonicalModelKey,
        modelName: change.modelName,
        vendor: change.vendor ?? null,
        rankBefore: change.rankBefore ?? null,
        rankAfter: change.rankAfter ?? null,
        scoreBefore: change.scoreBefore ?? null,
        scoreAfter: change.scoreAfter ?? null,
        eventFingerprint: change.eventFingerprint,
        detailsJson: toJson(change),
      });
      inserted += info.changes;
    }
    return inserted;
  }

  insertNewsSnapshot(
    runId: string,
    sourceName: string,
    snapshotAt: string,
    entries: NormalizedNewsEntry[],
    rawPayload?: unknown,
  ): string {
    const snapshotId = randomUUID();
    this.db.prepare(`
      INSERT INTO news_snapshots (id, run_id, source_name, snapshot_at, raw_payload_json)
      VALUES (@id, @runId, @sourceName, @snapshotAt, @rawPayloadJson)
    `).run({
      id: snapshotId,
      runId,
      sourceName,
      snapshotAt,
      rawPayloadJson: rawPayload ? toJson(rawPayload) : null,
    });

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO news_entries
      (id, snapshot_id, source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json)
      VALUES
      (@id, @snapshotId, @sourceName, @canonicalUrl, @title, @publishedAt, @authorOrOutlet, @summary, @topicTagsJson, @importanceScore, @payloadJson)
    `);
    const tx = this.db.transaction((batch: NormalizedNewsEntry[]) => {
      for (const row of batch) {
        insert.run({
          id: randomUUID(),
          snapshotId,
          sourceName: row.sourceName,
          canonicalUrl: row.canonicalUrl,
          title: row.title,
          publishedAt: row.publishedAt ?? null,
          authorOrOutlet: row.authorOrOutlet ?? null,
          summary: row.summary ?? null,
          topicTagsJson: row.topicTags ? toJson(row.topicTags) : null,
          importanceScore: typeof row.importanceScore === "number" ? row.importanceScore : null,
          payloadJson: row.payload ? toJson(row.payload) : null,
        });
      }
    });
    tx(entries);
    return snapshotId;
  }

  getNewsEntriesInWindow(windowStartIso: string, windowEndIso: string): NormalizedNewsEntry[] {
    const rows = this.db.prepare(`
      SELECT source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json
      FROM news_entries
      WHERE (published_at IS NOT NULL AND published_at >= ? AND published_at < ?)
         OR (published_at IS NULL AND created_at >= ? AND created_at < ?)
      ORDER BY COALESCE(published_at, created_at) DESC
    `).all(windowStartIso, windowEndIso, windowStartIso, windowEndIso) as Array<{
      source_name: string;
      canonical_url: string;
      title: string;
      published_at: string | null;
      author_or_outlet: string | null;
      summary: string | null;
      topic_tags_json: string | null;
      importance_score: number | null;
      payload_json: string | null;
    }>;

    return rows.map((row) => ({
      sourceName: row.source_name,
      canonicalUrl: row.canonical_url,
      title: row.title,
      publishedAt: row.published_at ?? undefined,
      authorOrOutlet: row.author_or_outlet ?? undefined,
      summary: row.summary ?? undefined,
      topicTags: row.topic_tags_json ? (JSON.parse(row.topic_tags_json) as string[]) : undefined,
      importanceScore: typeof row.importance_score === "number" ? row.importance_score : undefined,
      payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined,
    }));
  }

  insertWeeklyDigest(
    runId: string,
    windowStartIso: string,
    windowEndIso: string,
    generatedAt: string,
    items: WeeklyDigestItem[],
  ): string {
    const digestId = randomUUID();
    this.db.prepare(`
      INSERT INTO weekly_digests (id, run_id, window_start, window_end, generated_at)
      VALUES (@id, @runId, @windowStart, @windowEnd, @generatedAt)
    `).run({
      id: digestId,
      runId,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      generatedAt,
    });

    const insert = this.db.prepare(`
      INSERT INTO weekly_digest_items
      (id, digest_id, rank, canonical_url, title, source_name, published_at, importance_score, summary)
      VALUES
      (@id, @digestId, @rank, @canonicalUrl, @title, @sourceName, @publishedAt, @importanceScore, @summary)
    `);
    for (const item of items) {
      insert.run({
        id: randomUUID(),
        digestId,
        rank: item.rank,
        canonicalUrl: item.canonicalUrl,
        title: item.title,
        sourceName: item.sourceName,
        publishedAt: item.publishedAt ?? null,
        importanceScore: item.importanceScore ?? null,
        summary: item.summary ?? null,
      });
    }
    return digestId;
  }

  insertNotificationLog(params: {
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
  }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO notification_log
      (id, run_id, notification_type, category, source_name, dedupe_key, recipient, subject, status, message_id, error_message, sent_at)
      VALUES
      (@id, @runId, @notificationType, @category, @sourceName, @dedupeKey, @recipient, @subject, @status, @messageId, @errorMessage, @sentAt)
    `).run({
      id: randomUUID(),
      runId: params.runId ?? null,
      notificationType: params.notificationType,
      category: params.category ?? null,
      sourceName: params.sourceName ?? null,
      dedupeKey: params.dedupeKey,
      recipient: params.recipient,
      subject: params.subject,
      status: params.status,
      messageId: params.messageId ?? null,
      errorMessage: params.errorMessage ?? null,
      sentAt: params.sentAt ?? null,
    });
  }

  upsertSourceHealth(params: {
    sourceName: string;
    sourceType: SourceType;
    enabled?: boolean;
    lastCheckedAt?: string;
    lastSuccessAt?: string;
    success?: boolean;
    latencyMs?: number;
    lastErrorMessage?: string;
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO source_health
      (source_name, source_type, enabled, last_checked_at, last_success_at, consecutive_failures, total_successes, total_failures, avg_latency_ms, last_error_message, updated_at)
      VALUES
      (@sourceName, @sourceType, @enabled, @lastCheckedAt, @lastSuccessAt, @consecutiveFailures, @totalSuccesses, @totalFailures, @avgLatencyMs, @lastErrorMessage, @updatedAt)
      ON CONFLICT(source_name) DO UPDATE SET
        source_type = excluded.source_type,
        enabled = excluded.enabled,
        last_checked_at = excluded.last_checked_at,
        last_success_at = COALESCE(excluded.last_success_at, source_health.last_success_at),
        consecutive_failures = CASE
          WHEN @success = 1 THEN 0
          ELSE source_health.consecutive_failures + 1
        END,
        total_successes = source_health.total_successes + CASE WHEN @success = 1 THEN 1 ELSE 0 END,
        total_failures = source_health.total_failures + CASE WHEN @success = 1 THEN 0 ELSE 1 END,
        avg_latency_ms = CASE
          WHEN @latencyMs IS NULL THEN source_health.avg_latency_ms
          WHEN source_health.avg_latency_ms IS NULL THEN @latencyMs
          ELSE ((source_health.avg_latency_ms * 0.8) + (@latencyMs * 0.2))
        END,
        last_error_message = CASE
          WHEN @success = 1 THEN NULL
          ELSE @lastErrorMessage
        END,
        updated_at = @updatedAt
    `).run({
      sourceName: params.sourceName,
      sourceType: params.sourceType,
      enabled: params.enabled === false ? 0 : 1,
      lastCheckedAt: params.lastCheckedAt ?? now,
      lastSuccessAt: params.success ? (params.lastSuccessAt ?? now) : params.lastSuccessAt ?? null,
      consecutiveFailures: params.success ? 0 : 1,
      totalSuccesses: params.success ? 1 : 0,
      totalFailures: params.success ? 0 : 1,
      avgLatencyMs: typeof params.latencyMs === "number" ? params.latencyMs : null,
      latencyMs: typeof params.latencyMs === "number" ? params.latencyMs : null,
      lastErrorMessage: params.success ? null : (params.lastErrorMessage ?? null),
      success: params.success ? 1 : 0,
      updatedAt: now,
    });
  }
}
