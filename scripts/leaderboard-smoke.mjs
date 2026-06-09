#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:4000";
const baseUrl = (process.env.LEADERBOARD_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const timeoutMs = Number(process.env.LEADERBOARD_SMOKE_TIMEOUT_MS || "20000");

const categories = [
  ["general_llm", 10],
  ["image_generation", 5],
  ["video_generation", 5],
  ["text_to_speech", 5],
  ["speech_to_text", 3],
  ["embeddings", 5],
];

const forbiddenGeneralLlmPatterns = [
  /\bxhigh\b/,
  /\b(?:high|medium|low)-effort\b/,
  /\bpreview-(?:high|medium|low|minimal)\b/,
  /\bpreview\b/,
  /\bfallback\b/,
  /\b(?:high|medium|low|minimal)\b/,
  /\b20\d{2}-\d{2}-\d{2}\b/,
  /\b20\d{6}\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)-?20\d{2}\b/,
  /-(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\b/,
  /\bgpt-5-[1-9]\b/,
  /\bgemini-3\b/,
  /\bclaude-[a-z]+-5\b/,
  /\bclaude-4-(?:[5-9]|\d{2,})\b/,
  /\bclaude-(?:opus|sonnet)-4-(?:[5-9]|\d{2,})\b/,
  /\bqwen3-(?:[5-9]|\d{2,})\b/,
  /\bdeepseek-v4\b/,
  /\bgrok-4-(?:[1-9]|\d{2,})\b/,
  /\bkimi-k2-(?:[1-9]|\d{2,})\b/,
  /\bminimax-m3\b/,
  /\bmimo-v2-(?:[1-9]|\d{2,})\b/,
  /\bgemma-4\b/,
  /\bstep-3-(?:[5-9]|\d{2,})\b/,
  /\bmistral-medium-3-(?:[5-9]|\d{2,})\b/,
];

function normalizeModelNameForQuality(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function isForbiddenGeneralLlmName(name) {
  const normalized = normalizeModelNameForQuality(name);
  return Boolean(normalized && forbiddenGeneralLlmPatterns.some((pattern) => pattern.test(normalized)));
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

async function fetchJson(url) {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: timeout.controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    timeout.clear();
  }
}

function extractRows(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function modelName(row) {
  return String(row?.model ?? row?.modelName ?? row?.name ?? "").trim();
}

async function main() {
  const failures = [];

  for (const [category, minRows] of categories) {
    const url = `${baseUrl}/api/monitoring/leaderboard?category=${encodeURIComponent(category)}`;
    let payload;
    try {
      payload = await fetchJson(url);
    } catch (error) {
      failures.push(`${category}: request failed (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const rows = extractRows(payload);
    if (rows.length < minRows) {
      failures.push(`${category}: expected at least ${minRows} rows, got ${rows.length}`);
    }

    if (!payload?.snapshotAt) {
      failures.push(`${category}: missing snapshotAt`);
    }

    if (category === "general_llm") {
      if (payload?.sourceName !== "artificial_analysis_models_page") {
        failures.push(`${category}: expected sourceName artificial_analysis_models_page, got ${payload?.sourceName ?? "missing"}`);
      }

      const badNames = rows
        .map(modelName)
        .filter(isForbiddenGeneralLlmName);
      if (badNames.length > 0) {
        failures.push(`${category}: forbidden model names: ${badNames.slice(0, 8).join(", ")}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Leaderboard smoke failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Leaderboard smoke passed for ${baseUrl}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
