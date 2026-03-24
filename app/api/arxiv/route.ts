import { NextRequest, NextResponse } from "next/server";
import { fetchWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { fallbackEnvelope } from "@/lib/normalize/common";
import { normalizeArxivFeed } from "@/lib/normalize/arxiv";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARXIV_API_BASE = "https://export.arxiv.org/api/query";
const ARXIV_SOURCE = "arxiv_public";
const ARXIV_ROUTE = "arxiv";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map<string, ApiEnvelope>();

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
  return `${query}::${limit}`;
}

function isStale(lastSuccessAt: string): boolean {
  const timestamp = Date.parse(lastSuccessAt);
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > CACHE_TTL_MS;
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
    stale: params.stale ?? isStale(params.lastSuccessAt),
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
  const cached = cache.get(key);
  const feedUrl = buildFeedUrl(query, limit);

  try {
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
      generatedAt,
      lastSuccessAt: generatedAt,
    }).slice(0, limit);

    const envelope = buildEnvelope({
      generatedAt,
      lastSuccessAt: generatedAt,
      data: records,
      error: null,
      stale: false,
      note: `Query: ${query}`,
    });

    cache.set(key, envelope);
    return NextResponse.json(envelope, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);

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

    return NextResponse.json(
      fallbackEnvelope({
        route: ARXIV_ROUTE as ApiEnvelope["route"],
        source: ARXIV_SOURCE as ApiEnvelope["source"],
        generatedAt,
        error: errorMeta,
        note: "No cached arXiv data available yet.",
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
