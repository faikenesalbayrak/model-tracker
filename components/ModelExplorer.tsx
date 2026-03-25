import Image from "next/image";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ChevronsDown, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Lock, LockOpen } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ColumnTooltipLabel } from "./ColumnTooltipLabel";
import type { AAModelRow, AiNewsItem, Locale } from "./dashboard-types";

type ModelExplorerProps = {
  aaModels: AAModelRow[];
  aiNews: AiNewsItem[];
  locale: Locale;
  onSectionChange?: (section: SectionKey) => void;
};

type SummaryRow = {
  id: string;
  model: string;
  lab: string;
  intelligenceIndex: number | null;
  codingIndex: number | null;
  agenticIndex: number | null;
  contextWindowTokens: number | null;
  outputTokensPerSecond: number | null;
  releaseDate: string | null;
  openWeights: boolean;
};

type SummarySortKey =
  | "model"
  | "lab"
  | "intelligenceIndex"
  | "codingIndex"
  | "agenticIndex"
  | "contextWindowTokens"
  | "outputTokensPerSecond"
  | "releaseDate"
  | "openWeights";

type LlmSortKey =
  | "model"
  | "lab"
  | "intelligenceIndex"
  | "codingIndex"
  | "agenticIndex"
  | "gpqa"
  | "mmluPro"
  | "terminalBenchHard"
  | "sweBench"
  | "pricePer1m"
  | "inputPricePer1m"
  | "outputPricePer1m"
  | "outputTokensPerSecond"
  | "ttftSeconds"
  | "endToEndSeconds"
  | "contextWindowTokens"
  | "reasoning"
  | "openWeights"
  | "releaseDate";

type ReleaseWindow = "all" | "30d" | "90d" | "180d";
type OpenFilter = "all" | "open" | "closed";
type SectionKey = "general" | "llm" | "image" | "video" | "tts" | "stt" | "embeddings";
type CategoryKey = Exclude<SectionKey, "general" | "llm">;

type CategoryLeaderboardItem = {
  rank: number;
  model: string;
  lab: string;
  sourceModelId: string | null;
  canonicalModelKey: string | null;
  score: number | null;
  imageGenScore: number | null;
  imageEditScore: number | null;
  videoGenScore: number | null;
  imageToVideoScore: number | null;
  scoreUnit: string | null;
  modelUrl: string | null;
  isOpenSource: boolean | null;
  releaseDate: string | null;
  matchesPlayed: number | null;
  winRate: number | null;
  coverageBenchmarks: number | null;
  pricePer1m: number | null;
  inputPricePer1m: number | null;
  outputPricePer1m: number | null;
  contextWindowTokens: number | null;
  outputTokensPerSecond: number | null;
  ttftSeconds: number | null;
  endToEndSeconds: number | null;
  gpqa: number | null;
  mmluPro: number | null;
  terminalBenchHard: number | null;
  sweBench: number | null;
};

type CategorySortKey =
  | "rank"
  | "model"
  | "lab"
  | "score"
  | "imageGenScore"
  | "imageEditScore"
  | "videoGenScore"
  | "imageToVideoScore"
  | "pricePer1m"
  | "inputPricePer1m"
  | "outputPricePer1m"
  | "outputTokensPerSecond"
  | "matchesPlayed"
  | "winRate"
  | "coverageBenchmarks";

type CategoryColumn = {
  key: CategorySortKey;
  label: string;
  hint: {
    en: string;
    tr: string;
  };
  render: (row: CategoryLeaderboardItem) => string;
};

const LAB_LOGO_MAP: Array<{ pattern: RegExp; src: string }> = [
  { pattern: /openai/i, src: "/lab-logos/llmstats/openai.svg" },
  { pattern: /anthropic|claude/i, src: "/lab-logos/llmstats/anthropic.svg" },
  { pattern: /google|deepmind|gemini/i, src: "/lab-logos/llmstats/google.svg" },
  { pattern: /meta|llama/i, src: "/lab-logos/llmstats/meta.svg" },
  { pattern: /mistral/i, src: "/lab-logos/llmstats/mistral.svg" },
  { pattern: /xai|grok/i, src: "/lab-logos/llmstats/xai.svg" },
  { pattern: /cohere/i, src: "/lab-logos/llmstats/cohere.png" },
  { pattern: /alibaba|qwen/i, src: "/lab-logos/llmstats/qwen.png" },
  { pattern: /deepseek/i, src: "/lab-logos/llmstats/deepseek.webp" },
  { pattern: /baidu|ernie/i, src: "/lab-logos/llmstats/baidu.svg" },
  { pattern: /bytedance|doubao/i, src: "/lab-logos/llmstats/bytedance.webp" },
  { pattern: /zhipu|glm|z ai|zhipu ai/i, src: "/lab-logos/llmstats/zai-org.svg" },
  { pattern: /moonshot|kimi/i, src: "/lab-logos/llmstats/moonshotai.svg" },
  { pattern: /perplexity|sonar/i, src: "/lab-logos/llmstats/perplexity.png" },
  { pattern: /nvidia|nemotron/i, src: "/lab-logos/llmstats/nvidia.svg" },
  { pattern: /microsoft|phi/i, src: "/lab-logos/llmstats/microsoft.svg" },
  { pattern: /minimax/i, src: "/lab-logos/llmstats/minimax.webp" },
];

const copy = {
  en: {
    latestTitle: "Latest Releases",
    latestSubtitle: "Announced in the last 15 days",
    aiNewsTitle: "AI News",
    aiNewsSubtitle: "",
    aiNewsLinkLabel: "View all",
    summaryTitle: "Leaderboard",
    summarySubtitle:
      "Business-facing snapshot: context, speed, freshness, openness, and core quality metrics.",
    updated: "Updated",
    top20: "Top 20",
    noRows: "No model data available.",
    headers: {
      model: "Model",
      provider: "Provider",
      intelligence: "Intelligence",
      code: "Code",
      agentic: "Agentic",
      context: "Context",
      speed: "Tok/s",
      release: "Release",
      openSource: "Open Source",
    },
  },
  tr: {
    latestTitle: "Son Yayınlar",
    latestSubtitle: "Son 15 günde duyurulanlar",
    aiNewsTitle: "AI News",
    aiNewsSubtitle: "",
    aiNewsLinkLabel: "Tümünü gör",
    summaryTitle: "Sıralama",
    summarySubtitle:
      "İş odaklı hızlı görünüm: bağlam, hız, güncellik, açıklık ve çekirdek kalite metrikleri.",
    updated: "Güncellendi",
    top20: "İlk 20",
    noRows: "Model verisi bulunamadı.",
    headers: {
      model: "Model",
      provider: "Sağlayıcı",
      intelligence: "Intelligence",
      code: "Coding",
      agentic: "Agentic",
      context: "Context",
      speed: "Tok/s",
      release: "Yayın",
      openSource: "Açık Kaynak",
    },
  },
} as const;

const summaryHeaderHints = {
  en: {
    model: "Model name and variant in the selected feed.",
    provider: "Company or research lab that publishes the model.",
    intelligence: "Composite capability score across core evaluations.",
    code: "Coding-focused performance score.",
    agentic: "How consistently the model handles multi-step agent workflows.",
    context: "Maximum input context window size.",
    speed: "Average generated output tokens per second.",
    release: "Public release date of the model version.",
    openSource: "Whether the model weights are publicly available.",
    gpqa: "Graduate-level science QA benchmark score.",
    mmluPro: "Advanced general-knowledge benchmark score.",
    terminalBench: "Terminal task execution benchmark score.",
    sweBench: "Software engineering benchmark score (if provided by source).",
    blendedPrice: "Estimated blended cost per 1M tokens.",
    inputPrice: "Input token cost per 1M tokens.",
    outputPrice: "Output token cost per 1M tokens.",
    ttft: "Time-to-first-token latency in seconds.",
    e2eLatency: "End-to-end response latency in seconds.",
    reasoning: "Reasoning mode capability flag from source data.",
  },
  tr: {
    model: "Seçili akıştaki model adı ve varyantı.",
    provider: "Modeli yayınlayan şirket veya araştırma laboratuvarı.",
    intelligence: "Temel değerlendirmelerin birleşik yetenek skoru.",
    code: "Kodlama odaklı performans skoru.",
    agentic: "Çok adımlı ajan iş akışlarını yürütme tutarlılığı.",
    context: "Maksimum giriş bağlam penceresi boyutu.",
    speed: "Saniye başına ortalama çıktı token üretimi.",
    release: "Model sürümünün kamuya açık çıkış tarihi.",
    openSource: "Model ağırlıklarının herkese açık olup olmadığı.",
    gpqa: "Lisansüstü seviye bilim soru-cevap benchmark skoru.",
    mmluPro: "Gelişmiş genel bilgi benchmark skoru.",
    terminalBench: "Terminal görevlerini tamamlama benchmark skoru.",
    sweBench: "Kaynak sağlıyorsa yazılım mühendisliği benchmark skoru.",
    blendedPrice: "1M token için tahmini birleşik maliyet.",
    inputPrice: "1M giriş token maliyeti.",
    outputPrice: "1M çıktı token maliyeti.",
    ttft: "İlk token'a ulaşma süresi (saniye).",
    e2eLatency: "Uçtan uca yanıt gecikmesi (saniye).",
    reasoning: "Kaynak verideki akıl yürütme modu bayrağı.",
  },
} as const;

const CONTEXT_MIN_OPTIONS = [0, 32_000, 128_000, 256_000, 1_000_000] as const;
const LLM_ROW_LIMIT_OPTIONS = [20, 50, 100, 200, 500] as const;
const AI_NEWS_LIMIT = 16;
const COMPARE_DRAWER_ANIMATION_MS = 300;
const COMPARE_MODAL_ANIMATION_MS = 320;
const BLOCKED_NEWS_DOMAIN_PATTERN = /^https?:\/\/(?:www\.)?llm-?stats\.com(?:\/|$)/i;

