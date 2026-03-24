import { NextRequest, NextResponse } from "next/server";
import { fallbackEnvelope, buildEnvelope } from "@/lib/normalize/common";
import { filterRecentReleases, normalizeReleases, type HfModelCard } from "@/lib/normalize/releases";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import { DEFAULT_ROUTE_LIMITS, HUGGING_FACE_MODEL_API, LAB_HF_ORGS } from "@/lib/sources";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, ApiEnvelope>();

const PER_ORG_LIMIT = 5; // models fetched per HF org

function clampLimit(value: string | null | undefined, fallback: number, max = 30): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cacheKey(request: NextRequest): string {
  const search = request.nextUrl.searchParams.toString();
  return search || "default";
}

function buildOrgUrl(author: string): string {
  const url = new URL(HUGGING_FACE_MODEL_API);
  url.searchParams.set("sort", "lastModified");
  url.searchParams.set("limit", String(PER_ORG_LIMIT));
  url.searchParams.set("filter", "text-generation");
  url.searchParams.set("author", author);
  return url.toString();
}

function hfHeaders(): HeadersInit {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
}

async function fetchAllOrgs(): Promise<HfModelCard[]> {
  const allOrgs = Object.values(LAB_HF_ORGS).flat();

  const settled = await Promise.allSettled(
    allOrgs.map(async (author) => {
      const { data } = await fetchJsonWithRetry<HfModelCard[]>(
        buildOrgUrl(author),
        {
          method: "GET",
          headers: { ...hfHeaders(), Accept: "application/json" },
        },
        { allowedHosts: ["huggingface.co"] },
      );
      return data;
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<HfModelCard[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const key = cacheKey(request);
  const cached = cache.get(key);
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.releases,
    24,
  );

  try {
    const allModels = await fetchAllOrgs();

    const records = filterRecentReleases(normalizeReleases(allModels, generatedAt), generatedAt)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, limit);

    const envelope = buildEnvelope({
      route: "releases",
      source: "hf_hub",
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
        route: "releases",
        source: "hf_hub",
        generatedAt,
        error: errorMeta,
        note: "No cached release data available yet.",
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
