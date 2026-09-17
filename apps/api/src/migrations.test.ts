import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDatabase } from "./database.js";
import { migrationsFolder } from "./migrations.js";
import { cleanupDatabase, createTestEnv } from "./testUtils.js";

const handles: Database.Database[] = [];
const directories: string[] = [];
const tables = [
  "user",
  "session",
  "account",
  "verification",
  "boards",
  "stages",
  "cards",
];

function database(filename = ":memory:") {
  const { sqlite } = openDatabase(filename);
  handles.push(sqlite);
  return sqlite;
}

function fixture(name: string) {
  return readFileSync(
    new URL(`./fixtures/${name}.sql`, import.meta.url),
    "utf8",
  );
}

function legacy(sqlite: Database.Database) {
  sqlite.exec(readFileSync(join(migrationsFolder, "legacy/v1.sql"), "utf8"));
  sqlite.exec(fixture("data"));
}

function objects(sqlite: Database.Database) {
  return sqlite.prepare("SELECT * FROM sqlite_schema ORDER BY name").all();
}

function data(sqlite: Database.Database) {
  return tables.map((table) =>
    sqlite.prepare(`SELECT * FROM "${table}" ORDER BY id`).all(),
  );
}

function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "cutline-migrations-"));
  directories.push(directory);
  return directory;
}

function withNextMigration(name: string) {
  const folder = temporary();
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries.push({
    idx: 1,
    version: "6",
    when: journal.entries[0].when + 1,
    tag: "0001_test",
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal));
  writeFileSync(join(folder, "0001_test.sql"), fixture(name));
  return folder;
}

