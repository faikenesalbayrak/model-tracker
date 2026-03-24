import { describe, expect, it } from "vitest";
import { formatLocaleCode } from "@/components/dashboard-utils";

describe("dashboard-utils", () => {
  it("formats locale codes without Turkish uppercase artifacts in English mode", () => {
    expect(formatLocaleCode("en")).toBe("EN");
    expect(formatLocaleCode("tr")).toBe("TR");
    expect(formatLocaleCode("en")).not.toContain("İ");
  });
});

