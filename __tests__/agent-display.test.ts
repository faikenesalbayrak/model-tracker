import { describe, expect, it } from "vitest";
import { computeDelta24h, toDisplayName, toMcpDisplayName, toSkillDisplayName } from "@/lib/monitoring/agent-display";

describe("agent-display", () => {
  it("humanizes slug-like names", () => {
    expect(toSkillDisplayName("github-actions-docs")).toBe("Github Actions Docs");
    expect(toSkillDisplayName("openai_api_mcp")).toBe("Openai API MCP");
  });

  it("cuts noisy mcp suffix phrases", () => {
    expect(toMcpDisplayName("strava mcp A Model Context Protocol (MCP) server")).toBe("strava mcp A Model Context Protocol");
    expect(toMcpDisplayName("Context 7 official Up-to-date Docs For Any Cursor")).toBe("Context 7");
  });

  it("returns fallback on empty", () => {
    expect(toDisplayName("", "Fallback")).toBe("Fallback");
    expect(toSkillDisplayName(null)).toBe("Unknown Skill");
  });

  it("computes delta24h only when both values are numeric", () => {
    expect(computeDelta24h(150, 120)).toBe(30);
    expect(computeDelta24h(120, 150)).toBe(-30);
    expect(computeDelta24h(120, null)).toBeNull();
    expect(computeDelta24h(null, 100)).toBeNull();
  });
});
