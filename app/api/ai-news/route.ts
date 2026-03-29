import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import { getActiveNewsSources, isAiNewsRelevant } from "@/lib/monitoring/news-sources";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import { getNewsDisplayTitle, getNewsSourceLabel, getNewsSourceLogo } from "@/lib/monitoring/news-source-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickVisibleEntries(
  entries: NormalizedNewsEntry[],
  activeNewsSources: Set<string>,
) {
  const sorted = [...entries].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
  const byCanonical = new Map<string, NormalizedNewsEntry>();
  const googleFallback = new Set<string>();

  const richnessScore = (entry: NormalizedNewsEntry): number => {
    const hasTitle = entry.title.trim().length > 0 ? 1 : 0;
    const hasImage =
      typeof entry.payload?.image_url === "string" ||
      typeof entry.payload?.imageUrl === "string"
        ? 1
        : 0;
    return hasTitle * 10 + hasImage;
  };

  for (const entry of sorted) {
    const key = entry.canonicalUrl.trim();
    if (!key) continue;
    if (entry.sourceName === "google_news_ai" || entry.canonicalUrl.includes("news.google.com")) {
      const fallbackKey = `${entry.title.trim().toLowerCase()}|${entry.publishedAt ?? ""}`;
      if (googleFallback.has(fallbackKey)) continue;
      googleFallback.add(fallbackKey);
    }
    const existing = byCanonical.get(key);
    if (!existing || richnessScore(entry) > richnessScore(existing)) {
      byCanonical.set(key, entry);
    }
  }
  const deduped = [...byCanonical.values()].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
  const filtered = deduped.filter((item) => activeNewsSources.has(item.sourceName));
  const pool = filtered.length > 0 ? filtered : deduped;
  const maxPerSourceRaw = Number(process.env.MONITORING_NEWS_MAX_PER_SOURCE ?? "6");
  const maxPerSource = Number.isFinite(maxPerSourceRaw) && maxPerSourceRaw > 0 ? Math.floor(maxPerSourceRaw) : 6;
  const sourceCounts = new Map<string, number>();
  const capped: NormalizedNewsEntry[] = [];
  for (const entry of pool) {
    const seen = sourceCounts.get(entry.sourceName) ?? 0;
    if (seen >= maxPerSource) continue;
    sourceCounts.set(entry.sourceName, seen + 1);
    capped.push(entry);
    if (capped.length >= 40) break;
  }
  return capped.sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
}

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
      const filteredEntries = filterEntriesForAiRelevance(
        filterEntriesForIngestWindow(entries, nowIso, ingestWindowDays),
      );
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
        data: entries.map((item) => ({
          id: item.canonicalUrl,
          title: getNewsDisplayTitle(item),
          link: item.canonicalUrl,
          source: getNewsSourceLabel(item),
          publishedAt: item.publishedAt ?? windowEndIso,
          timeAgo: item.summary ?? null,
          imageUrl: getNewsSourceLogo(item),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await runtime.close();
  }
}
