import { NextRequest, NextResponse } from "next/server";
import { runScheduledCycle, runWeeklyDigestCycle } from "@/lib/monitoring/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunType = "scheduled" | "weekly";

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

function parseRunType(raw: unknown): RunType {
  if (raw === "weekly") return "weekly";
  return "scheduled";
}

async function executeRun(payload: { type?: RunType; nowIso?: string; timeoutMs?: number }) {
  const runType = parseRunType(payload.type);

  if (runType === "weekly") {
    const result = await runWeeklyDigestCycle({
      nowIso: payload.nowIso,
      timeoutMs: payload.timeoutMs,
    });
    return NextResponse.json(
      {
        ok: true,
        type: "weekly",
        runId: result.runId,
        digestCount: result.digestCount,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

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

  const type = parseRunType(request.nextUrl.searchParams.get("type"));
  const timeoutRaw = request.nextUrl.searchParams.get("timeoutMs");
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;

  try {
    return await executeRun({
      type,
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

  let payload: { type?: RunType; nowIso?: string; timeoutMs?: number } = {};
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
