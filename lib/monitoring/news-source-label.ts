import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";

const SOURCE_LABEL_OVERRIDES: Record<string, string> = {
  hn_algolia: "Hacker News",
  newsapi_everything: "NewsAPI",
  newscatcher_api: "NewsCatcher",
  gdelt_doc_v2: "GDELT",
  semantic_scholar_trending: "Semantic Scholar",
  arxiv_feed_news_lane: "arXiv",
  google_news_ai: "Google News",
  openrouter_models_api: "OpenRouter",
  github_releases_api: "GitHub Releases",
};

function toTitleCaseFromSlug(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (!last) return null;
    const cleaned = decodeURIComponent(last)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return null;
    return cleaned
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

export function getNewsSourceLabel(entry: Pick<NormalizedNewsEntry, "sourceName" | "payload">): string {
  const outlet = entry.payload?.outlet;
  if (typeof outlet === "string" && outlet.trim().length > 0) {
    return outlet.trim();
  }

  const fromOverride = SOURCE_LABEL_OVERRIDES[entry.sourceName];
  if (fromOverride) {
    return fromOverride;
  }

  return toTitleCaseFromSlug(entry.sourceName);
}

export function getNewsDisplayTitle(entry: Pick<NormalizedNewsEntry, "title" | "canonicalUrl">): string {
  const cleaned = entry.title.trim();
  if (cleaned.length > 0) {
    return cleaned;
  }
  return titleFromUrl(entry.canonicalUrl) ?? entry.canonicalUrl;
}
