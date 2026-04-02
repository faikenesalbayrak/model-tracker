import { describe, expect, it } from "vitest";
import { derivePublisherFromUrl, formatNewsSourceDisplay, sanitizeNewsDescription } from "@/lib/news-display";

describe("news-display", () => {
  it("sanitizes html entities and whitespace", () => {
    expect(sanitizeNewsDescription("AI&nbsp;&amp;&nbsp;ML&nbsp; launch   ")).toBe("AI & ML launch");
    expect(sanitizeNewsDescription("  ")).toBeNull();
    expect(sanitizeNewsDescription(null)).toBeNull();
  });

  it("derives publisher from canonical url host", () => {
    expect(derivePublisherFromUrl("https://www.reuters.com/world/europe/sample")).toBe("Reuters");
    expect(derivePublisherFromUrl("https://www.the-verge.com/ai/story")).toBe("The Verge");
    expect(derivePublisherFromUrl("not-a-url")).toBeNull();
  });

  it("formats google news source display with publisher", () => {
    expect(formatNewsSourceDisplay("Google News", "Reuters")).toBe("Google News | Reuters");
    expect(formatNewsSourceDisplay("Google News", null)).toBe("Google News");
    expect(formatNewsSourceDisplay("Reuters", "Reuters")).toBe("Reuters");
  });
});
