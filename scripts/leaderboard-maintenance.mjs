#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import BetterSqlite3 from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;

const leaderboardTables = [
  "llm_current",
  "llm_history",
  "vlm_current",
  "vlm_history",
  "tts_current",
  "tts_history",
  "stt_current",
  "stt_history",
  "embeddings_current",
  "embeddings_history",
  "leaderboard_changes",
];

loadEnvLocal();

const args = new Set(process.argv.slice(2));
const target = readArg("target") || "sqlite";
const apply = args.has("--apply");
const backfill = args.has("--backfill");
const backup = !args.has("--no-backup");
const dbPath = readArg("db") || process.env.MONITORING_DB_PATH || path.join(process.cwd(), "data", "monitoring.db");

function usage() {
  console.log(`Usage:
  npm run maintenance:leaderboard -- --target=sqlite [--db=data/monitoring.db] [--apply] [--backfill]
  npm run maintenance:leaderboard -- --target=postgres [--apply] --confirm=RESET_LEADERBOARD --confirm-prod-reset=<db-host-or-name> [--backfill]

Defaults are dry-run and backup-on. Destructive reset requires --apply.
Postgres destructive reset also requires --confirm=RESET_LEADERBOARD and --confirm-prod-reset matching the DB host or database name.`);
}

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    process.env[key] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function sqliteCounts(db) {
  return Object.fromEntries(
    leaderboardTables.map((table) => {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
      return [table, Number(row.count)];
    }),
  );
}

function printCounts(label, counts) {
  console.log(label);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`- ${table}: ${count}`);
  }
}

async function runSqlite() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite DB not found: ${dbPath}`);
  }

  const db = new BetterSqlite3(dbPath);
  try {
    printCounts("Current SQLite leaderboard row counts:", sqliteCounts(db));

    if (!apply) {
      console.log("Dry-run only. Re-run with --apply to backup and reset leaderboard tables.");
      return;
    }

    if (backup) {
      const backupPath = `${dbPath}.leaderboard-backup-${timestamp()}`;
      fs.copyFileSync(dbPath, backupPath);
      for (const suffix of ["-wal", "-shm"]) {
        const sidecar = `${dbPath}${suffix}`;
        if (fs.existsSync(sidecar)) {
          fs.copyFileSync(sidecar, `${backupPath}${suffix}`);
        }
      }
      console.log(`SQLite backup written: ${backupPath}`);
    }

    const tx = db.transaction(() => {
      for (const table of leaderboardTables) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
    });
    tx();
    db.prepare("VACUUM").run();
    printCounts("Post-reset SQLite leaderboard row counts:", sqliteCounts(db));
  } finally {
    db.close();
  }
}

function postgresConnectionString() {
  const explicit = process.env.MONITORING_DATABASE_URL || process.env.POSTGRES_URL;
  if (explicit) return explicit;
  const databaseUrl = process.env.DATABASE_URL || "";
  const allowFallback = /^(1|true|yes)$/i.test(process.env.MONITORING_ALLOW_DATABASE_URL_FALLBACK || "");
  if (databaseUrl && !allowFallback) {
    throw new Error("DATABASE_URL fallback is disabled for leaderboard maintenance. Set MONITORING_DATABASE_URL/POSTGRES_URL or MONITORING_ALLOW_DATABASE_URL_FALLBACK=true.");
  }
  return databaseUrl;
}

function describePostgresTarget(connectionString) {
  const parsed = new URL(connectionString);
  return {
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ""),
    user: decodeURIComponent(parsed.username || ""),
  };
}

async function postgresCounts(client) {
  const counts = {};
  for (const table of leaderboardTables) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM public.${table}`);
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  return counts;
}

