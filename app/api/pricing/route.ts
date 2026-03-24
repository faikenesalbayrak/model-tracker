import { NextRequest, NextResponse } from "next/server";
import { buildEnvelope } from "@/lib/normalize/common";
import { normalizeOpenRouterData, type OpenRouterResponse } from "@/lib/normalize/pricing";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { isStale, readSnapshot, refreshSnapshot, startAutoRefresh } from "@/lib/local-snapshot";
import { DEFAULT_ROUTE_LIMITS, OPENROUTER_MODELS_API } from "@/lib/sources";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "api-pricing";
const REFRESH_MS = 12 * 60 * 60 * 1000;

function clampLimit(value: string | null | undefined, fallback: number, max = 60): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

async function buildFreshSnapshot(): Promise<ApiEnvelope> {
  const generatedAt = new Date().toISOString();
  const { data } = await fetchJsonWithRetry<OpenRouterResponse>(
    OPENROUTER_MODELS_API,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    { allowedHosts: ["openrouter.ai"] },
  );

  const records = normalizeOpenRouterData(data, generatedAt);
  return buildEnvelope({
    route: "pricing",
    source: "pricing_feed",
    generatedAt,
    lastSuccessAt: generatedAt,
    data: records,
    error: null,
    stale: false,
  });
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.pricing,
    60,
  );

  startAutoRefresh(CACHE_KEY, REFRESH_MS, buildFreshSnapshot);

  try {
    let snapshot = await readSnapshot<ApiEnvelope>(CACHE_KEY);
    if (!snapshot) {
      snapshot = await refreshSnapshot(CACHE_KEY, buildFreshSnapshot);
    }

    const stale = isStale(snapshot.last_success_at, REFRESH_MS);
    if (stale) {
      void refreshSnapshot(CACHE_KEY, buildFreshSnapshot).catch(() => {
        // keep last good snapshot
      });
    }

    return NextResponse.json(
      {
        ...snapshot,
        generated_at: generatedAt,
        stale,
        data: snapshot.data.slice(0, limit),
      } satisfies ApiEnvelope,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);

    const cached = await readSnapshot<ApiEnvelope>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(
        {
          ...cached,
          generated_at: generatedAt,
          stale: true,
          error: errorMeta,
          data: cached.data.slice(0, limit),
        } satisfies ApiEnvelope,
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      buildEnvelope({
        route: "pricing",
        source: "pricing_feed",
        generatedAt,
        lastSuccessAt: generatedAt,
        data: [],
        error: errorMeta,
        stale: true,
        note: "No cached pricing data available yet.",
      }),
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
