import { NextRequest, NextResponse } from "next/server";
import { fetchWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { normalizeArxivFeed } from "@/lib/normalize/arxiv";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARXIV_API_BASE = "https://export.arxiv.org/api/query";
const ARXIV_SOURCE = "arxiv_public";
const ARXIV_ROUTE = "arxiv";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const REFRESH_MS = 12 * 60 * 60 * 1000;

function normalizeLimit(value: string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function normalizeQuery(value: string | null | undefined): string {
  const query = (value ?? "").trim();
  if (!query) {
    return 'cat:cs.AI OR cat:cs.LG OR cat:cs.CL';
  }

  if (/[:()"]|\b(AND|OR|ANDNOT|NOT)\b/i.test(query)) {
    return query;
  }

  return `all:"${query.replace(/"/g, "")}"`;
}

function buildFeedUrl(query: string, limit: number): string {
  const url = new URL(ARXIV_API_BASE);
  url.searchParams.set("search_query", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url.toString();
}

function cacheKey(query: string, limit: number): string {
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 80);
  return `api-arxiv-${normalizedQuery || "default"}-${limit}`;
}

function buildEnvelope(params: {
  generatedAt: string;
  lastSuccessAt: string;
  data: ApiEnvelope["data"];
  error: ApiEnvelope["error"];
  stale?: boolean;
  note?: string;
}): ApiEnvelope {
  return {
    route: ARXIV_ROUTE as ApiEnvelope["route"],
    source: ARXIV_SOURCE as ApiEnvelope["source"],
    generated_at: params.generatedAt,
    last_success_at: params.lastSuccessAt,
    stale: params.stale ?? isStale(params.lastSuccessAt, REFRESH_MS),
    data: params.data,
    error: params.error,
    ...(params.note ? { note: params.note } : {}),
  };
}

function buildHeaders(): HeadersInit {
  return {
    Accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
    "User-Agent": "model-tracker/0.1 (arXiv public feed)",
  };
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  const limit = normalizeLimit(request.nextUrl.searchParams.get("limit"));
  const key = cacheKey(query, limit);
  const feedUrl = buildFeedUrl(query, limit);

  const buildFreshSnapshot = async (): Promise<ApiEnvelope> => {
    const fetchedAt = new Date().toISOString();
    const { data: xml } = await fetchWithRetry<string>(
      feedUrl,
      {
        method: "GET",
        headers: buildHeaders(),
      },
      async (response) => response.text(),
      {
        allowedHosts: ["export.arxiv.org"],
      },
    );

    const records = normalizeArxivFeed({
      xml,
      generatedAt: fetchedAt,
      lastSuccessAt: fetchedAt,
    }).slice(0, limit);

    return buildEnvelope({
      generatedAt: fetchedAt,
      lastSuccessAt: fetchedAt,
      data: records,
      error: null,
      stale: false,
      note: `Query: ${query}`,
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
        generatedAt,
        lastSuccessAt: generatedAt,
        data: [],
        error: errorMeta,
        stale: true,
        note: "No cached arXiv data available yet.",
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
