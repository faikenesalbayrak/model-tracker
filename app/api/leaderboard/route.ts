import { NextRequest, NextResponse } from "next/server";
import { fallbackEnvelope, buildEnvelope } from "@/lib/normalize/common";
import {
  buildLeaderboardRecordsV2,
  type LeaderboardV2Response,
} from "@/lib/normalize/leaderboard";
import { fetchJsonWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import {
  DEFAULT_ROUTE_LIMITS,
  HF_DATASETS_SEARCH_API,
  HF_LEADERBOARD_V2_DATASET,
  LAB_HF_ORGS,
} from "@/lib/sources";
import type { ApiEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, ApiEnvelope>();

// One result per HF org — keeps request count manageable
const PER_ORG_ROWS = 5;

function clampLimit(value: string | null | undefined, fallback: number, max = 60): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function cacheKey(request: NextRequest): string {
  const search = request.nextUrl.searchParams.toString();
  return search || "default";
}

function buildSearchUrl(query: string): string {
  const url = new URL(HF_DATASETS_SEARCH_API);
  url.searchParams.set("dataset", HF_LEADERBOARD_V2_DATASET);
  url.searchParams.set("config", "default");
  url.searchParams.set("split", "train");
  url.searchParams.set("query", query);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", String(PER_ORG_ROWS));
  return url.toString();
}

async function fetchAllLabRows() {
  const allOrgs = Object.values(LAB_HF_ORGS).flat();

  const settled = await Promise.allSettled(
    allOrgs.map(async (org) => {
      const { data } = await fetchJsonWithRetry<LeaderboardV2Response>(
        buildSearchUrl(org),
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
        { allowedHosts: ["datasets-server.huggingface.co"] },
      );
      return (data.rows ?? []).map((r) => r.row ?? {});
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<Array<Record<string, unknown>>> =>
      r.status === "fulfilled"
    )
    .flatMap((r) => r.value);
}

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const key = cacheKey(request);
  const cached = cache.get(key);
  const limit = clampLimit(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_ROUTE_LIMITS.leaderboard,
    60,
  );
  const labFilter = request.nextUrl.searchParams.get("lab")?.toLowerCase().trim();

  try {
    const rows = await fetchAllLabRows();
    let records = buildLeaderboardRecordsV2({ rows, lastSuccessAt: generatedAt });

    if (labFilter) {
      records = records.filter((r) => r.lab.toLowerCase().includes(labFilter));
    }

    records = records.slice(0, limit);

    const envelope = buildEnvelope({
      route: "leaderboard",
      source: "hf_leaderboard",
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
        route: "leaderboard",
        source: "hf_leaderboard",
        generatedAt,
        error: errorMeta,
        note: "No cached leaderboard data available yet.",
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
