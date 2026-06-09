import { describe, expect, it } from "vitest";
import { extractArtificialAnalysisModels } from "@/lib/normalize/artificial-analysis";

function nextChunk(payload: string) {
  return `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
}

describe("Artificial Analysis parser", () => {
  it("uses defaultData scored rows when models metadata appears first", () => {
    const html = nextChunk(
      [
        '{"models":[{"id":"metadata-only","name":"GPT-5.5 (xhigh)"}]}',
        '{"defaultData":[{"id":"gpt-4-1","slug":"gpt-4-1","name":"GPT-4.1","short_name":"GPT-4.1","intelligence_index":42.5,"model_creators":{"name":"OpenAI"}}]}',
      ].join(""),
    );

    const models = extractArtificialAnalysisModels(html);

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "gpt-4-1",
      short_name: "GPT-4.1",
      intelligence_index: 42.5,
      model_creators: { name: "OpenAI" },
    });
  });

  it("chooses the richest scored candidate and prefers defaultData on ties", () => {
    const html = nextChunk(
      [
        '{"models":[{"id":"old","name":"Old scored","intelligence_index":10}]}',
        '{"defaultData":[{"id":"new-a","name":"New A","intelligence_index":20},{"id":"new-b","name":"New B","intelligence_index":30}]}',
      ].join(""),
    );

    const models = extractArtificialAnalysisModels(html);

    expect(models.map((model) => model.id)).toEqual(["new-a", "new-b"]);
  });
});
