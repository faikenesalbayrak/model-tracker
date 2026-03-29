import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import { getActiveNewsSources } from "@/lib/monitoring/news-sources";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickVisibleEntries(
  entries: NormalizedNewsEntry[],
  activeNewsSources: Set<string>,
) {
  const sorted = [...entries].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
  const filtered = sorted.filter((item) => activeNewsSources.has(item.sourceName));
  return (filtered.length > 0 ? filtered : sorted).slice(0, 40);
}

async function hydrateNewsIfEmpty(nowIso: string) {
  const runtime = await openMonitoringRuntime();
  const runId = await runtime.repository.insertRun({
    runType: "manual",
    status: "running",
    startedAt: nowIso,
  });

  let checked = 0;
  let written = 0;

  try {
    const adapters = getActiveNewsSources();
    for (const adapter of adapters) {
      checked += 1;
      const raw = await adapter.fetchRaw({ nowIso, timeoutMs: 15_000 });
      const entries = await adapter.normalizeNews(raw, nowIso);
      written += entries.length;
      await runtime.repository.insertNewsSnapshot(runId, adapter.sourceName, nowIso, entries, raw);
      await runtime.repository.upsertSourceHealth({
        sourceName: adapter.sourceName,
        sourceType: "news",
        enabled: true,
        success: true,
        latencyMs: 0,
        lastCheckedAt: nowIso,
        lastSuccessAt: nowIso,
      });
    }
    await runtime.repository.updateRun(runId, "success", new Date().toISOString(), {
      leaderboardSourcesChecked: 0,
      leaderboardSnapshotsWritten: 0,
      leaderboardChangesDetected: 0,
      newsSourcesChecked: checked,
      newsEntriesWritten: written,
      notificationsSent: 0,
      notificationsFailed: 0,
    });
  } catch (error) {
    await runtime.repository.updateRun(
      runId,
      "failed",
      new Date().toISOString(),
      {
        leaderboardSourcesChecked: 0,
        leaderboardSnapshotsWritten: 0,
        leaderboardChangesDetected: 0,
        newsSourcesChecked: checked,
        newsEntriesWritten: written,
        notificationsSent: 0,
        notificationsFailed: 0,
      },
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    await runtime.close();
  }
}

export async function GET() {
  const runtime = await openMonitoringRuntime();

  try {
    const now = new Date();
    const windowEndIso = now.toISOString();
    const windowStartIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const activeNewsSources = new Set(
      SOURCE_REGISTRY
        .filter((item) => item.sourceType === "news" && item.status === "enabled")
        .map((item) => item.sourceName),
    );

    let entries = pickVisibleEntries(
      await runtime.repository.getNewsEntriesInWindow(windowStartIso, windowEndIso),
      activeNewsSources,
    );

    if (entries.length === 0) {
      await hydrateNewsIfEmpty(windowEndIso);
      entries = pickVisibleEntries(
        await runtime.repository.getNewsEntriesInWindow(windowStartIso, windowEndIso),
        activeNewsSources,
      );
    }

    return NextResponse.json(
      {
        source: "monitoring_db",
        generated_at: windowEndIso,
        last_success_at: entries[0]?.publishedAt ?? null,
        stale: false,
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
    await runtime.close();
  }
}
