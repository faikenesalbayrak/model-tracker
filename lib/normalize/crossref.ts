import { buildConfidence } from "@/lib/normalize/common";

type CrossrefDateParts = {
  "date-parts"?: number[][];
};

export interface CrossrefWork {
  DOI?: string;
  URL?: string;
  title?: string[];
  "container-title"?: string[];
  author?: Array<{
    given?: string;
    family?: string;
    name?: string;
  }>;
  created?: CrossrefDateParts;
  issued?: CrossrefDateParts;
  published?: CrossrefDateParts;
  "published-online"?: CrossrefDateParts;
  "published-print"?: CrossrefDateParts;
  score?: number;
  type?: string;
  "is-referenced-by-count"?: number;
}

export interface CrossrefResponse {
  message?: {
    items?: CrossrefWork[];
    "total-results"?: number;
  };
}

export type CrossrefSource = "crossref_public";

export type CrossrefRecord = {
  id: string;
  kind: "benchmark";
  lab: string;
  source: CrossrefSource;
  metric: null;
  value: number;
  title: string;
  subtitle?: string;
  url: string;
  timestamp: string;
  confidence: "high" | "medium" | "low";
  last_success_at: string;
  payload: {
    doi: string | null;
    doi_url: string;
    title: string;
    title_url: string;
    container_title: string | null;
    authors: string[];
    work_type: string | null;
    crossref_score: number | null;
    referenced_by_count: number | null;
    published_at: string;
    query: string;
  };
};

type CrossrefEnvelope = {
  route: "crossref";
  generated_at: string;
  last_success_at: string;
  stale: boolean;
  source: CrossrefSource;
  data: CrossrefRecord[];
  error: {
    kind: string;
    message: string;
    status?: number;
    retryAfterSeconds?: number;
    upstreamUrl?: string;
    detail?: string;
    attempts?: number;
  } | null;
  note?: string;
};

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function firstString(value: string[] | undefined): string | null {
  const candidate = value?.[0]?.trim();
  return candidate ? candidate : null;
}

function extractPublishedAt(work: CrossrefWork, fallback: string): string {
  const candidates = [
    work["published-online"],
    work["published-print"],
    work.published,
    work.issued,
    work.created,
  ];

  for (const candidate of candidates) {
    const parts = candidate?.["date-parts"]?.[0];
    if (!parts?.length) continue;

    const [year, month = 1, day = 1] = parts;
    const isoMonth = String(month).padStart(2, "0");
    const isoDay = String(day).padStart(2, "0");
    const iso = `${year}-${isoMonth}-${isoDay}T00:00:00.000Z`;
    if (!Number.isNaN(Date.parse(iso))) {
      return iso;
    }
  }

  return fallback;
}

function toDoiUrl(doi: string | null | undefined, url?: string): string {
  if (url?.trim()) {
    return url.trim();
  }

  if (doi?.trim()) {
    return `https://doi.org/${doi.trim()}`;
  }

  return "https://crossref.org";
}

function normalizeAuthors(work: CrossrefWork): string[] {
  return (work.author ?? [])
    .map((author) => author.name?.trim() || [author.given, author.family].filter(Boolean).join(" ").trim())
    .filter((author): author is string => Boolean(author));
}

function stableRecordId(doi: string | null, title: string): string {
  const base = doi?.trim() || title.trim() || "unknown";
  return `crossref:${base.toLowerCase()}`;
}

export function normalizeCrossrefWorks(params: {
  query: string;
  works: CrossrefWork[];
  generatedAt: string;
  lastSuccessAt: string;
}): CrossrefRecord[] {
  return params.works
    .map((work, index) => {
      const title = firstString(work.title) ?? "Untitled work";
      const doi = work.DOI?.trim() || null;
      const doiUrl = toDoiUrl(doi, work.URL);
      const publishedAt = extractPublishedAt(work, params.generatedAt);
      const containerTitle = firstString(work["container-title"]);
      const authors = normalizeAuthors(work);
      const score = typeof work.score === "number" ? work.score : null;
      const referencedByCount = typeof work["is-referenced-by-count"] === "number"
        ? work["is-referenced-by-count"]
        : null;

      return {
        id: stableRecordId(doi, title),
        kind: "benchmark",
        lab: "Crossref",
        source: "crossref_public",
        metric: null,
        value: referencedByCount ?? score ?? index + 1,
        title,
        subtitle: containerTitle ?? authors[0] ?? "Crossref metadata",
        url: doiUrl,
        timestamp: publishedAt,
        confidence: buildConfidence({
          hasFreshTimestamp: Boolean(publishedAt),
          hasSummary: Boolean(title),
        }),
        last_success_at: params.lastSuccessAt,
        payload: {
          doi,
          doi_url: doiUrl,
          title,
          title_url: doiUrl,
          container_title: containerTitle,
          authors,
          work_type: work.type ?? null,
          crossref_score: score,
          referenced_by_count: referencedByCount,
          published_at: publishedAt,
          query: params.query,
        },
      } satisfies CrossrefRecord;
    });
}

export function isCrossrefStale(lastSuccessAt: string): boolean {
  const timestamp = Date.parse(lastSuccessAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > STALE_AFTER_MS;
}

export function buildCrossrefEnvelope(params: {
  generatedAt: string;
  lastSuccessAt: string;
  data: CrossrefRecord[];
  error: CrossrefEnvelope["error"];
  stale?: boolean;
  note?: string;
}): CrossrefEnvelope {
  return {
    route: "crossref",
    generated_at: params.generatedAt,
    last_success_at: params.lastSuccessAt,
    stale: params.stale ?? isCrossrefStale(params.lastSuccessAt),
    source: "crossref_public",
    data: params.data,
    error: params.error,
    ...(params.note ? { note: params.note } : {}),
  };
}

export function buildCrossrefFallbackEnvelope(params: {
  generatedAt: string;
  error: CrossrefEnvelope["error"];
  note?: string;
}): CrossrefEnvelope {
  return {
    route: "crossref",
    generated_at: params.generatedAt,
    last_success_at: params.generatedAt,
    stale: true,
    source: "crossref_public",
    data: [],
    error: params.error,
    ...(params.note ? { note: params.note } : {}),
  };
}

export type { CrossrefEnvelope };
