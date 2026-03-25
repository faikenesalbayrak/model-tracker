import { NextRequest, NextResponse } from "next/server";
import { runScheduledCycle, runWeeklyDigestCycle } from "@/lib/monitoring/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunType = "scheduled" | "weekly";

function isManualRunEnabled(): boolean {
  const value = process.env.MONITORING_MANUAL_RUN_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function authorize(request: NextRequest): boolean {
  const requiredToken = process.env.MONITORING_MANUAL_TOKEN?.trim();
  if (!isManualRunEnabled() || !requiredToken) {
    return false;
  }

  const headerToken =
    request.headers.get("x-monitoring-token")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  return headerToken === requiredToken;
}

function parseRunType(raw: unknown): RunType {
  if (raw === "weekly") return "weekly";
  return "scheduled";
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: { type?: RunType; nowIso?: string; timeoutMs?: number } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // allow empty body
  }

  const runType = parseRunType(payload.type);

  try {
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
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Monitoring run failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