const CATEGORY_TABLE_COLUMNS: Record<CategoryKey, CategoryColumn[]> = {
  image: [
    { key: "rank", label: "#", hint: { en: "Leaderboard rank in this category.", tr: "Bu kategorideki sıralama." }, render: (row) => String(row.rank) },
    { key: "model", label: "Model", hint: { en: "Model name and variant.", tr: "Model adı ve varyantı." }, render: (row) => row.model },
    { key: "lab", label: "Provider", hint: { en: "Company or lab publishing the model.", tr: "Modeli yayımlayan şirket veya laboratuvar." }, render: (row) => row.lab },
    { key: "score", label: "Overall", hint: { en: "Overall image score (combined summary).", tr: "Genel görsel skor (birleşik özet)." }, render: (row) => fmtNum(row.score, 2) },
    { key: "imageGenScore", label: "Image Gen", hint: { en: "Text-to-image generation score.", tr: "Text-to-image üretim skoru." }, render: (row) => fmtNum(row.imageGenScore, 2) },
    { key: "imageEditScore", label: "Image Edit", hint: { en: "Image-to-image editing score.", tr: "Image-to-image düzenleme skoru." }, render: (row) => fmtNum(row.imageEditScore, 2) },
    { key: "pricePer1m", label: "$/Gen", hint: { en: "Estimated price per generation/image.", tr: "Tahmini üretim/görsel başına fiyat." }, render: (row) => formatUsd(row.pricePer1m) },
    { key: "inputPricePer1m", label: "Input $/1M", hint: { en: "Input token price per 1M tokens if provided.", tr: "Varsa 1M giriş token fiyatı." }, render: (row) => formatUsd(row.inputPricePer1m) },
    { key: "outputPricePer1m", label: "Output $/1M", hint: { en: "Output token price per 1M tokens if provided.", tr: "Varsa 1M çıktı token fiyatı." }, render: (row) => formatUsd(row.outputPricePer1m) },
  ],
  video: [
    { key: "rank", label: "#", hint: { en: "Leaderboard rank in this category.", tr: "Bu kategorideki sıralama." }, render: (row) => String(row.rank) },
    { key: "model", label: "Model", hint: { en: "Model name and variant.", tr: "Model adı ve varyantı." }, render: (row) => row.model },
    { key: "lab", label: "Provider", hint: { en: "Company or lab publishing the model.", tr: "Modeli yayımlayan şirket veya laboratuvar." }, render: (row) => row.lab },
    { key: "score", label: "Overall", hint: { en: "Overall video score (combined summary).", tr: "Genel video skoru (birleşik özet)." }, render: (row) => fmtNum(row.score, 2) },
    { key: "videoGenScore", label: "Text-to-Video", hint: { en: "Text-to-video generation score.", tr: "Text-to-video üretim skoru." }, render: (row) => fmtNum(row.videoGenScore, 2) },
    { key: "imageToVideoScore", label: "Image-to-Video", hint: { en: "Image-to-video generation score.", tr: "Image-to-video üretim skoru." }, render: (row) => fmtNum(row.imageToVideoScore, 2) },
    { key: "pricePer1m", label: "$/Gen", hint: { en: "Estimated price per video generation.", tr: "Tahmini video üretim fiyatı." }, render: (row) => formatUsd(row.pricePer1m) },
    { key: "inputPricePer1m", label: "Input $/1M", hint: { en: "Input token price per 1M tokens if provided.", tr: "Varsa 1M giriş token fiyatı." }, render: (row) => formatUsd(row.inputPricePer1m) },
    { key: "outputPricePer1m", label: "Output $/1M", hint: { en: "Output token price per 1M tokens if provided.", tr: "Varsa 1M çıktı token fiyatı." }, render: (row) => formatUsd(row.outputPricePer1m) },
    { key: "outputTokensPerSecond", label: "S/Second", hint: { en: "Generation speed metric from source throughput (higher is better).", tr: "Kaynağın throughput hız metriği (yüksek daha iyi)." }, render: (row) => fmtNum(row.outputTokensPerSecond, 1) },
  ],
  tts: [
    { key: "rank", label: "#", hint: { en: "Leaderboard rank in this category.", tr: "Bu kategorideki sıralama." }, render: (row) => String(row.rank) },
    { key: "model", label: "Model", hint: { en: "Model name and variant.", tr: "Model adı ve varyantı." }, render: (row) => row.model },
    { key: "lab", label: "Provider", hint: { en: "Company or lab publishing the model.", tr: "Modeli yayımlayan şirket veya laboratuvar." }, render: (row) => row.lab },
    { key: "score", label: "Arena Score", hint: { en: "Arena Elo-style TTS performance score.", tr: "Arena Elo benzeri TTS performans skoru." }, render: (row) => fmtNum(row.score, 2) },
    { key: "matchesPlayed", label: "Matches", hint: { en: "Number of arena matchups used in ranking.", tr: "Sıralamada kullanılan arena karşılaşma sayısı." }, render: (row) => fmtNum(row.matchesPlayed, 0) },
    { key: "winRate", label: "Win Rate %", hint: { en: "Head-to-head win percentage.", tr: "İkili karşılaşmalardaki kazanma yüzdesi." }, render: (row) => fmtNum(row.winRate, 1) },
  ],
  stt: [
    { key: "rank", label: "#", hint: { en: "Leaderboard rank in this category.", tr: "Bu kategorideki sıralama." }, render: (row) => String(row.rank) },
    { key: "model", label: "Model", hint: { en: "Model name and variant.", tr: "Model adı ve varyantı." }, render: (row) => row.model },
    { key: "lab", label: "Provider", hint: { en: "Company or lab publishing the model.", tr: "Modeli yayımlayan şirket veya laboratuvar." }, render: (row) => row.lab },
    { key: "score", label: "Arena Score", hint: { en: "Arena Elo-style STT performance score.", tr: "Arena Elo benzeri STT performans skoru." }, render: (row) => fmtNum(row.score, 2) },
    { key: "matchesPlayed", label: "Matches", hint: { en: "Number of arena matchups used in ranking.", tr: "Sıralamada kullanılan arena karşılaşma sayısı." }, render: (row) => fmtNum(row.matchesPlayed, 0) },
    { key: "winRate", label: "Win Rate %", hint: { en: "Head-to-head win percentage.", tr: "İkili karşılaşmalardaki kazanma yüzdesi." }, render: (row) => fmtNum(row.winRate, 1) },
    { key: "inputPricePer1m", label: "Input $/1M", hint: { en: "Input token price per 1M tokens if provided.", tr: "Varsa 1M giriş token fiyatı." }, render: (row) => formatUsd(row.inputPricePer1m) },
  ],
  embeddings: [
    { key: "rank", label: "#", hint: { en: "Leaderboard rank in this category.", tr: "Bu kategorideki sıralama." }, render: (row) => String(row.rank) },
    { key: "model", label: "Model", hint: { en: "Model name and variant.", tr: "Model adı ve varyantı." }, render: (row) => row.model },
    { key: "lab", label: "Provider", hint: { en: "Company or lab publishing the model.", tr: "Modeli yayımlayan şirket veya laboratuvar." }, render: (row) => row.lab },
    { key: "score", label: "Benchmark Score", hint: { en: "Aggregated embedding benchmark score.", tr: "Birleşik embedding benchmark skoru." }, render: (row) => fmtNum(row.score, 2) },
    { key: "coverageBenchmarks", label: "Benchmarks", hint: { en: "How many benchmark sets are covered.", tr: "Kapsanan benchmark seti sayısı." }, render: (row) => fmtNum(row.coverageBenchmarks, 0) },
  ],
};

function formatSourceDisplayName(sourceName: string | null): string {
  switch (sourceName) {
    case "llm_stats_image_generation":
      return "ZeroEval Magia Arena (image)";
    case "llm_stats_video_generation":
      return "ZeroEval Magia Arena (video)";
    case "llm_stats_text_to_speech":
      return "ZeroEval Magia Arena (text-to-speech)";
    case "llm_stats_speech_to_text":
      return "ZeroEval Magia Arena (speech-to-text)";
    case "llm_stats_embeddings":
      return "ZeroEval Category Benchmarks (search/embeddings)";
    default:
      return sourceName ?? "source";
  }
}

function normalizeCompareKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function modelVendorCompareKey(model: string, vendor: string): string {
  return `${normalizeCompareKey(vendor)}:${normalizeCompareKey(model)}`;
}

