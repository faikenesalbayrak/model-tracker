import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";

export async function runPostgresMigrations(schemaFilePath: string, client: PoolClient): Promise<void> {
  const sql = readFileSync(schemaFilePath, "utf8").trim();
  if (sql.length === 0) {
    throw new Error(`Schema file is empty: ${schemaFilePath}`);
  }

  await client.query(sql);
}
