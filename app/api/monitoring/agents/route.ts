import { NextRequest, NextResponse } from "next/server";
import { openMonitoringRuntime } from "@/lib/monitoring/runtime";
import type { AgentListQuery } from "@/lib/monitoring/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentCategory = "top_agents" | "skills" | "mcp_servers" | "overview";
type AgentBoard = "main" | "trending24h" | "top";

type AgentRepoShape = {
  getLatestAgentSnapshotAt: () => string | null | Promise<string | null>;
  getAgentsOverviewCounts: () => { skills: number; mcpServers: number } | Promise<{ skills: number; mcpServers: number }>;
  getLatestCategorySnapshot: (category: "general_llm") => Promise<{ sourceName: string; snapshotAt: string; entries: Array<{ canonicalModelKey: string; modelName: string; vendor?: string; score?: number }> } | { sourceName: string; snapshotAt: string; entries: Array<{ canonicalModelKey: string; modelName: string; vendor?: string; score?: number }> } | null>;
  getSkillEntries: (query: AgentListQuery) => { total: number; data: Array<Record<string, unknown>> } | Promise<{ total: number; data: Array<Record<string, unknown>> }>;
  getSkillTrending24hEntries: (query: AgentListQuery) => { total: number; data: Array<Record<string, unknown>> } | Promise<{ total: number; data: Array<Record<string, unknown>> }>;
  getSkillTopEntries: (query: AgentListQuery) => { total: number; data: Array<Record<string, unknown>> } | Promise<{ total: number; data: Array<Record<string, unknown>> }>;
  getMcpEntries: (query: AgentListQuery) => { total: number; data: Array<Record<string, unknown>> } | Promise<{ total: number; data: Array<Record<string, unknown>> }>;
  getMcpTrending24hEntries: (query: AgentListQuery) => { total: number; data: Array<Record<string, unknown>> } | Promise<{ total: number; data: Array<Record<string, unknown>> }>;
  getMcpTopEntries: (query: AgentListQuery) => { total: number; data: Array<Record<string, unknown>> } | Promise<{ total: number; data: Array<Record<string, unknown>> }>;
  getSkillFacets: () => { categories: string[]; sources: string[] } | Promise<{ categories: string[]; sources: string[] }>;
  getMcpFacets: () => { categories: string[]; sources: string[] } | Promise<{ categories: string[]; sources: string[] }>;
};

function parseCategory(value: string | null): AgentCategory {
  if (value === "top_agents" || value === "skills" || value === "mcp_servers" || value === "overview") {
    return value;
  }
  return "overview";
}

function parseBoard(value: string | null): AgentBoard {
  if (value === "main" || value === "trending24h" || value === "top") {
    return value;
  }
  return "main";
}

