import { accessSync, constants, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, type Migration } from "./migrations.js";

export const DATABASE_FILE_NAME = "premise.db";

export type StorageErrorCode =
  "DATA_FOLDER_UNWRITABLE" | "SCHEMA_NEWER_THAN_PREMISE" | "DATABASE_DAMAGED" | "MIGRATION_FAILED";

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export type Database = DatabaseSync;

export interface OpenedDatabase {
  db: Database;
  file: string;
  schemaVersion: number;
  /** The backup made before migrating, if one was made. */
  backup: string | null;
}

/** Make sure the data folder exists and premise can write to it. */
export function ensureDataFolder(folder: string): void {
  try {
    mkdirSync(folder, { recursive: true });
    accessSync(folder, constants.W_OK);
  } catch (error) {
    throw new StorageError(
      "DATA_FOLDER_UNWRITABLE",
      `premise cannot write to its data folder ${folder} (${(error as Error).message}). Choose another with --data or PREMISE_DATA_FOLDER.`,
    );
  }
}

function userVersion(db: Database): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

/**
 * Open premise's database in the data folder, migrated to the current schema.
 * The file is copied to premise.db.bak-<old version> before any migration runs.
 */
export function openDatabase(
  dataFolder: string,
  migrations: readonly Migration[] = MIGRATIONS,
): OpenedDatabase {
  ensureDataFolder(dataFolder);
  const file = join(dataFolder, DATABASE_FILE_NAME);
  const existed = existsSync(file);
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (existed) {
      const check = db.prepare("PRAGMA quick_check").get() as Record<string, string>;
      const verdict = Object.values(check)[0];
      if (verdict !== "ok") {
        throw new StorageError(
          "DATABASE_DAMAGED",
          `premise's database ${file} is damaged (${verdict}). Restore it from the newest premise.db.bak-* file in the same folder.`,
        );
      }
    }
    const latest = migrations.length ? migrations[migrations.length - 1]!.version : 0;
    const from = userVersion(db);
    if (from > latest) {
      throw new StorageError(
        "SCHEMA_NEWER_THAN_PREMISE",
        `premise's database ${file} was written by a newer premise (schema ${from}; this premise knows ${latest}). Update premise, or use another data folder.`,
      );
    }
    const pending = migrations.filter((m) => m.version > from);
    let backup: string | null = null;
    if (pending.length > 0 && existed && from > 0) {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      backup = `${file}.bak-${from}`;
      copyFileSync(file, backup);
    }
    for (const migration of pending) {
      try {
        db.exec("BEGIN IMMEDIATE");
        db.exec(migration.sql);
        db.exec(`PRAGMA user_version = ${migration.version}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw new StorageError(
          "MIGRATION_FAILED",
          `premise could not update its database to schema ${migration.version} (${migration.name}): ${(error as Error).message}.${backup ? ` The copy made before updating is ${backup}.` : ""}`,
        );
      }
    }
    return { db, file, schemaVersion: userVersion(db), backup };
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Run work in one transaction: committed together, or not at all. Inside another transaction the
 * work joins it, so modules can call each other without knowing who opened it.
 */
export function transaction<T>(db: Database, work: () => T): T {
  if (db.isTransaction) return work();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function now(): string {
  return new Date().toISOString();
}

export interface EventInput {
  softwareId?: string | null;
  module: string;
  kind: string;
  reference?: string | null;
  detail?: unknown;
}

/** Append an event: the single history of what happened (storage spec 10). */
export function recordEvent(db: Database, event: EventInput): number {
  const result = db
    .prepare(
      "INSERT INTO events (time, software_id, module, kind, reference, detail) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      now(),
      event.softwareId ?? null,
      event.module,
      event.kind,
      event.reference ?? null,
      event.detail === undefined ? null : JSON.stringify(event.detail),
    );
  return Number(result.lastInsertRowid);
}

export { CURRENT_SCHEMA_VERSION };
