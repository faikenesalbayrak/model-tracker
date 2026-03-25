import { NextResponse } from "next/server";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=24&query=%28ai%20OR%20llm%20OR%20openai%20OR%20anthropic%20OR%20gemini%20OR%20claude%29";
const CACHE_KEY = "api-ai-news-hn";
const REFRESH_MS = 12 * 60 * 60 * 1000;

type HnHit = {
  objectID?: string;
  created_at?: string;
  title?: string | null;
  story_title?: string | null;
  url?: string | null;
  story_url?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
};

type HnResponse = {
  hits?: HnHit[];
};

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
  source: "hn_algolia";
  data: AiNewsItem[];
};

type Payload = Snapshot & {
  generated_at: string;
  stale: boolean;
  error: ReturnType<typeof toApiErrorMeta> | null;
  note?: string;
};

function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function parseAiNews(payload: HnResponse): AiNewsItem[] {
  const items: AiNewsItem[] = [];
  const seen = new Set<string>();
  const hits = Array.isArray(payload.hits) ? payload.hits : [];

  for (const hit of hits) {
    const title = (hit.title ?? hit.story_title ?? "").trim();
    const rawLink = (hit.url ?? hit.story_url ?? "").trim();
    if (!title || !rawLink) continue;

    const link = canonicalizeUrl(rawLink);
    if (seen.has(link)) continue;
    seen.add(link);

    const publishedAtTs = Date.parse(hit.created_at ?? "");
    const publishedAt = Number.isFinite(publishedAtTs)
      ? new Date(publishedAtTs).toISOString()
      : new Date().toISOString();

    const points = typeof hit.points === "number" && Number.isFinite(hit.points) ? hit.points : 0;
    const comments =
      typeof hit.num_comments === "number" && Number.isFinite(hit.num_comments) ? hit.num_comments : 0;

    items.push({
      id: (hit.objectID ?? link).trim(),
      title,
      link,
      source: (hit.author ?? "").trim() || "Hacker News",
      publishedAt,
      timeAgo: `${points} points / ${comments} comments`,
      imageUrl: null,
    });
  }

  return items
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 12);
}

async function buildFreshSnapshot(): Promise<Snapshot> {
  const { data } = await fetchJsonWithRetry<HnResponse>(
    SOURCE_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "model-tracker/1.0 (+https://localhost:4000)",
      },
    },
    {
      allowedHosts: ["hn.algolia.com"],
    },
  );

  const items = parseAiNews(data);
  if (items.length === 0) {
    throw new Error("Could not parse ai-news items from hn.algolia.com");
  }

  return {
    last_success_at: new Date().toISOString(),
    source: "hn_algolia",
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
        source: "hn_algolia",
        stale: true,
        error: errorMeta,
        data: [],
        note: "No cached AI news available yet.",
      } satisfies Payload,
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
