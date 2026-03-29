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
  hn_algolia: "/news-logos/hn_algolia.png",
  arxiv_ai: "/news-logos/arxiv_ai.png",
  arxiv_cl: "/news-logos/arxiv_cl.png",
  arxiv_lg: "/news-logos/arxiv_lg.png",
  reuters_technology: "/news-logos/reuters_technology.png",
  techcrunch_ai: "/news-logos/techcrunch_ai.png",
  the_verge_ai: "/news-logos/the_verge_ai.png",
  venturebeat_ai: "/news-logos/venturebeat_ai.png",
  mit_tech_review_ai: "/news-logos/mit_tech_review_ai.png",
  openai_news: "/news-logos/openai_news.png",
  anthropic_news: "/news-logos/anthropic_news.png",
  deepmind_blog: "/news-logos/deepmind_blog.png",
  meta_ai_blog: "/news-logos/meta_ai_blog.png",
  huggingface_blog: "/news-logos/huggingface_blog.png",
  cohere_blog: "/news-logos/cohere_blog.png",
  mistral_news: "/news-logos/mistral_news.png",
  aws_ml_blog: "/news-logos/aws_ml_blog.png",
  google_cloud_ai_blog: "/news-logos/google_cloud_ai_blog.png",
  azure_ai_blog: "/news-logos/azure_ai_blog.png",
  nvidia_ai_blog: "/news-logos/nvidia_ai_blog.png",
  semafor_tech: "/news-logos/semafor_tech.png",
  zdnet_ai: "/news-logos/zdnet_ai.png",
  computerworld_ai: "/news-logos/computerworld_ai.png",
  infoworld_ai: "/news-logos/infoworld_ai.png",
  siliconangle_ai: "/news-logos/siliconangle_ai.png",
  searchengineland_ai: "/news-logos/searchengineland_ai.png",
  google_news_ai: "/news-logos/google_news_ai.png",
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
