import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { initDatabase, closeDatabase } from "@/lib/monitoring/db";
import { runMigrations } from "@/lib/monitoring/migrate";
import { MonitoringRepository } from "@/lib/monitoring/repositories";
import { LEADERBOARD_CATEGORIES, type LeaderboardCategory } from "@/lib/monitoring/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCategory(value: string | null): LeaderboardCategory {
  const fallback: LeaderboardCategory = "general_llm";
  if (!value) return fallback;
  const normalized = value.trim() as LeaderboardCategory;
  return LEADERBOARD_CATEGORIES.includes(normalized) ? normalized : fallback;
}

export async function GET(request: NextRequest) {
  const category = parseCategory(request.nextUrl.searchParams.get("category"));
  const dbPath = process.env.MONITORING_DB_PATH?.trim() || path.join(process.cwd(), "data", "monitoring.db");
  const schemaPath =
    process.env.MONITORING_SCHEMA_PATH?.trim() ||
    path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql");

  const db = initDatabase(dbPath);

  try {
    runMigrations(schemaPath, db);
    const repo = new MonitoringRepository(db);
    const snapshot = repo.getLatestCategorySnapshot(category);

    if (!snapshot) {
      return NextResponse.json(
        {
          category,
          sourceName: null,
          snapshotAt: null,
          data: [],
          note: "No snapshot found for this category yet.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const data = snapshot.entries.map((entry) => ({
      rank: entry.rank,
      model: entry.modelName,
      lab: entry.vendor ?? "Unknown",
      sourceModelId: entry.sourceModelId ?? null,
      canonicalModelKey: entry.canonicalModelKey,
      score: entry.score ?? null,
      scoreUnit: entry.scoreUnit ?? null,
      modelUrl: entry.modelUrl ?? null,
      ...(entry.payload ?? {}),
    }));

    return NextResponse.json(
      {
        category,
        sourceName: snapshot.sourceName,
        snapshotAt: snapshot.snapshotAt,
        total: data.length,
        data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    closeDatabase(db);
  }
}
