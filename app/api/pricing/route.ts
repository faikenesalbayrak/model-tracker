import { NextRequest, NextResponse } from "next/server";
import { fallbackEnvelope, buildEnvelope } from "@/lib/normalize/common";
import { normalizeOpenRouterData, type OpenRouterResponse } from "@/lib/normalize/pricing";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { DEFAULT_ROUTE_LIMITS, OPENROUTER_MODELS_API } from "@/lib/sources";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, ApiEnvelope>();

function clampLimit(value: string | null | undefined, fallback: number, max = 60): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cacheKey(request: NextRequest): string {
  const search = request.nextUrl.searchParams.toString();
  return search || "default";
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const key = cacheKey(request);
  const cached = cache.get(key);
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.pricing,
    60,
  );

  try {
    const { data } = await fetchJsonWithRetry<OpenRouterResponse>(
      OPENROUTER_MODELS_API,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      { allowedHosts: ["openrouter.ai"] },
    );

    const records = normalizeOpenRouterData(data, generatedAt).slice(0, limit);

    const envelope = buildEnvelope({
      route: "pricing",
      source: "pricing_feed",
      generatedAt,
      lastSuccessAt: generatedAt,
      data: records,
      error: null,
      stale: false,
    });

    cache.set(key, envelope);
    return NextResponse.json(envelope, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const errorMeta = toApiErrorMeta(error);

    if (cached) {
      const envelope: ApiEnvelope = {
        ...cached,
        generated_at: generatedAt,
        stale: true,
        error: errorMeta,
      };
      return NextResponse.json(envelope, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      fallbackEnvelope({
        route: "pricing",
        source: "pricing_feed",
        generatedAt,
        error: errorMeta,
        note: "No cached pricing data available yet.",
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
