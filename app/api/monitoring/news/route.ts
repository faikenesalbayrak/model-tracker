import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import { getNewsDisplayTitle, getNewsSourceLabel } from "@/lib/monitoring/news-source-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dedupeByCanonical(entries: NormalizedNewsEntry[]): NormalizedNewsEntry[] {
  const byCanonical = new Map<string, NormalizedNewsEntry>();
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
    const existing = byCanonical.get(key);
    if (!existing || richnessScore(entry) > richnessScore(existing)) {
      byCanonical.set(key, entry);
    }
  }
  return [...byCanonical.values()];
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
    const entries = (filteredEntries.length > 0 ? filteredEntries : dedupedEntries).slice(0, 40);

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
          imageUrl:
            (item.payload?.image_url as string | undefined) ??
            (item.payload?.imageUrl as string | undefined) ??
            null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await runtime.close();
  }
}
