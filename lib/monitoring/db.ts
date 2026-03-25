import BetterSqlite3 from "better-sqlite3";

export type MonitoringDatabase = BetterSqlite3.Database;

export interface InitDatabaseOptions {
  readonlyMode?: boolean;
  fileMustExist?: boolean;
  timeoutMs?: number;
}

export function initDatabase(dbPath: string, options: InitDatabaseOptions = {}): MonitoringDatabase {
  const db = new BetterSqlite3(dbPath, {
    readonly: options.readonlyMode ?? false,
    fileMustExist: options.fileMustExist ?? false,
    timeout: options.timeoutMs ?? 5_000,
  });

  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  return db;
}

export function closeDatabase(db: MonitoringDatabase): void {
  if (db.open) {
    db.close();
  }
}
