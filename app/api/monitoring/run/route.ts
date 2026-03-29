import { NextRequest, NextResponse } from "next/server";
import { runScheduledCycle } from "@/lib/monitoring/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunPayload = { nowIso?: string; timeoutMs?: number };

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

async function executeRun(payload: RunPayload) {
  const result = await runScheduledCycle({
    nowIso: payload.nowIso,
    timeoutMs: payload.timeoutMs,
  });
  return NextResponse.json(
    {
      ok: true,
      type: "scheduled",
      runId: result.runId,
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

  try {
    return await executeRun({
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeManual(request) && !authorizeCron(request)) {
    return unauthorizedResponse();
  }

  let payload: RunPayload = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // allow empty body
  }

  try {
    return await executeRun(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
