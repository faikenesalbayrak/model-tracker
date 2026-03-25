import { NextResponse } from "next/server";
import path from "node:path";
import { initDatabase, closeDatabase } from "@/lib/monitoring/db";
import { runMigrations } from "@/lib/monitoring/migrate";
import { MonitoringRepository } from "@/lib/monitoring/repositories";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

export async function GET() {
  const dbPath = process.env.MONITORING_DB_PATH?.trim() || path.join(process.cwd(), "data", "monitoring.db");
  const schemaPath =
    process.env.MONITORING_SCHEMA_PATH?.trim() ||
    path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql");

  const db = initDatabase(dbPath);

  try {
    runMigrations(schemaPath, db);
    const repository = new MonitoringRepository(db);
    const snapshot = repository.getLatestCategorySnapshot("general_llm");
    const nowTs = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const entries = snapshot?.entries ?? [];

    const totalModels = entries.length;
    const providers = new Set(
      entries
        .map((entry) => (typeof entry.vendor === "string" ? entry.vendor.trim() : ""))
        .filter(Boolean),
    ).size;
    const last30Days = entries.filter((entry) => {
      const payload = entry.payload;
      if (!payload || typeof payload !== "object") {
        return false;
      }

      const releaseDate = toIsoDate(
        (payload as Record<string, unknown>).release_date ??
        (payload as Record<string, unknown>).releaseDate,
      );
      if (!releaseDate) {
        return false;
      }

      return nowTs - Date.parse(releaseDate) <= thirtyDaysMs;
    }).length;

    const enabledLeaderboardSources = new Set(
      SOURCE_REGISTRY
        .filter((item) => item.sourceType === "leaderboard" && item.status === "enabled")
        .map((item) => item.sourceName),
    );

    const latestCategorySources = db.prepare(`
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

    const sources = new Set(
      latestCategorySources
        .map((row) => row.source_name)
        .filter((name) => enabledLeaderboardSources.has(name)),
    ).size;

    return NextResponse.json(
      {
        totalModels,
        last30Days,
        providers,
        sources,
        snapshotAt: snapshot?.snapshotAt ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    closeDatabase(db);
  }
}

