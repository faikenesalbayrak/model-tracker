import { readFileSync } from "node:fs";
import type { MonitoringDatabase } from "@/lib/monitoring/db";

export function runMigrations(schemaFilePath: string, db: MonitoringDatabase): void {
  const sql = readFileSync(schemaFilePath, "utf8").trim();
  if (sql.length === 0) {
    throw new Error(`Schema file is empty: ${schemaFilePath}`);
  }

  db.exec(sql);
}
