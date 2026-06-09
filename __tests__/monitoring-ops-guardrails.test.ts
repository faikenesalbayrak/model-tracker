import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "DATABASE_URL",
  "MONITORING_ALLOW_DATABASE_URL_FALLBACK",
  "MONITORING_DATABASE_URL",
  "POSTGRES_URL",
  "VERCEL",
] as const;

function restoreEnv(snapshot: Partial<NodeJS.ProcessEnv>): void {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe("monitoring ops guardrails", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    restoreEnv(envSnapshot);
    vi.resetModules();
  });

  it("keeps Vercel on a single daily monitoring cron", () => {
    const vercelConfig = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path?: string; schedule?: string }> };

    expect(vercelConfig.crons).toEqual([
      {
        path: "/api/monitoring/run?type=scheduled&lane=metadata&lane=leaderboard&lane=news&lane=maintenance",
        schedule: "0 6 * * *",
      },
    ]);
  });

  it("blocks production monitoring from silently falling back to DATABASE_URL", async () => {
    delete process.env.MONITORING_DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.MONITORING_ALLOW_DATABASE_URL_FALLBACK;
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "postgres://example.invalid/db";

    const { isPostgresConfigured } = await import("@/lib/monitoring/postgres");

    expect(() => isPostgresConfigured()).toThrow(/DATABASE_URL fallback is disabled/);
  });
});
