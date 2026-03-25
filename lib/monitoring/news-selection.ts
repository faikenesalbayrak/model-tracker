import type { NormalizedNewsEntry } from "@/lib/monitoring/contracts";
import type { WeeklyDigestItem } from "@/lib/monitoring/run-types";

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeNews(items: NormalizedNewsEntry[]): NormalizedNewsEntry[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: NormalizedNewsEntry[] = [];

  for (const item of items) {
    const url = item.canonicalUrl.trim();
    const title = normalizeTitle(item.title);
    if (!url || !title) {
      continue;
    }
    if (seenUrls.has(url) || seenTitles.has(title)) {
      continue;
    }
    seenUrls.add(url);
    seenTitles.add(title);
    result.push(item);
  }

  return result;
}

function recencyScore(publishedAt?: string, now = Date.now()): number {
  if (!publishedAt) return 0;
  const parsed = Date.parse(publishedAt);
  if (!Number.isFinite(parsed)) return 0;
  const hours = Math.max(0, (now - parsed) / 3_600_000);
  return Math.max(0, 5 - Math.min(5, hours / 24));
}

function sourceDiversityPenalty(sourceName: string, counts: Map<string, number>): number {
  const seen = counts.get(sourceName) ?? 0;
  if (seen === 0) return 0;
  return Math.min(2.5, seen * 0.7);
}

function keywordBonus(title: string): number {
  const text = title.toLowerCase();
  const rules: Array<[RegExp, number]> = [
    [/\b(release|launch|announces?|rolls out)\b/, 1.8],
    [/\b(model|gpt|claude|gemini|llama|deepseek)\b/, 1.4],
    [/\b(benchmark|leaderboard|sota)\b/, 1.2],
    [/\b(funding|raises?|acquire|acquisition)\b/, 1.0],
  ];
  return rules.reduce((sum, [pattern, weight]) => sum + (pattern.test(text) ? weight : 0), 0);
}

export function selectWeeklyTopNews(
  entries: NormalizedNewsEntry[],
  topN = 10,
  now = Date.now(),
): WeeklyDigestItem[] {
  const deduped = dedupeNews(entries);

  const scored = deduped
    .map((entry) => {
      const baseImportance = typeof entry.importanceScore === "number" ? entry.importanceScore : 0;
      const score = baseImportance + recencyScore(entry.publishedAt, now) + keywordBonus(entry.title);
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score);

  const sourceCounts = new Map<string, number>();
  const selected: WeeklyDigestItem[] = [];

  for (const row of scored) {
    const penalty = sourceDiversityPenalty(row.entry.sourceName, sourceCounts);
    const effectiveScore = row.score - penalty;

    if (selected.length < topN) {
      selected.push({
        rank: selected.length + 1,
        sourceName: row.entry.sourceName,
        canonicalUrl: row.entry.canonicalUrl,
        title: row.entry.title,
        publishedAt: row.entry.publishedAt,
        summary: row.entry.summary,
        importanceScore: Number(effectiveScore.toFixed(3)),
      });
      sourceCounts.set(row.entry.sourceName, (sourceCounts.get(row.entry.sourceName) ?? 0) + 1);
    }

    if (selected.length >= topN) break;
  }

  return selected.map((item, index) => ({ ...item, rank: index + 1 }));
}

