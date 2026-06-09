import path from "node:path";
import { describe, expect, it } from "vitest";
import { initDatabase, closeDatabase } from "@/lib/monitoring/db";
import { runMigrations } from "@/lib/monitoring/migrate";
import { MonitoringRepository } from "@/lib/monitoring/repositories";

describe("leaderboard snapshot source selection", () => {
  it("uses explicit source priority when snapshots share the same observed timestamp", () => {
    const db = initDatabase(":memory:");
    try {
      runMigrations(path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql"), db);
      const repository = new MonitoringRepository(db);
      const observedAt = "2026-06-09T09:00:00.000Z";
      const runId = repository.insertRun({
        runType: "manual",
        status: "running",
        startedAt: observedAt,
      });

      repository.insertLeaderboardSnapshot(runId, "general_llm", "livebench_general_llm", 20, observedAt, [
        {
          rank: 1,
          canonicalModelKey: "openai:gpt_5_5_xhigh",
          modelName: "gpt-5.5-xhigh",
          vendor: "OpenAI",
          score: 99,
        },
      ]);
      repository.insertLeaderboardSnapshot(runId, "general_llm", "artificial_analysis_models_page", 10, observedAt, [
        {
          rank: 1,
          canonicalModelKey: "openai:gpt_4_1",
          modelName: "GPT-4.1",
          vendor: "OpenAI",
          score: 45,
        },
      ]);

      const snapshot = repository.getLatestCategorySnapshot("general_llm");

      expect(snapshot?.sourceName).toBe("artificial_analysis_models_page");
      expect(snapshot?.entries[0].modelName).toBe("GPT-4.1");
    } finally {
      closeDatabase(db);
    }
  });

  it("falls back to LiveBench when the primary general LLM source is unavailable", () => {
    const db = initDatabase(":memory:");
    try {
      runMigrations(path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql"), db);
      const repository = new MonitoringRepository(db);
      const observedAt = "2026-06-09T09:00:00.000Z";
      const runId = repository.insertRun({
        runType: "manual",
        status: "running",
        startedAt: observedAt,
      });

      repository.insertLeaderboardSnapshot(runId, "general_llm", "livebench_general_llm", 20, observedAt, [
        {
          rank: 1,
          canonicalModelKey: "openai:o3",
          modelName: "o3",
          vendor: "OpenAI",
          score: 99,
        },
      ]);

      const snapshot = repository.getLatestCategorySnapshot("general_llm");

      expect(snapshot?.sourceName).toBe("livebench_general_llm");
      expect(snapshot?.entries[0].modelName).toBe("o3");
    } finally {
      closeDatabase(db);
    }
  });

  it("keeps the primary general LLM source as the UI default even when secondary data is fresher", () => {
    const db = initDatabase(":memory:");
    try {
      runMigrations(path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql"), db);
      const repository = new MonitoringRepository(db);
      const runId = repository.insertRun({
        runType: "manual",
        status: "running",
        startedAt: new Date().toISOString(),
      });

      repository.insertLeaderboardSnapshot(runId, "general_llm", "artificial_analysis_models_page", 10, "2000-01-01T00:00:00.000Z", [
        {
          rank: 1,
          canonicalModelKey: "openai:gpt_4_1",
          modelName: "GPT-4.1",
          vendor: "OpenAI",
          score: 45,
        },
      ]);
      repository.insertLeaderboardSnapshot(runId, "general_llm", "livebench_general_llm", 20, new Date().toISOString(), [
        {
          rank: 1,
          canonicalModelKey: "openai:o3",
          modelName: "o3",
          vendor: "OpenAI",
          score: 50,
        },
      ]);

      const snapshot = repository.getLatestCategorySnapshot("general_llm");

      expect(snapshot?.sourceName).toBe("artificial_analysis_models_page");
      expect(snapshot?.entries[0].modelName).toBe("GPT-4.1");
    } finally {
      closeDatabase(db);
    }
  });
});
