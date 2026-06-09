import cron, { type ScheduledTask } from "node-cron";
import { runScheduledCycle, type RunCycleOptions } from "@/lib/monitoring/orchestrator";

const ISTANBUL_TIMEZONE = "Europe/Istanbul";

export interface SchedulerHandles {
  daily: ScheduledTask;
  stop: () => void;
}

export function startMonitoringScheduler(options: RunCycleOptions = {}): SchedulerHandles {
  const daily = cron.schedule(
    "0 9 * * *",
    () => {
      void runScheduledCycle(options).catch((error) => {
        console.error("Monitoring scheduled cycle failed:", error);
      });
    },
    { timezone: ISTANBUL_TIMEZONE },
  );

  const stop = () => {
    daily.stop();
  };

  return { daily, stop };
}
