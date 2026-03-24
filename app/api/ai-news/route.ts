import { NextResponse } from "next/server";
import { fetchWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://llm-stats.com/ai-news";
const CACHE_KEY = "api-ai-news";
const REFRESH_MS = 12 * 60 * 60 * 1000;

type AiNewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  timeAgo: string | null;
  imageUrl: string | null;
};

type Snapshot = {
  last_success_at: string;
  source: "llm_stats_ai_news";
  data: AiNewsItem[];
};

type Payload = Snapshot & {
  generated_at: string;
  stale: boolean;
  error: ReturnType<typeof toApiErrorMeta> | null;
  note?: string;
};

function normalizeText(value: string): string {
  return value
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003c", "<")
    .replaceAll("\\u003e", ">")
    .replaceAll("\\n", " ")
    .replaceAll('\\"', '"')
    .replaceAll("\\/", "/")
    .replaceAll("\\\\", "\\")
    .trim();
}

function parseAiNews(html: string): AiNewsItem[] {
  const pattern =
    /\{\\\"id\\\":\\\"([^\\\"]+)\\\",\\\"title\\\":\\\"([^\\\"]+)\\\",\\\"description\\\":\\\"([^\\\"]*)\\\",\\\"link\\\":\\\"([^\\\"]+)\\\",\\\"source\\\":\\\"([^\\\"]+)\\\",\\\"pubDate\\\":\\\"([^\\\"]+)\\\"(?:,\\\"timeAgo\\\":\\\"([^\\\"]*)\\\")?(?:,\\\"image\\\":\\\"([^\\\"]*)\\\")?/g;
  const items: AiNewsItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(pattern)) {
    const id = normalizeText(match[1] ?? "");
    const title = normalizeText(match[2] ?? "");
    const link = normalizeText(match[4] ?? "");
    const source = normalizeText(match[5] ?? "");
    const publishedAtRaw = normalizeText(match[6] ?? "");
    const timeAgoRaw = normalizeText(match[7] ?? "");
    const imageRaw = normalizeText(match[8] ?? "");

    if (!title || !link) {
      continue;
    }
    if (seen.has(link)) {
      continue;
    }
    seen.add(link);

    const publishedAtTs = Date.parse(publishedAtRaw);
    const publishedAt = Number.isFinite(publishedAtTs)
      ? new Date(publishedAtTs).toISOString()
      : publishedAtRaw;

    items.push({
      id: id || link,
      title,
      link,
      source: source || "LLM Stats",
      publishedAt,
      timeAgo: timeAgoRaw || null,
      imageUrl: imageRaw.startsWith("http") ? imageRaw : null,
    });
  }

  return items
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 12);
}

async function buildFreshSnapshot(): Promise<Snapshot> {
  const { data: html } = await fetchWithRetry<string>(
    SOURCE_URL,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "model-tracker/1.0 (+https://localhost:4000)",
      },
    },
    async (response) => response.text(),
    {
      allowedHosts: ["llm-stats.com"],
    },
  );

  const items = parseAiNews(html);
  if (items.length === 0) {
    throw new Error("Could not parse ai-news items from llm-stats.com");
  }

  return {
    last_success_at: new Date().toISOString(),
    source: "llm_stats_ai_news",
    data: items,
  };
}

export async function GET() {
  startAutoRefresh(CACHE_KEY, REFRESH_MS, buildFreshSnapshot);
  const generatedAt = new Date().toISOString();

  try {
    let snapshot = await readSnapshot<Snapshot>(CACHE_KEY);
    if (!snapshot) {
      snapshot = await refreshSnapshot(CACHE_KEY, buildFreshSnapshot);
    }

    const stale = isStale(snapshot.last_success_at, REFRESH_MS);
    if (stale) {
      void refreshSnapshot(CACHE_KEY, buildFreshSnapshot).catch(() => {
        // Keep last good snapshot while refresh runs in background.
      });
    }

    return NextResponse.json(
      {
        ...snapshot,
        generated_at: generatedAt,
        stale,
        error: null,
      } satisfies Payload,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);
    const cached = await readSnapshot<Snapshot>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          generated_at: generatedAt,
          stale: true,
          error: errorMeta,
          note: "Serving cached AI news because upstream refresh failed.",
        } satisfies Payload,
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        generated_at: generatedAt,
        last_success_at: generatedAt,
        source: "llm_stats_ai_news",
        stale: true,
        error: errorMeta,
        data: [],
        note: "No cached AI news available yet.",
      } satisfies Payload,
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
