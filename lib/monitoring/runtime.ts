import path from "node:path";
import type { PoolClient } from "pg";
import { initDatabase, closeDatabase, type MonitoringDatabase } from "@/lib/monitoring/db";
import { runMigrations } from "@/lib/monitoring/migrate";
import { runPostgresMigrations } from "@/lib/monitoring/migrate-postgres";
import { getMonitoringPool, isPostgresConfigured } from "@/lib/monitoring/postgres";
import { MonitoringRepository } from "@/lib/monitoring/repositories";
import { PostgresMonitoringRepository } from "@/lib/monitoring/repositories-postgres";

export interface MonitoringRuntimeOptions {
  dbPath?: string;
  schemaPath?: string;
  postgresSchemaPath?: string;
}

export type MonitoringRepo = MonitoringRepository | PostgresMonitoringRepository;

export interface MonitoringRuntime {
  backend: "sqlite" | "postgres";
  repository: MonitoringRepo;
  close: () => Promise<void>;
  db?: MonitoringDatabase;
}

function defaultSqliteDbPath(): string {
  return process.env.MONITORING_DB_PATH?.trim() || path.join(process.cwd(), "data", "monitoring.db");
}

function defaultSqliteSchemaPath(): string {
  return process.env.MONITORING_SCHEMA_PATH?.trim() || path.join(process.cwd(), "docs", "sqlite_monitoring_schema.sql");
}

function defaultPostgresSchemaPath(): string {
  return (
    process.env.MONITORING_POSTGRES_SCHEMA_PATH?.trim() ||
    path.join(process.cwd(), "docs", "postgres_monitoring_schema.sql")
  );
}

async function openPostgresRuntime(options: MonitoringRuntimeOptions): Promise<MonitoringRuntime> {
  const pool = getMonitoringPool();
  const client = (await pool.connect()) as PoolClient;

  try {
    await runPostgresMigrations(options.postgresSchemaPath ?? defaultPostgresSchemaPath(), client);
  } catch (error) {
    client.release();
    throw error;
  }

  return {
    backend: "postgres",
    repository: new PostgresMonitoringRepository(client),
    close: async () => {
      client.release();
    },
  };
}

function openSqliteRuntime(options: MonitoringRuntimeOptions): MonitoringRuntime {
  const db = initDatabase(options.dbPath ?? defaultSqliteDbPath());
  runMigrations(options.schemaPath ?? defaultSqliteSchemaPath(), db);

  return {
    backend: "sqlite",
    repository: new MonitoringRepository(db),
    db,
    close: async () => {
      closeDatabase(db);
    },
  };
}

export async function openMonitoringRuntime(options: MonitoringRuntimeOptions = {}): Promise<MonitoringRuntime> {
  if (isPostgresConfigured()) {
    return openPostgresRuntime(options);
  }
  return openSqliteRuntime(options);
}
