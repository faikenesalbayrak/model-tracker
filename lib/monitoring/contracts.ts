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
    sourceName: "livebench_general_llm",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 20,
    categories: ["general_llm"],
    note: "Secondary source for general LLM leaderboard snapshots.",
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
  // ── Image generation (primary: AA leaderboard pages) ────────────────────
  {
    sourceName: "aa_image_text_to_image",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["image_generation"],
    note: "Primary image leaderboard: AA text-to-image + editing combined.",
  },
  {
    sourceName: "llm_stats_image_generation",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 20,
    categories: ["image_generation"],
    note: "Secondary fallback: ZeroEval Magia Arena image arenas.",
  },
  // ── Video generation (primary: AA leaderboard pages) ────────────────────
  {
    sourceName: "aa_video_text_to_video",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["video_generation"],
    note: "Primary video leaderboard: AA text-to-video + image-to-video combined.",
  },
  {
    sourceName: "llm_stats_video_generation",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 20,
    categories: ["video_generation"],
    note: "Secondary fallback: ZeroEval Magia Arena video arenas.",
  },
  // ── Text-to-speech (primary: AA TTS leaderboard) ────────────────────────
  {
    sourceName: "aa_tts",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["text_to_speech"],
    note: "Primary TTS leaderboard: AA text-to-speech leaderboard page.",
  },
  {
    sourceName: "llm_stats_text_to_speech",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 20,
    categories: ["text_to_speech"],
    note: "Secondary fallback: ZeroEval Magia Arena TTS.",
  },
  // ── Speech-to-text (primary: AA STT page) ───────────────────────────────
  {
    sourceName: "aa_stt",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["speech_to_text"],
    note: "Primary STT leaderboard: AA speech-to-text page.",
  },
  {
    sourceName: "llm_stats_speech_to_text",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 20,
    categories: ["speech_to_text"],
    note: "Secondary fallback: ZeroEval Magia Arena STT.",
  },
  {
    sourceName: "open_asr_leaderboard",
    sourceType: "leaderboard",
    status: "planned",
    priority: 30,
    categories: ["speech_to_text"],
  },
  // ── Embeddings (primary: MTEB leaderboard) ───────────────────────────────
  {
    sourceName: "mteb_embeddings",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 10,
    categories: ["embeddings"],
    note: "Primary embeddings leaderboard: MTEB HuggingFace dataset.",
  },
  {
    sourceName: "llm_stats_embeddings",
    sourceType: "leaderboard",
    status: "enabled",
    priority: 20,
    categories: ["embeddings"],
    note: "Secondary fallback: ZeroEval search/embeddings category.",
  },
  {
    sourceName: "mteb_leaderboard",
    sourceType: "leaderboard",
    status: "disabled",
    priority: 30,
    categories: ["embeddings"],
    note: "Superseded by mteb_embeddings.",
  },
  {
    sourceName: "llm_stats_ai_news",
    sourceType: "news",
    status: "disabled",
    priority: 10,
    note: "Disabled to avoid reusing leaderboard/data sources in news lane.",
  },
  {
    sourceName: "hn_algolia",
    sourceType: "news",
    status: "enabled",
    priority: 10,
    note: "Community source for fast AI signal discovery.",
  },
  {
    sourceName: "arxiv_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 20,
  },
  {
    sourceName: "arxiv_cl_rss",
    sourceType: "news",
    status: "enabled",
    priority: 21,
  },
  {
    sourceName: "arxiv_lg_rss",
    sourceType: "news",
    status: "enabled",
    priority: 22,
  },
  {
    sourceName: "reuters_technology_rss",
    sourceType: "news",
    status: "enabled",
    priority: 30,
  },
  {
    sourceName: "techcrunch_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 31,
  },
  {
    sourceName: "the_verge_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 32,
  },
  {
    sourceName: "venturebeat_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 33,
  },
  {
    sourceName: "mit_tech_review_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 34,
  },
  {
    sourceName: "openai_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 40,
  },
  {
    sourceName: "anthropic_news_rss",
    sourceType: "news",
    status: "enabled",
    priority: 41,
  },
  {
    sourceName: "deepmind_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 42,
  },
  {
    sourceName: "meta_ai_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 43,
  },
  {
    sourceName: "huggingface_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 44,
  },
  {
    sourceName: "cohere_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 45,
  },
  {
    sourceName: "mistral_news_rss",
    sourceType: "news",
    status: "enabled",
    priority: 46,
  },
  {
    sourceName: "aws_ml_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 50,
  },
  {
    sourceName: "google_cloud_blog_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 51,
  },
  {
    sourceName: "azure_ai_blog_rss",
    sourceType: "news",
    status: "enabled",
    priority: 52,
  },
  {
    sourceName: "nvidia_blog_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 53,
  },
  {
    sourceName: "semafor_tech_rss",
    sourceType: "news",
    status: "enabled",
    priority: 60,
  },
  {
    sourceName: "zdnet_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 61,
  },
  {
    sourceName: "computerworld_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 62,
  },
  {
    sourceName: "infoworld_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 63,
  },
  {
    sourceName: "siliconangle_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 64,
  },
  {
    sourceName: "searchengineland_ai_rss",
    sourceType: "news",
    status: "enabled",
    priority: 65,
  },
  {
    sourceName: "newsapi_everything",
    sourceType: "news",
    status: "planned",
    priority: 70,
  },
  {
    sourceName: "newscatcher_api",
    sourceType: "news",
    status: "planned",
    priority: 80,
  },
  {
    sourceName: "gdelt_doc_v2",
    sourceType: "news",
    status: "planned",
    priority: 90,
  },
  {
    sourceName: "semantic_scholar_trending",
    sourceType: "news",
    status: "planned",
    priority: 95,
  },
  {
    sourceName: "arxiv_feed_news_lane",
    sourceType: "news",
    status: "planned",
    priority: 100,
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
