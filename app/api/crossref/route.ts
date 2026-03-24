import { NextRequest, NextResponse } from "next/server";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";
import { DEFAULT_ROUTE_LIMITS } from "@/lib/sources";
import {
  buildCrossrefEnvelope,
  normalizeCrossrefWorks,
  type CrossrefEnvelope,
  type CrossrefResponse,
} from "@/lib/normalize/crossref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_MS = 12 * 60 * 60 * 1000;

function clampLimit(value: string | null | undefined, fallback: number, max = 25): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cacheKey(request: NextRequest): string {
  const search = request.nextUrl.searchParams.toString();
  return `api-crossref-${Buffer.from(search || "default").toString("base64url")}`;
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
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.releases,
    25,
  );
  const buildFreshSnapshot = async (): Promise<CrossrefEnvelope> => {
    const fetchedAt = new Date().toISOString();
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
      generatedAt: fetchedAt,
      lastSuccessAt: fetchedAt,
    }).slice(0, limit);

    return buildCrossrefEnvelope({
      generatedAt: fetchedAt,
      lastSuccessAt: fetchedAt,
      data: records,
      error: null,
      stale: false,
      note: works.length === 0 ? `No Crossref results matched "${query}".` : undefined,
    });
  };

  startAutoRefresh(key, REFRESH_MS, buildFreshSnapshot);

  try {
    let snapshot = await readSnapshot<CrossrefEnvelope>(key);
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
      } satisfies CrossrefEnvelope,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);
    const cached = await readSnapshot<CrossrefEnvelope>(key);
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          generated_at: generatedAt,
          stale: true,
          error: errorMeta,
        } satisfies CrossrefEnvelope,
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      buildCrossrefEnvelope({
        generatedAt,
        lastSuccessAt: generatedAt,
        data: [],
        error: errorMeta,
        stale: true,
        note: `No cached Crossref data available for "${query}".`,
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
