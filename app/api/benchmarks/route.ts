import { NextRequest, NextResponse } from "next/server";
import { fallbackEnvelope, buildEnvelope } from "@/lib/normalize/common";
import {
  getBenchmarkAliases,
  normalizeBenchmarkName,
  offlineBenchmarkFallback,
  pointsToRecords,
} from "@/lib/normalize/benchmarks";
import { fetchJsonWithRetry, toApiErrorMeta, UpstreamFetchError } from "@/lib/fetcher";
import { DEFAULT_ROUTE_LIMITS, PWC_API_BASE, PWC_SITE_BASE } from "@/lib/sources";
import type { ApiEnvelope, MetricKey } from "@/lib/types";

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

function buildCandidateUrls(metric: MetricKey): string[] {
  const aliases = getBenchmarkAliases(metric);
  const urls = new Set<string>();

  for (const alias of aliases.slice(0, 2)) {
    urls.add(`${PWC_API_BASE}/sota/?benchmark=${encodeURIComponent(alias)}`);
    urls.add(`${PWC_API_BASE}/sota/${encodeURIComponent(alias)}`);
  }

  return [...urls].slice(0, 4);
}

function toBenchmarkPoints(raw: unknown, metric: MetricKey, generatedAt: string): { points: ReturnType<typeof offlineBenchmarkFallback>; parsed: boolean } {
  if (Array.isArray(raw)) {
    return {
      parsed: true,
      points: raw.map((item) => ({
      model: String((item as Record<string, unknown>).model ?? (item as Record<string, unknown>).name ?? "unknown/model"),
      lab: String((item as Record<string, unknown>).lab ?? (item as Record<string, unknown>).creator ?? "Unknown"),
      score: Number((item as Record<string, unknown>).score ?? (item as Record<string, unknown>).value ?? 0),
      timestamp: String((item as Record<string, unknown>).timestamp ?? generatedAt),
      rank: typeof (item as Record<string, unknown>).rank === "number"
        ? (item as Record<string, unknown>).rank as number
        : undefined,
      sourceUrl: typeof (item as Record<string, unknown>).url === "string"
        ? (item as Record<string, unknown>).url as string
        : undefined,
      })),
    };
  }

  if (raw && typeof raw === "object") {
    const objectValue = raw as Record<string, unknown>;
    if (Array.isArray(objectValue.results)) {
      return toBenchmarkPoints(objectValue.results, metric, generatedAt);
    }

    if (Array.isArray(objectValue.data)) {
      return toBenchmarkPoints(objectValue.data, metric, generatedAt);
    }
  }

  return {
    parsed: false,
    points: offlineBenchmarkFallback(metric, generatedAt),
  };
}

async function fetchBenchmarkData(metric: MetricKey, generatedAt: string) {
  const candidateUrls = buildCandidateUrls(metric);
  const settled = await Promise.allSettled(
    candidateUrls.map(async (url) => {
      const { data } = await fetchJsonWithRetry<unknown>(
        url,
        {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          },
        },
        {
          allowedHosts: ["paperswithcode.com"],
        },
      );

      const parsed = toBenchmarkPoints(data, metric, generatedAt);
      return {
        parsed,
        sourceUrl: url,
      };
    }),
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    if (result.value.parsed.parsed && result.value.parsed.points.length > 0) {
      return {
        points: result.value.parsed.points,
        sourceUrl: result.value.sourceUrl,
        fallback: false,
        error: null,
      };
    }
  }

  return {
    points: offlineBenchmarkFallback(metric, generatedAt).map((point) => ({
      ...point,
      sourceUrl: `${PWC_SITE_BASE}/sota`,
    })),
    sourceUrl: `${PWC_SITE_BASE}/sota`,
    fallback: true,
    error: new UpstreamFetchError("Papers With Code benchmark data unavailable", {
      kind: "upstream_error",
      retryable: true,
      upstreamUrl: `${PWC_SITE_BASE}/sota`,
      detail: "Using offline benchmark fallback series.",
    }),
  };
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const key = cacheKey(request);
  const cached = cache.get(key);
  const metric = normalizeBenchmarkName(
    request.nextUrl.searchParams.get("benchmark") ?? request.nextUrl.searchParams.get("metric"),
  );
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.benchmarks,
    24,
  );

  try {
    const { points, sourceUrl, fallback, error } = await fetchBenchmarkData(metric, generatedAt);
    const records = pointsToRecords(metric, points, generatedAt, generatedAt, fallback)
      .slice(0, limit)
      .map((record) => ({
        ...record,
        payload: {
          ...record.payload,
          source_url: sourceUrl,
        },
      }));

    const envelope = buildEnvelope({
      route: "benchmarks",
      source: "pwc",
      generatedAt,
      lastSuccessAt: generatedAt,
      data: records,
      error: error ? toApiErrorMeta(error) : null,
      stale: Boolean(error),
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
        route: "benchmarks",
        source: "pwc",
        generatedAt,
        error: errorMeta,
        note: "No cached benchmark data available yet.",
      }),
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
