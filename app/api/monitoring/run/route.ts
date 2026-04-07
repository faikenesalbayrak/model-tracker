import { NextRequest, NextResponse } from "next/server";
import { MonitoringRunConflictError, runScheduledCycle, type RunLane } from "@/lib/monitoring/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RunPayload = { nowIso?: string; timeoutMs?: number; lanes?: RunLane[] };
const RUN_LANES: RunLane[] = ["metadata", "leaderboard", "news", "maintenance"];

function isManualRunEnabled(): boolean {
  const value = process.env.MONITORING_MANUAL_RUN_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function readBearerToken(request: NextRequest): string | null {
  return (
    request.headers.get("x-monitoring-token")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    null
  );
}

function parseLanes(input: string[]): RunLane[] | undefined {
  const parsed = input
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is RunLane => RUN_LANES.includes(value as RunLane));
  return parsed.length > 0 ? parsed : undefined;
}

function parseLanesFromSearchParams(request: NextRequest): RunLane[] | undefined {
  const explicit = request.nextUrl.searchParams.getAll("lane");
  if (explicit.length === 0) {
    return undefined;
  }
  return parseLanes(explicit);
}

function parseLanesFromPayload(payload: RunPayload): RunLane[] | undefined {
  if (!Array.isArray(payload.lanes) || payload.lanes.length === 0) {
    return undefined;
  }
  return parseLanes(payload.lanes.map((value) => String(value)));
}

function authorizeManual(request: NextRequest): boolean {
  const requiredToken = process.env.MONITORING_MANUAL_TOKEN?.trim();
  if (!isManualRunEnabled() || !requiredToken) {
    return false;
  }
  return readBearerToken(request) === requiredToken;
}

function authorizeCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }
  return readBearerToken(request) === cronSecret;
}

async function executeRun(payload: RunPayload, lanes: RunLane[] | undefined, runType: "manual" | "scheduled_12h") {
  const result = await runScheduledCycle({
    nowIso: payload.nowIso,
    timeoutMs: payload.timeoutMs,
    lanes,
    runType,
  });
  return NextResponse.json(
    {
      ok: true,
      type: runType,
      runId: result.runId,
      lanes: lanes ?? RUN_LANES,
      summary: result.summary,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof MonitoringRunConflictError) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Monitoring run failed",
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return unauthorizedResponse();
  }

  const timeoutRaw = request.nextUrl.searchParams.get("timeoutMs");
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
  const lanes = parseLanesFromSearchParams(request);

  try {
    return await executeRun(
      {
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      },
      lanes,
      "scheduled_12h",
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const manualAuthorized = authorizeManual(request);
  const cronAuthorized = authorizeCron(request);
  if (!manualAuthorized && !cronAuthorized) {
    return unauthorizedResponse();
  }

  let payload: RunPayload = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // allow empty body
  }

  const lanes = parseLanesFromPayload(payload) ?? parseLanesFromSearchParams(request);
  const runType = cronAuthorized && !manualAuthorized ? "scheduled_12h" : "manual";

  try {
    return await executeRun(payload, lanes, runType);
  } catch (error) {
    return errorResponse(error);
  }
}
