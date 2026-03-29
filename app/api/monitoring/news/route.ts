import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dedupeByCanonical(entries: NormalizedNewsEntry[]): NormalizedNewsEntry[] {
  const seen = new Set<string>();
  const unique: NormalizedNewsEntry[] = [];
  for (const entry of entries) {
    const key = entry.canonicalUrl.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
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
          title: item.title,
          link: item.canonicalUrl,
          source: item.sourceName,
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
