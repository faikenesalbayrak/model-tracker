import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  extractArtificialAnalysisModels,
  type ArtificialAnalysisModel,
} from "@/lib/normalize/artificial-analysis";
import { fetchWithRetry, toApiErrorMeta } from "@/lib/fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://artificialanalysis.ai/models";
const REFRESH_MS = 12 * 60 * 60 * 1000;
const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOT_FILE = path.join(DATA_DIR, "artificial-analysis-models.json");

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
let intervalStarted = false;

async function readSnapshotFromDisk(): Promise<Snapshot | null> {
  try {
    const raw = await readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Array.isArray(parsed.data) || typeof parsed.last_success_at !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshotToDisk(snapshot: Snapshot): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "utf8");
}

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
    await writeSnapshotToDisk(snapshot);
    memorySnapshot = snapshot;
    return snapshot;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function startAutoRefreshLoop(): void {
  if (intervalStarted) {
    return;
  }
  intervalStarted = true;

  const timer = setInterval(() => {
    void refreshSnapshot().catch(() => {
      // Preserve last good snapshot if refresh fails.
    });
  }, REFRESH_MS);

  timer.unref?.();
}

async function ensureSnapshot(): Promise<Snapshot | null> {
  if (memorySnapshot) {
    return memorySnapshot;
  }

  const disk = await readSnapshotFromDisk();
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
