export const LEADERBOARD_CATEGORIES = [
  "general_llm",
  "image_generation",
  "video_generation",
  "text_to_speech",
  "speech_to_text",
  "embeddings",
] as const;

export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export type SourceType = "leaderboard" | "news" | "metadata";

export interface AdapterContext {
  nowIso: string;
  timeoutMs: number;
}

export interface NormalizedLeaderboardEntry {
  rank: number;
  sourceModelId?: string;
  canonicalModelKey: string;
  modelName: string;
  vendor?: string;
  score?: number;
  scoreUnit?: string;
  modelUrl?: string;
  payload?: Record<string, unknown>;
}

export interface NormalizedNewsEntry {
  sourceName: string;
  canonicalUrl: string;
  title: string;
  publishedAt?: string;
  authorOrOutlet?: string;
  summary?: string;
  topicTags?: string[];
  importanceScore?: number;
  payload?: Record<string, unknown>;
}

export interface LeaderboardAdapter {
  sourceName: string;
  sourceType: "leaderboard";
  categories: LeaderboardCategory[];
  priority: number;
  fetchRaw(ctx: AdapterContext): Promise<unknown>;
  normalizeTop10(raw: unknown, category: LeaderboardCategory, nowIso: string): Promise<NormalizedLeaderboardEntry[]>;
}

export interface NewsAdapter {
  sourceName: string;
  sourceType: "news";
  priority: number;
  fetchRaw(ctx: AdapterContext): Promise<unknown>;
  normalizeNews(raw: unknown, nowIso: string): Promise<NormalizedNewsEntry[]>;
}

export interface MetadataAdapter {
  sourceName: string;
  sourceType: "metadata";
  priority: number;
  fetchRaw(ctx: AdapterContext): Promise<unknown>;
  normalizeMetadata(raw: unknown, nowIso: string): Promise<Record<string, unknown>[]>;
}

export type MonitoringAdapter = LeaderboardAdapter | NewsAdapter | MetadataAdapter;

export type SourceStatus = "enabled" | "planned" | "disabled";

export interface SourceRegistryItem {
  sourceName: string;
  sourceType: SourceType;
  status: SourceStatus;
  priority: number;
  categories?: LeaderboardCategory[];
  note?: string;
}

export const SOURCE_REGISTRY: SourceRegistryItem[] = [
  {
    sourceName: "artificial_analysis_models_page",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["general_llm"],
    note: "Primary source for general LLM leaderboard.",
  },
  {
    sourceName: "hf_open_llm_leaderboard",
    sourceType: "leaderboard",
    status: "planned",
    priority: 20,
    categories: ["general_llm"],
  },
  {
    sourceName: "lm_arena_leaderboard",
    sourceType: "leaderboard",
    status: "planned",
    priority: 30,
    categories: ["general_llm"],
  },
  {
    sourceName: "llm_stats_image_generation",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["image_generation"],
  },
  {
    sourceName: "llm_stats_video_generation",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["video_generation"],
  },
  {
    sourceName: "llm_stats_text_to_speech",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["text_to_speech"],
  },
  {
    sourceName: "llm_stats_speech_to_text",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["speech_to_text"],
  },
  {
    sourceName: "open_asr_leaderboard",
    sourceType: "leaderboard",
    status: "planned",
    priority: 20,
    categories: ["speech_to_text"],
  },
  {
    sourceName: "llm_stats_embeddings",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["embeddings"],
  },
  {
    sourceName: "mteb_leaderboard",
    sourceType: "leaderboard",
    status: "planned",
    priority: 20,
    categories: ["embeddings"],
  },
  {
    sourceName: "llm_stats_ai_news",
    sourceType: "news",
    status: "disabled",
    priority: 10,
    note: "Disabled to avoid reusing leaderboard/data sources in news lane.",
  },
  {
    sourceName: "newsapi_everything",
    sourceType: "news",
    status: "planned",
    priority: 20,
  },
  {
    sourceName: "newscatcher_api",
    sourceType: "news",
    status: "planned",
    priority: 30,
  },
  {
    sourceName: "gdelt_doc_v2",
    sourceType: "news",
    status: "planned",
    priority: 40,
  },
  {
    sourceName: "hn_algolia",
    sourceType: "news",
    status: "enabled",
    priority: 10,
    note: "Single dedicated AI news source (separate from data/leaderboard sources).",
  },
  {
    sourceName: "arxiv_feed_news_lane",
    sourceType: "news",
    status: "planned",
    priority: 60,
  },
  {
    sourceName: "openrouter_models_api",
    sourceType: "metadata",
    status: "planned",
    priority: 10,
  },
  {
    sourceName: "github_releases_api",
    sourceType: "metadata",
    status: "planned",
    priority: 20,
  },
];

export function getEnabledSources(): SourceRegistryItem[] {
  return SOURCE_REGISTRY.filter((item) => item.status === "enabled");
}
