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
  const last = journal.entries.at(-1);
  journal.entries.push({
    idx: last.idx + 1,
    version: "6",
    when: last.when + 1,
    tag: `${String(last.idx + 1).padStart(4, "0")}_test`,
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal));
  const file = `${String(last.idx + 1).padStart(4, "0")}_test.sql`;
  writeFileSync(join(folder, file), fixture(name));
  return { folder, file };
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
    const migrations = readMigrationFiles({ migrationsFolder });
    expect(
      sqlite
        .prepare(
          "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
        )
        .all(),
    ).toEqual(
      migrations.map((migration) => ({
        hash: migration.hash,
        created_at: migration.folderMillis,
      })),
    );
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

  it("adopts legacy v1, preserves all rows, and rebuilds only boards", () => {
    const filename = join(temporary(), "legacy.db");
    const sqlite = database(filename);
    legacy(sqlite);
    const before = data(sqlite);
    const roots = sqlite
      .prepare(
        "SELECT name, rootpage FROM sqlite_schema WHERE type = 'table' AND name != 'boards' ORDER BY name",
      )
      .all();
    migrate(sqlite);
    expect(
      sqlite.prepare("SELECT * FROM boards WHERE id = 'b1'").get(),
    ).toEqual({
      id: "b1",
      user_id: "u1",
      name: "My board",
      creator_type: "video",
      created_at: expect.any(String),
    });
    const preservedRows = () =>
      tables.map((table) =>
        sqlite
          .prepare(
            table === "boards"
              ? "SELECT id, user_id, creator_type FROM boards ORDER BY id"
              : `SELECT * FROM "${table}" ORDER BY id`,
          )
          .all(),
      );
    expect(preservedRows()).toEqual(before);
    expect(
      sqlite.prepare("SELECT version FROM schema_migrations").all(),
    ).toEqual([{ version: 1 }]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      sqlite
        .prepare(
          "SELECT name, rootpage FROM sqlite_schema WHERE type = 'table' AND name NOT IN ('__drizzle_migrations', 'boards') ORDER BY name",
        )
        .all(),
    ).toEqual(roots);
    const schema = objects(sqlite);
    migrate(sqlite);
    expect(objects(sqlite)).toEqual(schema);
    const upgraded = data(sqlite);
    sqlite.close();
    const reopened = database(filename);
    migrate(reopened);
    expect(reopened.pragma("foreign_key_check")).toEqual([]);
    expect(data(reopened)).toEqual(upgraded);
  });

  it("verifies generated baseline+0001 columns, defaults, foreign keys and index semantics against legacy", () => {
    const old = database();
    legacy(old);
    const fresh = database();
    migrate(fresh);
    const columns = (sqlite: Database.Database, table: string) =>
      (
        sqlite.pragma(`table_xinfo('${table}')`) as {
          name: string;
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
    for (const table of tables.filter((name) => name !== "boards")) {
      expect(columns(fresh, table)).toEqual(columns(old, table));
      expect(foreignKeys(fresh, table)).toEqual(foreignKeys(old, table));
      expect(indexes(fresh, table)).toEqual(indexes(old, table));
    }
    expect(columns(fresh, "boards").map((column) => column.name)).toEqual([
      "id",
      "user_id",
      "name",
      "creator_type",
      "created_at",
    ]);
    expect(
      columns(fresh, "boards").find((column) => column.name === "name")
        ?.dflt_value,
    ).toBe("'My board'");
    expect(
      indexes(fresh, "boards")
        .map((index) => ({
          unique: index.unique,
          origin: (index.columns as { name: string }[])
            .filter((column) => column.name)
            .map((column) => column.name),
        }))
        .sort((a, b) => a.origin.join().localeCompare(b.origin.join())),
    ).toEqual([
      { unique: 1, origin: ["id"] },
      { unique: 0, origin: ["user_id"] },
    ]);
    expect(foreignKeys(fresh, "boards")).toEqual(foreignKeys(old, "boards"));
  });

  it.each(["fresh", "legacy", "baseline"])(
    "supports multiple boards after migrating %s and enforces foreign keys",
    (kind) => {
      const sqlite = database();
      if (kind === "legacy") legacy(sqlite);
      if (kind === "baseline") {
        const { folder } = withNextMigration("next");
        const journalPath = join(folder, "meta/_journal.json");
        const journal = JSON.parse(readFileSync(journalPath, "utf8"));
        journal.entries = journal.entries.slice(0, 1);
        writeFileSync(journalPath, JSON.stringify(journal));
        migrate(sqlite, folder);
        sqlite.exec(fixture("data"));
      }
      const before = kind === "fresh" ? [] : data(sqlite);
      migrate(sqlite);
      if (kind === "fresh") sqlite.exec(fixture("data"));
      else {
        for (const [index, table] of tables.entries()) {
          if (table !== "boards") {
            expect(
              sqlite.prepare(`SELECT * FROM "${table}" ORDER BY id`).all(),
            ).toEqual(before[index]);
          }
        }
      }
      sqlite.exec(
        "INSERT INTO boards (id, user_id, creator_type) VALUES ('b2', 'u1', 'video')",
      );
      expect(sqlite.prepare("SELECT id FROM boards ORDER BY id").all()).toEqual(
        [{ id: "b1" }, { id: "b2" }],
      );
      expect(() =>
        sqlite.exec(
          "INSERT INTO boards (id, user_id, creator_type) VALUES ('b3', 'missing', 'video')",
        ),
      ).toThrow(/FOREIGN KEY/);
      sqlite.exec("DELETE FROM boards WHERE id = 'b2'");
      expect(sqlite.prepare("SELECT id FROM cards").all()).toEqual([
        { id: "c1" },
      ]);
      sqlite.exec("DELETE FROM user WHERE id = 'u1'");
      for (const table of ["boards", "stages", "cards"]) {
        expect(sqlite.prepare(`SELECT * FROM "${table}"`).all()).toEqual([]);
      }
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    },
  );

  it("rolls back migration-introduced foreign key violations and restores enforcement", () => {
    const sqlite = database();
    migrate(sqlite);
    sqlite.exec(fixture("data"));
    const before = data(sqlite);
    const schema = objects(sqlite);
    const ledger = sqlite.prepare("SELECT * FROM __drizzle_migrations").all();
    const { folder, file } = withNextMigration("next");
    writeFileSync(join(folder, file), "UPDATE boards SET user_id = 'missing';");
    expect(() => migrate(sqlite, folder)).toThrow(/foreign key violations/);
    expect(data(sqlite)).toEqual(before);
    expect(objects(sqlite)).toEqual(schema);
    expect(sqlite.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(
      ledger,
    );
    expect(sqlite.inTransaction).toBe(false);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
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
      const { folder, file } = withNextMigration("failure");
      expect(() => migrate(sqlite, folder)).toThrow(/missing_table/);
      expect(sqlite.inTransaction).toBe(false);
      expect(objects(sqlite)).toEqual(schema);
      if (kind !== "fresh") expect(data(sqlite)).toEqual(before);
      const appliedCount = readMigrationFiles({
        migrationsFolder: folder,
      }).length;
      writeFileSync(join(folder, file), fixture("next"));
      migrate(sqlite, folder);
      expect(sqlite.prepare("SELECT * FROM migration_probe").all()).toEqual([
        { id: 1 },
      ]);
      expect(
        sqlite.prepare("SELECT * FROM __drizzle_migrations").all(),
      ).toHaveLength(appliedCount);
      migrate(sqlite, folder);
      expect(
        sqlite.prepare("SELECT * FROM __drizzle_migrations").all(),
      ).toHaveLength(appliedCount);
    },
  );

  it("refuses changed or missing applied history", () => {
    const sqlite = database();
    const { folder, file } = withNextMigration("next");
    migrate(sqlite, folder);
    const before = objects(sqlite);
    expect(() => migrate(sqlite)).toThrow(/history mismatch/);
    writeFileSync(join(folder, file), fixture("failure"));
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
    const { folder } = withNextMigration("next");
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
