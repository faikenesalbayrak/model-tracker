import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentCategory = "top_agents" | "skills" | "mcp_servers" | "overview";

function parseCategory(value: string | null): AgentCategory {
  if (value === "top_agents" || value === "skills" || value === "mcp_servers" || value === "overview") {
    return value;
  }
  return "overview";
}

async function readJsonFile<T>(fileName: string): Promise<T[]> {
  const fullPath = path.join(process.cwd(), "data", "agents", fileName);
  const raw = await fs.readFile(fullPath, "utf-8");
  return JSON.parse(raw) as T[];
}

export async function GET(request: NextRequest) {
  const category = parseCategory(request.nextUrl.searchParams.get("category"));

  const [topAgents, skills, mcpServers] = await Promise.all([
    readJsonFile<Record<string, unknown>>("top_agents.json"),
    readJsonFile<Record<string, unknown>>("skills.json"),
    readJsonFile<Record<string, unknown>>("mcp_servers.json"),
  ]);

  const snapshotAt = new Date().toISOString();

  if (category === "overview") {
    return NextResponse.json(
      {
        category,
        sourceName: "seed:internal+public",
        snapshotAt,
        lastSuccessAt: snapshotAt,
        data: {
          topAgents: topAgents.length,
          skills: skills.length,
          mcpServers: mcpServers.length,
          totalTracked: topAgents.length + skills.length + mcpServers.length,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const data =
    category === "top_agents"
      ? topAgents
      : category === "skills"
        ? skills
        : mcpServers;

  return NextResponse.json(
    {
      category,
      sourceName: "seed:internal+public",
      snapshotAt,
      lastSuccessAt: snapshotAt,
      scoreUnit: "index",
      total: data.length,
      data,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
