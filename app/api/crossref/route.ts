import { NextRequest, NextResponse } from "next/server";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { DEFAULT_ROUTE_LIMITS } from "@/lib/sources";
import {
  buildCrossrefEnvelope,
  buildCrossrefFallbackEnvelope,
  normalizeCrossrefWorks,
  type CrossrefEnvelope,
  type CrossrefResponse,
} from "@/lib/normalize/crossref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, CrossrefEnvelope>();

function clampLimit(value: string | null | undefined, fallback: number, max = 25): number {
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

function buildCrossrefUrl(query: string, limit: number): string {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", String(Math.max(20, Math.min(100, limit * 3))));
  url.searchParams.set("sort", "score");
  url.searchParams.set("order", "desc");
  url.searchParams.set(
    "select",
    [
      "DOI",
      "URL",
      "title",
      "container-title",
      "author",
      "created",
      "issued",
      "published",
      "published-online",
      "published-print",
      "score",
      "type",
      "is-referenced-by-count",
    ].join(","),
  );
  return url.toString();
}

function normalizeQuery(value: string | null | undefined): string {
  const query = value?.trim();
  return query && query.length > 0 ? query : "large language model";
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const key = cacheKey(request);
  const cached = cache.get(key);
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.releases,
    25,
  );

  try {
    const { data } = await fetchJsonWithRetry<CrossrefResponse>(
      buildCrossrefUrl(query, limit),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "model-tracker/0.1 (Crossref public metadata feed)",
        },
      },
      {
        allowedHosts: ["api.crossref.org"],
      },
    );

    const works = data.message?.items ?? [];
    const records = normalizeCrossrefWorks({
      query,
      works,
      generatedAt,
      lastSuccessAt: generatedAt,
    }).slice(0, limit);

    const envelope = buildCrossrefEnvelope({
      generatedAt,
      lastSuccessAt: generatedAt,
      data: records,
      error: null,
      stale: false,
      note: works.length === 0 ? `No Crossref results matched "${query}".` : undefined,
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
      const envelope: CrossrefEnvelope = {
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
      buildCrossrefFallbackEnvelope({
        generatedAt,
        error: errorMeta,
        note: `No cached Crossref data available for "${query}".`,
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
