import { randomUUID } from "node:crypto";
import type { MonitoringDatabase } from "@/lib/monitoring/db";
import type {
  LeaderboardCategory,
  NormalizedLeaderboardEntry,
  NormalizedMcpEntry,
  NormalizedNewsEntry,
  NormalizedSkillEntry,
  SourceType,
} from "@/lib/monitoring/contracts";
import type {
  LeaderboardChangeEvent,
  MonitorRunStatus,
  MonitorRunType,
} from "@/lib/monitoring/run-types";
import { computeDelta24h, toMcpDisplayName, toSkillDisplayName } from "@/lib/monitoring/agent-display";

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

export interface AgentListQuery {
  q?: string;
  view?: "all_time" | "trending" | "hot";
  officiality?: "official" | "unofficial" | "unknown";
  category?: string;
  source?: string;
  sort?: "installs" | "rank" | "name";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

type SkillDbRow = {
  view: string;
  rank: number | null;
  source_skill_id: string;
  canonical_skill_key: string;
  skill_name: string;
  provider: string | null;
  repository: string | null;
  description: string | null;
  category: string | null;
  officiality: "official" | "unofficial" | "unknown";
  installs: number | null;
  installs_yesterday: number | null;
  change_24h: number | null;
  match_confidence: number | null;
  match_method: "strict" | "fuzzy" | "none" | null;
  primary_source: string;
  enriched_by_json: string | null;
  payload_json: string | null;
  observed_at: string;
};

type McpDbRow = {
  rank: number | null;
  source_server_id: string;
  canonical_mcp_key: string;
  server_name: string;
  provider: string | null;
  repository: string | null;
  description: string | null;
  category: string | null;
  officiality: "official" | "unofficial" | "unknown";
  installs: number | null;
  primary_source: string;
  enriched_by_json: string | null;
  payload_json: string | null;
  observed_at: string;
};

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
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

const SQLITE_RUN_LEASES = new Set<string>();

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

  failStaleRunningRuns(staleBeforeIso: string, errorMessage: string): number {
    const result = this.db.prepare(`
      UPDATE monitor_runs
      SET status = 'failed',
          completed_at = @completedAt,
          error_message = @errorMessage
      WHERE status = 'running'
        AND started_at < @staleBeforeIso
    `).run({
      completedAt: new Date().toISOString(),
      errorMessage,
      staleBeforeIso,
    });
    return result.changes;
  }

  acquireRunLease(lockKey: string): boolean {
    if (SQLITE_RUN_LEASES.has(lockKey)) {
      return false;
    }
    SQLITE_RUN_LEASES.add(lockKey);
    return true;
  }

  releaseRunLease(lockKey: string): void {
    SQLITE_RUN_LEASES.delete(lockKey);
  }

