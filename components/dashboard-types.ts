export type Locale = "en" | "tr";

export type ReleaseItem = {
  id: string;
  lab: string;
  model: string;
  releasedAt: string;
  summary: string;
  url: string;
};

export type LeaderboardRow = {
  id: string;
  arc: number;
  hellaswag: number;
  humaneval: number;
  lab: string;
  mmlu: number;
  model: string;
  openSource: boolean;
  parameters: string;
  releasedAt: string;
  mtBench: number;
};

export type BenchmarkPoint = {
  id: string;
  date: string;
  lab: string;
  model: string;
  record: boolean;
  score: number;
};

export type PricePoint = {
  id: string;
  lab: string;
  model: string;
  params: number;
  pricePer1m: number;
  score: number;
};

export type AAModelRow = {
  id: string;
  model: string;
  lab: string;
  intelligenceIndex: number | null;
  codingIndex: number | null;
  agenticIndex: number | null;
  gpqa: number | null;
  mmluPro: number | null;
  terminalBenchHard: number | null;
  sweBench: number | null;
  pricePer1m: number | null;
  inputPricePer1m: number | null;
  outputPricePer1m: number | null;
  outputTokensPerSecond: number | null;
  ttftSeconds: number | null;
  endToEndSeconds: number | null;
  contextWindowTokens: number | null;
  openWeights: boolean;
  reasoning: boolean;
  releaseDate: string | null;
  modelUrl: string | null;
};

export type AiNewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceDisplay?: string;
  publisher?: string | null;
  description?: string | null;
  imageKind?: "photo" | "logo" | "none";
  publishedAt: string;
  timeAgo: string | null;
  imageUrl: string | null;
};

export type FeedState<T> = {
  data: T;
  error: string | null;
  lastSuccessAt: string;
  loading: boolean;
  sourceLabel: string;
};

export type AgentRow = {
  id: string;
  name: string;
  provider: string;
  score: number | null;
  tasksCompleted: number | null;
  successRate: number | null;
  latencyMs: number | null;
  source: string;
  updatedAt: string | null;
};

export type SkillRow = {
  id: string;
  view: "all_time" | "trending" | "hot";
  rank: number | null;
  skillId: string;
  skill: string;
  displayName?: string;
  provider: string | null;
  repository: string | null;
  description: string | null;
  category: string | null;
  officiality: "official" | "unofficial" | "unknown";
  installs: number | null;
  installsYesterday: number | null;
  change24h: number | null;
  delta24h?: number | null;
  matchConfidence: number | null;
  matchMethod: "strict" | "fuzzy" | "none" | null;
  primarySource: string;
  enrichedBy: string[];
  payload: Record<string, unknown>;
  updatedAt: string | null;
};

export type McpServerRow = {
  id: string;
  rank: number | null;
  serverId: string;
  server: string;
  displayName?: string;
  owner: string | null;
  repository: string | null;
  description: string | null;
  category: string | null;
  officiality: "official" | "unofficial" | "unknown";
  installs: number | null;
  delta24h?: number | null;
  primarySource: string;
  enrichedBy: string[];
  payload: Record<string, unknown>;
  updatedAt: string | null;
};
