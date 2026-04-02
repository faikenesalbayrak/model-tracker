import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import { getActiveNewsSources, isAiNewsRelevant } from "@/lib/monitoring/news-sources";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import { pickVisibleEntries, toNewsApiItem } from "@/lib/news-feed";
import { enrichNewsEntriesWithOgImages } from "@/lib/monitoring/news-enrichment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoMinusDays(iso: string, days: number): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return iso;
  }
  return new Date(ts - days * 24 * 60 * 60 * 1000).toISOString();
}

function filterEntriesForIngestWindow(entries: NormalizedNewsEntry[], nowIso: string, windowDays: number) {
  const windowStartIso = isoMinusDays(nowIso, windowDays);
  const windowStartTs = Date.parse(windowStartIso);
  if (!Number.isFinite(windowStartTs)) {
    return entries;
  }
  return entries.filter((entry) => {
    if (!entry.publishedAt) {
      return true;
    }
    const ts = Date.parse(entry.publishedAt);
    if (!Number.isFinite(ts)) {
      return true;
    }
    return ts >= windowStartTs;
  });
}

function filterEntriesForAiRelevance(entries: NormalizedNewsEntry[]): NormalizedNewsEntry[] {
  return entries.filter((entry) =>
    isAiNewsRelevant(
      entry.title,
      entry.summary ?? "",
      2.8,
      typeof entry.importanceScore === "number" ? entry.importanceScore : undefined,
    ),
  );
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
  const ingestWindowDaysRaw = Number(process.env.MONITORING_NEWS_INGEST_WINDOW_DAYS ?? "14");
  const ingestWindowDays = Number.isFinite(ingestWindowDaysRaw) && ingestWindowDaysRaw > 0
    ? Math.floor(ingestWindowDaysRaw)
    : 14;

  try {
    const adapters = getActiveNewsSources();
    for (const adapter of adapters) {
      checked += 1;
      const raw = await adapter.fetchRaw({ nowIso, timeoutMs: 15_000 });
      const entries = await adapter.normalizeNews(raw, nowIso);
      const filteredEntries = await enrichNewsEntriesWithOgImages(filterEntriesForAiRelevance(
        filterEntriesForIngestWindow(entries, nowIso, ingestWindowDays),
      ));
      written += filteredEntries.length;
      await runtime.repository.insertNewsSnapshot(runId, adapter.sourceName, nowIso, filteredEntries);
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
    const recentWindowStartIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const fallbackWindowStartIso = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const activeNewsSources = new Set(
      SOURCE_REGISTRY
        .filter((item) => item.sourceType === "news" && item.status === "enabled")
        .map((item) => item.sourceName),
    );

    let rawEntries = filterEntriesForAiRelevance(
      await runtime.repository.getNewsEntriesInWindow(recentWindowStartIso, windowEndIso),
    );
    if (rawEntries.length === 0) {
      rawEntries = filterEntriesForAiRelevance(
        await runtime.repository.getNewsEntriesInWindow(fallbackWindowStartIso, windowEndIso),
      );
    }
    let entries = pickVisibleEntries(rawEntries, activeNewsSources);

    if (entries.length === 0) {
      await hydrateNewsIfEmpty(windowEndIso);
      let refreshedEntries = filterEntriesForAiRelevance(
        await runtime.repository.getNewsEntriesInWindow(recentWindowStartIso, windowEndIso),
      );
      if (refreshedEntries.length === 0) {
        refreshedEntries = filterEntriesForAiRelevance(
          await runtime.repository.getNewsEntriesInWindow(fallbackWindowStartIso, windowEndIso),
        );
      }
      entries = pickVisibleEntries(refreshedEntries, activeNewsSources);
    }

    return NextResponse.json(
      {
        source: "monitoring_db",
        generated_at: windowEndIso,
        last_success_at: entries[0]?.publishedAt ?? null,
        stale: false,
        data: entries.map((item) => toNewsApiItem(item, windowEndIso)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await runtime.close();
  }
}
