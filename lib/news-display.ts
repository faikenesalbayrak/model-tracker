const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);

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

function cleanPublisherToken(value: string): string | null {
  const token = value.trim().replace(/[|•]/g, " ").replace(/\s+/g, " ");
  if (!token) return null;
  if (token.length > 64) return null;
  if (!/[a-zA-Z]/.test(token)) return null;
  return token;
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

export function extractPublisherFromTitle(title: string | null | undefined): string | null {
  const clean = (title ?? "").trim();
  if (!clean) return null;
  const parts = clean.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return cleanPublisherToken(parts[parts.length - 1] ?? "");
}

export function isLikelyImageUrl(url: string | null | undefined): boolean {
  const value = (url ?? "").trim();
  if (!value) return false;
  try {
    const parsed = new URL(value, "https://example.com");
    const pathname = parsed.pathname.toLowerCase();
    const ext = pathname.split(".").pop() ?? "";
    if (VIDEO_EXTENSIONS.has(ext)) return false;
    if (IMAGE_EXTENSIONS.has(ext)) return true;
    if (pathname.includes("/news-logos/")) return true;
    return !pathname.endsWith(".mp4") && !pathname.endsWith(".webm") && !pathname.endsWith(".mov");
  } catch {
    return false;
  }
}

export function classifyImageKind(
  imageUrl: string | null | undefined,
  sourceLogoUrl: string | null | undefined,
): "photo" | "logo" | "none" {
  const image = (imageUrl ?? "").trim();
  const sourceLogo = (sourceLogoUrl ?? "").trim();
  if (!image) return sourceLogo ? "logo" : "none";
  if (!isLikelyImageUrl(image)) return sourceLogo ? "logo" : "none";
  if (sourceLogo && image === sourceLogo) return "logo";
  if (image.includes("/news-logos/")) return "logo";
  return "photo";
}

export function formatNewsSourceDisplay(source: string, publisher: string | null): string {
  const cleanSource = source.trim();
  if (!cleanSource) return publisher ?? "Unknown Source";
  if (!/google news/i.test(cleanSource)) return cleanSource;
  if (!publisher || publisher.trim().length === 0) return "Google News";
  return `Google News | ${publisher.trim()}`;
}
