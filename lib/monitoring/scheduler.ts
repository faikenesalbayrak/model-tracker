import cron, { type ScheduledTask } from "node-cron";
import { runScheduledCycle, type RunCycleOptions } from "@/lib/monitoring/orchestrator";

const ISTANBUL_TIMEZONE = "Europe/Istanbul";

export interface SchedulerHandles {
  dailyMorning: ScheduledTask;
  dailyEvening: ScheduledTask;
  stop: () => void;
}

export function startMonitoringScheduler(options: RunCycleOptions = {}): SchedulerHandles {
  const dailyMorning = cron.schedule(
    "0 9 * * *",
    () => {
      void runScheduledCycle(options).catch((error) => {
        console.error("Monitoring scheduled cycle (09:00) failed:", error);
      });
    },
    { timezone: ISTANBUL_TIMEZONE },
  );

  const dailyEvening = cron.schedule(
    "0 21 * * *",
    () => {
      void runScheduledCycle(options).catch((error) => {
        console.error("Monitoring scheduled cycle (21:00) failed:", error);
      });
    },
    { timezone: ISTANBUL_TIMEZONE },
  );

  const stop = () => {
    dailyMorning.stop();
    dailyEvening.stop();
  };

  return { dailyMorning, dailyEvening, stop };
}