async function runPostgres() {
  const connectionString = postgresConnectionString();
  if (!connectionString) {
    throw new Error("Missing MONITORING_DATABASE_URL, POSTGRES_URL, or DATABASE_URL.");
  }
  const targetInfo = describePostgresTarget(connectionString);
  console.log(`Postgres target: host=${targetInfo.host} database=${targetInfo.database || "(unknown)"} user=${targetInfo.user || "(unknown)"}`);
  if (apply && readArg("confirm") !== "RESET_LEADERBOARD") {
    throw new Error("Postgres reset requires --confirm=RESET_LEADERBOARD in addition to --apply.");
  }
  if (apply) {
    const prodConfirm = readArg("confirm-prod-reset");
    if (!prodConfirm || ![targetInfo.host, targetInfo.database].includes(prodConfirm)) {
      throw new Error("Postgres reset requires --confirm-prod-reset matching the DB host or database name.");
    }
    if (!backup && !/^(1|true|yes)$/i.test(process.env.MONITORING_ALLOW_UNBACKED_RESET || "")) {
      throw new Error("Postgres reset cannot use --no-backup unless MONITORING_ALLOW_UNBACKED_RESET=true.");
    }
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    printCounts("Current Postgres leaderboard row counts:", await postgresCounts(client));

    if (!apply) {
      console.log("Dry-run only. Re-run with --apply to backup and reset leaderboard tables.");
      return;
    }

    const stamp = timestamp();
    await client.query("BEGIN");
    try {
      if (backup) {
        for (const table of leaderboardTables) {
          await client.query(`CREATE TABLE public.${table}_backup_${stamp} AS TABLE public.${table}`);
        }
        console.log(`Postgres backup tables created with suffix _backup_${stamp}.`);
      }

      for (const table of leaderboardTables) {
        await client.query(`DELETE FROM public.${table}`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    printCounts("Post-reset Postgres leaderboard row counts:", await postgresCounts(client));
  } finally {
    client.release();
    await pool.end();
  }
}

async function triggerBackfill() {
  const appUrl = (process.env.PROD_APP_URL || process.env.LEADERBOARD_BACKFILL_URL || "").replace(/\/+$/, "");
  const manualEnabled = /^(1|true|yes)$/i.test(process.env.MONITORING_MANUAL_RUN_ENABLED || "");
  const token = process.env.CRON_SECRET || (manualEnabled ? process.env.MONITORING_MANUAL_TOKEN : "") || "";
  if (!appUrl || !token) {
    throw new Error("Backfill requires PROD_APP_URL or LEADERBOARD_BACKFILL_URL plus MONITORING_MANUAL_TOKEN or CRON_SECRET.");
  }

  const response = await fetch(`${appUrl}/api/monitoring/run?lane=leaderboard`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lanes: ["leaderboard"] }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Backfill failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  console.log(`Backfill triggered: ${text.slice(0, 1000)}`);
}

async function validateRemoteLeaderboard() {
  const appUrl = (process.env.PROD_APP_URL || process.env.LEADERBOARD_BACKFILL_URL || "").replace(/\/+$/, "");
  if (!appUrl) {
    throw new Error("Remote validation requires PROD_APP_URL or LEADERBOARD_BACKFILL_URL.");
  }

  const expectations = [
    ["general_llm", 20],
    ["image_generation", 5],
    ["video_generation", 5],
    ["text_to_speech", 5],
    ["speech_to_text", 3],
    ["embeddings", 5],
  ];
  const failures = [];

  for (const [category, minRows] of expectations) {
    const response = await fetch(`${appUrl}/api/monitoring/leaderboard?category=${encodeURIComponent(category)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      failures.push(`${category}: HTTP ${response.status}`);
      continue;
    }
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (rows.length < minRows) {
      failures.push(`${category}: expected at least ${minRows} rows, got ${rows.length}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Remote leaderboard validation failed: ${failures.join("; ")}`);
  }
  console.log("Remote leaderboard validation passed.");
}

async function main() {
  if (args.has("--help") || args.has("-h")) {
    usage();
    return;
  }

  if (target === "sqlite") {
    await runSqlite();
  } else if (target === "postgres") {
    await runPostgres();
  } else {
    throw new Error(`Unknown target: ${target}`);
  }

  if (backfill) {
    if (!apply) {
      console.log("Skipping backfill in dry-run mode. Add --apply --backfill to trigger it.");
      return;
    }
    await triggerBackfill();
    await validateRemoteLeaderboard();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
