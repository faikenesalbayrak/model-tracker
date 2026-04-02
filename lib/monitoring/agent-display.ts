const STOP_PHRASES = [
  /\bmcp\s+server\b/i,
  /\(mcp\)\s+server\b/i,
  /\bofficial\b/i,
  /\benable\s+ai\s+agents\b/i,
  /\bfor\s+\w+/i,
  /\bthis\s+mcp\b/i,
];

const ACRONYMS = new Set([
  "API",
  "AI",
  "MCP",
  "SDK",
  "CLI",
  "HTTP",
  "HTTPS",
  "SQL",
  "DB",
  "LLM",
  "RAG",
  "OCR",
  "JWT",
  "CSV",
  "JSON",
  "XML",
  "AWS",
  "GCP",
  "GPU",
  "CPU",
  "UI",
  "UX",
  "ID",
  "URL",
  "MLOPS",
]);

function truncate(input: string, max = 64): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1).trimEnd()}…`;
}

function splitFromStopPhrase(input: string): string {
  let result = input;
  for (const rx of STOP_PHRASES) {
    const match = rx.exec(result);
    if (!match || typeof match.index !== "number") continue;
    if (match.index >= 10) {
      result = result.slice(0, match.index).trim();
      break;
    }
  }
  return result;
}

function titleCaseToken(token: string): string {
  const upper = token.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  if (/^\d+[a-z]+$/i.test(token)) return token;
  if (token.length <= 2 && /[A-Z]/.test(token)) return upper;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function humanizeSlug(value: string): string {
  const normalized = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((part) => titleCaseToken(part))
    .join(" ")
    .trim();
}

export function toDisplayName(raw: string | null | undefined, fallback = "Unknown"): string {
  const source = (raw ?? "").trim();
  if (!source) return fallback;

  const stripped = splitFromStopPhrase(source)
    .replace(/\s+/g, " ")
    .trim();

  const candidate = /[_-]/.test(stripped) ? humanizeSlug(stripped) : stripped;
  const cleaned = candidate
    .replace(/[|•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;
  return truncate(cleaned);
}

export function toSkillDisplayName(raw: string | null | undefined): string {
  return toDisplayName(raw, "Unknown Skill");
}

export function toMcpDisplayName(raw: string | null | undefined): string {
  return toDisplayName(raw, "Unknown MCP");
}

export function computeDelta24h(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  if (typeof previous !== "number" || !Number.isFinite(previous)) return null;
  return current - previous;
}
