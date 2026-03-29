import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";

const SOURCE_LABEL_OVERRIDES: Record<string, string> = {
  hn_algolia: "Hacker News",
  newsapi_everything: "NewsAPI",
  newscatcher_api: "NewsCatcher",
  gdelt_doc_v2: "GDELT",
  semantic_scholar_trending: "Semantic Scholar",
  arxiv_feed_news_lane: "arXiv",
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
