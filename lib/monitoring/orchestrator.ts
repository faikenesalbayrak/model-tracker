import { getActiveLeaderboardSources } from "@/lib/monitoring/leaderboard-sources";
import { getActiveNewsSources } from "@/lib/monitoring/news-sources";
import { diffTop10 } from "@/lib/monitoring/leaderboard-diff";
import { selectWeeklyTopNews } from "@/lib/monitoring/news-selection";
import { sendTop10AlertEmail, sendWeeklyDigestEmail } from "@/lib/monitoring/notifications";
import { LEADERBOARD_CATEGORIES, type LeaderboardCategory } from "@/lib/monitoring/contracts";
import { openMonitoringRuntime, type MonitoringRuntime, type MonitoringRuntimeOptions } from "@/lib/monitoring/runtime";
import type { RunSummary } from "@/lib/monitoring/run-types";

export interface RunCycleOptions {
  runtime?: MonitoringRuntime;
  runtimeOptions?: MonitoringRuntimeOptions;
  nowIso?: string;
  timeoutMs?: number;
}

function getRecipients(): string[] {
  return (process.env.MONITORING_ALERT_RECIPIENTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isNotificationsEnabled(): boolean {
  const value = process.env.MONITORING_NOTIFICATIONS_ENABLED?.trim().toLowerCase();
  if (!value) {
    return true;
  }
  return value === "1" || value === "true" || value === "yes";
}

function isoMinusDays(iso: string, days: number): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return iso;
  }
  return new Date(ts - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function initializeMonitoringRuntime(options: MonitoringRuntimeOptions = {}): Promise<MonitoringRuntime> {
  return openMonitoringRuntime(options);
}

export async function runScheduledCycle(options: RunCycleOptions = {}): Promise<{ runId: string; summary: RunSummary }> {
  const runtime = options.runtime ?? (await initializeMonitoringRuntime(options.runtimeOptions));
  const shouldClose = !options.runtime;
  const repository = runtime.repository;
  const nowIso = options.nowIso ?? new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const summary: RunSummary = {
    leaderboardSourcesChecked: 0,
    leaderboardSnapshotsWritten: 0,
    leaderboardChangesDetected: 0,
    newsSourcesChecked: 0,
    newsEntriesWritten: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
  };
  let hadSourceErrors = false;

  const runId = await repository.insertRun({
    runType: "scheduled_12h",
    status: "running",
    startedAt: nowIso,
  });

  try {
    const recipients = isNotificationsEnabled() ? getRecipients() : [];
    const newsAdapters = getActiveNewsSources();

    for (const category of LEADERBOARD_CATEGORIES) {
      const adapters = getActiveLeaderboardSources(category);
      for (const adapter of adapters) {
        const startedAt = Date.now();
        try {
          const raw = await adapter.fetchRaw({ nowIso, timeoutMs });
          summary.leaderboardSourcesChecked += 1;

          const currentEntries = await adapter.normalizeTop10(raw, category as LeaderboardCategory, nowIso);
          if (currentEntries.length === 0) {
            await repository.upsertSourceHealth({
              sourceName: adapter.sourceName,
              sourceType: "leaderboard",
              enabled: true,
              success: true,
              latencyMs: Date.now() - startedAt,
              lastCheckedAt: nowIso,
              lastSuccessAt: nowIso,
            });
            continue;
          }

          const previous = await repository.getLatestLeaderboardSnapshot(
            category as LeaderboardCategory,
            adapter.sourceName,
          );
          const previousTop10 = (previous?.entries ?? []).slice(0, 10);
          const currentTop10 = currentEntries.slice(0, 10);
          const changes = diffTop10(category, adapter.sourceName, previousTop10, currentTop10);

          await repository.insertLeaderboardSnapshot(
            runId,
            category as LeaderboardCategory,
            adapter.sourceName,
            adapter.priority,
            nowIso,
            currentEntries,
            raw,
          );
          summary.leaderboardSnapshotsWritten += 1;

          const insertedChanges = await repository.insertLeaderboardChanges(
            runId,
            category as LeaderboardCategory,
            adapter.sourceName,
            changes,
          );
          summary.leaderboardChangesDetected += insertedChanges;

          await repository.upsertSourceHealth({
            sourceName: adapter.sourceName,
            sourceType: "leaderboard",
            enabled: true,
            success: true,
            latencyMs: Date.now() - startedAt,
            lastCheckedAt: nowIso,
            lastSuccessAt: nowIso,
          });

          if (changes.length > 0 && recipients.length > 0) {
            for (const recipient of recipients) {
              const dedupeKey = `top10:${category}:${adapter.sourceName}:${changes.map((c) => c.eventFingerprint).join(",")}:${recipient}`;
              try {
                const sent = await sendTop10AlertEmail({
                  to: [recipient],
                  category,
                  sourceName: adapter.sourceName,
                  runTimeIso: nowIso,
                  changes: changes.map((item) => ({
                    modelName: item.modelName,
                    vendor: item.vendor,
                    changeType: item.changeType,
                    rankBefore: item.rankBefore,
                    rankAfter: item.rankAfter,
                  })),
                });
                await repository.insertNotificationLog({
                  runId,
                  notificationType: "top10_alert",
                  category,
                  sourceName: adapter.sourceName,
                  dedupeKey,
                  recipient,
                  subject: `Top10 alert ${category}`,
                  status: "sent",
                  messageId: sent.messageId,
                  sentAt: nowIso,
                });
                summary.notificationsSent += 1;
              } catch (error) {
                await repository.insertNotificationLog({
                  runId,
                  notificationType: "top10_alert",
                  category,
                  sourceName: adapter.sourceName,
                  dedupeKey,
                  recipient,
                  subject: `Top10 alert ${category}`,
                  status: "failed",
                  errorMessage: error instanceof Error ? error.message : String(error),
                });
                summary.notificationsFailed += 1;
              }
            }
          }
        } catch (error) {
          await repository.upsertSourceHealth({
            sourceName: adapter.sourceName,
            sourceType: "leaderboard",
            enabled: true,
            success: false,
            latencyMs: Date.now() - startedAt,
            lastCheckedAt: nowIso,
            lastErrorMessage: error instanceof Error ? error.message : String(error),
          });
          hadSourceErrors = true;
          continue;
        }
      }
    }

    for (const adapter of newsAdapters) {
      const startedAt = Date.now();
      try {
        summary.newsSourcesChecked += 1;
        const raw = await adapter.fetchRaw({ nowIso, timeoutMs });
        const entries = await adapter.normalizeNews(raw, nowIso);
        await repository.insertNewsSnapshot(runId, adapter.sourceName, nowIso, entries, raw);
        summary.newsEntriesWritten += entries.length;
        await repository.upsertSourceHealth({
          sourceName: adapter.sourceName,
          sourceType: "news",
          enabled: true,
          success: true,
          latencyMs: Date.now() - startedAt,
          lastCheckedAt: nowIso,
          lastSuccessAt: nowIso,
        });
      } catch (error) {
        await repository.upsertSourceHealth({
          sourceName: adapter.sourceName,
          sourceType: "news",
          enabled: true,
          success: false,
          latencyMs: Date.now() - startedAt,
          lastCheckedAt: nowIso,
          lastErrorMessage: error instanceof Error ? error.message : String(error),
        });
        hadSourceErrors = true;
        continue;
      }
    }

    const runStatus = hadSourceErrors || summary.notificationsFailed > 0 ? "partial_success" : "success";
    await repository.updateRun(runId, runStatus, new Date().toISOString(), summary);
    return { runId, summary };
  } catch (error) {
    await repository.updateRun(
      runId,
      "failed",
      new Date().toISOString(),
      summary,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    if (shouldClose) {
      await runtime.close();
    }
  }
}

export async function runWeeklyDigestCycle(options: RunCycleOptions = {}): Promise<{ runId: string; digestCount: number }> {
  const runtime = options.runtime ?? (await initializeMonitoringRuntime(options.runtimeOptions));
  const shouldClose = !options.runtime;
  const repository = runtime.repository;
  const nowIso = options.nowIso ?? new Date().toISOString();
  const recipients = isNotificationsEnabled() ? getRecipients() : [];

  const runId = await repository.insertRun({
    runType: "weekly_digest",
    status: "running",
    startedAt: nowIso,
  });

  try {
    const windowEndIso = nowIso;
    const windowStartIso = isoMinusDays(nowIso, 7);
    const entries = await repository.getNewsEntriesInWindow(windowStartIso, windowEndIso);
    const items = selectWeeklyTopNews(entries);
    await repository.insertWeeklyDigest(runId, windowStartIso, windowEndIso, nowIso, items);

    for (const recipient of recipients) {
      const dedupeKey = `weekly:${windowStartIso}:${windowEndIso}:${recipient}`;
      try {
        const sent = await sendWeeklyDigestEmail({
          to: [recipient],
          windowStartIso,
          windowEndIso,
          items: items.map((item) => ({
            title: item.title,
            sourceName: item.sourceName,
            canonicalUrl: item.canonicalUrl,
            publishedAt: item.publishedAt,
            importanceScore: item.importanceScore,
          })),
        });
        await repository.insertNotificationLog({
          runId,
          notificationType: "weekly_digest",
          dedupeKey,
          recipient,
          subject: "Weekly AI Digest",
          status: "sent",
          messageId: sent.messageId,
          sentAt: nowIso,
        });
      } catch (error) {
        await repository.insertNotificationLog({
          runId,
          notificationType: "weekly_digest",
          dedupeKey,
          recipient,
          subject: "Weekly AI Digest",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await repository.updateRun(runId, "success", new Date().toISOString(), {
      weeklyDigestItems: items.length,
    });
    return { runId, digestCount: items.length };
  } catch (error) {
    await repository.updateRun(
      runId,
      "failed",
      new Date().toISOString(),
      undefined,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    if (shouldClose) {
      await runtime.close();
    }
  }
}