afterEach(() => {
  cleanupDatabase();
  for (const sqlite of handles.splice(0)) if (sqlite.open) sqlite.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("managed migrations", () => {
  it("creates a fresh database and persists an idempotent journal across reopen", () => {
    const filename = join(temporary(), "fresh.db");
    const sqlite = database(filename);
    migrate(sqlite);
    sqlite.exec(fixture("data"));
    const before = data(sqlite);
    const schema = objects(sqlite);
    const migration = readMigrationFiles({ migrationsFolder })[0];
    expect(
      sqlite.prepare("SELECT hash, created_at FROM __drizzle_migrations").all(),
    ).toEqual([{ hash: migration?.hash, created_at: migration?.folderMillis }]);
    migrate(sqlite);
    expect(objects(sqlite)).toEqual(schema);
    expect(data(sqlite)).toEqual(before);
    sqlite.close();
    const reopened = database(filename);
    migrate(reopened);
    expect(data(reopened)).toEqual(before);
    expect(reopened.pragma("foreign_key_check")).toEqual([]);
    expect(reopened.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(reopened.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("adopts exact legacy v1 without rebuilding tables or changing any user data", () => {
    const filename = join(temporary(), "legacy.db");
    const sqlite = database(filename);
    legacy(sqlite);
    const before = data(sqlite);
    const roots = sqlite
      .prepare(
        "SELECT name, rootpage FROM sqlite_schema WHERE type = 'table' ORDER BY name",
      )
      .all();
    migrate(sqlite);
    expect(data(sqlite)).toEqual(before);
    expect(
      sqlite.prepare("SELECT version FROM schema_migrations").all(),
    ).toEqual([{ version: 1 }]);
    expect(
      sqlite
        .prepare(
          "SELECT name, rootpage FROM sqlite_schema WHERE type = 'table' AND name != '__drizzle_migrations' ORDER BY name",
        )
        .all(),
    ).toEqual(roots);
    const schema = objects(sqlite);
    migrate(sqlite);
    expect(objects(sqlite)).toEqual(schema);
    sqlite.close();
    const reopened = database(filename);
    migrate(reopened);
    expect(data(reopened)).toEqual(before);
  });

  it("verifies generated baseline columns, defaults, foreign keys and index semantics against legacy", () => {
    const old = database();
    legacy(old);
    const fresh = database();
    migrate(fresh);
    const columns = (sqlite: Database.Database, table: string) =>
      (
        sqlite.pragma(`table_xinfo('${table}')`) as {
          dflt_value: string | null;
        }[]
      ).map((column) => ({
        ...column,
        dflt_value: column.dflt_value === "false" ? "0" : column.dflt_value,
      }));
    const foreignKeys = (sqlite: Database.Database, table: string) =>
      (sqlite.pragma(`foreign_key_list('${table}')`) as { id: number }[])
        .map(({ id: _id, ...key }) => key)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const indexes = (sqlite: Database.Database, table: string) =>
      (
        sqlite.pragma(`index_list('${table}')`) as {
          name: string;
          unique: number;
          partial: number;
        }[]
      )
        .map((index) => ({
          unique: index.unique,
          partial: index.partial,
          columns: sqlite.pragma(`index_xinfo('${index.name}')`),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    for (const table of tables) {
      expect(columns(fresh, table)).toEqual(columns(old, table));
      expect(foreignKeys(fresh, table)).toEqual(foreignKeys(old, table));
      expect(indexes(fresh, table)).toEqual(indexes(old, table));
    }
  });

  it.each([
    "missing-index",
    "extra-column",
    "unknown-version",
    "trigger",
    "orphan",
  ])("refuses unknown legacy %s without writes", (name) => {
    const sqlite = database();
    legacy(sqlite);
    sqlite.exec(fixture(name));
    const schema = objects(sqlite);
    const before = data(sqlite);
    expect(() => migrate(sqlite)).toThrow(/refusing migration/);
    expect(objects(sqlite)).toEqual(schema);
    expect(data(sqlite)).toEqual(before);
  });

  it("refuses partial and untracked schemas without writes", () => {
    const sqlite = database();
    sqlite.exec(fixture("partial"));
    const before = objects(sqlite);
    expect(() => migrate(sqlite)).toThrow(/Unknown legacy schema/);
    expect(objects(sqlite)).toEqual(before);
    const untracked = database();
    untracked.exec(fixture("next"));
    const untrackedBefore = objects(untracked);
    expect(() => migrate(untracked)).toThrow(/Unknown legacy schema/);
    expect(objects(untracked)).toEqual(untrackedBefore);
  });

  it.each(["fresh", "legacy", "managed"])(
    "rolls back all DDL, data and ledger writes on failure for %s",
    (kind) => {
      const sqlite = database();
      if (kind === "legacy") legacy(sqlite);
      if (kind === "managed") {
        migrate(sqlite);
        sqlite.exec(fixture("data"));
      }
      const schema = objects(sqlite);
      const before = kind === "fresh" ? [] : data(sqlite);
      const folder = withNextMigration("failure");
      expect(() => migrate(sqlite, folder)).toThrow(/missing_table/);
      expect(sqlite.inTransaction).toBe(false);
      expect(objects(sqlite)).toEqual(schema);
      if (kind !== "fresh") expect(data(sqlite)).toEqual(before);
      writeFileSync(join(folder, "0001_test.sql"), fixture("next"));
      migrate(sqlite, folder);
      expect(sqlite.prepare("SELECT * FROM migration_probe").all()).toEqual([
        { id: 1 },
      ]);
      expect(
        sqlite.prepare("SELECT * FROM __drizzle_migrations").all(),
      ).toHaveLength(2);
      migrate(sqlite, folder);
      expect(
        sqlite.prepare("SELECT * FROM __drizzle_migrations").all(),
      ).toHaveLength(2);
    },
  );

  it("refuses changed or missing applied history", () => {
    const sqlite = database();
    const folder = withNextMigration("next");
    migrate(sqlite, folder);
    const before = objects(sqlite);
    expect(() => migrate(sqlite)).toThrow(/history mismatch/);
    writeFileSync(join(folder, "0001_test.sql"), fixture("failure"));
    expect(() => migrate(sqlite, folder)).toThrow(/history mismatch/);
    expect(objects(sqlite)).toEqual(before);
  });

  it("refuses an empty ledger on a populated legacy database", () => {
    const sqlite = database();
    legacy(sqlite);
    sqlite.exec(
      readFileSync(join(migrationsFolder, "legacy/ledger.sql"), "utf8"),
    );
    const before = objects(sqlite);
    expect(() => migrate(sqlite)).toThrow(/empty migration history/);
    expect(objects(sqlite)).toEqual(before);
  });

  it("refuses adoption against a modified baseline", () => {
    const sqlite = database();
    legacy(sqlite);
    const folder = withNextMigration("next");
    writeFileSync(join(folder, "0000_baseline.sql"), fixture("next"));
    const before = objects(sqlite);
    const rows = data(sqlite);
    expect(() => migrate(sqlite, folder)).toThrow(/original baseline/);
    expect(objects(sqlite)).toEqual(before);
    expect(data(sqlite)).toEqual(rows);
  });

  it("refuses missing migration assets before writing", () => {
    const sqlite = database();
    expect(() => migrate(sqlite, temporary())).toThrow(/journal/);
    expect(objects(sqlite)).toEqual([]);
  });

  it("requires foreign keys and an independent transaction", () => {
    const sqlite = database();
    sqlite.pragma("foreign_keys = OFF");
    expect(() => migrate(sqlite)).toThrow(/foreign_keys/);
    sqlite.pragma("foreign_keys = ON");
    sqlite.transaction(() =>
      expect(() => migrate(sqlite)).toThrow(/dedicated connection/),
    )();
    expect(objects(sqlite)).toEqual([]);
  });

  it("closes all test environment handles and tolerates repeated cleanup", async () => {
    const first = await createTestEnv();
    const second = await createTestEnv();
    first.sqlite.close();
    cleanupDatabase();
    expect(second.sqlite.open).toBe(false);
    expect(() => cleanupDatabase()).not.toThrow();
  });
});
