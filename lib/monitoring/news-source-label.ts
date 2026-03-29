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

const SOURCE_LOGO_OVERRIDES: Record<string, string> = {
  hn_algolia: "https://logo.clearbit.com/ycombinator.com",
  arxiv_ai: "https://logo.clearbit.com/arxiv.org",
  arxiv_cl: "https://logo.clearbit.com/arxiv.org",
  arxiv_lg: "https://logo.clearbit.com/arxiv.org",
  reuters_technology: "https://logo.clearbit.com/reuters.com",
  techcrunch_ai: "https://logo.clearbit.com/techcrunch.com",
  the_verge_ai: "https://logo.clearbit.com/theverge.com",
  venturebeat_ai: "https://logo.clearbit.com/venturebeat.com",
  mit_tech_review_ai: "https://logo.clearbit.com/technologyreview.com",
  openai_news: "https://logo.clearbit.com/openai.com",
  anthropic_news: "https://logo.clearbit.com/anthropic.com",
  deepmind_blog: "https://logo.clearbit.com/deepmind.google",
  meta_ai_blog: "https://logo.clearbit.com/meta.com",
  huggingface_blog: "https://logo.clearbit.com/huggingface.co",
  cohere_blog: "https://logo.clearbit.com/cohere.com",
  mistral_news: "https://logo.clearbit.com/mistral.ai",
  aws_ml_blog: "https://logo.clearbit.com/aws.amazon.com",
  google_cloud_ai_blog: "https://logo.clearbit.com/cloud.google.com",
  azure_ai_blog: "https://logo.clearbit.com/microsoft.com",
  nvidia_ai_blog: "https://logo.clearbit.com/nvidia.com",
  semafor_tech: "https://logo.clearbit.com/semafor.com",
  zdnet_ai: "https://logo.clearbit.com/zdnet.com",
  computerworld_ai: "https://logo.clearbit.com/computerworld.com",
  infoworld_ai: "https://logo.clearbit.com/infoworld.com",
  siliconangle_ai: "https://logo.clearbit.com/siliconangle.com",
  searchengineland_ai: "https://logo.clearbit.com/searchengineland.com",
  google_news_ai: "https://logo.clearbit.com/news.google.com",
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

export function getNewsSourceLogo(entry: Pick<NormalizedNewsEntry, "sourceName">): string | null {
  return SOURCE_LOGO_OVERRIDES[entry.sourceName] ?? null;
}
