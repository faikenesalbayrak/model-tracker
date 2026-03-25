import { createHash } from "node:crypto";
import type { NormalizedLeaderboardEntry } from "@/lib/monitoring/contracts";
import type { LeaderboardChangeEvent } from "@/lib/monitoring/run-types";

function fingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function indexByKey(entries: NormalizedLeaderboardEntry[]): Map<string, NormalizedLeaderboardEntry> {
  const map = new Map<string, NormalizedLeaderboardEntry>();
  for (const entry of entries) {
    map.set(entry.canonicalModelKey, entry);
  }
  return map;
}

export function diffTop10(
  category: string,
  sourceName: string,
  previous: NormalizedLeaderboardEntry[],
  current: NormalizedLeaderboardEntry[],
): LeaderboardChangeEvent[] {
  const prevMap = indexByKey(previous);
  const currMap = indexByKey(current);
  const events: LeaderboardChangeEvent[] = [];

  for (const currentEntry of current) {
    const before = prevMap.get(currentEntry.canonicalModelKey);
    if (!before) {
      events.push({
        changeType: "entered",
        canonicalModelKey: currentEntry.canonicalModelKey,
        modelName: currentEntry.modelName,
        vendor: currentEntry.vendor,
        rankAfter: currentEntry.rank,
        scoreAfter: currentEntry.score,
        eventFingerprint: fingerprint([
          category,
          sourceName,
          "entered",
          currentEntry.canonicalModelKey,
          String(currentEntry.rank),
        ]),
      });
      continue;
    }

    if (before.rank !== currentEntry.rank) {
      events.push({
        changeType: "moved",
        canonicalModelKey: currentEntry.canonicalModelKey,
        modelName: currentEntry.modelName,
        vendor: currentEntry.vendor,
        rankBefore: before.rank,
        rankAfter: currentEntry.rank,
        scoreBefore: before.score,
        scoreAfter: currentEntry.score,
        eventFingerprint: fingerprint([
          category,
          sourceName,
          "moved",
          currentEntry.canonicalModelKey,
          String(before.rank),
          String(currentEntry.rank),
        ]),
      });
    }
  }

  for (const previousEntry of previous) {
    if (currMap.has(previousEntry.canonicalModelKey)) {
      continue;
    }
    events.push({
      changeType: "exited",
      canonicalModelKey: previousEntry.canonicalModelKey,
      modelName: previousEntry.modelName,
      vendor: previousEntry.vendor,
      rankBefore: previousEntry.rank,
      scoreBefore: previousEntry.score,
      eventFingerprint: fingerprint([
        category,
        sourceName,
        "exited",
        previousEntry.canonicalModelKey,
        String(previousEntry.rank),
      ]),
    });
  }

  return events;
}

