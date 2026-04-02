import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import { getNewsDisplayTitle, getNewsSourceLabel, getNewsSourceLogo } from "@/lib/monitoring/news-source-label";
import {
  classifyImageKind,
  derivePublisherFromUrl,
  extractPublisherFromTitle,
  isLikelyImageUrl,
  sanitizeNewsDescription,
  sanitizeNewsLabel,
  formatNewsSourceDisplay,
} from "@/lib/news-display";

export type NewsApiItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceName?: string;
  sourceDisplay?: string;
  publisher?: string | null;
  description?: string | null;
  publishedAt: string;
  timeAgo: string | null;
  imageUrl: string | null;
  imageKind?: "photo" | "logo" | "none";
  importanceScore?: number | null;
};

export function shouldHideFromDisplay(sourceName: string): boolean {
  return sourceName.startsWith("arxiv_") || sourceName === "arxiv_feed_news_lane";
}

export function dedupeByCanonical(entries: NormalizedNewsEntry[]): NormalizedNewsEntry[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
  const byCanonical = new Map<string, NormalizedNewsEntry>();
  const googleFallback = new Set<string>();

  const richnessScore = (entry: NormalizedNewsEntry): number => {
    const hasTitle = entry.title.trim().length > 0 ? 1 : 0;
    const hasImage =
      typeof entry.payload?.image_url === "string" ||
      typeof entry.payload?.imageUrl === "string"
        ? 1
        : 0;
    return hasTitle * 10 + hasImage;
  };

  for (const entry of sorted) {
    const key = entry.canonicalUrl.trim();
    if (!key) continue;
    if (entry.sourceName === "google_news_ai" || entry.canonicalUrl.includes("news.google.com")) {
      const fallbackKey = `${entry.title.trim().toLowerCase()}|${entry.publishedAt ?? ""}`;
      if (googleFallback.has(fallbackKey)) continue;
      googleFallback.add(fallbackKey);
    }
    const existing = byCanonical.get(key);
    if (!existing || richnessScore(entry) > richnessScore(existing)) {
      byCanonical.set(key, entry);
    }
  }

  return [...byCanonical.values()].sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
}

export function pickVisibleEntries(entries: NormalizedNewsEntry[], activeNewsSources: Set<string>): NormalizedNewsEntry[] {
  const deduped = dedupeByCanonical(entries);
  const filtered = deduped.filter((item) => activeNewsSources.has(item.sourceName));
  const pool = filtered.length > 0 ? filtered : deduped;
  return pool
    .filter((entry) => !shouldHideFromDisplay(entry.sourceName))
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
}

function pickEntryImageData(entry: NormalizedNewsEntry): {
  imageUrl: string | null;
  imageKind: "photo" | "logo" | "none";
} {
  const sourceLogo = getNewsSourceLogo(entry);
  const rawImage =
    typeof entry.payload?.image_url === "string"
      ? entry.payload.image_url
      : typeof entry.payload?.imageUrl === "string"
        ? entry.payload.imageUrl
        : null;
  const imageCandidate = rawImage?.trim() ?? "";
  const imageKind = classifyImageKind(imageCandidate, sourceLogo);
  if (imageKind === "photo" && isLikelyImageUrl(imageCandidate)) {
    return { imageUrl: imageCandidate, imageKind: "photo" };
  }
  if (sourceLogo) {
    return { imageUrl: sourceLogo, imageKind: "logo" };
  }
  return { imageUrl: null, imageKind: "none" };
}

function resolvePublisher(entry: NormalizedNewsEntry): string | null {
  const fromTitle = extractPublisherFromTitle(entry.title);
  const fromOutlet = typeof entry.authorOrOutlet === "string" && entry.authorOrOutlet.trim().length > 0
    ? sanitizeNewsLabel(entry.authorOrOutlet)
    : null;
  const fromHost = sanitizeNewsLabel(derivePublisherFromUrl(entry.canonicalUrl));
  const preferred = fromTitle || fromOutlet || fromHost;
  if (
    entry.sourceName === "google_news_ai" &&
    (preferred?.toLowerCase() === "google" || preferred?.toLowerCase() === "google news")
  ) {
    return fromTitle || fromHost || null;
  }
  return preferred;
}

export function toNewsApiItem(entry: NormalizedNewsEntry, nowIso: string): NewsApiItem {
  const source = sanitizeNewsLabel(getNewsSourceLabel(entry)) ?? getNewsSourceLabel(entry);
  const publisher = sanitizeNewsLabel(resolvePublisher(entry));
  const description = sanitizeNewsDescription(entry.summary ?? null);
  const image = pickEntryImageData(entry);
  return {
    id: entry.canonicalUrl,
    title: getNewsDisplayTitle(entry),
    link: entry.canonicalUrl,
    source,
    sourceName: entry.sourceName,
    publisher,
    sourceDisplay: formatNewsSourceDisplay(source, publisher),
    description,
    publishedAt: entry.publishedAt ?? nowIso,
    timeAgo: description,
    imageUrl: image.imageUrl,
    imageKind: image.imageKind,
    importanceScore: typeof entry.importanceScore === "number" ? entry.importanceScore : null,
  };
}
