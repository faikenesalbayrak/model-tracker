import { fetchWithRetry } from "@/lib/fetcher";
import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import { classifyImageKind, isLikelyImageUrl } from "@/lib/news-display";

const DEFAULT_TIMEOUT_MS = 7_000;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_DELAY_MS = 120;
const DEFAULT_MAX_PER_BATCH = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(html)?.[1]?.trim();
    if (found && isLikelyImageUrl(found)) return found;
  }
  return null;
}

function getEnrichmentSettings() {
  const enabled = (process.env.MONITORING_NEWS_OG_ENRICHMENT_ENABLED ?? "true").toLowerCase() !== "false";
  const timeoutMs = Number(process.env.MONITORING_NEWS_OG_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const delayMs = Number(process.env.MONITORING_NEWS_OG_DELAY_MS ?? DEFAULT_DELAY_MS);
  const concurrency = Number(process.env.MONITORING_NEWS_OG_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  const maxPerBatch = Number(process.env.MONITORING_NEWS_OG_MAX_PER_BATCH ?? DEFAULT_MAX_PER_BATCH);
  return {
    enabled,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : DEFAULT_DELAY_MS,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : DEFAULT_CONCURRENCY,
    maxPerBatch: Number.isFinite(maxPerBatch) && maxPerBatch > 0 ? Math.floor(maxPerBatch) : DEFAULT_MAX_PER_BATCH,
  };
}

function shouldEnrich(entry: NormalizedNewsEntry): boolean {
  const image =
    typeof entry.payload?.image_url === "string"
      ? entry.payload.image_url
      : typeof entry.payload?.imageUrl === "string"
        ? entry.payload.imageUrl
        : null;
  const logo = typeof entry.payload?.source_logo === "string" ? entry.payload.source_logo : null;
  const kind = classifyImageKind(image, logo);
  return kind === "logo" || kind === "none";
}

async function enrichSingle(entry: NormalizedNewsEntry, timeoutMs: number): Promise<NormalizedNewsEntry> {
  try {
    const host = new URL(entry.canonicalUrl).hostname;
    const { data: html } = await fetchWithRetry<string>(
      entry.canonicalUrl,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "model-tracker-monitoring/1.0",
        },
      },
      async (response) => response.text(),
      { timeoutMs, retries: 1, allowedHosts: [host] },
    );
    const og = parseOgImage(html);
    if (!og) return entry;
    return {
      ...entry,
      payload: {
        ...(entry.payload ?? {}),
        image_url: og,
        image_enriched_at: new Date().toISOString(),
      },
    };
  } catch {
    return entry;
  }
}

export async function enrichNewsEntriesWithOgImages(entries: NormalizedNewsEntry[]): Promise<NormalizedNewsEntry[]> {
  const settings = getEnrichmentSettings();
  if (!settings.enabled || entries.length === 0) return entries;

  const enriched = [...entries];
  const candidates = enriched
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => shouldEnrich(entry))
    .slice(0, settings.maxPerBatch);
  if (candidates.length === 0) return enriched;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const current = cursor;
      cursor += 1;
      const { entry, index } = candidates[current];
      enriched[index] = await enrichSingle(entry, settings.timeoutMs);
      if (settings.delayMs > 0) {
        await sleep(settings.delayMs);
      }
    }
  }

  const count = Math.max(1, Math.min(settings.concurrency, candidates.length));
  await Promise.all(Array.from({ length: count }, () => worker()));
  return enriched;
}
