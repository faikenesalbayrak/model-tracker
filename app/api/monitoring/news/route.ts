import { NextResponse } from "next/server";
import path from "node:path";
import { initDatabase, closeDatabase } from "@/lib/monitoring/db";
import { runMigrations } from "@/lib/monitoring/migrate";
import { MonitoringRepository } from "@/lib/monitoring/repositories";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dbPath = process.env.MONITORING_DB_PATH?.trim() || path.join(process.cwd(), "data", "monitoring.db");
  const schemaPath =
    process.env.MONITORING_SCHEMA_PATH?.trim() ||
    path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql");

  const db = initDatabase(dbPath);

  try {
    runMigrations(schemaPath, db);
    const repo = new MonitoringRepository(db);
    const now = new Date();
    const windowEndIso = now.toISOString();
    const windowStartIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const activeNewsSources = new Set(
      SOURCE_REGISTRY
        .filter((item) => item.sourceType === "news" && item.status === "enabled")
        .map((item) => item.sourceName),
    );
    const entries = repo.getNewsEntriesInWindow(windowStartIso, windowEndIso)
      .filter((item) => activeNewsSources.has(item.sourceName))
      .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""))
      .slice(0, 40);

    return NextResponse.json(
      {
        sourceName: "monitoring_db",
        snapshotAt: windowEndIso,
        data: entries.map((item) => ({
          id: item.canonicalUrl,
          title: item.title,
          link: item.canonicalUrl,
          source: item.sourceName,
          publishedAt: item.publishedAt ?? windowEndIso,
          timeAgo: item.summary ?? null,
          imageUrl: null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    closeDatabase(db);
  }
}
