import { NextRequest, NextResponse } from "next/server";
import { buildEnvelope } from "@/lib/normalize/common";
import {
  offlineSemanticScholarFallback,
  normalizeSemanticScholarPapers,
  type SemanticScholarSearchResponse,
} from "@/lib/normalize/semantic-scholar";
import {
  fetchJsonWithRetry,
  toApiErrorMeta,
  UpstreamFetchError,
} from "@/lib/fetcher";
import { DEFAULT_ROUTE_LIMITS } from "@/lib/sources";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, ApiEnvelope>();

function clampLimit(value: string | null | undefined, fallback: number, max = 24): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cacheKey(request: NextRequest): string {
  const search = request.nextUrl.searchParams.toString();
  return search || "default";
}

function normalizeQuery(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "large language model";
}

function buildSearchUrl(query: string, limit: number): string {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", query);
  url.searchParams.set(
    "fields",
    [
      "paperId",
      "title",
      "abstract",
      "venue",
      "year",
      "publicationDate",
      "citationCount",
      "url",
      "openAccessPdf",
      "authors",
      "externalIds",
      "fieldsOfStudy",
    ].join(","),
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");
  return url.toString();
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const key = cacheKey(request);
  const cached = cache.get(key);
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.semantic_scholar,
    24,
  );
  const searchUrl = buildSearchUrl(query, limit);

  try {
    const { data } = await fetchJsonWithRetry<SemanticScholarSearchResponse>(
      searchUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      {
        allowedHosts: ["api.semanticscholar.org"],
      },
    );

    const records = normalizeSemanticScholarPapers(data, generatedAt, query, searchUrl).slice(
      0,
      limit,
    );

    const envelope = buildEnvelope({
      route: "semantic_scholar",
      source: "semantic_scholar_public",
      generatedAt,
      lastSuccessAt: generatedAt,
      data: records,
      error: null,
      stale: false,
    });

    cache.set(key, envelope);
    return NextResponse.json(envelope, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const attempts = error instanceof UpstreamFetchError ? error.attempts : undefined;
    const errorMeta = toApiErrorMeta(error, attempts);

    if (cached) {
      const envelope: ApiEnvelope = {
        ...cached,
        generated_at: generatedAt,
        stale: true,
        error: errorMeta,
      };

      return NextResponse.json(envelope, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    const fallbackRecords = offlineSemanticScholarFallback(query, generatedAt, searchUrl).slice(
      0,
      limit,
    );

    return NextResponse.json(
      buildEnvelope({
        route: "semantic_scholar",
        source: "semantic_scholar_public",
        generatedAt,
        lastSuccessAt: generatedAt,
        data: fallbackRecords,
        error: errorMeta,
        stale: true,
        note: "Using offline Semantic Scholar fallback series.",
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
