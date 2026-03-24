import { NextRequest, NextResponse } from "next/server";
import { buildEnvelope } from "@/lib/normalize/common";
import {
  normalizeSemanticScholarPapers,
  type SemanticScholarSearchResponse,
} from "@/lib/normalize/semantic-scholar";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";
import {
  fetchJsonWithRetry,
  toApiErrorMeta,
} from "@/lib/fetcher";
import { DEFAULT_ROUTE_LIMITS } from "@/lib/sources";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_MS = 12 * 60 * 60 * 1000;

function clampLimit(value: string | null | undefined, fallback: number, max = 24): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cacheKey(request: NextRequest): string {
  const search = request.nextUrl.searchParams.toString();
  return `api-semantic-scholar-${Buffer.from(search || "default").toString("base64url")}`;
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
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.semantic_scholar,
    24,
  );
  const searchUrl = buildSearchUrl(query, limit);
  const buildFreshSnapshot = async (): Promise<ApiEnvelope> => {
    const fetchedAt = new Date().toISOString();
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

    const records = normalizeSemanticScholarPapers(data, fetchedAt, query, searchUrl).slice(
      0,
      limit,
    );

    return buildEnvelope({
      route: "semantic_scholar",
      source: "semantic_scholar_public",
      generatedAt: fetchedAt,
      lastSuccessAt: fetchedAt,
      data: records,
      error: null,
      stale: false,
    });
  };

  startAutoRefresh(key, REFRESH_MS, buildFreshSnapshot);

  try {
    let snapshot = await readSnapshot<ApiEnvelope>(key);
    if (!snapshot) {
      snapshot = await refreshSnapshot(key, buildFreshSnapshot);
    }

    const stale = isStale(snapshot.last_success_at, REFRESH_MS);
    if (stale) {
      void refreshSnapshot(key, buildFreshSnapshot).catch(() => {
        // keep last good snapshot
      });
    }

    return NextResponse.json(
      {
        ...snapshot,
        generated_at: generatedAt,
        stale,
      } satisfies ApiEnvelope,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);
    const cached = await readSnapshot<ApiEnvelope>(key);
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          generated_at: generatedAt,
          stale: true,
          error: errorMeta,
        } satisfies ApiEnvelope,
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      buildEnvelope({
        route: "semantic_scholar",
        source: "semantic_scholar_public",
        generatedAt,
        lastSuccessAt: generatedAt,
        data: [],
        error: errorMeta,
        stale: true,
        note: `No cached Semantic Scholar data available for "${query}".`,
      }),
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
