import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { openMonitoringRuntimeMock } = vi.hoisted(() => ({
  openMonitoringRuntimeMock: vi.fn(),
}));

vi.mock("@/lib/monitoring/runtime", () => ({
  openMonitoringRuntime: openMonitoringRuntimeMock,
}));

import { GET } from "@/app/api/monitoring/agents/route";

function makeRepository() {
  return {
    getLatestAgentSnapshotAt: vi.fn().mockResolvedValue("2026-04-02T10:00:00.000Z"),
    getAgentsOverviewCounts: vi.fn().mockResolvedValue({ skills: 10, mcpServers: 20 }),
    getLatestCategorySnapshot: vi.fn().mockResolvedValue({
      sourceName: "aa",
      snapshotAt: "2026-04-02T10:00:00.000Z",
      entries: [{ canonicalModelKey: "a", modelName: "A" }],
    }),
    getSkillEntries: vi.fn().mockResolvedValue({ total: 1, data: [{ id: "s1", displayName: "Skill One" }] }),
    getSkillTrending24hEntries: vi.fn().mockResolvedValue({ total: 1, data: [{ id: "s2", displayName: "Skill Two", delta24h: 12 }] }),
    getSkillTopEntries: vi.fn().mockResolvedValue({ total: 1, data: [{ id: "s3", displayName: "Skill Three" }] }),
    getMcpEntries: vi.fn().mockResolvedValue({ total: 1, data: [{ id: "m1", displayName: "MCP One" }] }),
    getMcpTrending24hEntries: vi.fn().mockResolvedValue({ total: 1, data: [{ id: "m2", displayName: "MCP Two", delta24h: 4 }] }),
    getMcpTopEntries: vi.fn().mockResolvedValue({ total: 1, data: [{ id: "m3", displayName: "MCP Three" }] }),
    getSkillFacets: vi.fn().mockResolvedValue({ categories: ["dev"], sources: ["skills_sh"] }),
    getMcpFacets: vi.fn().mockResolvedValue({ categories: ["general"], sources: ["mcpservers_catalog"] }),
  };
}

describe("/api/monitoring/agents route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes skills main board to getSkillEntries", async () => {
    const repository = makeRepository();
    openMonitoringRuntimeMock.mockResolvedValue({ repository, close: vi.fn().mockResolvedValue(undefined) });

    const req = new NextRequest("http://localhost:4000/api/monitoring/agents?kind=skills&board=main&page=2&pageSize=20");
    const res = await GET(req);
    const json = await res.json();

    expect(repository.getSkillEntries).toHaveBeenCalledTimes(1);
    expect(repository.getSkillTrending24hEntries).not.toHaveBeenCalled();
    expect(repository.getSkillTopEntries).not.toHaveBeenCalled();
    expect(json.category).toBe("skills");
    expect(json.board).toBe("main");
    expect(json.page).toBe(2);
    expect(json.pageSize).toBe(20);
    expect(json.facets).toEqual({ categories: ["dev"], sources: ["skills_sh"] });
  });

  it("routes skills trending board to getSkillTrending24hEntries", async () => {
    const repository = makeRepository();
    openMonitoringRuntimeMock.mockResolvedValue({ repository, close: vi.fn().mockResolvedValue(undefined) });

    const req = new NextRequest("http://localhost:4000/api/monitoring/agents?kind=skills&board=trending24h");
    const res = await GET(req);
    const json = await res.json();

    expect(repository.getSkillTrending24hEntries).toHaveBeenCalledTimes(1);
    expect(repository.getSkillEntries).not.toHaveBeenCalled();
    expect(repository.getSkillTopEntries).not.toHaveBeenCalled();
    expect(json.board).toBe("trending24h");
    expect(json.data[0].delta24h).toBe(12);
  });

  it("routes mcp top board to getMcpTopEntries", async () => {
    const repository = makeRepository();
    openMonitoringRuntimeMock.mockResolvedValue({ repository, close: vi.fn().mockResolvedValue(undefined) });

    const req = new NextRequest("http://localhost:4000/api/monitoring/agents?kind=mcp_servers&board=top");
    const res = await GET(req);
    const json = await res.json();

    expect(repository.getMcpTopEntries).toHaveBeenCalledTimes(1);
    expect(repository.getMcpEntries).not.toHaveBeenCalled();
    expect(repository.getMcpTrending24hEntries).not.toHaveBeenCalled();
    expect(json.category).toBe("mcp_servers");
    expect(json.board).toBe("top");
    expect(json.facets).toEqual({ categories: ["general"], sources: ["mcpservers_catalog"] });
  });
});
