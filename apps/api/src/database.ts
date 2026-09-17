import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SERVER } from "./config.js";
import * as schema from "./schema.js";

const MIGRATIONS = [
  `CREATE TABLE user (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE session (id TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE);
  CREATE INDEX session_user_idx ON session(user_id);
  CREATE TABLE account (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE INDEX account_user_idx ON account(user_id);
  CREATE UNIQUE INDEX account_provider_idx ON account(provider_id, account_id);
  CREATE TABLE verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE boards (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE, creator_type TEXT NOT NULL);
  CREATE TABLE stages (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, name TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL);
  CREATE INDEX stages_board_idx ON stages(board_id);
  CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, stage_id TEXT NOT NULL REFERENCES stages(id), title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', checklist TEXT NOT NULL, tags TEXT NOT NULL, links TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT);
  CREATE INDEX cards_board_idx ON cards(board_id);
  CREATE INDEX cards_stage_idx ON cards(stage_id);`,
] as const;
export function openDatabase(filename: string) {
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma(`busy_timeout = ${SERVER.busyTimeoutMs}`);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export function migrate(sqlite: Database.Database) {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL)",
  );
  sqlite.transaction(() => {
    for (const [index, sql] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (
        !sqlite
          .prepare("SELECT version FROM schema_migrations WHERE version = ?")
          .get(version)
      ) {
        sqlite.exec(sql);
        sqlite
          .prepare("INSERT INTO schema_migrations (version) VALUES (?)")
          .run(version);
      }
    }
  })();
}
export type AppDatabase = ReturnType<typeof openDatabase>["db"];
