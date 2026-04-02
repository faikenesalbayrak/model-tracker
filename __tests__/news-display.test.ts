import { describe, expect, it } from "vitest";
import {
  classifyImageKind,
  derivePublisherFromUrl,
  extractPublisherFromTitle,
  formatNewsSourceDisplay,
  isLikelyImageUrl,
  sanitizeNewsDescription,
} from "@/lib/news-display";

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

  it("extracts publisher from title suffix when present", () => {
    expect(extractPublisherFromTitle("AI Models Lie, Cheat - WIRED")).toBe("WIRED");
    expect(extractPublisherFromTitle("No suffix title")).toBeNull();
  });

  it("validates image urls and rejects video urls", () => {
    expect(isLikelyImageUrl("https://example.com/cover.jpg")).toBe(true);
    expect(isLikelyImageUrl("https://example.com/video.mp4")).toBe(false);
    expect(classifyImageKind("https://example.com/video.mp4", "/news-logos/source.png")).toBe("logo");
    expect(classifyImageKind("/news-logos/google_news_ai.png", "/news-logos/google_news_ai.png")).toBe("logo");
  });

  it("formats google news source display with publisher", () => {
    expect(formatNewsSourceDisplay("Google News", "Reuters")).toBe("Google News | Reuters");
    expect(formatNewsSourceDisplay("Google News", null)).toBe("Google News");
    expect(formatNewsSourceDisplay("Reuters", "Reuters")).toBe("Reuters");
  });
});
