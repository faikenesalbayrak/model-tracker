import { describe, expect, it } from "vitest";
import { buildNewsBento, layoutClassForVariant, scoreNewsItem, variantForIndex } from "@/lib/news-bento";
import type { AiNewsItem } from "@/components/dashboard-types";

const NOW_MS = Date.parse("2026-04-02T12:00:00.000Z");

function makeItem(overrides: Partial<AiNewsItem>): AiNewsItem {
  return {
    id: overrides.id ?? "id-1",
    title: overrides.title ?? "OpenAI announces new model release",
    link: overrides.link ?? "https://example.com/story",
    source: overrides.source ?? "OpenAI",
    publishedAt: overrides.publishedAt ?? "2026-04-02T09:00:00.000Z",
    timeAgo: overrides.timeAgo ?? "3h ago",
    imageUrl: overrides.imageUrl ?? null,
    description: overrides.description ?? null,
    publisher: overrides.publisher ?? null,
    sourceDisplay: overrides.sourceDisplay ?? "",
  };
}

describe("news-bento", () => {
  it("prioritizes recent stories over older ones", () => {
    const fresh = makeItem({
      id: "fresh",
      publishedAt: "2026-04-02T11:00:00.000Z",
      title: "Google announces major model launch",
      source: "Google",
    });
    const old = makeItem({
      id: "old",
      publishedAt: "2026-03-28T11:00:00.000Z",
      title: "Google announces major model launch",
      source: "Google",
    });

    expect(scoreNewsItem(fresh, NOW_MS)).toBeGreaterThan(scoreNewsItem(old, NOW_MS));
  });

  it("handles invalid publication dates by ranking them lower", () => {
    const valid = makeItem({ id: "valid", publishedAt: "2026-04-02T10:00:00.000Z" });
    const invalid = makeItem({ id: "invalid", publishedAt: "invalid-date" });
    const ranked = buildNewsBento([invalid, valid], NOW_MS);

    expect(ranked[0]?.id).toBe("valid");
    expect(ranked[1]?.id).toBe("invalid");
  });

  it("applies stable layout variants and repeats the pattern", () => {
    expect(variantForIndex(0)).toBe("hero");
    expect(variantForIndex(1)).toBe("tall");
    expect(variantForIndex(2)).toBe("wide");
    expect(variantForIndex(10)).toBe("hero");
    expect(layoutClassForVariant("hero")).toBe("md:col-span-3 md:row-span-3");
    expect(layoutClassForVariant("standard")).toBe("md:col-span-1 md:row-span-2");
  });

  it("packs cards without overlaps and fills the first row", () => {
    const items = Array.from({ length: 18 }).map((_, idx) =>
      makeItem({
        id: `news-${idx + 1}`,
        title: `Story ${idx + 1}`,
        publishedAt: `2026-04-${String((idx % 9) + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
    const ranked = buildNewsBento(items, NOW_MS, 6);

    let maxRow = 0;
    const occupied = new Set<string>();
    for (const item of ranked) {
      for (let row = item.rowStart; row < item.rowStart + item.rowSpan; row += 1) {
        for (let col = item.colStart; col < item.colStart + item.colSpan; col += 1) {
          const key = `${row}-${col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
          if (row > maxRow) maxRow = row;
        }
      }
    }

    for (let col = 1; col <= 6; col += 1) {
      expect(occupied.has(`1-${col}`)).toBe(true);
    }
    expect(maxRow).toBeGreaterThan(1);
  });
});
