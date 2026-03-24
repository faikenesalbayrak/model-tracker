import { NextRequest, NextResponse } from "next/server";
import { buildEnvelope } from "@/lib/normalize/common";
import {
  getBenchmarkAliases,
  normalizeBenchmarkName,
  pointsToRecords,
} from "@/lib/normalize/benchmarks";
import { fetchJsonWithRetry, toApiErrorMeta, UpstreamFetchError } from "@/lib/fetcher";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";
import { DEFAULT_ROUTE_LIMITS, PWC_API_BASE, PWC_SITE_BASE } from "@/lib/sources";
import type { ApiEnvelope, MetricKey } from "@/lib/types";

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

function buildCandidateUrls(metric: MetricKey): string[] {
  const aliases = getBenchmarkAliases(metric);
  const urls = new Set<string>();

  for (const alias of aliases.slice(0, 2)) {
    urls.add(`${PWC_API_BASE}/sota/?benchmark=${encodeURIComponent(alias)}`);
    urls.add(`${PWC_API_BASE}/sota/${encodeURIComponent(alias)}`);
  }

  return [...urls].slice(0, 4);
}

function toBenchmarkPoints(raw: unknown, generatedAt: string): { points: Array<{
  model: string;
  lab: string;
  score: number;
  timestamp: string;
  rank?: number;
  sourceUrl?: string;
}>; parsed: boolean } {
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
      return toBenchmarkPoints(objectValue.results, generatedAt);
    }

    if (Array.isArray(objectValue.data)) {
      return toBenchmarkPoints(objectValue.data, generatedAt);
    }
  }

  return {
    parsed: false,
    points: [],
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

      const parsed = toBenchmarkPoints(data, generatedAt);
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

  throw new UpstreamFetchError("Papers With Code benchmark data unavailable", {
      kind: "upstream_error",
      retryable: true,
      upstreamUrl: `${PWC_SITE_BASE}/sota`,
      detail: "No benchmark rows could be parsed from source.",
    });
}

async function buildFreshSnapshot(metric: MetricKey): Promise<ApiEnvelope> {
  const generatedAt = new Date().toISOString();
  const { points, sourceUrl, fallback, error } = await fetchBenchmarkData(metric, generatedAt);
  const records = pointsToRecords(metric, points, generatedAt, generatedAt, fallback)
    .map((record) => ({
      ...record,
      payload: {
        ...record.payload,
        source_url: sourceUrl,
      },
    }));

  return buildEnvelope({
    route: "benchmarks",
    source: "pwc",
    generatedAt,
    lastSuccessAt: generatedAt,
    data: records,
    error: error ? toApiErrorMeta(error) : null,
    stale: Boolean(error),
  });
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const metric = normalizeBenchmarkName(
    request.nextUrl.searchParams.get("benchmark") ?? request.nextUrl.searchParams.get("metric"),
  );
  const cacheKey = `api-benchmarks-${metric}`;
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.benchmarks,
    24,
  );

  startAutoRefresh(cacheKey, REFRESH_MS, () => buildFreshSnapshot(metric));

  try {
    let snapshot = await readSnapshot<ApiEnvelope>(cacheKey);
    if (!snapshot) {
      snapshot = await refreshSnapshot(cacheKey, () => buildFreshSnapshot(metric));
    }

    const stale = isStale(snapshot.last_success_at, REFRESH_MS);
    if (stale) {
      void refreshSnapshot(cacheKey, () => buildFreshSnapshot(metric)).catch(() => {
        // keep last good snapshot
      });
    }

    return NextResponse.json({
      ...snapshot,
      generated_at: generatedAt,
      stale,
      data: snapshot.data.slice(0, limit),
    } satisfies ApiEnvelope, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);
    const cached = await readSnapshot<ApiEnvelope>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        generated_at: generatedAt,
        stale: true,
        error: errorMeta,
        data: cached.data.slice(0, limit),
      } satisfies ApiEnvelope, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      buildEnvelope({
        route: "benchmarks",
        source: "pwc",
        generatedAt,
        lastSuccessAt: generatedAt,
        data: [],
        error: errorMeta,
        stale: true,
        note: "No cached benchmark data available yet.",
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
