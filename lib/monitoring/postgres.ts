import { Pool } from "pg";

declare global {
  var __monitoringPgPool: Pool | undefined;
}

function resolveConnectionString(): string | null {
  const explicit = process.env.MONITORING_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (postgresUrl) return postgresUrl;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const allowDatabaseUrlFallback = process.env.MONITORING_ALLOW_DATABASE_URL_FALLBACK?.trim().toLowerCase();
  const fallbackAllowed = allowDatabaseUrlFallback === "1" || allowDatabaseUrlFallback === "true" || allowDatabaseUrlFallback === "yes";
  if (databaseUrl && fallbackAllowed) return databaseUrl;
  if (databaseUrl && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
    throw new Error(
      "DATABASE_URL fallback is disabled for monitoring in production. Set MONITORING_DATABASE_URL or POSTGRES_URL, or explicitly set MONITORING_ALLOW_DATABASE_URL_FALLBACK=true.",
    );
  }
  if (databaseUrl) return databaseUrl;

  return null;
}

export function isMonitoringReadOnly(): boolean {
  const value = process.env.MONITORING_READ_ONLY ?? process.env.MONITORING_READONLY;
  return value?.trim().toLowerCase() === "true";
}

export function isPostgresConfigured(): boolean {
  return Boolean(resolveConnectionString());
}

export function getMonitoringPool(): Pool {
  if (globalThis.__monitoringPgPool) {
    return globalThis.__monitoringPgPool;
  }

  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error("Postgres connection string is missing. Set MONITORING_DATABASE_URL or POSTGRES_URL.");
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ...(isMonitoringReadOnly() ? { options: "-c default_transaction_read_only=on" } : {}),
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });

  globalThis.__monitoringPgPool = pool;
  return pool;
}
