import type { RouteKey } from "@/lib/types";

export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RETRIES = 2;
export const BACKOFF_BASE_MS = 700;
export const BACKOFF_JITTER_MS = 450;
export const MAX_BACKOFF_MS = 8_000;

export const HUGGING_FACE_MODEL_API = "https://huggingface.co/api/models";
export const HUGGING_FACE_LEADERBOARD_DATASET_API =
  "https://huggingface.co/api/datasets/open-llm-leaderboard/results";
export const HUGGING_FACE_DATASET_RESOLVE_BASE =
  "https://huggingface.co/datasets/open-llm-leaderboard/results/resolve/main";

export const PWC_API_BASE = "https://paperswithcode.com/api/v1";
export const PWC_SITE_BASE = "https://paperswithcode.com";

export const ARTIFICIAL_ANALYSIS_LLMS_API =
  "https://artificialanalysis.ai/api/v2/data/llms/models";

export const OPENROUTER_MODELS_API = "https://openrouter.ai/api/v1/models";

export const HF_DATASETS_VIEWER_API =
  "https://datasets-server.huggingface.co/rows";

export const HF_DATASETS_SEARCH_API =
  "https://datasets-server.huggingface.co/search";

export const HF_LEADERBOARD_V2_DATASET = "open-llm-leaderboard/contents";

// HuggingFace org names for each canonical lab (used for per-author release queries)
export const LAB_HF_ORGS: Record<string, string[]> = {
  OpenAI: ["openai"],
  Anthropic: ["anthropic"],
  "Google DeepMind": ["google", "google-deepmind"],
  "Meta AI": ["meta-llama", "facebook"],
  "Mistral AI": ["mistralai"],
  "xAI (Grok)": ["xai"],
  Cohere: ["cohere"],
  "Alibaba (Qwen)": ["Qwen"],
  DeepSeek: ["deepseek"],
  "Baidu (ERNIE)": ["baidu"],
  "ByteDance (Doubao)": ["bytedance"],
  "Zhipu AI (GLM)": ["THUDM"],
  "Moonshot AI (Kimi)": ["moonshotai"],
  "01.AI (Yi)": ["01-ai"],
  Minimax: ["MiniMaxAI"],
  Baichuan: ["baichuan-inc"],
  "Perplexity (Sonar)": ["perplexity-ai"],
  "NVIDIA (Nemotron)": ["nvidia"],
  "Microsoft (Phi)": ["microsoft"],
};

export const REVALIDATE_SECONDS: Record<RouteKey, number> = {
  leaderboard: 12 * 60 * 60,
  releases: 6 * 60 * 60,
  benchmarks: 12 * 60 * 60,
  pricing: 24 * 60 * 60,
  github_releases: 6 * 60 * 60,
  semantic_scholar: 12 * 60 * 60,
  arxiv: 12 * 60 * 60,
  crossref: 12 * 60 * 60,
};

export const BENCHMARK_DEFAULTS = ["mmlu", "humaneval", "arc", "hellaswag", "mtbench"] as const;

export const DEFAULT_ROUTE_LIMITS: Record<RouteKey, number> = {
  leaderboard: 20,
  releases: 12,
  benchmarks: 12,
  pricing: 24,
  github_releases: 6,
  semantic_scholar: 12,
  arxiv: 12,
  crossref: 12,
};
