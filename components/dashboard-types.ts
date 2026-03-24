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

export type FeedState<T> = {
  data: T;
  error: string | null;
  lastSuccessAt: string;
  loading: boolean;
  sourceLabel: string;
};
