import { fetchJsonWithRetry } from "@/lib/fetcher";
import type {
  NewsAdapter,
  NormalizedNewsEntry,
  SourceRegistryItem,
} from "@/lib/monitoring/contracts";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";

const HN_ALGOLIA_NEWS_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=100&query=%28ai%20OR%20llm%20OR%20openai%20OR%20anthropic%20OR%20gemini%20OR%20claude%29";

type HnAlgoliaHit = {
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

type HnAlgoliaResponse = {
  hits?: HnAlgoliaHit[];
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

function toIsoDate(value: string | undefined, fallbackIso: string): string {
  if (!value) return fallbackIso;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fallbackIso;
  return new Date(parsed).toISOString();
}

function keywordImportance(title: string): number {
  const text = title.toLowerCase();
  const weights: Array<[RegExp, number]> = [
    [/\b(model|release|launch|announces?)\b/, 2.5],
    [/\b(openai|anthropic|google|meta|mistral|xai|deepseek)\b/, 2.2],
    [/\b(funding|raises?|acquire|acquisition)\b/, 1.7],
    [/\b(benchmark|leaderboard|sota)\b/, 1.6],
  ];
  return weights.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0);
}

function normalizeHnHits(raw: unknown, nowIso: string): NormalizedNewsEntry[] {
  const payload = (raw ?? {}) as HnAlgoliaResponse;
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  const dedupe = new Set<string>();
  const nowTs = Date.parse(nowIso);

  const items: Array<NormalizedNewsEntry | null> = hits.map((hit): NormalizedNewsEntry | null => {
      const title = (hit.title ?? hit.story_title ?? "").trim();
      const url = (hit.url ?? hit.story_url ?? "").trim();
      if (!title || !url) return null;
      const canonicalUrl = canonicalizeUrl(url);
      if (dedupe.has(canonicalUrl)) return null;
      dedupe.add(canonicalUrl);

      const publishedAt = toIsoDate(hit.created_at, nowIso);
      const points = typeof hit.points === "number" && Number.isFinite(hit.points) ? hit.points : 0;
      const comments =
        typeof hit.num_comments === "number" && Number.isFinite(hit.num_comments) ? hit.num_comments : 0;
      const recencyBoost = nowTs - Date.parse(publishedAt) < 86_400_000 ? 1 : 0;

      return {
        sourceName: "hn_algolia",
        canonicalUrl,
        title,
        publishedAt,
        authorOrOutlet: (hit.author ?? "").trim() || "Hacker News",
        summary: `${points} points / ${comments} comments`,
        topicTags: ["ai-news"],
        importanceScore: keywordImportance(title) + recencyBoost + points / 100 + comments / 120,
        payload: {
          objectId: hit.objectID ?? null,
          points,
          comments,
        },
      };
    });

  return items
    .filter((item): item is NormalizedNewsEntry => item !== null)
    .slice(0, 100)
    .sort((a, b) => Date.parse(b.publishedAt ?? nowIso) - Date.parse(a.publishedAt ?? nowIso));
}

const hnAlgoliaNewsAdapter: NewsAdapter = {
  sourceName: "hn_algolia",
  sourceType: "news",
  priority: 10,
  async fetchRaw(): Promise<unknown> {
    const { data } = await fetchJsonWithRetry<HnAlgoliaResponse>(
      HN_ALGOLIA_NEWS_URL,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "model-tracker-monitoring/1.0",
        },
      },
      { allowedHosts: ["hn.algolia.com"] },
    );
    return data;
  },
  async normalizeNews(raw: unknown, nowIso: string): Promise<NormalizedNewsEntry[]> {
    return normalizeHnHits(raw, nowIso);
  },
};

const NEWS_ADAPTERS: Record<string, NewsAdapter> = {
  [hnAlgoliaNewsAdapter.sourceName]: hnAlgoliaNewsAdapter,
};

function isActiveSource(item: SourceRegistryItem): boolean {
  return item.sourceType === "news" && item.status === "enabled";
}

export function getActiveNewsSources(): NewsAdapter[] {
  return SOURCE_REGISTRY
    .filter(isActiveSource)
    .map((item) => NEWS_ADAPTERS[item.sourceName])
    .filter((adapter): adapter is NewsAdapter => Boolean(adapter))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 1);
}
