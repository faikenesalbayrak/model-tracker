import { startMonitoringScheduler, type SchedulerHandles } from "@/lib/monitoring/scheduler";

declare global {
  var __monitoringSchedulerHandles: SchedulerHandles | undefined;
}

function isEnabled(): boolean {
  const value = process.env.MONITORING_SCHEDULER_ENABLED?.trim().toLowerCase();
  if (!value) {
    return false;
  }
  return value === "1" || value === "true" || value === "yes";
}

export function bootstrapMonitoringScheduler(): SchedulerHandles | null {
  // Deliberately opt-in: only start the cron scheduler when the environment
  // explicitly enables it. This avoids side effects from importing the module
  // in request-time code paths such as app layouts.
  if (process.env.NODE_ENV === "test") {
    return null;
  }
  if (!isEnabled()) {
    return null;
  }
  if (globalThis.__monitoringSchedulerHandles) {
    return globalThis.__monitoringSchedulerHandles;
  }

  const handles = startMonitoringScheduler();
  globalThis.__monitoringSchedulerHandles = handles;
  return handles;
}