function formatProviderName(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "Unknown";
  if (/^openai$/i.test(normalized)) return "OpenAI";
  if (/^xai$/i.test(normalized)) return "xAI";
  if (/^meta$/i.test(normalized)) return "Meta";
  if (/^google$/i.test(normalized)) return "Google";
  if (/^mistral$/i.test(normalized)) return "Mistral";
  if (/^anthropic$/i.test(normalized)) return "Anthropic";
  if (/^deepseek$/i.test(normalized)) return "DeepSeek";
  if (/^qwen$/i.test(normalized)) return "Qwen";
  if (/^alibaba$/i.test(normalized)) return "Alibaba";
  if (/^cohere$/i.test(normalized)) return "Cohere";
  if (/^perplexity$/i.test(normalized)) return "Perplexity";
  if (/^microsoft$/i.test(normalized)) return "Microsoft";
  return normalized
    .split(/\s+/)
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function describeCategoryScore(
  scoreUnit: string | null,
  sourceName: string | null,
  locale: Locale,
): string {
  const source = formatSourceDisplayName(sourceName);

  if (scoreUnit?.includes("avg_conservative_rating")) {
    return locale === "tr"
      ? `Kaynak: ${source}. Bu skor, ilgili alt arenalardaki conservative rating değerlerinin ortalamasıdır. Yüksek olması daha iyi performans demektir. Yüzde değildir; arena tabanlı göreli bir rating ölçeğidir.`
      : `Source: ${source}. This score is the average conservative rating across relevant sub-arenas. Higher is better. It is not a percentage; it is an arena-based relative rating scale.`;
  }

  if (scoreUnit?.includes("conservative_rating")) {
    return locale === "tr"
      ? `Kaynak: ${source}. Bu skor, tek bir arena leaderboard'ındaki conservative rating değeridir. Yüksek olması daha iyi performans demektir. Yüzde değildir; göreli bir rating skorudur.`
      : `Source: ${source}. This score is the conservative rating from a single arena leaderboard. Higher is better. It is not a percentage; it is a relative rating score.`;
  }

  if (scoreUnit?.includes("avg_normalized_score")) {
    return locale === "tr"
      ? `Kaynak: ${source}. Bu skor, birden fazla benchmark setindeki normalize edilmiş puanların ortalamasıdır. Yüksek olması daha iyi performans demektir.`
      : `Source: ${source}. This score is the average of normalized scores across multiple benchmark sets. Higher is better.`;
  }

  return locale === "tr"
    ? `Kaynak: ${source}. Bu kategori için birincil performans skorudur; yüksek değer daha iyi performansı ifade eder.`
    : `Source: ${source}. This is the primary performance score for this category; higher means better performance.`;
}
const MOCK_AI_NEWS: AiNewsItem[] = [
  {
    id: "mock-news-1",
    title: "Open-source coding copilots race heats up with faster local inference stacks",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T09:00:00.000Z",
    timeAgo: "now",
    imageUrl: "/mock-news/open-source-copilot.svg",
  },
  {
    id: "mock-news-2",
    title: "New multimodal benchmark wave spotlights reasoning + vision consistency",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T08:00:00.000Z",
    timeAgo: "1h",
    imageUrl: "/mock-news/multimodal-benchmarks.svg",
  },
  {
    id: "mock-news-3",
    title: "AI infra teams optimize token latency with smarter routing strategies",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T07:00:00.000Z",
    timeAgo: "2h",
    imageUrl: "/mock-news/token-latency-routing.svg",
  },
  {
    id: "mock-news-4",
    title: "Frontier model pricing pressure pushes providers toward bundle plans",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T06:00:00.000Z",
    timeAgo: "3h",
    imageUrl: "/mock-news/pricing-bundles.svg",
  },
  {
    id: "mock-news-5",
    title: "Agent workflow templates become default in enterprise AI operations",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T05:00:00.000Z",
    timeAgo: "4h",
    imageUrl: "/mock-news/open-source-copilot.svg",
  },
  {
    id: "mock-news-6",
    title: "Smaller reasoning models gain traction thanks to lower latency targets",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T04:00:00.000Z",
    timeAgo: "5h",
    imageUrl: "/mock-news/token-latency-routing.svg",
  },
  {
    id: "mock-news-7",
    title: "Cloud AI teams roll out weekly benchmark snapshots for product planning",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T03:00:00.000Z",
    timeAgo: "6h",
    imageUrl: "/mock-news/multimodal-benchmarks.svg",
  },
  {
    id: "mock-news-8",
    title: "Model monitoring stacks adopt tighter alerting for output quality drift",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T02:00:00.000Z",
    timeAgo: "7h",
    imageUrl: "/mock-news/pricing-bundles.svg",
  },
  {
    id: "mock-news-9",
    title: "Prompt evaluation suites expand multilingual regression checks",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T01:00:00.000Z",
    timeAgo: "8h",
    imageUrl: "/mock-news/open-source-copilot.svg",
  },
  {
    id: "mock-news-10",
    title: "Teams combine retrieval and reasoning layers for faster support agents",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-24T00:00:00.000Z",
    timeAgo: "9h",
    imageUrl: "/mock-news/token-latency-routing.svg",
  },
  {
    id: "mock-news-11",
    title: "Evaluation dashboards add side-by-side quality trend diffing by release",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-23T23:00:00.000Z",
    timeAgo: "10h",
    imageUrl: "/mock-news/multimodal-benchmarks.svg",
  },
  {
    id: "mock-news-12",
    title: "Inference gateways cut costs with adaptive model-tier fallback policies",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-23T22:00:00.000Z",
    timeAgo: "11h",
    imageUrl: "/mock-news/pricing-bundles.svg",
  },
  {
    id: "mock-news-13",
    title: "Vision-language product teams prioritize temporal consistency tests",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-23T21:00:00.000Z",
    timeAgo: "12h",
    imageUrl: "/mock-news/token-latency-routing.svg",
  },
  {
    id: "mock-news-14",
    title: "Open model hosts roll out per-region failover for enterprise workloads",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-23T20:00:00.000Z",
    timeAgo: "13h",
    imageUrl: "/mock-news/open-source-copilot.svg",
  },
  {
    id: "mock-news-15",
    title: "Prompt libraries introduce stricter version pinning for reliability",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-23T19:00:00.000Z",
    timeAgo: "14h",
    imageUrl: "/mock-news/multimodal-benchmarks.svg",
  },
  {
    id: "mock-news-16",
    title: "Applied AI teams benchmark support agents on conversation resolution rate",
    link: "",
    source: "Mock Feed",
    publishedAt: "2026-03-23T18:00:00.000Z",
    timeAgo: "15h",
    imageUrl: "/mock-news/pricing-bundles.svg",
  },
];

export function ModelExplorer({ aaModels, aiNews, locale, onSectionChange }: ModelExplorerProps) {
  const strings = copy[locale];
  const headerHints = summaryHeaderHints[locale];
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [openFilter, setOpenFilter] = useState<OpenFilter>("all");
  const [releaseWindow, setReleaseWindow] = useState<ReleaseWindow>("all");
  const [contextMin, setContextMin] = useState<number>(0);
  const [llmQuery, setLlmQuery] = useState("");
  const [llmProviderFilter, setLlmProviderFilter] = useState("all");
  const [llmOpenFilter, setLlmOpenFilter] = useState<OpenFilter>("all");
  const [llmReleaseWindow, setLlmReleaseWindow] = useState<ReleaseWindow>("all");
  const [llmContextMin, setLlmContextMin] = useState<number>(0);
  const [llmReasoningOnly, setLlmReasoningOnly] = useState(false);
  const [summaryRowLimit, setSummaryRowLimit] = useState<(typeof LLM_ROW_LIMIT_OPTIONS)[number]>(20);
  const [llmRowLimit, setLlmRowLimit] = useState<(typeof LLM_ROW_LIMIT_OPTIONS)[number]>(20);
  const [categoryRowLimit, setCategoryRowLimit] = useState<(typeof LLM_ROW_LIMIT_OPTIONS)[number]>(20);
  const [summarySortKey, setSummarySortKey] = useState<SummarySortKey>("intelligenceIndex");
  const [summarySortDirection, setSummarySortDirection] = useState<"asc" | "desc">("desc");
  const [llmSortKey, setLlmSortKey] = useState<LlmSortKey>("intelligenceIndex");
  const [llmSortDirection, setLlmSortDirection] = useState<"asc" | "desc">("desc");
  const [activeSection, setActiveSection] = useState<SectionKey>("general");
  const [categoryRows, setCategoryRows] = useState<CategoryLeaderboardItem[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categorySourceName, setCategorySourceName] = useState<string | null>(null);
  const [categorySnapshotAt, setCategorySnapshotAt] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryProviderFilter, setCategoryProviderFilter] = useState("all");
  const [categoryOpenFilter, setCategoryOpenFilter] = useState<OpenFilter>("all");
  const [categorySortKey, setCategorySortKey] = useState<CategorySortKey>("rank");
  const [categorySortDirection, setCategorySortDirection] = useState<"asc" | "desc">("asc");
  const [nowTs, setNowTs] = useState(0);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareModalData, setCompareModalData] = useState<CompareData | null>(null);
  const [isCompareModalExiting, setIsCompareModalExiting] = useState(false);
  const [compareDrawerData, setCompareDrawerData] = useState<CompareData | null>(null);
  const [isCompareDrawerExiting, setIsCompareDrawerExiting] = useState(false);

  useEffect(() => {
    onSectionChange?.(activeSection);
  }, [activeSection, onSectionChange]);

  useEffect(() => {
    const sectionToCategory: Record<CategoryKey, string> = {
      image: "image_generation",
      video: "video_generation",
      tts: "text_to_speech",
      stt: "speech_to_text",
      embeddings: "embeddings",
    };

    if (activeSection === "general" || activeSection === "llm") {
      setCategoryRows([]);
      setCategoryLoading(false);
      setCategoryError(null);
      setCategorySourceName(null);
      setCategorySnapshotAt(null);
      return;
    }

    const category = sectionToCategory[activeSection as CategoryKey];
    let alive = true;
    setCategoryLoading(true);
    setCategoryError(null);
    setCategoryQuery("");
    setCategoryProviderFilter("all");
    setCategoryOpenFilter("all");
    setCategorySortKey("rank");
    setCategorySortDirection("asc");

    void fetch(`/api/monitoring/leaderboard?category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<{
          sourceName?: string | null;
          snapshotAt?: string | null;
          data?: Array<Record<string, unknown>>;
        }>;
      })
      .then((payload) => {
        if (!alive) return;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        const normalizePositiveValue = (value: unknown): number | null =>
          typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
        const normalizeBenchmarkScore = (value: unknown): number | null => {
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
          if (value <= 1) return value * 100;
          return value;
        };
        const normalized = rows
          .map((row) => ({
            rank: typeof row.rank === "number" ? row.rank : Number(row.rank ?? 0),
            model: typeof row.model === "string" ? row.model : "Unknown model",
            lab: typeof row.lab === "string" ? row.lab : "Unknown",
            sourceModelId: typeof row.sourceModelId === "string" ? row.sourceModelId : null,
            canonicalModelKey: typeof row.canonicalModelKey === "string" ? row.canonicalModelKey : null,
            score: typeof row.score === "number" ? row.score : null,
            imageGenScore: normalizeBenchmarkScore(
              typeof row.image_gen_score === "number" ? row.image_gen_score : row.imageGenScore,
            ),
            imageEditScore: normalizeBenchmarkScore(
              typeof row.image_edit_score === "number" ? row.image_edit_score : row.imageEditScore,
            ),
            videoGenScore: normalizeBenchmarkScore(
              typeof row.video_gen_score === "number" ? row.video_gen_score : row.videoGenScore,
            ),
            imageToVideoScore: normalizeBenchmarkScore(
              typeof row.image_to_video_score === "number" ? row.image_to_video_score : row.imageToVideoScore,
            ),
            scoreUnit: typeof row.scoreUnit === "string" ? row.scoreUnit : null,
            modelUrl: typeof row.modelUrl === "string" ? row.modelUrl : null,
            isOpenSource:
              typeof row.is_open_source === "boolean"
                ? row.is_open_source
                : typeof row.isOpenSource === "boolean"
                  ? row.isOpenSource
                  : null,
            releaseDate: typeof row.release_date === "string" ? row.release_date : null,
            matchesPlayed: normalizePositiveValue(
              typeof row.matches_played === "number" ? row.matches_played : row.matchesPlayed,
            ),
            winRate: normalizePositiveValue(
              typeof row.win_rate === "number" ? row.win_rate : row.winRate,
            ),
            coverageBenchmarks: normalizePositiveValue(
              typeof row.coverage_benchmarks === "number" ? row.coverage_benchmarks : row.coverageBenchmarks,
            ),
            pricePer1m: normalizePositiveValue(
              typeof row.price_1m_blended_3_to_1 === "number" ? row.price_1m_blended_3_to_1 : row.pricePer1m,
            ),
            inputPricePer1m: normalizePositiveValue(
              typeof row.price_1m_input_tokens === "number" ? row.price_1m_input_tokens : row.inputPricePer1m,
            ),
            outputPricePer1m: normalizePositiveValue(
              typeof row.price_1m_output_tokens === "number" ? row.price_1m_output_tokens : row.outputPricePer1m,
            ),
            contextWindowTokens: normalizePositiveValue(
              typeof row.context_window_tokens === "number" ? row.context_window_tokens : row.contextWindowTokens,
            ),
            outputTokensPerSecond: normalizePositiveValue(
              typeof row.output_tokens_per_second === "number" ? row.output_tokens_per_second : row.outputTokensPerSecond,
            ),
            ttftSeconds: normalizePositiveValue(
              typeof row.ttft_seconds === "number" ? row.ttft_seconds : row.ttftSeconds,
            ),
            endToEndSeconds: normalizePositiveValue(
              typeof row.end_to_end_seconds === "number" ? row.end_to_end_seconds : row.endToEndSeconds,
            ),
            gpqa: normalizeBenchmarkScore(row.gpqa),
            mmluPro: normalizeBenchmarkScore(typeof row.mmlu_pro === "number" ? row.mmlu_pro : row.mmluPro),
            terminalBenchHard: normalizeBenchmarkScore(
              typeof row.terminalbench_hard === "number" ? row.terminalbench_hard : row.terminalBenchHard,
            ),
            sweBench: normalizeBenchmarkScore(typeof row.swe_bench === "number" ? row.swe_bench : row.sweBench),
          }))
          .filter((row) => Number.isFinite(row.rank) && row.rank > 0)
          .sort((a, b) => a.rank - b.rank);

        setCategoryRows(normalized);
        setCategorySourceName(payload.sourceName ?? null);
        setCategorySnapshotAt(payload.snapshotAt ?? null);
      })
      .catch((error) => {
        if (!alive) return;
        setCategoryError(error instanceof Error ? error.message : "Category feed unavailable");
        setCategoryRows([]);
        setCategorySourceName(null);
        setCategorySnapshotAt(null);
      })
      .finally(() => {
        if (!alive) return;
        setCategoryLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [activeSection]);

  useEffect(() => {
    const tick = () => setNowTs(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!compareModalData) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [compareModalData]);

  const latestModels = useMemo(
    () =>
      aaModels
        .filter((row) => row.releaseDate)
        .sort((a, b) => toMs(b.releaseDate) - toMs(a.releaseDate))
        .slice(0, 6),
    [aaModels],
  );
  const aiNewsPreview = useMemo(() => {
    const primary = [...(aiNews.length > 0 ? aiNews : MOCK_AI_NEWS)]
      .sort((left, right) => toMs(right.publishedAt) - toMs(left.publishedAt));
    const merged = [...primary];
    if (merged.length < AI_NEWS_LIMIT) {
      for (const mock of MOCK_AI_NEWS) {
        if (merged.length >= AI_NEWS_LIMIT) break;
        if (merged.some((item) => item.id === mock.id || item.link === mock.link)) continue;
        merged.push(mock);
      }
    }

    return merged.slice(0, AI_NEWS_LIMIT).map((item, index) => ({
      ...item,
      imageUrl: item.imageUrl || MOCK_AI_NEWS[index % MOCK_AI_NEWS.length]?.imageUrl || null,
    }));
  }, [aiNews]);
  const showAiNewsScrollHint = aiNewsPreview.length > 4;

  const summaryRows = useMemo<SummaryRow[]>(
    () =>
      [...aaModels].map((row) => ({
        id: row.id,
        model: row.model,
        lab: row.lab,
        intelligenceIndex: row.intelligenceIndex,
        codingIndex: row.codingIndex,
        agenticIndex: row.agenticIndex,
        contextWindowTokens: row.contextWindowTokens,
        outputTokensPerSecond: row.outputTokensPerSecond,
        releaseDate: row.releaseDate,
        openWeights: row.openWeights,
      })),
    [aaModels],
  );
  const aaById = useMemo(
    () => new Map(aaModels.map((item) => [item.id, item])),
    [aaModels],
  );
  const aaIdByModelVendor = useMemo(
    () => new Map(aaModels.map((item) => [modelVendorCompareKey(item.model, item.lab), item.id])),
    [aaModels],
  );
  const validSelectedModelIds = useMemo(
    () => selectedModelIds.filter((id) => aaById.has(id)).slice(0, 2),
    [aaById, selectedModelIds],
  );
  const selectedModels = useMemo(
    () => validSelectedModelIds.map((id) => aaById.get(id)).filter((item): item is AAModelRow => Boolean(item)),
    [aaById, validSelectedModelIds],
  );
  const selectedIdSet = useMemo(() => new Set(validSelectedModelIds), [validSelectedModelIds]);
  const selectionLimitReached = validSelectedModelIds.length >= 2;
  const compareData = useMemo(
    () => (selectedModels.length === 2 ? buildCompareData(selectedModels[0], selectedModels[1], locale) : null),
    [locale, selectedModels],
  );

  useEffect(() => {
    if (compareData) {
      const frameId = window.requestAnimationFrame(() => {
        setCompareDrawerData(compareData);
        setIsCompareDrawerExiting(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }
    if (!compareDrawerData) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      setIsCompareDrawerExiting(true);
    });
    const timer = window.setTimeout(() => {
      setCompareDrawerData(null);
      setIsCompareDrawerExiting(false);
    }, COMPARE_DRAWER_ANIMATION_MS);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
    };
  }, [compareData, compareDrawerData]);

  useEffect(() => {
    if (compareModalOpen && compareData) {
      const frameId = window.requestAnimationFrame(() => {
        setCompareModalData(compareData);
        setIsCompareModalExiting(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }
    if (!compareModalData) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      setIsCompareModalExiting(true);
    });
    const timer = window.setTimeout(() => {
      setCompareModalData(null);
      setIsCompareModalExiting(false);
    }, COMPARE_MODAL_ANIMATION_MS);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer);
    };
  }, [compareData, compareModalData, compareModalOpen]);

  const providerOptions = useMemo(
    () =>
      Array.from(new Set(summaryRows.map((row) => row.lab)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [summaryRows],
  );

  const filteredRows = useMemo(() => {
    const releaseWindowMs =
      releaseWindow === "30d"
        ? 30 * 24 * 60 * 60 * 1000
        : releaseWindow === "90d"
          ? 90 * 24 * 60 * 60 * 1000
          : releaseWindow === "180d"
            ? 180 * 24 * 60 * 60 * 1000
            : 0;
    const queryText = query.trim().toLowerCase();

    return summaryRows.filter((row) => {
      if (queryText) {
        const haystack = `${row.model} ${row.lab}`.toLowerCase();
        if (!haystack.includes(queryText)) {
          return false;
        }
      }

      if (providerFilter !== "all" && row.lab !== providerFilter) {
        return false;
      }

      if (openFilter === "open" && !row.openWeights) {
        return false;
      }
      if (openFilter === "closed" && row.openWeights) {
        return false;
      }

      if (releaseWindowMs > 0) {
        const releasedAt = toMs(row.releaseDate);
        if (!releasedAt || nowTs - releasedAt > releaseWindowMs) {
          return false;
        }
      }

      if (contextMin > 0) {
        const ctx = row.contextWindowTokens ?? 0;
        if (ctx < contextMin) {
          return false;
        }
      }

      return true;
    });
  }, [summaryRows, query, providerFilter, openFilter, releaseWindow, contextMin, nowTs]);

  const filteredRowsLlm = useMemo(() => {
    const releaseWindowMs =
      llmReleaseWindow === "30d"
        ? 30 * 24 * 60 * 60 * 1000
        : llmReleaseWindow === "90d"
          ? 90 * 24 * 60 * 60 * 1000
          : llmReleaseWindow === "180d"
            ? 180 * 24 * 60 * 60 * 1000
            : 0;
    const queryText = llmQuery.trim().toLowerCase();

    return summaryRows.filter((row) => {
      if (queryText) {
        const haystack = `${row.model} ${row.lab}`.toLowerCase();
        if (!haystack.includes(queryText)) {
          return false;
        }
      }

      if (llmProviderFilter !== "all" && row.lab !== llmProviderFilter) {
        return false;
      }

      if (llmOpenFilter === "open" && !row.openWeights) {
        return false;
      }
      if (llmOpenFilter === "closed" && row.openWeights) {
        return false;
      }

      if (releaseWindowMs > 0) {
        const releasedAt = toMs(row.releaseDate);
        if (!releasedAt || nowTs - releasedAt > releaseWindowMs) {
          return false;
        }
      }

      if (llmContextMin > 0) {
        const ctx = row.contextWindowTokens ?? 0;
        if (ctx < llmContextMin) {
          return false;
        }
      }

      if (llmReasoningOnly) {
        const raw = aaById.get(row.id);
        if (!raw?.reasoning) {
          return false;
        }
      }

      return true;
    });
  }, [
    aaById,
    summaryRows,
    llmQuery,
    llmProviderFilter,
    llmOpenFilter,
    llmReleaseWindow,
    llmContextMin,
    llmReasoningOnly,
    nowTs,
  ]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let result = 0;

      if (summarySortKey === "model" || summarySortKey === "lab") {
        result = a[summarySortKey].localeCompare(b[summarySortKey]);
      } else if (summarySortKey === "releaseDate") {
        result = toMs(a.releaseDate) - toMs(b.releaseDate);
      } else if (summarySortKey === "openWeights") {
        result = Number(a.openWeights) - Number(b.openWeights);
      } else {
        const left = numericSortValue(a[summarySortKey]);
        const right = numericSortValue(b[summarySortKey]);
        result = left - right;
      }

      return summarySortDirection === "asc" ? result : -result;
    });
  }, [filteredRows, summarySortDirection, summarySortKey]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / summaryRowLimit));
  const clampedPage = Math.min(page, pageCount - 1);
  const visibleRows = sortedRows.slice(
    clampedPage * summaryRowLimit,
    clampedPage * summaryRowLimit + summaryRowLimit,
  );
  const openSourceTooltip = locale === "tr" ? "Open Source" : "Open Source";
  const closedSourceTooltip = locale === "tr" ? "Open Source Değil" : "Not Open Source";
  const filteredIdSet = useMemo(() => new Set(filteredRowsLlm.map((row) => row.id)), [filteredRowsLlm]);
  const llmRows = useMemo(
    () =>
      aaModels
        .filter((row) => filteredIdSet.has(row.id))
        .sort((a, b) => {
          let result = 0;
          if (llmSortKey === "model" || llmSortKey === "lab") {
            result = a[llmSortKey].localeCompare(b[llmSortKey]);
          } else if (llmSortKey === "releaseDate") {
            result = toMs(a.releaseDate) - toMs(b.releaseDate);
          } else if (llmSortKey === "openWeights" || llmSortKey === "reasoning") {
            result = Number(a[llmSortKey]) - Number(b[llmSortKey]);
          } else {
            const left = numericSortValue(a[llmSortKey]);
            const right = numericSortValue(b[llmSortKey]);
            result = left - right;
          }
          return llmSortDirection === "asc" ? result : -result;
        }),
    [aaModels, filteredIdSet, llmSortDirection, llmSortKey],
  );
  const llmRankById = useMemo(() => {
    const ranked = [...aaModels].sort((left, right) => {
      const leftScore = numericSortValue(left.intelligenceIndex);
      const rightScore = numericSortValue(right.intelligenceIndex);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.model.localeCompare(right.model);
    });
    return new Map(ranked.map((row, index) => [row.id, index + 1]));
  }, [aaModels]);
  const llmVisibleRows = useMemo(() => llmRows.slice(0, llmRowLimit), [llmRows, llmRowLimit]);
  const sections = [
    { key: "general" as const, label: locale === "tr" ? "Genel" : "General" },
    { key: "llm" as const, label: "LLM" },
    { key: "image" as const, label: "Image Generation" },
    { key: "video" as const, label: "Video Generation" },
    { key: "tts" as const, label: "Text-to-Speech" },
    { key: "stt" as const, label: "Speech-to-Text" },
    { key: "embeddings" as const, label: "Embeddings" },
  ];
  const categorySectionKey = (
    activeSection === "image" ||
    activeSection === "video" ||
    activeSection === "tts" ||
    activeSection === "stt" ||
    activeSection === "embeddings"
  )
    ? activeSection
    : null;
  const categoryProviderOptions = useMemo(
    () =>
      Array.from(new Set(categoryRows.map((row) => row.lab)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [categoryRows],
  );
  const visibleCategoryColumns = categorySectionKey
    ? CATEGORY_TABLE_COLUMNS[categorySectionKey].filter((column) => column.key !== "rank")
    : [];
  const categoryFilteredRows = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    return categoryRows.filter((row) => {
      if (q) {
        const hay = `${row.model} ${row.lab}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (categoryProviderFilter !== "all" && row.lab !== categoryProviderFilter) {
        return false;
      }
      if (categoryOpenFilter === "open" && row.isOpenSource !== true) {
        return false;
      }
      if (categoryOpenFilter === "closed" && row.isOpenSource !== false) {
        return false;
      }
      return true;
    });
  }, [categoryOpenFilter, categoryProviderFilter, categoryQuery, categoryRows]);
  const categoryVisibleRows = useMemo(() => {
    return [...categoryFilteredRows].sort((left, right) => {
      if (categorySortKey === "rank") {
        const result = left.rank - right.rank;
        return categorySortDirection === "asc" ? result : -result;
      }
      if (categorySortKey === "model" || categorySortKey === "lab") {
        const result = left[categorySortKey].localeCompare(right[categorySortKey]);
        return categorySortDirection === "asc" ? result : -result;
      }
      const l = numericSortValue(left[categorySortKey] as number | null);
      const r = numericSortValue(right[categorySortKey] as number | null);
      const result = l - r;
      return categorySortDirection === "asc" ? result : -result;
    });
  }, [categoryFilteredRows, categorySortDirection, categorySortKey]);
  const categoryLimitedRows = useMemo(
    () => categoryVisibleRows.slice(0, categoryRowLimit),
    [categoryRowLimit, categoryVisibleRows],
  );
  const categoryScoreUnit = useMemo(
    () => categoryRows.find((row) => typeof row.scoreUnit === "string" && row.scoreUnit.length > 0)?.scoreUnit ?? null,
    [categoryRows],
  );
  const isLlmSection = activeSection === "llm";
  const activeQuery = isLlmSection ? llmQuery : query;
  const activeProviderFilter = isLlmSection ? llmProviderFilter : providerFilter;
  const activeOpenFilter = isLlmSection ? llmOpenFilter : openFilter;
  const activeReleaseWindow = isLlmSection ? llmReleaseWindow : releaseWindow;
  const activeContextMin = isLlmSection ? llmContextMin : contextMin;
  const filtersPanel = (
    <div
      className="mb-2 rounded-2xl p-4"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-card)",
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {locale === "tr" ? "Filtreler" : "Filters"}
        </p>
        <button
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={() => {
            if (isLlmSection) {
              setLlmQuery("");
              setLlmProviderFilter("all");
              setLlmOpenFilter("all");
              setLlmReleaseWindow("all");
              setLlmContextMin(0);
              setLlmReasoningOnly(false);
              return;
            }
            setQuery("");
            setProviderFilter("all");
            setOpenFilter("all");
            setReleaseWindow("all");
            setContextMin(0);
          }}
          type="button"
        >
          <RotateCcw className="h-3 w-3" />
          {locale === "tr" ? "Sıfırla" : "Reset"}
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isLlmSection ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
        <label className="flex flex-col">
          <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {locale === "tr" ? "Ara" : "Search"}
          </span>
          <input
            className="h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
              color: "var(--text)",
            }}
            onChange={(event) => (isLlmSection ? setLlmQuery(event.target.value) : setQuery(event.target.value))}
            placeholder={locale === "tr" ? "Model veya sağlayıcı" : "Model or provider"}
            type="text"
            value={activeQuery}
          />
        </label>

        <label className="flex flex-col">
          <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {locale === "tr" ? "Sağlayıcı" : "Provider"}
          </span>
          <select
            className="h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
              color: "var(--text)",
            }}
            onChange={(event) => (isLlmSection ? setLlmProviderFilter(event.target.value) : setProviderFilter(event.target.value))}
            value={activeProviderFilter}
          >
            <option value="all">{locale === "tr" ? "Tümü" : "All"}</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col">
          <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {locale === "tr" ? "Açık Kaynak" : "Open Source"}
          </span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            onChange={(event) => (isLlmSection ? setLlmOpenFilter(event.target.value as OpenFilter) : setOpenFilter(event.target.value as OpenFilter))}
            value={activeOpenFilter}
          >
            <option value="all">{locale === "tr" ? "Tümü" : "All"}</option>
            <option value="open">{locale === "tr" ? "Açık" : "Open"}</option>
            <option value="closed">{locale === "tr" ? "Kilitli" : "Closed"}</option>
          </select>
        </label>

        <label className="flex flex-col">
          <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {locale === "tr" ? "Yayın" : "Release"}
          </span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            onChange={(event) => (isLlmSection ? setLlmReleaseWindow(event.target.value as ReleaseWindow) : setReleaseWindow(event.target.value as ReleaseWindow))}
            value={activeReleaseWindow}
          >
            <option value="all">{locale === "tr" ? "Tüm zamanlar" : "All time"}</option>
            <option value="30d">{locale === "tr" ? "Son 30 gün" : "Last 30 days"}</option>
            <option value="90d">{locale === "tr" ? "Son 90 gün" : "Last 90 days"}</option>
            <option value="180d">{locale === "tr" ? "Son 180 gün" : "Last 180 days"}</option>
          </select>
        </label>

        <label className="flex flex-col">
          <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {locale === "tr" ? "Minimum Bağlam" : "Min Context"}
          </span>
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            onChange={(event) => (isLlmSection ? setLlmContextMin(Number(event.target.value)) : setContextMin(Number(event.target.value)))}
            value={activeContextMin}
          >
            {CONTEXT_MIN_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 0 ? (locale === "tr" ? "Yok" : "None") : formatContext(option)}
              </option>
            ))}
          </select>
        </label>
        {isLlmSection ? (
          <label className="flex flex-col">
            <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Reasoning
            </span>
            <select
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              onChange={(event) => setLlmReasoningOnly(event.target.value === "only")}
              value={llmReasoningOnly ? "only" : "all"}
            >
              <option value="all">{locale === "tr" ? "Tümü" : "All"}</option>
              <option value="only">{locale === "tr" ? "Sadece Reasoning" : "Reasoning only"}</option>
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="space-y-4">
      {/* Tab bar */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-slate-950 p-2 shadow-[0_14px_40px_rgba(15,23,42,0.12)] dark:border-white/10">
        <div className="flex min-w-max items-center gap-1.5">
          {sections.map((section) => {
            const active = activeSection === section.key;
            return (
              <button
                key={section.key}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                onClick={() => setActiveSection(section.key)}
                type="button"
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === "general" ? (
        <section className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,2.45fr)_minmax(280px,0.72fr)]">
      <div
        id="summary-table"
        className="rounded-[var(--radius-panel)] p-5"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface-card)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {strings.summaryTitle}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {strings.summarySubtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>{locale === "tr" ? "Satır" : "Rows"}</span>
              <select
                className="h-7 rounded-lg px-2 text-xs outline-none transition"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface-subtle)",
                  color: "var(--text)",
                }}
                onChange={(event) => {
                  setSummaryRowLimit(Number(event.target.value) as (typeof LLM_ROW_LIMIT_OPTIONS)[number]);
                  setPage(0);
                }}
                value={summaryRowLimit}
              >
                {LLM_ROW_LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-right text-xs" style={{ color: "var(--text-faint)" }}>
              {visibleRows.length} / {sortedRows.length}
            </div>
          </div>
        </div>

        {summaryRows.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-sm"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {strings.noRows}
          </div>
        ) : (
          <>
            {filtersPanel}

            <div className="relative">
            <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/80 bg-white dark:border-white/8 dark:bg-white/[0.02]">
              <table className="min-w-[1080px] w-max text-left text-sm">
                <thead className="bg-slate-50 text-[0.7rem] tracking-[0.14em] text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                  <tr>
                    <th aria-label={locale === "tr" ? "Karşılaştırma seçimi" : "Compare selection"} className="w-10 px-3 py-3" />
                    <th aria-label={locale === "tr" ? "Sağlayıcı logosu" : "Vendor logo"} className="w-14 px-4 py-3" />
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.model, "model", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.model)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.provider, "lab", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.provider)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.intelligence, "intelligenceIndex", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.intelligence)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.code, "codingIndex", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.code)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.agentic, "agenticIndex", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.agentic)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.context, "contextWindowTokens", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.context)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.speed, "outputTokensPerSecond", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.speed)}</th>
                    <th className="px-4 py-3">{renderSortableHeader(strings.headers.release, "releaseDate", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.release)}</th>
                    <th className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        {renderSortableHeader(strings.headers.openSource, "openWeights", summarySortKey, summarySortDirection, setSummarySortKey, setSummarySortDirection, headerHints.openSource)}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const logoPath = getLabLogoPath(row.lab);
                    const isSelected = selectedIdSet.has(row.id);
                    const isDisabled = selectionLimitReached && !isSelected;
                    return (
                      <tr key={row.id} className="border-t border-slate-200/70 text-slate-700 hover:bg-slate-50 dark:border-white/8 dark:text-slate-300 dark:hover:bg-white/[0.03]">
                        <td className="px-3 py-3 align-middle">
                          <input
                            aria-label={locale === "tr" ? `${row.model} modelini karşılaştırma için seç` : `Select ${row.model} for comparison`}
                            checked={isSelected}
                            className="compare-checkbox"
                            disabled={isDisabled}
                            onChange={() => {
                              if (isSelected) {
                                setCompareModalOpen(false);
                              }
                              setSelectedModelIds((current) => {
                                const normalized = current.filter((id) => aaById.has(id)).slice(0, 2);
                                const exists = normalized.includes(row.id);
                                if (exists) {
                                  return normalized.filter((id) => id !== row.id);
                                }
                                if (normalized.length >= 2) {
                                  return normalized;
                                }
                                return [...normalized, row.id];
                              });
                            }}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="grid h-8 w-8 place-items-center overflow-hidden">
                            {logoPath ? (
                              <Image
                                alt={`${row.lab} logo`}
                                className="h-5 w-5 object-contain"
                                height={20}
                                src={logoPath}
                                width={20}
                              />
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{labMonogram(row.lab)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.model}</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{row.lab}</td>
                        <td className="px-4 py-3">{fmtNum(row.intelligenceIndex, 2)}</td>
                        <td className="px-4 py-3">{fmtNum(row.codingIndex, 2)}</td>
                        <td className="px-4 py-3">{fmtNum(row.agenticIndex, 2)}</td>
                        <td className="px-4 py-3">{formatContext(row.contextWindowTokens)}</td>
                        <td className="px-4 py-3">{fmtNum(row.outputTokensPerSecond, 1)}</td>
                        <td className="px-4 py-3">{row.releaseDate ? row.releaseDate.slice(0, 10) : "-"}</td>
                        <td className="px-4 py-3 text-center align-middle">
                          {row.openWeights ? (
                            <span
                              aria-label={openSourceTooltip}
                              className="inline-flex items-center justify-center cursor-help"
                              title={openSourceTooltip}
                            >
                              <LockOpen className="h-4 w-4 text-emerald-500" />
                            </span>
                          ) : (
                            <span
                              aria-label={closedSourceTooltip}
                              className="inline-flex items-center justify-center cursor-help"
                              title={closedSourceTooltip}
                            >
                              <Lock className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile scroll hint */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-white/60 to-transparent dark:from-slate-900/60 md:hidden" />
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface-card)",
                  color: "var(--text-muted)",
                }}
                disabled={clampedPage <= 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                type="button"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {locale === "tr" ? "Önceki" : "Prev"}
              </button>
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                {clampedPage + 1} / {pageCount}
              </span>
              <button
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface-card)",
                  color: "var(--text-muted)",
                }}
                disabled={clampedPage >= pageCount - 1}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                type="button"
              >
                {locale === "tr" ? "Sonraki" : "Next"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex min-h-0 self-stretch flex-col gap-6">
        <div
          id="latest-models"
          className="min-h-[20rem] rounded-[var(--radius-panel)] p-5"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface-card)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {strings.latestTitle}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {strings.latestSubtitle}
            </p>
          </div>
          <div className="space-y-2">
            {latestModels.map((item) => {
              const logoPath = getLabLogoPath(item.lab);
              return (
                <article
                  key={item.id}
                  className="flex items-center gap-3 rounded-3xl px-5 py-4"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden">
                    {logoPath ? (
                      <Image
                        alt={`${item.lab} logo`}
                        className="h-5 w-5 object-contain"
                        height={20}
                        src={logoPath}
                        width={20}
                      />
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                        {labMonogram(item.lab)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {item.model}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {item.lab} <span className="px-1">·</span> {shortDate(item.releaseDate, locale)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div
          id="ai-news"
          className="flex flex-col rounded-[var(--radius-panel)] p-5"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface-card)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {strings.aiNewsTitle}
            </h2>
            {strings.aiNewsSubtitle ? (
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {strings.aiNewsSubtitle}
              </p>
            ) : null}
          </div>
          <div className="relative">
            <div className="hide-scrollbar max-h-[min(600px,60vh)] space-y-2 overflow-y-auto pr-1">
              {aiNewsPreview.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl px-3 py-3"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <Image
                        alt={item.title}
                        className="h-full w-full object-cover"
                        height={56}
                        src={item.imageUrl || "/mock-news/open-source-copilot.svg"}
                        width={80}
                      />
                    </div>
                    <div className="min-w-0">
                      {item.link && !BLOCKED_NEWS_DOMAIN_PATTERN.test(item.link) ? (
                        <a
                          className="line-clamp-2 text-xs font-semibold transition-colors duration-150"
                          href={item.link}
                          rel="noreferrer"
                          target="_blank"
                          style={{ color: "var(--text)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
                        >
                          {item.title}
                        </a>
                      ) : (
                        <p className="line-clamp-2 text-xs font-semibold" style={{ color: "var(--text)" }}>
                          {item.title}
                        </p>
                      )}
                      <p className="mt-0.5 text-[0.65rem]" style={{ color: "var(--text-faint)" }}>
                        {item.source} <span className="px-1">·</span> {shortDate(item.publishedAt, locale)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {showAiNewsScrollHint ? (
              <>
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
                  style={{ background: "linear-gradient(to top, var(--surface-card), transparent)" }}
                />
                <div
                  className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2"
                  style={{ color: "var(--text-faint)" }}
                >
                  <ChevronsDown className="h-5 w-5 animate-bounce" />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
      </section>
      ) : activeSection === "llm" ? (
        <section
          className="rounded-[var(--radius-panel)] p-5"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface-card)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                {locale === "tr" ? "LLM Detaylar" : "LLM Details"}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{locale === "tr" ? "Satır" : "Rows"}</span>
                <select
                  className="h-7 rounded-lg px-2 text-xs outline-none transition"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                  onChange={(event) => setLlmRowLimit(Number(event.target.value) as (typeof LLM_ROW_LIMIT_OPTIONS)[number])}
                  value={llmRowLimit}
                >
                  {LLM_ROW_LIMIT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-right text-xs" style={{ color: "var(--text-faint)" }}>
                {llmVisibleRows.length} / {llmRows.length}
              </div>
            </div>
          </div>
          {filtersPanel}
          <div className="relative">
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/80 bg-white dark:border-white/8 dark:bg-white/[0.02]">
            <table className="min-w-[1800px] w-max text-left text-sm">
              <thead className="bg-slate-50 text-[0.7rem] tracking-[0.14em] text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                <tr>
                  <th aria-label={locale === "tr" ? "Karşılaştırma seçimi" : "Compare selection"} className="w-10 px-3 py-2" />
                  <th className="px-4 py-2">{locale === "tr" ? "Sıra" : "Rank"}</th>
                  <th aria-label={locale === "tr" ? "Sağlayıcı logosu" : "Vendor logo"} className="w-14 px-4 py-2" />
                  <th className="px-4 py-2">{renderSortableHeader("Model", "model", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.model)}</th>
                  <th className="px-4 py-2">{renderSortableHeader(locale === "tr" ? "Sağlayıcı" : "Provider", "lab", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.provider)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("Intelligence", "intelligenceIndex", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.intelligence)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("Coding", "codingIndex", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.code)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("Agentic", "agenticIndex", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.agentic)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("GPQA", "gpqa", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.gpqa)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("MMLU-Pro", "mmluPro", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.mmluPro)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("TerminalBench", "terminalBenchHard", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.terminalBench)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("SWE-Bench", "sweBench", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.sweBench)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("$ / 1M", "pricePer1m", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.blendedPrice)}</th>
                  <th className="px-4 py-2">{renderSortableHeader(locale === "tr" ? "Girdi $ / 1M" : "Input $ / 1M", "inputPricePer1m", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.inputPrice)}</th>
                  <th className="px-4 py-2">{renderSortableHeader(locale === "tr" ? "Çıktı $ / 1M" : "Output $ / 1M", "outputPricePer1m", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.outputPrice)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("Tok/s", "outputTokensPerSecond", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.speed)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("TTFT (s)", "ttftSeconds", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.ttft)}</th>
                  <th className="px-4 py-2">{renderSortableHeader(locale === "tr" ? "Uçtan Uca (s)" : "End-to-End (s)", "endToEndSeconds", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.e2eLatency)}</th>
                  <th className="px-4 py-2">{renderSortableHeader("Context", "contextWindowTokens", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.context)}</th>
                  <th className="px-4 py-2">{renderSortableHeader(locale === "tr" ? "Akıl Yürütme" : "Reasoning", "reasoning", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.reasoning)}</th>
                  <th className="px-4 py-2 text-center">
                    <div className="flex justify-center">
                      {renderSortableHeader("Open Source", "openWeights", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.openSource)}
                    </div>
                  </th>
                  <th className="px-4 py-2">{renderSortableHeader(locale === "tr" ? "Yayın" : "Release", "releaseDate", llmSortKey, llmSortDirection, setLlmSortKey, setLlmSortDirection, headerHints.release)}</th>
                </tr>
              </thead>
              <tbody>
                {llmVisibleRows.map((row) => {
                  const logoPath = getLabLogoPath(row.lab);
                  const isSelected = selectedIdSet.has(row.id);
                  const isDisabled = selectionLimitReached && !isSelected;
                  return (
                      <tr key={row.id} className="border-t border-slate-200/70 text-slate-700 hover:bg-slate-50 dark:border-white/8 dark:text-slate-300 dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-2 align-middle">
                        <input
                          aria-label={locale === "tr" ? `${row.model} modelini karşılaştırma için seç` : `Select ${row.model} for comparison`}
                          checked={isSelected}
                          className="compare-checkbox"
                          disabled={isDisabled}
                          onChange={() => {
                            if (isSelected) {
                              setCompareModalOpen(false);
                            }
                            setSelectedModelIds((current) => {
                              const normalized = current.filter((id) => aaById.has(id)).slice(0, 2);
                              const exists = normalized.includes(row.id);
                              if (exists) {
                                return normalized.filter((id) => id !== row.id);
                              }
                              if (normalized.length >= 2) {
                                return normalized;
                              }
                              return [...normalized, row.id];
                            });
                          }}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-4 py-2">{llmRankById.get(row.id) ?? "-"}</td>
                      <td className="px-4 py-2">
                        <div className="grid h-8 w-8 place-items-center overflow-hidden">
                          {logoPath ? (
                            <Image
                              alt={`${row.lab} logo`}
                              className="h-5 w-5 object-contain"
                              height={20}
                              src={logoPath}
                              width={20}
                            />
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{labMonogram(row.lab)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{row.model}</td>
                      <td className="px-4 py-2">{row.lab}</td>
                      <td className="px-4 py-2">{fmtNum(row.intelligenceIndex, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.codingIndex, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.agenticIndex, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.gpqa, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.mmluPro, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.terminalBenchHard, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.sweBench, 2)}</td>
                      <td className="px-4 py-2">{formatUsd(row.pricePer1m)}</td>
                      <td className="px-4 py-2">{formatUsd(row.inputPricePer1m)}</td>
                      <td className="px-4 py-2">{formatUsd(row.outputPricePer1m)}</td>
                      <td className="px-4 py-2">{fmtNum(row.outputTokensPerSecond, 1)}</td>
                      <td className="px-4 py-2">{fmtNum(row.ttftSeconds, 2)}</td>
                      <td className="px-4 py-2">{fmtNum(row.endToEndSeconds, 2)}</td>
                      <td className="px-4 py-2">{formatContext(row.contextWindowTokens)}</td>
                      <td className="px-4 py-2">{row.reasoning ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No")}</td>
                      <td className="px-4 py-2 text-center align-middle">
                        {row.openWeights ? (
                          <span
                            aria-label={openSourceTooltip}
                            className="inline-flex items-center justify-center cursor-help"
                            title={openSourceTooltip}
                          >
                            <LockOpen className="h-4 w-4 text-emerald-500" />
                          </span>
                        ) : (
                          <span
                            aria-label={closedSourceTooltip}
                            className="inline-flex items-center justify-center cursor-help"
                            title={closedSourceTooltip}
                          >
                            <Lock className="h-4 w-4 text-red-500" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.releaseDate ? row.releaseDate.slice(0, 10) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile scroll hint */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-white/60 to-transparent dark:from-slate-900/60 md:hidden" />
          </div>
        </section>
      ) : (
        <section
          id="leaderboard"
          className="rounded-[var(--radius-panel)] p-5 text-sm"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface-card)",
            color: "var(--text-muted)",
          }}
        >
          <div
            className="mb-2 rounded-2xl p-4"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-card)",
            }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {locale === "tr" ? "Kategori Filtreleri" : "Category Filters"}
              </p>
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() => {
                  setCategoryQuery("");
                  setCategoryProviderFilter("all");
                  setCategoryOpenFilter("all");
                  setCategorySortKey("rank");
                  setCategorySortDirection("asc");
                }}
                type="button"
              >
                <RotateCcw className="h-3 w-3" />
                {locale === "tr" ? "Sıfırla" : "Reset"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <label className="flex flex-col">
                <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  {locale === "tr" ? "Ara" : "Search"}
                </span>
                <input
                  className="h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  placeholder={locale === "tr" ? "Model veya sağlayıcı" : "Model or provider"}
                  type="text"
                  value={categoryQuery}
                />
              </label>
              <label className="flex flex-col">
                <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  {locale === "tr" ? "Sağlayıcı" : "Provider"}
                </span>
                <select
                  className="h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                  onChange={(event) => setCategoryProviderFilter(event.target.value)}
                  value={categoryProviderFilter}
                >
                  <option value="all">{locale === "tr" ? "Tümü" : "All"}</option>
                  {categoryProviderOptions.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="mb-1 flex h-6 items-end text-xs font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  {locale === "tr" ? "Açık Kaynak" : "Open Source"}
                </span>
                <select
                  className="h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                  onChange={(event) => setCategoryOpenFilter(event.target.value as OpenFilter)}
                  value={categoryOpenFilter}
                >
                  <option value="all">{locale === "tr" ? "Tümü" : "All"}</option>
                  <option value="open">{locale === "tr" ? "Açık" : "Open"}</option>
                  <option value="closed">{locale === "tr" ? "Kilitli" : "Closed"}</option>
                </select>
              </label>
            </div>
          </div>
          {categoryLoading ? (
            <p>{locale === "tr" ? "Veri yükleniyor..." : "Loading data..."}</p>
          ) : categoryError ? (
            <p>{locale === "tr" ? `Hata: ${categoryError}` : `Error: ${categoryError}`}</p>
          ) : categoryVisibleRows.length === 0 ? (
            <p>{locale === "tr" ? "Bu kategori için henüz snapshot yok." : "No snapshot yet for this category."}</p>
          ) : (
            <div className="space-y-3">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                    {(() => {
                      if (activeSection === "image") return locale === "tr" ? "Image Generation Detaylar" : "Image Generation Details";
                      if (activeSection === "video") return locale === "tr" ? "Video Generation Detaylar" : "Video Generation Details";
                      if (activeSection === "tts") return locale === "tr" ? "Text-to-Speech Detaylar" : "Text-to-Speech Details";
                      if (activeSection === "stt") return locale === "tr" ? "Speech-to-Text Detaylar" : "Speech-to-Text Details";
                      return locale === "tr" ? "Embeddings Detaylar" : "Embeddings Details";
                    })()}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{locale === "tr" ? "Satır" : "Rows"}</span>
                    <select
                      className="h-7 rounded-lg px-2 text-xs outline-none transition"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface-subtle)",
                        color: "var(--text)",
                      }}
                      onChange={(event) => setCategoryRowLimit(Number(event.target.value) as (typeof LLM_ROW_LIMIT_OPTIONS)[number])}
                      value={categoryRowLimit}
                    >
                      {LLM_ROW_LIMIT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-right text-xs" style={{ color: "var(--text-faint)" }}>
                    {categoryLimitedRows.length} / {categoryRows.length}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-5 text-xs" style={{ color: "var(--text-faint)" }}>
                <span>{locale === "tr" ? "Kaynak" : "Source"}: {categorySourceName ?? "-"}</span>
                <span>{locale === "tr" ? "Snapshot" : "Snapshot"}: {categorySnapshotAt ? categorySnapshotAt.slice(0, 16).replace("T", " ") : "-"}</span>
              </div>
              <div className="relative">
              <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/80 bg-white dark:border-white/8 dark:bg-white/[0.02]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[0.7rem] tracking-[0.14em] text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                    <tr>
                      <th aria-label={locale === "tr" ? "Karşılaştırma seçimi" : "Compare selection"} className="w-10 px-3 py-2" />
                      <th className="px-4 py-2">
                        <button
                          className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:text-slate-700 dark:hover:text-slate-200"
                          onClick={() => {
                            if (categorySortKey === "rank") {
                              setCategorySortDirection(categorySortDirection === "asc" ? "desc" : "asc");
                              return;
                            }
                            setCategorySortKey("rank");
                            setCategorySortDirection("asc");
                          }}
                          type="button"
                        >
                          <ColumnTooltipLabel
                            description={locale === "tr" ? "Bu kategorideki sıralama." : "Leaderboard rank in this category."}
                            label={locale === "tr" ? "Sıra" : "Rank"}
                          />
                          {categorySortKey === "rank" ? (
                            categorySortDirection === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-65" />
                          )}
                        </button>
                      </th>
                      <th aria-label={locale === "tr" ? "Sağlayıcı logosu" : "Vendor logo"} className="w-14 px-4 py-2" />
                      {visibleCategoryColumns.map((column) => {
                        const active = categorySortKey === column.key;
                        return (
                          <th key={column.key} className="px-4 py-2">
                            <button
                              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:text-slate-700 dark:hover:text-slate-200"
                              onClick={() => {
                                if (active) {
                                  setCategorySortDirection(categorySortDirection === "asc" ? "desc" : "asc");
                                  return;
                                }
                                setCategorySortKey(column.key);
                                setCategorySortDirection(column.key === "rank" ? "asc" : "desc");
                              }}
                              type="button"
                            >
                              <ColumnTooltipLabel
                                description={
                                  column.key === "score"
                                    ? describeCategoryScore(categoryScoreUnit, categorySourceName, locale)
                                    : (locale === "tr" ? column.hint.tr : column.hint.en)
                                }
                                label={column.label}
                              />
                              {active ? (
                                categorySortDirection === "asc" ? (
                                  <ArrowUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowDown className="h-3.5 w-3.5" />
                                )
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5 opacity-65" />
                              )}
                            </button>
                          </th>
                        );
                      })}
                      <th className="px-4 py-2 text-center">
                        <div className="flex justify-center">
                          <ColumnTooltipLabel
                            description={
                              locale === "tr"
                                ? "Model ağırlıklarının herkese açık olup olmadığını gösterir."
                                : "Shows whether model weights are publicly available."
                            }
                            label={locale === "tr" ? "Açık" : "Open"}
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryLimitedRows.map((row) => {
                      const logoPath = getLabLogoPath(row.lab);
                      const matchedId = aaIdByModelVendor.get(modelVendorCompareKey(row.model, row.lab)) ?? null;
                      const isSelected = matchedId ? selectedIdSet.has(matchedId) : false;
                      const isDisabled = !matchedId || (selectionLimitReached && !isSelected);
                      return (
                        <tr
                          key={`${row.rank}-${row.model}`}
                          className="border-t border-slate-200/70 text-slate-700 hover:bg-slate-50 dark:border-white/8 dark:text-slate-300 dark:hover:bg-white/[0.03]"
                        >
                          <td className="px-3 py-2 align-middle">
                            <input
                              aria-label={locale === "tr" ? `${row.model} modelini karşılaştırma için seç` : `Select ${row.model} for comparison`}
                              checked={isSelected}
                              className="compare-checkbox"
                              disabled={isDisabled}
                              onChange={() => {
                                if (!matchedId) return;
                                if (isSelected) {
                                  setCompareModalOpen(false);
                                }
                                setSelectedModelIds((current) => {
                                  const normalized = current.filter((id) => aaById.has(id)).slice(0, 2);
                                  const exists = normalized.includes(matchedId);
                                  if (exists) {
                                    return normalized.filter((id) => id !== matchedId);
                                  }
                                  if (normalized.length >= 2) {
                                    return normalized;
                                  }
                                  return [...normalized, matchedId];
                                });
                              }}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-4 py-2">{row.rank}</td>
                          <td className="px-4 py-2">
                            <div className="grid h-8 w-8 place-items-center overflow-hidden">
                              {logoPath ? (
                                <Image
                                  alt={`${row.lab} logo`}
                                  className="h-5 w-5 object-contain"
                                  height={20}
                                  src={logoPath}
                                  width={20}
                                />
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{labMonogram(row.lab)}</span>
                              )}
                            </div>
                          </td>
                          {visibleCategoryColumns.map((column) => (
                            <td key={`${row.rank}-${row.model}-${column.key}`} className="px-4 py-2">
                              {column.key === "model" ? (
                                row.modelUrl ? (
                                  <a href={row.modelUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline" style={{ color: "var(--text)" }}>
                                    {row.model}
                                  </a>
                                ) : (
                                  <span className="font-medium" style={{ color: "var(--text)" }}>{row.model}</span>
                                )
                              ) : column.key === "lab" ? (
                                formatProviderName(column.render(row))
                              ) : (
                                column.render(row)
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-center align-middle">
                            {row.isOpenSource === true ? (
                              <LockOpen className="mx-auto h-4 w-4 text-emerald-500" />
                            ) : row.isOpenSource === false ? (
                              <Lock className="mx-auto h-4 w-4 text-red-500" />
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile scroll hint */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-white/60 to-transparent dark:from-slate-900/60 md:hidden" />
              </div>
            </div>
          )}
        </section>
      )}

      {compareDrawerData ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <div
            className={`${
              isCompareDrawerExiting
                ? "compare-drawer-exit pointer-events-none"
                : "compare-drawer-enter pointer-events-auto"
            } w-full max-w-3xl rounded-2xl px-4 py-3`}
            style={{
              border: "1px solid var(--border-strong)",
              background: "var(--surface-raised)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                <span className="font-semibold">{compareDrawerData.leftModel.model}</span>
                <span className="px-2" style={{ color: "var(--text-faint)" }}>vs</span>
                <span className="font-semibold">{compareDrawerData.rightModel.model}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    background: "transparent",
                  }}
                  onClick={() => {
                    setSelectedModelIds([]);
                    setCompareModalOpen(false);
                  }}
                  type="button"
                >
                  {locale === "tr" ? "Seçimi Temizle" : "Clear Selection"}
                </button>
                <button
                  className="rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150"
                  style={{
                    border: "1px solid var(--accent)",
                    background: "var(--accent)",
                    color: "#fff",
                    boxShadow: "0 4px 12px rgba(201,12,15,0.25)",
                  }}
                  onClick={() => setCompareModalOpen(true)}
                  type="button"
                >
                  {locale === "tr" ? "Kıyasla" : "Compare"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {compareModalData ? (
        <ModelCompareModal
          data={compareModalData}
          isExiting={isCompareModalExiting}
          locale={locale}
          onClose={() => setCompareModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

type CompareBarRow = {
  category: string;
  left: number;
  right: number;
};

type CompareRadarRow = {
  axis: string;
  left: number;
  right: number;
};

type CompareMetricRow = {
  label: string;
  left: string;
  right: string;
};

type CompareData = {
  leftModel: AAModelRow;
  rightModel: AAModelRow;
  leftPreferencePct: number;
  rightPreferencePct: number;
  barRows: CompareBarRow[];
  radarRows: CompareRadarRow[];
  detailRows: CompareMetricRow[];
};

function ModelCompareModal({
  data,
  isExiting,
  locale,
  onClose,
}: {
  data: CompareData;
  isExiting: boolean;
  locale: Locale;
  onClose: () => void;
}) {
  const leftWins = data.leftPreferencePct >= data.rightPreferencePct;
  const winner = leftWins ? data.leftModel.model : data.rightModel.model;
  const loser = leftWins ? data.rightModel.model : data.leftModel.model;
  const winnerPct = leftWins ? data.leftPreferencePct : data.rightPreferencePct;
  const leftSeriesColor = "var(--tt-blue)";
  const rightSeriesColor = "#14b8a6";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-4 md:items-center ${
        isExiting ? "compare-modal-overlay-exit" : "compare-modal-overlay-enter"
      }`}
      style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className={`w-full max-w-6xl overflow-hidden rounded-2xl ${
          isExiting ? "compare-modal-panel-exit" : "compare-modal-panel-enter"
        }`}
        style={{
          border: "1px solid var(--border-strong)",
          background: "var(--surface-raised)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted)" }}
          >
            {locale === "tr" ? "Model Kıyaslama" : "Model Comparison"}
          </p>
          <button
            aria-label={locale === "tr" ? "Kapat" : "Close"}
            className="rounded-full p-2 transition-all duration-150"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
              color: "var(--text-muted)",
            }}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[85vh] overflow-y-auto px-5 py-5 md:px-7">
          {/* Winner headline */}
          <div className="text-center">
            <p className="text-5xl font-bold" style={{ color: "var(--accent)" }}>
              {winnerPct}%
            </p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {locale === "tr"
                ? `${winner}, karşılaştırmalı metriklerde ${loser} modeline göre daha güçlü görünüyor.`
                : `${winner} appears stronger than ${loser} across comparative metrics.`}
            </p>
          </div>

          {/* Metric table */}
          <div
            className="mt-5 rounded-xl p-4"
            style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div
                className="hidden text-xs font-semibold uppercase tracking-[0.16em] md:block"
                style={{ color: "var(--text-faint)" }}
              >
                {locale === "tr" ? "Metrik" : "Metric"}
              </div>
              <div className="text-xs font-semibold tracking-[0.12em]" style={{ color: "var(--tt-blue)" }}>
                {data.leftModel.model}
              </div>
              <div className="text-xs font-semibold tracking-[0.12em] text-teal-500">
                {data.rightModel.model}
              </div>
              {data.detailRows.map((row) => (
                <Fragment key={row.label}>
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>{row.label}</div>
              <div className="text-sm font-semibold" style={{ color: "var(--tt-blue)", opacity: 0.9 }}>{row.left}</div>
                  <div className="text-sm font-semibold text-teal-600/90 dark:text-teal-400/80">{row.right}</div>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div
            className="mt-4 rounded-xl p-4"
            style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
          >
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--text-faint)" }}
            >
              {locale === "tr" ? "Kategori Bazında" : "Category Breakdown"}
            </p>
            <div className="h-[clamp(180px,35vh,320px)]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.barRows} layout="vertical" margin={{ top: 8, right: 18, left: 10, bottom: 8 }}>
                  <XAxis hide type="number" domain={[0, 100]} />
                  <YAxis dataKey="category" type="category" width={130} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => formatTooltipPercent(value)}
                    contentStyle={{
                      backgroundColor: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      color: "var(--text)",
                    }}
                  />
                  <Bar dataKey="left" stackId="s" fill={leftSeriesColor} fillOpacity={0.85} radius={[6, 0, 0, 6]} />
                  <Bar dataKey="right" stackId="s" fill={rightSeriesColor} fillOpacity={0.85} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Radar chart */}
          <div
            className="mt-4 rounded-xl p-4"
            style={{ border: "1px solid var(--border)", background: "var(--surface-subtle)" }}
          >
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--text-faint)" }}
            >
              {locale === "tr" ? "Çok Boyutlu Profil" : "Multi-dimensional Profile"}
            </p>
            <div className="h-[clamp(160px,30vh,280px)]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data.radarRows} outerRadius="75%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Radar dataKey="left" name={data.leftModel.model} stroke={leftSeriesColor} fill={leftSeriesColor} fillOpacity={0.15} />
                  <Radar dataKey="right" name={data.rightModel.model} stroke={rightSeriesColor} fill={rightSeriesColor} fillOpacity={0.15} />
                  <Tooltip
                    formatter={(value) => formatTooltipPercent(value)}
                    contentStyle={{
                      backgroundColor: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      color: "var(--text)",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5" style={{ color: "var(--tt-blue)" }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--tt-blue)" }} />
                {data.leftModel.model}
              </span>
              <span className="inline-flex items-center gap-1.5 text-teal-500">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                {data.rightModel.model}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildCompareData(left: AAModelRow, right: AAModelRow, locale: Locale): CompareData {
  const barMetricDefs: Array<{ key: keyof AAModelRow; labelEn: string; labelTr: string; better: "higher" | "lower" }> = [
    { key: "intelligenceIndex", labelEn: "Intelligence", labelTr: "Intelligence", better: "higher" },
    { key: "codingIndex", labelEn: "Coding", labelTr: "Coding", better: "higher" },
    { key: "agenticIndex", labelEn: "Agentic", labelTr: "Agentic", better: "higher" },
    { key: "gpqa", labelEn: "GPQA", labelTr: "GPQA", better: "higher" },
    { key: "mmluPro", labelEn: "MMLU-Pro", labelTr: "MMLU-Pro", better: "higher" },
    { key: "terminalBenchHard", labelEn: "TerminalBench", labelTr: "TerminalBench", better: "higher" },
    { key: "outputTokensPerSecond", labelEn: "Speed", labelTr: "Hız", better: "higher" },
    { key: "ttftSeconds", labelEn: "TTFT", labelTr: "TTFT", better: "lower" },
    { key: "endToEndSeconds", labelEn: "End-to-End", labelTr: "Uçtan Uca", better: "lower" },
    { key: "pricePer1m", labelEn: "Price / 1M", labelTr: "Fiyat / 1M", better: "lower" },
  ];

  const barRows: CompareBarRow[] = barMetricDefs
    .map((metric) => {
      const split = toPairPercent(getMetricValue(left, metric.key), getMetricValue(right, metric.key), metric.better);
      if (!split) {
        return null;
      }
      return {
        category: locale === "tr" ? metric.labelTr : metric.labelEn,
        left: split.left,
        right: split.right,
      };
    })
    .filter((row): row is CompareBarRow => Boolean(row));

  const radarDefs: Array<{ labelEn: string; labelTr: string; left: number | null; right: number | null; better: "higher" | "lower" }> = [
    {
      labelEn: "Intelligence",
      labelTr: "Intelligence",
      left: left.intelligenceIndex,
      right: right.intelligenceIndex,
      better: "higher",
    },
    {
      labelEn: "Coding",
      labelTr: "Coding",
      left: left.codingIndex,
      right: right.codingIndex,
      better: "higher",
    },
    {
      labelEn: "Agentic",
      labelTr: "Agentic",
      left: left.agenticIndex,
      right: right.agenticIndex,
      better: "higher",
    },
    {
      labelEn: "Speed",
      labelTr: "Hız",
      left: left.outputTokensPerSecond,
      right: right.outputTokensPerSecond,
      better: "higher",
    },
    {
      labelEn: "Context",
      labelTr: "Context",
      left: left.contextWindowTokens,
      right: right.contextWindowTokens,
      better: "higher",
    },
    {
      labelEn: "Cost",
      labelTr: "Maliyet",
      left: left.pricePer1m,
      right: right.pricePer1m,
      better: "lower",
    },
    {
      labelEn: "Latency",
      labelTr: "Gecikme",
      left: left.ttftSeconds,
      right: right.ttftSeconds,
      better: "lower",
    },
  ];

  const radarRows = radarDefs.map((axis) => {
    const split = toPairPercent(axis.left, axis.right, axis.better);
    return {
      axis: locale === "tr" ? axis.labelTr : axis.labelEn,
      left: split?.left ?? 50,
      right: split?.right ?? 50,
    };
  });

  const preferenceMetrics = barMetricDefs
    .map((metric) => toPairPercent(getMetricValue(left, metric.key), getMetricValue(right, metric.key), metric.better))
    .filter((metric): metric is { left: number; right: number } => Boolean(metric));

  const leftPreferencePct =
    preferenceMetrics.length > 0
      ? Math.round(
        preferenceMetrics.reduce((total, metric) => total + metric.left, 0) / preferenceMetrics.length,
      )
      : 50;
  const rightPreferencePct = Math.max(0, 100 - leftPreferencePct);

  const detailRows: CompareMetricRow[] = [
    {
      label: locale === "tr" ? "Sağlayıcı" : "Provider",
      left: left.lab,
      right: right.lab,
    },
    {
      label: "Intelligence",
      left: fmtNum(left.intelligenceIndex, 2),
      right: fmtNum(right.intelligenceIndex, 2),
    },
    {
      label: "Coding",
      left: fmtNum(left.codingIndex, 2),
      right: fmtNum(right.codingIndex, 2),
    },
    {
      label: "Agentic",
      left: fmtNum(left.agenticIndex, 2),
      right: fmtNum(right.agenticIndex, 2),
    },
    {
      label: "GPQA",
      left: fmtNum(left.gpqa, 2),
      right: fmtNum(right.gpqa, 2),
    },
    {
      label: "MMLU-Pro",
      left: fmtNum(left.mmluPro, 2),
      right: fmtNum(right.mmluPro, 2),
    },
    {
      label: "TerminalBench",
      left: fmtNum(left.terminalBenchHard, 2),
      right: fmtNum(right.terminalBenchHard, 2),
    },
    {
      label: locale === "tr" ? "Fiyat / 1M" : "Price / 1M",
      left: formatUsd(left.pricePer1m),
      right: formatUsd(right.pricePer1m),
    },
    {
      label: locale === "tr" ? "Girdi Fiyatı / 1M" : "Input Price / 1M",
      left: formatUsd(left.inputPricePer1m),
      right: formatUsd(right.inputPricePer1m),
    },
    {
      label: locale === "tr" ? "Çıktı Fiyatı / 1M" : "Output Price / 1M",
      left: formatUsd(left.outputPricePer1m),
      right: formatUsd(right.outputPricePer1m),
    },
    {
      label: "Tok/s",
      left: fmtNum(left.outputTokensPerSecond, 1),
      right: fmtNum(right.outputTokensPerSecond, 1),
    },
    {
      label: "TTFT (s)",
      left: fmtNum(left.ttftSeconds, 2),
      right: fmtNum(right.ttftSeconds, 2),
    },
    {
      label: locale === "tr" ? "Uçtan Uca (s)" : "End-to-End (s)",
      left: fmtNum(left.endToEndSeconds, 2),
      right: fmtNum(right.endToEndSeconds, 2),
    },
    {
      label: "Context",
      left: formatContext(left.contextWindowTokens),
      right: formatContext(right.contextWindowTokens),
    },
    {
      label: locale === "tr" ? "Reasoning" : "Reasoning",
      left: left.reasoning ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No"),
      right: right.reasoning ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No"),
    },
    {
      label: "Open Source",
      left: left.openWeights ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No"),
      right: right.openWeights ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No"),
    },
    {
      label: locale === "tr" ? "Yayın Tarihi" : "Release Date",
      left: left.releaseDate ? left.releaseDate.slice(0, 10) : "-",
      right: right.releaseDate ? right.releaseDate.slice(0, 10) : "-",
    },
  ];

  return {
    leftModel: left,
    rightModel: right,
    leftPreferencePct,
    rightPreferencePct,
    barRows,
    radarRows,
    detailRows,
  };
}

function getMetricValue(model: AAModelRow, key: keyof AAModelRow): number | null {
  const value = model[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toPairPercent(
  left: number | null,
  right: number | null,
  better: "higher" | "lower",
): { left: number; right: number } | null {
  if (left === null && right === null) {
    return null;
  }
  if (left === null) {
    return { left: 0, right: 100 };
  }
  if (right === null) {
    return { left: 100, right: 0 };
  }
  if (left === right) {
    return { left: 50, right: 50 };
  }

  if (better === "higher") {
    const total = left + right;
    if (total <= 0) {
      return left > right ? { left: 100, right: 0 } : { left: 0, right: 100 };
    }
    const leftPct = Math.round((left / total) * 100);
    return { left: leftPct, right: 100 - leftPct };
  }

  const leftSafe = left <= 0 ? 0.0001 : left;
  const rightSafe = right <= 0 ? 0.0001 : right;
  const invLeft = 1 / leftSafe;
  const invRight = 1 / rightSafe;
  const total = invLeft + invRight;
  const leftPct = Math.round((invLeft / total) * 100);
  return { left: leftPct, right: 100 - leftPct };
}

function formatTooltipPercent(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return `${numeric.toFixed(0)}%`;
}

function renderSortableHeader<TSortKey extends string>(
  label: string,
  key: TSortKey,
  activeKey: TSortKey,
  direction: "asc" | "desc",
  setSortKey: (key: TSortKey) => void,
  setSortDirection: (value: "asc" | "desc") => void,
  hint: string,
) {
  const isActive = key === activeKey;
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:text-slate-700 dark:hover:text-slate-200"
      onClick={() => {
        if (isActive) {
          setSortDirection(direction === "asc" ? "desc" : "asc");
          return;
        }
        setSortKey(key);
        setSortDirection("desc");
      }}
      type="button"
    >
      <ColumnTooltipLabel description={hint} label={label} />
      {isActive ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-65" />
      )}
    </button>
  );
}

function numericSortValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NEGATIVE_INFINITY;
}

function fmtNum(value: number | null, digits: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

function formatContext(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function formatUsd(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

function toMs(dateLike: string | null) {
  if (!dateLike) {
    return 0;
  }

  const parsed = Date.parse(dateLike);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortDate(dateLike: string | null, locale: Locale) {
  const ms = toMs(dateLike);
  if (!ms) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(ms);
}

function labMonogram(lab: string) {
  return lab
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
}

function getLabLogoPath(lab: string): string | null {
  for (const item of LAB_LOGO_MAP) {
    if (item.pattern.test(lab)) {
      return item.src;
    }
  }
  return null;
}