function parseNumber(input: string | null, fallback: number): number {
  if (!input) return fallback;
  const value = Number(input);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function asNonEmpty(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toAgentListQuery(request: NextRequest, endpointCategory: AgentCategory): AgentListQuery {
  const params = request.nextUrl.searchParams;
  const sort = params.get("sort");
  const order = params.get("order");
  const view = params.get("view");
  const officiality = params.get("officiality");

  const categoryFromParam = asNonEmpty(params.get("category"));
  const categoryFilter = asNonEmpty(params.get("categoryFilter")) ?? (
    categoryFromParam && categoryFromParam !== endpointCategory ? categoryFromParam : undefined
  );

  return {
    q: asNonEmpty(params.get("q")),
    view: view === "all_time" || view === "trending" || view === "hot" ? view : undefined,
    officiality:
      officiality === "official" || officiality === "unofficial" || officiality === "unknown"
        ? officiality
        : undefined,
    category: categoryFilter,
    source: asNonEmpty(params.get("source")),
    sort: sort === "installs" || sort === "rank" || sort === "name" ? sort : undefined,
    order: order === "asc" || order === "desc" ? order : undefined,
    page: parseNumber(params.get("page"), 1),
    pageSize: parseNumber(params.get("pageSize"), 30),
  };
}

async function maybeAwait<T>(value: T | Promise<T>): Promise<T> {
  return Promise.resolve(value);
}

export async function GET(request: NextRequest) {
  const routeCategoryRaw = request.nextUrl.searchParams.get("kind") ?? request.nextUrl.searchParams.get("category");
  const board = parseBoard(request.nextUrl.searchParams.get("board"));
  const category = parseCategory(routeCategoryRaw);
  const query = toAgentListQuery(request, category);
  const runtimeRef = await openMonitoringRuntime();
  const repository = runtimeRef.repository as unknown as AgentRepoShape;

  try {
    const snapshotAt = await maybeAwait(repository.getLatestAgentSnapshotAt());
    const overview = await maybeAwait(repository.getAgentsOverviewCounts());
    const topSnapshot = await maybeAwait(repository.getLatestCategorySnapshot("general_llm"));

    if (category === "overview") {
      const topAgentsCount = topSnapshot?.entries.length ?? 0;
      return NextResponse.json(
        {
          category,
          sourceName: "monitoring_db_snapshot",
          snapshotAt,
          lastSuccessAt: snapshotAt,
          data: {
            topAgents: topAgentsCount,
            skills: overview.skills,
            mcpServers: overview.mcpServers,
            totalTracked: topAgentsCount + overview.skills + overview.mcpServers,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (category === "top_agents") {
      const data = (topSnapshot?.entries ?? []).map((row) => ({
        id: row.canonicalModelKey,
        name: row.modelName,
        provider: row.vendor ?? "unknown",
        score: row.score ?? null,
        tasksCompleted: null,
        successRate: null,
        latencyMs: null,
        source: topSnapshot?.sourceName ?? "monitoring_db_snapshot",
        updatedAt: topSnapshot?.snapshotAt ?? snapshotAt,
      }));

      return NextResponse.json(
        {
          category,
          board,
          sourceName: topSnapshot?.sourceName ?? "monitoring_db_snapshot",
          snapshotAt: topSnapshot?.snapshotAt ?? snapshotAt,
          lastSuccessAt: topSnapshot?.snapshotAt ?? snapshotAt,
          scoreUnit: "index",
          total: data.length,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 30,
          filtersApplied: {},
          provenanceCoverage: { enrichedRows: 0, enrichedRatio: 0 },
          data,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const facets = category === "skills"
      ? await maybeAwait(repository.getSkillFacets())
      : await maybeAwait(repository.getMcpFacets());

    const result = category === "skills"
      ? board === "trending24h"
        ? await maybeAwait(repository.getSkillTrending24hEntries(query))
        : board === "top"
          ? await maybeAwait(repository.getSkillTopEntries(query))
          : await maybeAwait(repository.getSkillEntries(query))
      : board === "trending24h"
        ? await maybeAwait(repository.getMcpTrending24hEntries(query))
        : board === "top"
          ? await maybeAwait(repository.getMcpTopEntries(query))
          : await maybeAwait(repository.getMcpEntries(query));

    const enrichedRows = result.data.reduce((acc, item) => {
      const enriched = Array.isArray(item.enrichedBy) ? item.enrichedBy.length : 0;
      return acc + (enriched > 0 ? 1 : 0);
    }, 0);
    const enrichedRatio = result.data.length > 0 ? Number((enrichedRows / result.data.length).toFixed(4)) : 0;

    return NextResponse.json(
      {
        category,
        board,
        sourceName: "monitoring_db_snapshot",
        snapshotAt,
        lastSuccessAt: snapshotAt,
        total: result.total,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 30,
        filtersApplied: {
          q: query.q ?? null,
          view: query.view ?? null,
          officiality: query.officiality ?? null,
          category: query.category ?? null,
          source: query.source ?? null,
          sort: query.sort ?? "installs",
          order: query.order ?? "desc",
        },
        facets,
        provenanceCoverage: {
          enrichedRows,
          enrichedRatio,
        },
        data: result.data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await runtimeRef.close();
  }
}
