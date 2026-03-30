import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import { getNewsDisplayTitle, getNewsSourceLabel, getNewsSourceLogo } from "@/lib/monitoring/news-source-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shouldHideFromDisplay(sourceName: string): boolean {
  return sourceName.startsWith("arxiv_") || sourceName === "arxiv_feed_news_lane";
}

function dedupeByCanonical(entries: NormalizedNewsEntry[]): NormalizedNewsEntry[] {
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

  for (const entry of entries) {
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
    return [...byCanonical.values()].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
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
    let allEntries = (await runtime.repository.getNewsEntriesInWindow(recentWindowStartIso, windowEndIso))
      .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
    if (allEntries.length === 0) {
      allEntries = (await runtime.repository.getNewsEntriesInWindow(fallbackWindowStartIso, windowEndIso))
        .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
    }
    const dedupedEntries = dedupeByCanonical(allEntries);
    const filteredEntries = dedupedEntries.filter((item) => activeNewsSources.has(item.sourceName));
    const pool = filteredEntries.length > 0 ? filteredEntries : dedupedEntries;
    const maxPerSourceRaw = Number(process.env.MONITORING_NEWS_MAX_PER_SOURCE ?? "6");
    const maxPerSource = Number.isFinite(maxPerSourceRaw) && maxPerSourceRaw > 0 ? Math.floor(maxPerSourceRaw) : 6;
    const sourceCounts = new Map<string, number>();
    const entries: NormalizedNewsEntry[] = [];
    for (const entry of pool) {
      if (shouldHideFromDisplay(entry.sourceName)) continue;
      const seen = sourceCounts.get(entry.sourceName) ?? 0;
      if (seen >= maxPerSource) continue;
      sourceCounts.set(entry.sourceName, seen + 1);
      entries.push(entry);
      if (entries.length >= 40) break;
    }
    entries.sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));

    return NextResponse.json(
      {
        sourceName: "monitoring_db",
        snapshotAt: windowEndIso,
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
