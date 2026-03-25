import type { LeaderboardCategory, NormalizedLeaderboardEntry, NormalizedNewsEntry } from "@/lib/monitoring/contracts";

export type MonitorRunType = "scheduled_12h" | "weekly_digest" | "manual";
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

export interface WeeklyDigestItem {
  rank: number;
  sourceName: string;
  canonicalUrl: string;
  title: string;
  publishedAt?: string;
  summary?: string;
  importanceScore?: number;
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

