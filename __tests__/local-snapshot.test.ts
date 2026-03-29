import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  default: {},
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe("local-snapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MONITORING_CACHE_DIR;
  });

  it("keeps fresh snapshot in memory when disk write fails", async () => {
    process.env.MONITORING_CACHE_DIR = "/readonly-cache";

    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOENT" }));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as never);
    vi.mocked(fs.writeFile).mockRejectedValue(Object.assign(new Error("read-only fs"), { code: "EROFS" }));

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const snapshotLib = await import("@/lib/local-snapshot");

    const fresh = await snapshotLib.refreshSnapshot("unit-local-snapshot", async () => ({
      generated_at: "2026-03-29T00:00:00.000Z",
      data: [{ id: "x" }],
    }));

    expect(fresh).toEqual({
      generated_at: "2026-03-29T00:00:00.000Z",
      data: [{ id: "x" }],
    });

    const cached = await snapshotLib.readSnapshot<{ generated_at: string; data: Array<{ id: string }> }>(
      "unit-local-snapshot",
    );
    expect(cached?.generated_at).toBe("2026-03-29T00:00:00.000Z");
    expect(cached?.data).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });
});
