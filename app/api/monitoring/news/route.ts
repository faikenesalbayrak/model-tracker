import { NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const entries = (await runtime.repository.getNewsEntriesInWindow(windowStartIso, windowEndIso))
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
    await runtime.close();
  }
}
