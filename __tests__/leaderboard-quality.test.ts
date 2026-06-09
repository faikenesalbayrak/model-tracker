import { describe, expect, it } from "vitest";
import { shouldAcceptGeneralLlmModel } from "@/lib/monitoring/leaderboard-sources";

const NOW = "2026-06-09T12:00:00.000Z";

describe("leaderboard quality filters", () => {
  it("rejects synthetic-looking future or effort-suffixed general LLM names", () => {
    expect(shouldAcceptGeneralLlmModel({ modelName: "gpt-5.5-xhigh", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "gpt-oss-120b (high)", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Nova 2.0 Lite (medium)", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "gpt-5.2-2025-12-11-high", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "MiMo-V2-Flash (Feb 2026)", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "MiMo-V2-Omni-0327", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "claude-opus-4-8-xhigh-effort", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Claude Fable 5 (fallback)", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Claude 4.5 Haiku", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "gemini-3.1-pro-preview-high", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "qwen3.7-max", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Qwen3.5", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "deepseek-v4-pro", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "grok-4.20-beta-0309-reasoning", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Grok 4.3 (high)", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Kimi K2.6", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "MiniMax-M3", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "MiMo-V2.5", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Gemma 4", nowIso: NOW })).toBe(false);
    expect(shouldAcceptGeneralLlmModel({ modelName: "Mistral Medium 3.5", nowIso: NOW })).toBe(false);
  });

  it("allows clean production-safe general LLM names", () => {
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GPT-4.1",
        vendor: "OpenAI",
        modelUrl: "https://artificialanalysis.ai/models/gpt-4-1/providers",
        sourceModelId: "gpt-4-1",
        hasListingEvidence: true,
        nowIso: NOW,
      }),
    ).toBe(true);
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "o3",
        vendor: "OpenAI",
        modelUrl: "https://artificialanalysis.ai/models/o3/providers",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(true);
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "Gemini 2.5 Pro",
        vendor: "Google",
        modelUrl: "https://artificialanalysis.ai/models/gemini-2-5-pro/providers",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(true);
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "Claude Sonnet 4",
        vendor: "Anthropic",
        modelUrl: "https://artificialanalysis.ai/models/claude-sonnet-4/providers",
        sourceModelId: "claude-sonnet-4",
        hasListingEvidence: true,
        nowIso: NOW,
      }),
    ).toBe(true);
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GPT-4.1",
        vendor: "OpenAI",
        sourceModelId: "/models/gpt-4-1",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(true);
  });

  it("rejects Artificial Analysis rows with future release dates", () => {
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GPT-4.1",
        vendor: "OpenAI",
        modelUrl: "https://artificialanalysis.ai/models/gpt-4-1/providers",
        sourceModelId: "gpt-4-1",
        releaseDate: "2026-06-10",
        nowIso: NOW,
      }),
    ).toBe(false);
  });

  it("rejects Artificial Analysis rows after the conservative public leaderboard cutoff", () => {
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "Command A+",
        vendor: "Cohere",
        modelUrl: "https://artificialanalysis.ai/models/command-a-plus/providers",
        releaseDate: "2026-05-20",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);
  });

  it("rejects Artificial Analysis rows without a trusted model locator", () => {
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GPT-4.1",
        vendor: "OpenAI",
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);
  });

  it("rejects deprecated Artificial Analysis rows and uuid-only locators", () => {
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "Grok-1",
        vendor: "xAI",
        modelUrl: "https://artificialanalysis.ai/models/grok-1/providers",
        sourceModelId: "grok-1",
        deprecated: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);

    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GPT-4.1",
        vendor: "OpenAI",
        sourceModelId: "72c358fd-7d45-4d68-89aa-699743710924",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);

    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GPT-4.1",
        vendor: "OpenAI",
        sourceModelId: "gpt-4-1",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);

    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "Muse Spark",
        vendor: "Meta",
        modelUrl: "https://artificialanalysis.ai/models/muse-spark",
        hasListingEvidence: false,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "GLM-5.1",
        vendor: "Z AI",
        modelUrl: "https://artificialanalysis.ai/models/glm-5-1/providers",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);
    expect(
      shouldAcceptGeneralLlmModel({
        modelName: "North Mini Code",
        vendor: "Cohere",
        modelUrl: "https://artificialanalysis.ai/models/north-mini-code/providers",
        hasListingEvidence: true,
        nowIso: NOW,
        requireTrustedLocator: true,
      }),
    ).toBe(false);
  });
});
