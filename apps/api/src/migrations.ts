import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";

export const migrationsFolder = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const legacyFolder = new URL("../migrations/legacy/", import.meta.url);

function legacySql(name: string) {
  return readFileSync(new URL(name, legacyFolder), "utf8");
}

function schemaObjects(sqlite: Database.Database) {
  return sqlite
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name",
    )
    .all();
}

function validateLegacy(sqlite: Database.Database) {
  const reference = new Database(":memory:");
  try {
    reference.exec(legacySql("v1.sql"));
    if (
      JSON.stringify(schemaObjects(sqlite)) !==
      JSON.stringify(schemaObjects(reference))
    ) {
      throw new Error(
        "Unknown legacy schema; refusing migration. Restore or reconcile from a verified backup.",
      );
    }
    const versions = sqlite
      .prepare("SELECT version FROM schema_migrations")
      .all();
    if (JSON.stringify(versions) !== JSON.stringify([{ version: 1 }])) {
      throw new Error("Unknown legacy migration version; refusing migration.");
    }
    if ((sqlite.pragma("foreign_key_check") as unknown[]).length !== 0) {
      throw new Error("Legacy foreign key violations; refusing migration.");
    }
  } finally {
    reference.close();
  }
}

export function migrate(
  sqlite: Database.Database,
  folder: string = migrationsFolder,
) {
  if (sqlite.inTransaction) {
    throw new Error(
      "Migrations require a dedicated connection outside a transaction.",
    );
  }
  if (sqlite.pragma("foreign_keys", { simple: true }) !== 1) {
    throw new Error("Migrations require foreign_keys = ON.");
  }
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  if (migrations.length === 0) throw new Error("No migrations found.");
  for (const [index, migration] of migrations.entries()) {
    if (
      !Number.isSafeInteger(migration.folderMillis) ||
      migration.folderMillis <= (migrations[index - 1]?.folderMillis ?? 0)
    ) {
      throw new Error("Invalid migration journal order.");
    }
  }
  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite
      .transaction(() => {
        const hasLedger = sqlite
          .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = '__drizzle_migrations'",
          )
          .get();
        let adoptLegacy = false;
        if (!hasLedger && schemaObjects(sqlite).length !== 0) {
          validateLegacy(sqlite);
          adoptLegacy = true;
        }
        if (!hasLedger) sqlite.exec(legacySql("ledger.sql"));
        const applied = sqlite
          .prepare(
            "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
          )
          .all() as { hash: string; created_at: number }[];
        if (
          hasLedger &&
          applied.length === 0 &&
          schemaObjects(sqlite).length !== 1
        ) {
          throw new Error(
            "Untracked schema with an empty migration history; refusing migration.",
          );
        }
        for (const [index, row] of applied.entries()) {
          const migration = migrations[index];
          if (
            !migration ||
            row.hash !== migration.hash ||
            row.created_at !== migration.folderMillis
          ) {
            throw new Error(
              "Migration history mismatch; refusing changed, missing, or unknown migrations.",
            );
          }
        }
        const record = sqlite.prepare(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        );
        for (const [index, migration] of migrations.entries()) {
          if (index < applied.length) continue;
          if (adoptLegacy && index === 0) {
            if (
              migration.hash !==
                "53958400beda4d3f6518aa48284787d40fa81b6f8cd998f2d2fe4c4200e4ba00" ||
              migration.folderMillis !== 1789671140334
            ) {
              throw new Error(
                "Legacy adoption requires the original baseline migration.",
              );
            }
            sqlite.exec(legacySql("adopt-v1.sql"));
          } else {
            for (const statement of migration.sql) sqlite.exec(statement);
          }
          record.run(migration.hash, migration.folderMillis);
        }
        if ((sqlite.pragma("foreign_key_check") as unknown[]).length !== 0) {
          throw new Error("Migration introduced foreign key violations.");
        }
      })
      .immediate();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
