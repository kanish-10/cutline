import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SERVER } from "./config.js";
import * as schema from "./schema.js";

export { migrate } from "./migrations.js";

export function openDatabase(filename: string) {
  const sqlite = new Database(filename);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma(`busy_timeout = ${SERVER.busyTimeoutMs}`);
    return { sqlite, db: drizzle(sqlite, { schema }) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
export type AppDatabase = ReturnType<typeof openDatabase>["db"];
