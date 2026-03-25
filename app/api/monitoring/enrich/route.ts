import { NextRequest, NextResponse } from "next/server";
import { runGeneralLlmMetadataEnrichment } from "@/lib/monitoring/metadata-enrichment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: { nowIso?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // allow empty body
  }

  try {
    const result = await runGeneralLlmMetadataEnrichment({
      nowIso: payload.nowIso,
    });
    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Metadata enrichment failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
