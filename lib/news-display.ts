const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

function decodeEntity(entity: string): string {
  const trimmed = entity.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("#x") || trimmed.startsWith("#X")) {
    const codePoint = Number.parseInt(trimmed.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
  }
  if (trimmed.startsWith("#")) {
    const codePoint = Number.parseInt(trimmed.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
  }
  return ENTITY_MAP[trimmed.toLowerCase()] ?? "";
}

export function sanitizeNewsDescription(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const decoded = value.replace(/&([^;]+);/g, (_match, entity) => decodeEntity(entity));
  const normalized = decoded.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function hostnameToPublisher(hostname: string): string | null {
  const clean = hostname.replace(/^www\./i, "").trim().toLowerCase();
  if (!clean) return null;

  const parts = clean.split(".");
  if (parts.length < 2) return null;
  const main = parts[parts.length - 2] ?? "";
  if (!main) return null;

  return main
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function derivePublisherFromUrl(url: string | null | undefined): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return hostnameToPublisher(parsed.hostname);
  } catch {
    return null;
  }
}

export function formatNewsSourceDisplay(source: string, publisher: string | null): string {
  const cleanSource = source.trim();
  if (!cleanSource) return publisher ?? "Unknown Source";
  if (!/google news/i.test(cleanSource)) return cleanSource;
  if (!publisher || publisher.trim().length === 0) return "Google News";
  return `Google News | ${publisher.trim()}`;
}
