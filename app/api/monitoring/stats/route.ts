import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
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
  const runtime = await openMonitoringRuntime();

  try {
    const repository = runtime.repository;
    const snapshot = await repository.getLatestCategorySnapshot("general_llm");
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

    const latestCategorySources = await repository.getLatestSourceNamesByCategory();

    const sources = new Set(
      latestCategorySources.filter((name) => enabledLeaderboardSources.has(name)),
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
    await runtime.close();
  }
}
