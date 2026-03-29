import { fetchJsonWithRetry, fetchWithRetry } from "@/lib/fetcher";
import type {
  NewsAdapter,
  NormalizedNewsEntry,
  SourceRegistryItem,
} from "@/lib/monitoring/contracts";
import { SOURCE_REGISTRY } from "@/lib/monitoring/contracts";

const HN_ALGOLIA_NEWS_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=100&query=%28ai%20OR%20llm%20OR%20openai%20OR%20anthropic%20OR%20gemini%20OR%20claude%29";

const RSS_FEEDS: Array<{
  sourceName: string;
  url: string;
  topicTags: string[];
  outlet: string;
  importanceBoost?: number;
  minRelevanceScore?: number;
}> = [
  { sourceName: "arxiv_ai", url: "https://export.arxiv.org/rss/cs.AI", topicTags: ["research", "arxiv"], outlet: "arXiv", importanceBoost: 2.2 },
  { sourceName: "arxiv_cl", url: "https://export.arxiv.org/rss/cs.CL", topicTags: ["research", "arxiv"], outlet: "arXiv", importanceBoost: 2.0 },
  { sourceName: "arxiv_lg", url: "https://export.arxiv.org/rss/cs.LG", topicTags: ["research", "arxiv"], outlet: "arXiv", importanceBoost: 2.0 },
  { sourceName: "reuters_technology", url: "https://www.reutersagency.com/feed/?best-topics=technology", topicTags: ["industry", "market"], outlet: "Reuters", importanceBoost: 2.2 },
  { sourceName: "techcrunch_ai", url: "https://techcrunch.com/category/artificial-intelligence/feed/", topicTags: ["industry", "startup"], outlet: "TechCrunch", importanceBoost: 1.8 },
  { sourceName: "the_verge_ai", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", topicTags: ["industry", "consumer"], outlet: "The Verge", importanceBoost: 1.5 },
  { sourceName: "venturebeat_ai", url: "https://venturebeat.com/ai/feed/", topicTags: ["industry", "market"], outlet: "VentureBeat", importanceBoost: 1.7 },
  { sourceName: "mit_tech_review_ai", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", topicTags: ["industry", "research"], outlet: "MIT Technology Review", importanceBoost: 1.9 },
  { sourceName: "openai_news", url: "https://openai.com/news/rss.xml", topicTags: ["vendor", "official"], outlet: "OpenAI", importanceBoost: 2.6 },
  { sourceName: "anthropic_news", url: "https://www.anthropic.com/news/rss.xml", topicTags: ["vendor", "official"], outlet: "Anthropic", importanceBoost: 2.6 },
  { sourceName: "deepmind_blog", url: "https://deepmind.google/discover/blog/rss.xml", topicTags: ["vendor", "official"], outlet: "Google DeepMind", importanceBoost: 2.4 },
  { sourceName: "meta_ai_blog", url: "https://ai.meta.com/blog/rss/", topicTags: ["vendor", "official"], outlet: "Meta AI", importanceBoost: 2.2 },
  { sourceName: "huggingface_blog", url: "https://huggingface.co/blog/feed.xml", topicTags: ["vendor", "models"], outlet: "Hugging Face", importanceBoost: 2.1 },
  { sourceName: "cohere_blog", url: "https://cohere.com/blog/rss.xml", topicTags: ["vendor", "official"], outlet: "Cohere", importanceBoost: 2.0 },
  { sourceName: "mistral_news", url: "https://mistral.ai/news/rss.xml", topicTags: ["vendor", "official"], outlet: "Mistral AI", importanceBoost: 2.0 },
  { sourceName: "aws_ml_blog", url: "https://aws.amazon.com/blogs/machine-learning/feed/", topicTags: ["cloud", "industry"], outlet: "AWS ML Blog", importanceBoost: 1.7 },
  { sourceName: "google_cloud_ai_blog", url: "https://cloud.google.com/blog/topics/ai-ml/rss", topicTags: ["cloud", "industry"], outlet: "Google Cloud", importanceBoost: 1.7 },
  { sourceName: "azure_ai_blog", url: "https://azure.microsoft.com/en-us/blog/topics/ai-machine-learning/feed/", topicTags: ["cloud", "industry"], outlet: "Microsoft Azure", importanceBoost: 1.7 },
  { sourceName: "nvidia_ai_blog", url: "https://blogs.nvidia.com/blog/category/ai/feed/", topicTags: ["hardware", "industry"], outlet: "NVIDIA", importanceBoost: 1.8 },
  { sourceName: "semafor_tech", url: "https://www.semafor.com/feeds/technology", topicTags: ["market", "industry"], outlet: "Semafor", importanceBoost: 1.3, minRelevanceScore: 2.4 },
  { sourceName: "zdnet_ai", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml", topicTags: ["industry", "enterprise"], outlet: "ZDNET", importanceBoost: 1.4, minRelevanceScore: 2.4 },
  { sourceName: "computerworld_ai", url: "https://www.computerworld.com/index.rss", topicTags: ["enterprise", "industry"], outlet: "Computerworld", importanceBoost: 1.2, minRelevanceScore: 2.4 },
  { sourceName: "infoworld_ai", url: "https://www.infoworld.com/index.rss", topicTags: ["developer", "enterprise"], outlet: "InfoWorld", importanceBoost: 1.2, minRelevanceScore: 2.4 },
  { sourceName: "siliconangle_ai", url: "https://siliconangle.com/feed/", topicTags: ["industry", "market"], outlet: "SiliconANGLE", importanceBoost: 1.2, minRelevanceScore: 1.8 },
  { sourceName: "searchengineland_ai", url: "https://searchengineland.com/library/channel/ai/feed", topicTags: ["industry", "product"], outlet: "Search Engine Land", importanceBoost: 1.1, minRelevanceScore: 1.8 },
  {
    sourceName: "google_news_ai",
    url: "https://news.google.com/rss/search?q=%28%22artificial+intelligence%22+OR+AI+OR+LLM+OR+OpenAI+OR+Anthropic+OR+Gemini+OR+Claude+OR+Mistral+OR+NVIDIA%29+when%3A7d&hl=en-US&gl=US&ceid=US:en",
    topicTags: ["industry", "market", "aggregator"],
    outlet: "Google News",
    importanceBoost: 1.2,
    minRelevanceScore: 2.6,
  },
];

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
    const decoded = decodeURIComponent(url.trim());
    if (/^https?:\/\//i.test(decoded) && decoded !== url) {
      return canonicalizeUrl(decoded);
    }

    const parsed = new URL(url);
    if (parsed.hostname.includes("news.google.com")) {
      const redirected = parsed.searchParams.get("url") ?? parsed.searchParams.get("q");
      if (redirected && /^https?:\/\//i.test(redirected)) {
        return canonicalizeUrl(redirected);
      }
    }

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
      "ocid",
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
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

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripHtml(text: string): string {
  return decodeXmlEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractTagContent(block: string, tagName: string): string | null {
  const cdata = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i").exec(block);
  if (cdata?.[1]) return cdata[1].trim();
  const direct = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(block);
  if (direct?.[1]) return decodeXmlEntities(direct[1].trim());
  return null;
}

function extractLink(block: string): string | null {
  const atomHref = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1];
  if (atomHref) return canonicalizeUrl(atomHref);
  const rssLink = extractTagContent(block, "link");
  if (rssLink) return canonicalizeUrl(rssLink);
  const guid = extractTagContent(block, "guid");
  if (guid?.startsWith("http")) return canonicalizeUrl(guid);
  return null;
}

function extractImageUrl(block: string): string | null {
  const mediaContent = /<media:content[^>]+url=["']([^"']+)["']/i.exec(block)?.[1];
  if (mediaContent) return mediaContent.trim();
  const mediaThumb = /<media:thumbnail[^>]+url=["']([^"']+)["']/i.exec(block)?.[1];
  if (mediaThumb) return mediaThumb.trim();
  const contentUrl = /<content[^>]+url=["']([^"']+)["']/i.exec(block)?.[1];
  if (contentUrl) return contentUrl.trim();
  const enclosure = /<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i.exec(block)?.[1];
  if (enclosure) return enclosure.trim();
  const desc = extractTagContent(block, "description") ?? extractTagContent(block, "content:encoded") ?? "";
  const imgInDesc =
    /<img[^>]+(?:src|data-src)=["']([^"']+)["']/i.exec(desc)?.[1] ??
    /<img[^>]+srcset=["']([^"']+)["']/i.exec(desc)?.[1]?.split(",")[0]?.trim().split(" ")[0];
  if (imgInDesc) return imgInDesc.trim();
  return null;
}

function resolveGoogleNewsTargetUrl(block: string, link: string): string {
  const direct = canonicalizeUrl(link);
  if (!direct.includes("news.google.com")) {
    return direct;
  }

  const desc = extractTagContent(block, "description") ?? "";
  const hrefs = [...desc.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of hrefs) {
    const candidate = canonicalizeUrl(href);
    if (!candidate.includes("news.google.com")) {
      return candidate;
    }
  }

  return direct;
}

async function resolveGoogleNewsFinalUrl(url: string): Promise<string> {
  const canonical = canonicalizeUrl(url);
  if (!canonical.includes("news.google.com")) {
    return canonical;
  }

  try {
    const { data } = await fetchWithRetry<string>(
      canonical,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "model-tracker-monitoring/1.0",
        },
      },
      async (response) => {
        const finalUrl = response.url;
        await response.body?.cancel();
        return finalUrl;
      },
      { timeoutMs: 6_000, retries: 1 },
    );
    return canonicalizeUrl(data);
  } catch {
    return canonical;
  }
}

async function resolveGoogleNewsUrls(
  rows: NormalizedNewsEntry[],
  concurrency = 6,
): Promise<NormalizedNewsEntry[]> {
  const resolved = [...rows];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < resolved.length) {
      const current = index;
      index += 1;
      const row = resolved[current];
      const resolvedUrl = await resolveGoogleNewsFinalUrl(row.canonicalUrl);
      resolved[current] = {
        ...row,
        canonicalUrl: resolvedUrl,
      };
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, resolved.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const dedupe = new Set<string>();
  return resolved.filter((item) => {
    const key = item.canonicalUrl.trim();
    if (!key || dedupe.has(key)) return false;
    dedupe.add(key);
    return true;
  });
}

function keywordImportance(title: string): number {
  const text = title.toLowerCase();
  const weights: Array<[RegExp, number]> = [
    [/\b(ai|artificial intelligence|llm|foundation model|genai|agentic|agents?)\b/, 2.8],
    [/\b(model|release|launch|announces?|preview|api)\b/, 2.6],
    [/\b(openai|anthropic|google|meta|mistral|xai|deepseek|nvidia|microsoft)\b/, 2.3],
    [/\b(funding|raises?|acquire|acquisition|ipo|market|earnings)\b/, 1.9],
    [/\b(benchmark|leaderboard|sota|paper|research|arxiv)\b/, 1.8],
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
    const comments = typeof hit.num_comments === "number" && Number.isFinite(hit.num_comments) ? hit.num_comments : 0;
    const recencyBoost = nowTs - Date.parse(publishedAt) < 86_400_000 ? 1 : 0;

    return {
      sourceName: "hn_algolia",
      canonicalUrl,
      title,
      publishedAt,
      authorOrOutlet: (hit.author ?? "").trim() || "Hacker News",
      summary: `${points} points / ${comments} comments`,
      topicTags: ["ai-news", "community"],
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
    .slice(0, 200)
    .sort((a, b) => Date.parse(b.publishedAt ?? nowIso) - Date.parse(a.publishedAt ?? nowIso));
}

async function normalizeRssXml(
  sourceName: string,
  xml: string,
  nowIso: string,
  outlet: string,
  topicTags: string[],
  importanceBoost = 1,
  minRelevanceScore = 0,
): Promise<NormalizedNewsEntry[]> {
  const dedupe = new Set<string>();
  const blocks = [
    ...(xml.match(/<item[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []),
  ];

  const rows: NormalizedNewsEntry[] = [];
  for (const block of blocks) {
    const titleRaw = extractTagContent(block, "title");
    const link = extractLink(block);
    if (!titleRaw || !link) continue;

    const canonicalUrl =
      sourceName === "google_news_ai"
        ? resolveGoogleNewsTargetUrl(block, link)
        : canonicalizeUrl(link);
    if (!canonicalUrl || dedupe.has(canonicalUrl)) continue;
    dedupe.add(canonicalUrl);

    const publishedRaw =
      extractTagContent(block, "pubDate") ??
      extractTagContent(block, "published") ??
      extractTagContent(block, "updated") ??
      extractTagContent(block, "dc:date") ??
      nowIso;

    const summaryRaw =
      extractTagContent(block, "description") ??
      extractTagContent(block, "content:encoded") ??
      extractTagContent(block, "summary") ??
      "";

    const imageUrl = extractImageUrl(block);
    const title = stripHtml(titleRaw);
    const summary = stripHtml(summaryRaw).slice(0, 320);
    const relevanceScore = keywordImportance(`${title} ${summary}`);
    if (relevanceScore < minRelevanceScore) continue;

    rows.push({
      sourceName,
      canonicalUrl,
      title,
      publishedAt: toIsoDate(publishedRaw, nowIso),
      authorOrOutlet: extractTagContent(block, "author") ?? outlet,
      summary,
      topicTags,
      importanceScore: relevanceScore + importanceBoost,
      payload: {
        image_url: imageUrl,
        outlet,
      },
    });
  }

  const sorted = rows.sort((a, b) => Date.parse(b.publishedAt ?? nowIso) - Date.parse(a.publishedAt ?? nowIso));
  if (sourceName === "google_news_ai") {
    return resolveGoogleNewsUrls(sorted);
  }
  return sorted;
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

function makeRssAdapter(input: {
  sourceName: string;
  url: string;
  topicTags: string[];
  outlet: string;
  importanceBoost?: number;
  minRelevanceScore?: number;
  priority: number;
}): NewsAdapter {
  return {
    sourceName: input.sourceName,
    sourceType: "news",
    priority: input.priority,
    async fetchRaw(): Promise<unknown> {
      const host = new URL(input.url).hostname;
      const { data } = await fetchWithRetry<string>(
        input.url,
        {
          method: "GET",
          headers: {
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain",
            "User-Agent": "model-tracker-monitoring/1.0",
          },
        },
        async (response) => response.text(),
        { allowedHosts: [host] },
      );
      return data;
    },
    async normalizeNews(raw: unknown, nowIso: string): Promise<NormalizedNewsEntry[]> {
      return normalizeRssXml(
        input.sourceName,
        String(raw ?? ""),
        nowIso,
        input.outlet,
        input.topicTags,
        input.importanceBoost,
        input.minRelevanceScore,
      );
    },
  };
}

const rssAdapters = RSS_FEEDS.map((feed, index) =>
  makeRssAdapter({
    ...feed,
    priority: 20 + index,
  }),
);

const NEWS_ADAPTERS: Record<string, NewsAdapter> = {
  [hnAlgoliaNewsAdapter.sourceName]: hnAlgoliaNewsAdapter,
  ...Object.fromEntries(rssAdapters.map((adapter) => [adapter.sourceName, adapter])),
};

function isActiveSource(item: SourceRegistryItem): boolean {
  return item.sourceType === "news" && item.status === "enabled";
}

export function getActiveNewsSources(): NewsAdapter[] {
  const maxSources = Number(process.env.MONITORING_NEWS_MAX_SOURCES ?? "50");
  const safeMax = Number.isFinite(maxSources) && maxSources > 0 ? Math.floor(maxSources) : 50;

  return SOURCE_REGISTRY
    .filter(isActiveSource)
    .map((item) => NEWS_ADAPTERS[item.sourceName])
    .filter((adapter): adapter is NewsAdapter => Boolean(adapter))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, safeMax);
}
