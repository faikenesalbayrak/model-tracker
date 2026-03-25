import { NextRequest, NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
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
  const runtime = await openMonitoringRuntime();

  try {
    const snapshot = await runtime.repository.getLatestCategorySnapshot(category);

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
    await runtime.close();
  }
}