  getLatestLeaderboardSnapshot(
    category: LeaderboardCategory,
    sourceName: string,
  ): SnapshotRef | null {
    const rows = this.db.prepare(`
      SELECT rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json
      FROM ${currentTableForCategory(category)}
      WHERE category = ? AND source_name = ?
      ORDER BY rank ASC
    `).all(category, sourceName) as Array<{
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

    if (rows.length === 0) {
      return null;
    }

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

    return { snapshotId: `${category}:${sourceName}`, entries };
  }

  getLatestCategorySnapshot(category: LeaderboardCategory): LatestCategorySnapshotRef | null {
    const snapshot = this.db.prepare(`
      SELECT source_name, observed_at AS snapshot_at
      FROM ${currentTableForCategory(category)}
      WHERE category = ?
      ORDER BY observed_at DESC, source_priority ASC
      LIMIT 1
    `).get(category) as { source_name: string; snapshot_at: string } | undefined;

    if (!snapshot) {
      return null;
    }

    const rows = this.db.prepare(`
      SELECT rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json
      FROM ${currentTableForCategory(category)}
      WHERE category = ? AND source_name = ?
      ORDER BY rank ASC
    `).all(category, snapshot.source_name) as Array<{
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
      snapshotId: `${category}:${snapshot.source_name}`,
      sourceName: snapshot.source_name,
      snapshotAt: snapshot.snapshot_at,
      entries,
    };
  }

  getLatestSourceNamesByCategory(): string[] {
    const names = new Set<string>();
    for (const category of ["general_llm", "image_generation", "video_generation", "text_to_speech", "speech_to_text", "embeddings"] as const) {
      const row = this.db.prepare(`
        SELECT source_name
        FROM ${currentTableForCategory(category)}
        WHERE category = ?
        ORDER BY observed_at DESC, source_priority ASC
        LIMIT 1
      `).get(category) as { source_name: string } | undefined;
      if (row?.source_name) names.add(row.source_name);
    }
    return [...names];
  }

  insertLeaderboardSnapshot(
    runId: string,
    category: LeaderboardCategory,
    sourceName: string,
    sourcePriority: number,
    snapshotAt: string,
    entries: NormalizedLeaderboardEntry[],
  ): string {
    const snapshotId = randomUUID();
    const currentTable = currentTableForCategory(category);
    const historyTable = historyTableForCategory(category);
    const upsertStmt = this.db.prepare(`
      INSERT INTO ${currentTable}
      (id, category, source_name, source_priority, rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json, observed_at, created_at, updated_at)
      VALUES
      (@id, @category, @sourceName, @sourcePriority, @rank, @sourceModelId, @canonicalModelKey, @modelName, @vendor, @score, @scoreUnit, @modelUrl, @payloadJson, @observedAt, @createdAt, @updatedAt)
      ON CONFLICT(category, source_name, canonical_model_key) DO UPDATE SET
        source_priority = excluded.source_priority,
        rank = excluded.rank,
        source_model_id = excluded.source_model_id,
        model_name = excluded.model_name,
        vendor = excluded.vendor,
        score = excluded.score,
        score_unit = excluded.score_unit,
        model_url = excluded.model_url,
        payload_json = excluded.payload_json,
        observed_at = excluded.observed_at,
        updated_at = excluded.updated_at
    `);
    const historyStmt = this.db.prepare(`
      INSERT INTO ${historyTable}
      (id, run_id, category, source_name, source_priority, rank, source_model_id, canonical_model_key, model_name, vendor, score, score_unit, model_url, payload_json, observed_at, created_at)
      VALUES
      (@id, @runId, @category, @sourceName, @sourcePriority, @rank, @sourceModelId, @canonicalModelKey, @modelName, @vendor, @score, @scoreUnit, @modelUrl, @payloadJson, @observedAt, @createdAt)
    `);

    const tx = this.db.transaction((batch: NormalizedLeaderboardEntry[]) => {
      const now = new Date().toISOString();
      for (const entry of batch) {
        upsertStmt.run({
          id: randomUUID(),
          category,
          sourceName,
          sourcePriority,
          rank: entry.rank,
          sourceModelId: entry.sourceModelId ?? null,
          canonicalModelKey: entry.canonicalModelKey,
          modelName: entry.modelName,
          vendor: entry.vendor ?? null,
          score: typeof entry.score === "number" ? entry.score : null,
          scoreUnit: entry.scoreUnit ?? null,
          modelUrl: entry.modelUrl ?? null,
          payloadJson: entry.payload ? toJson(entry.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
          updatedAt: now,
        });
        historyStmt.run({
          id: randomUUID(),
          runId,
          category,
          sourceName,
          sourcePriority,
          rank: entry.rank,
          sourceModelId: entry.sourceModelId ?? null,
          canonicalModelKey: entry.canonicalModelKey,
          modelName: entry.modelName,
          vendor: entry.vendor ?? null,
          score: typeof entry.score === "number" ? entry.score : null,
          scoreUnit: entry.scoreUnit ?? null,
          modelUrl: entry.modelUrl ?? null,
          payloadJson: entry.payload ? toJson(entry.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
        });
      }
    });
    tx(entries);

    const keys = entries.map((item) => item.canonicalModelKey);
    if (keys.length > 0) {
      const placeholders = keys.map(() => "?").join(", ");
      this.db.prepare(`
        DELETE FROM ${currentTable}
        WHERE category = ?
          AND source_name = ?
          AND canonical_model_key NOT IN (${placeholders})
      `).run(category, sourceName, ...keys);
    } else {
      this.db.prepare(`
        DELETE FROM ${currentTable}
        WHERE category = ?
          AND source_name = ?
      `).run(category, sourceName);
    }

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
  ): string {
    const snapshotId = randomUUID();
    const upsertCurrent = this.db.prepare(`
      INSERT INTO news_current
      (id, source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json, observed_at, created_at, updated_at)
      VALUES
      (@id, @sourceName, @canonicalUrl, @title, @publishedAt, @authorOrOutlet, @summary, @topicTagsJson, @importanceScore, @payloadJson, @observedAt, @createdAt, @updatedAt)
      ON CONFLICT(source_name, canonical_url) DO UPDATE SET
        title = excluded.title,
        published_at = excluded.published_at,
        author_or_outlet = excluded.author_or_outlet,
        summary = excluded.summary,
        topic_tags_json = excluded.topic_tags_json,
        importance_score = excluded.importance_score,
        payload_json = excluded.payload_json,
        observed_at = excluded.observed_at,
        updated_at = excluded.updated_at
    `);
    const insertHistory = this.db.prepare(`
      INSERT INTO news_history
      (id, run_id, source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json, observed_at, created_at)
      VALUES
      (@id, @runId, @sourceName, @canonicalUrl, @title, @publishedAt, @authorOrOutlet, @summary, @topicTagsJson, @importanceScore, @payloadJson, @observedAt, @createdAt)
    `);
    const tx = this.db.transaction((batch: NormalizedNewsEntry[]) => {
      const now = new Date().toISOString();
      for (const row of batch) {
        upsertCurrent.run({
          id: randomUUID(),
          sourceName: row.sourceName,
          canonicalUrl: row.canonicalUrl,
          title: row.title,
          publishedAt: row.publishedAt ?? null,
          authorOrOutlet: row.authorOrOutlet ?? null,
          summary: row.summary ?? null,
          topicTagsJson: row.topicTags ? toJson(row.topicTags) : null,
          importanceScore: typeof row.importanceScore === "number" ? row.importanceScore : null,
          payloadJson: row.payload ? toJson(row.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
          updatedAt: now,
        });
        insertHistory.run({
          id: randomUUID(),
          runId,
          sourceName: row.sourceName,
          canonicalUrl: row.canonicalUrl,
          title: row.title,
          publishedAt: row.publishedAt ?? null,
          authorOrOutlet: row.authorOrOutlet ?? null,
          summary: row.summary ?? null,
          topicTagsJson: row.topicTags ? toJson(row.topicTags) : null,
          importanceScore: typeof row.importanceScore === "number" ? row.importanceScore : null,
          payloadJson: row.payload ? toJson(row.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
        });
      }
    });
    tx(entries);

    const urls = entries.map((item) => item.canonicalUrl);
    if (urls.length > 0) {
      const placeholders = urls.map(() => "?").join(", ");
      this.db.prepare(`
        DELETE FROM news_current
        WHERE source_name = ?
          AND canonical_url NOT IN (${placeholders})
      `).run(sourceName, ...urls);
    } else {
      this.db.prepare(`DELETE FROM news_current WHERE source_name = ?`).run(sourceName);
    }
    return snapshotId;
  }

  pruneNewsData(retentionDays: number): { entriesDeleted: number; snapshotsDeleted: number } {
    const safeDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 30;
    const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

    const entriesDeleted = this.db.prepare(`
      DELETE FROM news_history
      WHERE observed_at < @cutoffIso
    `).run({ cutoffIso }).changes;
    return { entriesDeleted, snapshotsDeleted: 0 };
  }

  pruneHistoryData(retentionDays: number): void {
    const safeDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 30;
    const cutoffIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(`DELETE FROM llm_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM vlm_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM tts_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM stt_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM embeddings_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM skills_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM mcp_history WHERE observed_at < ?`).run(cutoffIso);
    this.db.prepare(`DELETE FROM news_history WHERE observed_at < ?`).run(cutoffIso);
  }

  getNewsEntriesInWindow(windowStartIso: string, windowEndIso: string): NormalizedNewsEntry[] {
    const rows = this.db.prepare(`
      SELECT source_name, canonical_url, title, published_at, author_or_outlet, summary, topic_tags_json, importance_score, payload_json
      FROM news_current
      WHERE (published_at IS NOT NULL AND published_at >= ? AND published_at < ?)
         OR (published_at IS NULL AND observed_at >= ? AND observed_at < ?)
      ORDER BY COALESCE(published_at, observed_at) DESC
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

  insertSkillsSnapshot(
    runId: string,
    sourceName: string,
    sourcePriority: number,
    snapshotAt: string,
    entries: NormalizedSkillEntry[],
  ): string {
    const snapshotId = randomUUID();
    const upsertCurrent = this.db.prepare(`
      INSERT INTO skills_current
      (id, source_name, source_priority, view, rank, source_skill_id, canonical_skill_key, skill_name, provider, repository, description, category, officiality, installs, installs_yesterday, change_24h, match_confidence, match_method, primary_source, enriched_by_json, field_source_map_json, payload_json, observed_at, created_at, updated_at)
      VALUES
      (@id, @sourceName, @sourcePriority, @view, @rank, @sourceSkillId, @canonicalSkillKey, @skillName, @provider, @repository, @description, @category, @officiality, @installs, @installsYesterday, @change24h, @matchConfidence, @matchMethod, @primarySource, @enrichedByJson, @fieldSourceMapJson, @payloadJson, @observedAt, @createdAt, @updatedAt)
      ON CONFLICT(view, canonical_skill_key) DO UPDATE SET
        source_name = excluded.source_name,
        source_priority = excluded.source_priority,
        rank = excluded.rank,
        source_skill_id = excluded.source_skill_id,
        skill_name = excluded.skill_name,
        provider = excluded.provider,
        repository = excluded.repository,
        description = excluded.description,
        category = excluded.category,
        officiality = excluded.officiality,
        installs = excluded.installs,
        installs_yesterday = excluded.installs_yesterday,
        change_24h = excluded.change_24h,
        match_confidence = excluded.match_confidence,
        match_method = excluded.match_method,
        primary_source = excluded.primary_source,
        enriched_by_json = excluded.enriched_by_json,
        field_source_map_json = excluded.field_source_map_json,
        payload_json = excluded.payload_json,
        observed_at = excluded.observed_at,
        updated_at = excluded.updated_at
    `);
    const insertHistory = this.db.prepare(`
      INSERT INTO skills_history
      (id, run_id, source_name, source_priority, view, rank, source_skill_id, canonical_skill_key, skill_name, provider, repository, description, category, officiality, installs, installs_yesterday, change_24h, match_confidence, match_method, primary_source, enriched_by_json, field_source_map_json, payload_json, observed_at, created_at)
      VALUES
      (@id, @runId, @sourceName, @sourcePriority, @view, @rank, @sourceSkillId, @canonicalSkillKey, @skillName, @provider, @repository, @description, @category, @officiality, @installs, @installsYesterday, @change24h, @matchConfidence, @matchMethod, @primarySource, @enrichedByJson, @fieldSourceMapJson, @payloadJson, @observedAt, @createdAt)
    `);
    const tx = this.db.transaction((batch: NormalizedSkillEntry[]) => {
      const now = new Date().toISOString();
      for (const row of batch) {
        const fieldSourceMap = {
          primary_source: row.primarySource,
          description: row.enrichedBy?.includes("skills_rank") ? "skills_rank" : row.primarySource,
        };
        upsertCurrent.run({
          id: randomUUID(),
          sourceName,
          sourcePriority,
          view: row.view,
          rank: row.rank ?? null,
          sourceSkillId: row.sourceSkillId,
          canonicalSkillKey: row.canonicalSkillKey,
          skillName: row.name,
          provider: row.provider ?? null,
          repository: row.repository ?? null,
          description: row.description ?? null,
          category: row.category ?? null,
          officiality: row.officiality,
          installs: row.installs ?? null,
          installsYesterday: row.installsYesterday ?? null,
          change24h: row.change24h ?? null,
          matchConfidence: row.matchConfidence ?? null,
          matchMethod: row.matchMethod ?? null,
          primarySource: row.primarySource,
          enrichedByJson: row.enrichedBy ? toJson(row.enrichedBy) : null,
          fieldSourceMapJson: toJson(fieldSourceMap),
          payloadJson: row.payload ? toJson(row.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
          updatedAt: now,
        });
        insertHistory.run({
          id: randomUUID(),
          runId,
          sourceName,
          sourcePriority,
          view: row.view,
          rank: row.rank ?? null,
          sourceSkillId: row.sourceSkillId,
          canonicalSkillKey: row.canonicalSkillKey,
          skillName: row.name,
          provider: row.provider ?? null,
          repository: row.repository ?? null,
          description: row.description ?? null,
          category: row.category ?? null,
          officiality: row.officiality,
          installs: row.installs ?? null,
          installsYesterday: row.installsYesterday ?? null,
          change24h: row.change24h ?? null,
          matchConfidence: row.matchConfidence ?? null,
          matchMethod: row.matchMethod ?? null,
          primarySource: row.primarySource,
          enrichedByJson: row.enrichedBy ? toJson(row.enrichedBy) : null,
          fieldSourceMapJson: toJson(fieldSourceMap),
          payloadJson: row.payload ? toJson(row.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
        });
      }
    });
    tx(entries);
    return snapshotId;
  }

  insertMcpSnapshot(
    runId: string,
    sourceName: string,
    sourcePriority: number,
    snapshotAt: string,
    entries: NormalizedMcpEntry[],
  ): string {
    const snapshotId = randomUUID();
    const upsertCurrent = this.db.prepare(`
      INSERT INTO mcp_current
      (id, source_name, source_priority, rank, source_server_id, canonical_mcp_key, server_name, provider, repository, description, category, officiality, installs, primary_source, enriched_by_json, field_source_map_json, payload_json, observed_at, created_at, updated_at)
      VALUES
      (@id, @sourceName, @sourcePriority, @rank, @sourceServerId, @canonicalMcpKey, @serverName, @provider, @repository, @description, @category, @officiality, @installs, @primarySource, @enrichedByJson, @fieldSourceMapJson, @payloadJson, @observedAt, @createdAt, @updatedAt)
      ON CONFLICT(canonical_mcp_key) DO UPDATE SET
        source_name = excluded.source_name,
        source_priority = excluded.source_priority,
        rank = excluded.rank,
        source_server_id = excluded.source_server_id,
        server_name = excluded.server_name,
        provider = excluded.provider,
        repository = excluded.repository,
        description = excluded.description,
        category = excluded.category,
        officiality = excluded.officiality,
        installs = excluded.installs,
        primary_source = excluded.primary_source,
        enriched_by_json = excluded.enriched_by_json,
        field_source_map_json = excluded.field_source_map_json,
        payload_json = excluded.payload_json,
        observed_at = excluded.observed_at,
        updated_at = excluded.updated_at
    `);
    const insertHistory = this.db.prepare(`
      INSERT INTO mcp_history
      (id, run_id, source_name, source_priority, rank, source_server_id, canonical_mcp_key, server_name, provider, repository, description, category, officiality, installs, primary_source, enriched_by_json, field_source_map_json, payload_json, observed_at, created_at)
      VALUES
      (@id, @runId, @sourceName, @sourcePriority, @rank, @sourceServerId, @canonicalMcpKey, @serverName, @provider, @repository, @description, @category, @officiality, @installs, @primarySource, @enrichedByJson, @fieldSourceMapJson, @payloadJson, @observedAt, @createdAt)
    `);
    const tx = this.db.transaction((batch: NormalizedMcpEntry[]) => {
      const now = new Date().toISOString();
      for (const row of batch) {
        const fieldSourceMap = {
          primary_source: row.primarySource,
          description: row.primarySource,
        };
        upsertCurrent.run({
          id: randomUUID(),
          sourceName,
          sourcePriority,
          rank: row.rank ?? null,
          sourceServerId: row.sourceServerId,
          canonicalMcpKey: row.canonicalMcpKey,
          serverName: row.name,
          provider: row.provider ?? null,
          repository: row.repository ?? null,
          description: row.description ?? null,
          category: row.category ?? null,
          officiality: row.officiality,
          installs: row.installs ?? null,
          primarySource: row.primarySource,
          enrichedByJson: row.enrichedBy ? toJson(row.enrichedBy) : null,
          fieldSourceMapJson: toJson(fieldSourceMap),
          payloadJson: row.payload ? toJson(row.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
          updatedAt: now,
        });
        insertHistory.run({
          id: randomUUID(),
          runId,
          sourceName,
          sourcePriority,
          rank: row.rank ?? null,
          sourceServerId: row.sourceServerId,
          canonicalMcpKey: row.canonicalMcpKey,
          serverName: row.name,
          provider: row.provider ?? null,
          repository: row.repository ?? null,
          description: row.description ?? null,
          category: row.category ?? null,
          officiality: row.officiality,
          installs: row.installs ?? null,
          primarySource: row.primarySource,
          enrichedByJson: row.enrichedBy ? toJson(row.enrichedBy) : null,
          fieldSourceMapJson: toJson(fieldSourceMap),
          payloadJson: row.payload ? toJson(row.payload) : null,
          observedAt: snapshotAt,
          createdAt: now,
        });
      }
    });
    tx(entries);
    return snapshotId;
  }

  getLatestAgentSnapshotAt(): string | null {
    const skillRow = this.db.prepare(`SELECT observed_at FROM skills_current ORDER BY observed_at DESC LIMIT 1`).get() as { observed_at: string } | undefined;
    const mcpRow = this.db.prepare(`SELECT observed_at FROM mcp_current ORDER BY observed_at DESC LIMIT 1`).get() as { observed_at: string } | undefined;
    const candidates = [skillRow?.observed_at, mcpRow?.observed_at].filter((item): item is string => Boolean(item));
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  }

  getAgentsOverviewCounts(): { skills: number; mcpServers: number } {
    const skills = this.db.prepare(`SELECT COUNT(*) AS count FROM skills_current`).get() as { count: number };
    const mcp = this.db.prepare(`SELECT COUNT(*) AS count FROM mcp_current`).get() as { count: number };
    return { skills: Number(skills?.count ?? 0), mcpServers: Number(mcp?.count ?? 0) };
  }

  getSkillFacets(): { categories: string[]; sources: string[] } {
    const categories = this.db.prepare(`
      SELECT DISTINCT category
      FROM skills_current
      WHERE category IS NOT NULL AND TRIM(category) <> ''
      ORDER BY category ASC
    `).all() as Array<{ category: string }>;
    const sources = this.db.prepare(`
      SELECT DISTINCT primary_source
      FROM skills_current
      WHERE primary_source IS NOT NULL AND TRIM(primary_source) <> ''
      ORDER BY primary_source ASC
    `).all() as Array<{ primary_source: string }>;
    return {
      categories: categories.map((row) => row.category),
      sources: sources.map((row) => row.primary_source),
    };
  }

  getMcpFacets(): { categories: string[]; sources: string[] } {
    const categories = this.db.prepare(`
      SELECT DISTINCT category
      FROM mcp_current
      WHERE category IS NOT NULL AND TRIM(category) <> ''
      ORDER BY category ASC
    `).all() as Array<{ category: string }>;
    const sources = this.db.prepare(`
      SELECT DISTINCT primary_source
      FROM mcp_current
      WHERE primary_source IS NOT NULL AND TRIM(primary_source) <> ''
      ORDER BY primary_source ASC
    `).all() as Array<{ primary_source: string }>;
    return {
      categories: categories.map((row) => row.category),
      sources: sources.map((row) => row.primary_source),
    };
  }

  getSkillEntries(query: AgentListQuery): { total: number; data: Array<Record<string, unknown>> } {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(query.pageSize ?? 50)));
    const sort = query.sort ?? "installs";
    const order = query.order === "asc" ? "ASC" : "DESC";
    const where: string[] = [];
    const values: Array<string | number> = [];

    if (query.view) {
      where.push("view = ?");
      values.push(query.view);
    }
    if (query.officiality) {
      where.push("officiality = ?");
      values.push(query.officiality);
    }
    if (query.category) {
      where.push("LOWER(COALESCE(category, '')) = LOWER(?)");
      values.push(query.category);
    }
    if (query.source) {
      where.push("(LOWER(primary_source) = LOWER(?) OR LOWER(source_name) = LOWER(?))");
      values.push(query.source, query.source);
    }
    if (query.q?.trim()) {
      const needle = `%${query.q.trim().toLowerCase()}%`;
      where.push("(LOWER(skill_name) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ? OR LOWER(COALESCE(repository, '')) LIKE ?)");
      values.push(needle, needle, needle);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sortSql =
      sort === "name"
        ? `skill_name ${order}`
        : sort === "rank"
          ? `COALESCE(rank, 999999) ${order}`
          : `COALESCE(installs, -1) ${order}`;

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count FROM skills_current ${whereSql}`).get(...values) as { count: number };
    const rows = this.db.prepare(`
      SELECT view, rank, source_skill_id, canonical_skill_key, skill_name, provider, repository, description, category, officiality, installs, installs_yesterday, change_24h, match_confidence, match_method, primary_source, enriched_by_json, payload_json, observed_at
      FROM skills_current
      ${whereSql}
      ORDER BY ${sortSql}, skill_name ASC
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize) as SkillDbRow[];

    return {
      total: Number(totalRow?.count ?? 0),
      data: rows.map((row) => mapSkillRow(row)),
    };
  }

  getMcpEntries(query: AgentListQuery): { total: number; data: Array<Record<string, unknown>> } {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(query.pageSize ?? 50)));
    const sort = query.sort ?? "installs";
    const order = query.order === "asc" ? "ASC" : "DESC";
    const where: string[] = [];
    const values: Array<string | number> = [];

    if (query.officiality) {
      where.push("officiality = ?");
      values.push(query.officiality);
    }
    if (query.category) {
      where.push("LOWER(COALESCE(category, '')) = LOWER(?)");
      values.push(query.category);
    }
    if (query.source) {
      where.push("(LOWER(primary_source) = LOWER(?) OR LOWER(source_name) = LOWER(?))");
      values.push(query.source, query.source);
    }
    if (query.q?.trim()) {
      const needle = `%${query.q.trim().toLowerCase()}%`;
      where.push("(LOWER(server_name) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ? OR LOWER(COALESCE(repository, '')) LIKE ?)");
      values.push(needle, needle, needle);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sortSql =
      sort === "name"
        ? `server_name ${order}`
        : sort === "rank"
          ? `COALESCE(rank, 999999) ${order}`
          : `COALESCE(installs, -1) ${order}`;

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count FROM mcp_current ${whereSql}`).get(...values) as { count: number };
    const rows = this.db.prepare(`
      SELECT rank, source_server_id, canonical_mcp_key, server_name, provider, repository, description, category, officiality, installs, primary_source, enriched_by_json, payload_json, observed_at
      FROM mcp_current
      ${whereSql}
      ORDER BY ${sortSql}, server_name ASC
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize) as McpDbRow[];

    return {
      total: Number(totalRow?.count ?? 0),
      data: rows.map((row) => mapMcpRow(row)),
    };
  }

  getSkillTrending24hEntries(query: AgentListQuery): { total: number; data: Array<Record<string, unknown>> } {
    const next = {
      ...query,
      view: query.view === "hot" || query.view === "trending" ? query.view : undefined,
      sort: "installs" as const,
      order: "desc" as const,
    };
    const page = Math.max(1, Math.floor(next.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(next.pageSize ?? 50)));

    const where: string[] = ["change_24h IS NOT NULL"];
    const values: Array<string | number> = [];
    if (next.officiality) {
      where.push("officiality = ?");
      values.push(next.officiality);
    }
    if (next.category) {
      where.push("LOWER(COALESCE(category, '')) = LOWER(?)");
      values.push(next.category);
    }
    if (next.source) {
      where.push("(LOWER(primary_source) = LOWER(?) OR LOWER(source_name) = LOWER(?))");
      values.push(next.source, next.source);
    }
    if (next.q?.trim()) {
      const needle = `%${next.q.trim().toLowerCase()}%`;
      where.push("(LOWER(skill_name) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ? OR LOWER(COALESCE(repository, '')) LIKE ?)");
      values.push(needle, needle, needle);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const viewPreferredSql = next.view ? "CASE WHEN view = ? THEN 0 ELSE 1 END," : "";
    const orderValues = next.view ? [...values, next.view] : [...values];

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count FROM skills_current ${whereSql}`).get(...values) as { count: number };
    const rows = this.db.prepare(`
      SELECT view, rank, source_skill_id, canonical_skill_key, skill_name, provider, repository, description, category, officiality, installs, installs_yesterday, change_24h, match_confidence, match_method, primary_source, enriched_by_json, payload_json, observed_at
      FROM skills_current
      ${whereSql}
      ORDER BY ${viewPreferredSql} change_24h DESC, COALESCE(installs, -1) DESC, skill_name ASC
      LIMIT ? OFFSET ?
    `).all(...orderValues, pageSize, (page - 1) * pageSize) as SkillDbRow[];

    return {
      total: Number(totalRow?.count ?? 0),
      data: rows.map((row) => mapSkillRow(row)),
    };
  }

  getSkillTopEntries(query: AgentListQuery): { total: number; data: Array<Record<string, unknown>> } {
    return this.getSkillEntries({
      ...query,
      view: "all_time",
      sort: "installs",
      order: "desc",
    });
  }

  getMcpTopEntries(query: AgentListQuery): { total: number; data: Array<Record<string, unknown>> } {
    return this.getMcpEntries({
      ...query,
      sort: "installs",
      order: "desc",
    });
  }

  getMcpTrending24hEntries(query: AgentListQuery): { total: number; data: Array<Record<string, unknown>> } {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(query.pageSize ?? 50)));
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const where: string[] = [];
    const values: Array<string | number> = [sinceIso];

    if (query.officiality) {
      where.push("LOWER(COALESCE(c.officiality, '')) = LOWER(?)");
      values.push(query.officiality);
    }
    if (query.category) {
      where.push("LOWER(COALESCE(c.category, '')) = LOWER(?)");
      values.push(query.category);
    }
    if (query.source) {
      where.push("(LOWER(c.primary_source) = LOWER(?) OR LOWER(c.source_name) = LOWER(?))");
      values.push(query.source, query.source);
    }
    if (query.q?.trim()) {
      const needle = `%${query.q.trim().toLowerCase()}%`;
      where.push("(LOWER(c.server_name) LIKE ? OR LOWER(COALESCE(c.description, '')) LIKE ? OR LOWER(COALESCE(c.repository, '')) LIKE ?)");
      values.push(needle, needle, needle);
    }
    const filterSql = where.length > 0 ? `AND ${where.join(" AND ")}` : "";
    const baseSql = `
      FROM mcp_current c
      LEFT JOIN (
        SELECT canonical_mcp_key, installs, observed_at,
               ROW_NUMBER() OVER (PARTITION BY canonical_mcp_key ORDER BY observed_at ASC) AS rn
        FROM mcp_history
        WHERE observed_at >= ?
      ) h ON h.canonical_mcp_key = c.canonical_mcp_key
      WHERE h.rn = 1
      ${filterSql}
    `;

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count ${baseSql}`).get(...values) as { count: number };
    const rows = this.db.prepare(`
      SELECT c.rank, c.source_server_id, c.canonical_mcp_key, c.server_name, c.provider, c.repository, c.description, c.category, c.officiality, c.installs, c.primary_source, c.enriched_by_json, c.payload_json, c.observed_at,
             h.installs AS installs_24h
      ${baseSql}
      ORDER BY COALESCE(c.installs, 0) - COALESCE(h.installs, 0) DESC, COALESCE(c.installs, -1) DESC, c.server_name ASC
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, (page - 1) * pageSize) as Array<McpDbRow & { installs_24h: number | null }>;

    return {
      total: Number(totalRow?.count ?? 0),
      data: rows.map((row) => mapMcpRow(row, row.installs_24h)),
    };
  }

  insertNotificationLog(params: {
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

function mapSkillRow(row: SkillDbRow): Record<string, unknown> {
  return {
    id: row.canonical_skill_key,
    view: row.view,
    rank: row.rank,
    skillId: row.source_skill_id,
    skill: row.skill_name,
    displayName: toSkillDisplayName(row.skill_name),
    provider: row.provider,
    repository: row.repository,
    description: row.description,
    category: row.category,
    officiality: row.officiality,
    installs: row.installs,
    installsYesterday: row.installs_yesterday,
    change24h: row.change_24h,
    delta24h: row.change_24h,
    matchConfidence: row.match_confidence,
    matchMethod: row.match_method,
    primarySource: row.primary_source,
    enrichedBy: row.enriched_by_json ? (JSON.parse(row.enriched_by_json) as string[]) : [],
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : {},
    updatedAt: row.observed_at,
  };
}

function mapMcpRow(row: McpDbRow, installs24hAgo?: number | null): Record<string, unknown> {
  const delta24h = computeDelta24h(row.installs, installs24hAgo);
  return {
    id: row.canonical_mcp_key,
    rank: row.rank,
    serverId: row.source_server_id,
    server: row.server_name,
    displayName: toMcpDisplayName(row.server_name),
    owner: row.provider,
    repository: row.repository,
    description: row.description,
    category: row.category,
    officiality: row.officiality,
    installs: row.installs,
    delta24h,
    primarySource: row.primary_source,
    enrichedBy: row.enriched_by_json ? (JSON.parse(row.enriched_by_json) as string[]) : [],
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : {},
    updatedAt: row.observed_at,
  };
}
