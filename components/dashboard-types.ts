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
