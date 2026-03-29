import { NextResponse } from "next/server";
import {
  extractArtificialAnalysisModels,
  type ArtificialAnalysisModel,
} from "@/lib/normalize/artificial-analysis";
import { fetchWithRetry, toApiErrorMeta } from "@/lib/fetcher";
import {
  readSnapshot,
  refreshSnapshot as persistSnapshot,
  startAutoRefresh,
} from "@/lib/local-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://artificialanalysis.ai/models";
const REFRESH_MS = 12 * 60 * 60 * 1000;
const CACHE_KEY = "artificial-analysis-models";

type Snapshot = {
  last_success_at: string;
  source: "artificial_analysis_models_page";
  data: ArtificialAnalysisModel[];
};

type Payload = Snapshot & {
  generated_at: string;
  stale: boolean;
  error: ReturnType<typeof toApiErrorMeta> | null;
  note?: string;
};

let memorySnapshot: Snapshot | null = null;
let refreshInFlight: Promise<Snapshot> | null = null;

function snapshotIsStale(lastSuccessAt: string): boolean {
  const last = Date.parse(lastSuccessAt);
  if (!Number.isFinite(last)) {
    return true;
  }
  return Date.now() - last >= REFRESH_MS;
}

async function fetchFreshSnapshot(): Promise<Snapshot> {
  const { data: html } = await fetchWithRetry<string>(
    SOURCE_URL,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "model-tracker/1.0 (+https://localhost:4000)",
      },
    },
    async (response) => response.text(),
    {
      allowedHosts: ["artificialanalysis.ai"],
    },
  );

  const models = extractArtificialAnalysisModels(html);
  if (models.length === 0) {
    throw new Error("Could not parse models payload from artificialanalysis.ai");
  }

  return {
    last_success_at: new Date().toISOString(),
    source: "artificial_analysis_models_page",
    data: models,
  };
}

async function refreshSnapshot(): Promise<Snapshot> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const snapshot = await fetchFreshSnapshot();
    memorySnapshot = snapshot;
    await persistSnapshot<Snapshot>(CACHE_KEY, async () => snapshot);
    return snapshot;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function startAutoRefreshLoop(): void {
  startAutoRefresh(CACHE_KEY, REFRESH_MS, refreshSnapshot);
}

async function ensureSnapshot(): Promise<Snapshot | null> {
  if (memorySnapshot) {
    return memorySnapshot;
  }

  const disk = await readSnapshot<Snapshot>(CACHE_KEY);
  if (disk) {
    memorySnapshot = disk;
    return disk;
  }

  try {
    return await refreshSnapshot();
  } catch {
    return null;
  }
}

export async function GET() {
  startAutoRefreshLoop();
  const generatedAt = new Date().toISOString();

  const snapshot = await ensureSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      {
        generated_at: generatedAt,
        last_success_at: generatedAt,
        source: "artificial_analysis_models_page",
        stale: true,
        error: toApiErrorMeta(new Error("No locally cached model data available yet.")),
        data: [],
        note: "Initial upstream fetch failed and no local snapshot exists yet.",
      } satisfies Payload,
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const stale = snapshotIsStale(snapshot.last_success_at);
  if (stale) {
    void refreshSnapshot().catch(() => {
      // Keep serving last good snapshot.
    });
  }

  return NextResponse.json(
    {
      generated_at: generatedAt,
      last_success_at: snapshot.last_success_at,
      source: snapshot.source,
      stale,
      error: null,
      data: snapshot.data,
      ...(stale
        ? { note: "Serving local cached snapshot while background refresh is in progress." }
        : {}),
    } satisfies Payload,
    { headers: { "Cache-Control": "no-store" } },
  );
}
