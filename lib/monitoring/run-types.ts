import type { LeaderboardCategory, NormalizedLeaderboardEntry, NormalizedNewsEntry } from "@/lib/monitoring/contracts";

export type MonitorRunType = "scheduled_12h" | "manual";
export type MonitorRunStatus = "running" | "success" | "partial_success" | "failed";

export interface RunSummary {
  leaderboardSourcesChecked: number;
  leaderboardSnapshotsWritten: number;
  leaderboardChangesDetected: number;
  newsSourcesChecked: number;
  newsEntriesWritten: number;
  notificationsSent: number;
  notificationsFailed: number;
}

export interface LeaderboardCycleResult {
  category: LeaderboardCategory;
  sourceName: string;
  entries: NormalizedLeaderboardEntry[];
  changes: LeaderboardChangeEvent[];
}

export interface NewsCycleResult {
  sourceName: string;
  entries: NormalizedNewsEntry[];
}

export interface LeaderboardChangeEvent {
  changeType: "entered" | "exited" | "moved";
  canonicalModelKey: string;
  modelName: string;
  vendor?: string;
  rankBefore?: number;
  rankAfter?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  eventFingerprint: string;
}
