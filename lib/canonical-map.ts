const CANONICAL_LABS = [
  "OpenAI",
  "Anthropic",
  "Google DeepMind",
  "Meta AI",
  "Mistral AI",
  "xAI (Grok)",
  "Cohere",
  "Alibaba (Qwen)",
  "DeepSeek",
  "Baidu (ERNIE)",
  "ByteDance (Doubao)",
  "Zhipu AI (GLM)",
  "Moonshot AI (Kimi)",
  "01.AI (Yi)",
  "Minimax",
  "Baichuan",
  "Perplexity (Sonar)",
  "NVIDIA (Nemotron)",
  "Microsoft (Phi)",
] as const;

export type CanonicalLab = (typeof CANONICAL_LABS)[number];

export const KNOWN_LABS = CANONICAL_LABS;

const LAB_ALIAS_PAIRS: Array<[string, CanonicalLab]> = [
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["claude", "Anthropic"],
  ["google", "Google DeepMind"],
  ["deepmind", "Google DeepMind"],
  ["google-deepmind", "Google DeepMind"],
  ["meta", "Meta AI"],
  ["meta-ai", "Meta AI"],
  ["meta-llama", "Meta AI"],
  ["mistral", "Mistral AI"],
  ["mistralai", "Mistral AI"],
  ["xai", "xAI (Grok)"],
  ["x-ai", "xAI (Grok)"],
  ["cohere", "Cohere"],
  ["qwen", "Alibaba (Qwen)"],
  ["alibaba", "Alibaba (Qwen)"],
  ["deepseek", "DeepSeek"],
  ["baidu", "Baidu (ERNIE)"],
  ["ernie", "Baidu (ERNIE)"],
  ["bytedance", "ByteDance (Doubao)"],
  ["doubao", "ByteDance (Doubao)"],
  ["zhipu", "Zhipu AI (GLM)"],
  ["zhipu-ai", "Zhipu AI (GLM)"],
  ["glm", "Zhipu AI (GLM)"],
  ["moonshot", "Moonshot AI (Kimi)"],
  ["moonshot-ai", "Moonshot AI (Kimi)"],
  ["kimi", "Moonshot AI (Kimi)"],
  ["01ai", "01.AI (Yi)"],
  ["01-ai", "01.AI (Yi)"],
  ["yi", "01.AI (Yi)"],
  ["minimax", "Minimax"],
  ["baichuan", "Baichuan"],
  ["perplexity", "Perplexity (Sonar)"],
  ["sonar", "Perplexity (Sonar)"],
  ["nvidia", "NVIDIA (Nemotron)"],
  ["nemotron", "NVIDIA (Nemotron)"],
  ["microsoft", "Microsoft (Phi)"],
  ["phi", "Microsoft (Phi)"],
];

const LAB_ALIAS_MAP = new Map<string, CanonicalLab>(
  LAB_ALIAS_PAIRS.map(([alias, lab]) => [alias.toLowerCase(), lab]),
);

function slugifyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalRecordId(
  lab: string,
  model: string,
  variant = "default",
): string {
  return [lab, model, variant].map(slugifyPart).join(":");
}

export function normalizeLabName(value: string | null | undefined): CanonicalLab | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (LAB_ALIAS_MAP.has(normalized)) {
    return LAB_ALIAS_MAP.get(normalized) ?? null;
  }

  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  if (LAB_ALIAS_MAP.has(compact)) {
    return LAB_ALIAS_MAP.get(compact) ?? null;
  }

  const match = CANONICAL_LABS.find((lab) => lab.toLowerCase() === normalized);
  return match ?? null;
}

export function resolveLabFromModelId(modelId: string | null | undefined): CanonicalLab | null {
  if (!modelId) {
    return null;
  }

  const owner = modelId.split("/")[0] ?? modelId;
  return normalizeLabName(owner);
}

export function isKnownLab(value: string | null | undefined): value is CanonicalLab {
  return Boolean(normalizeLabName(value));
}
