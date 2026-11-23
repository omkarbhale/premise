import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StorageError, openDatabase, recordEvent } from "../src/storage/database.js";
import { MIGRATIONS } from "../src/storage/migrations.js";
import { tempFolder } from "./helpers.js";

describe("storage", () => {
  it("creates the database in the data folder at the current schema", () => {
    const folder = tempFolder();
    const { db, schemaVersion, backup } = openDatabase(folder);
    expect(schemaVersion).toBe(MIGRATIONS.at(-1)!.version);
    expect(backup).toBeNull();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "softwares",
        "jobs",
        "agent_sessions",
        "events",
        "settings",
        "page_tokens",
      ]),
    );
    expect(existsSync(join(folder, "premise.db"))).toBe(true);
    db.close();
  });

  it("keeps data across reopening and copies the database before a migration", () => {
    const folder = tempFolder();
    const first = openDatabase(folder);
    recordEvent(first.db, { module: "test", kind: "kept" });
    first.db.close();

    const next = [
      ...MIGRATIONS,
      { version: MIGRATIONS.length + 1, name: "extra", sql: "CREATE TABLE extra (id INTEGER)" },
    ];
    const second = openDatabase(folder, next);
    expect(second.schemaVersion).toBe(next.length);
    expect(second.backup).toBe(join(folder, `premise.db.bak-${MIGRATIONS.length}`));
    expect(existsSync(second.backup!)).toBe(true);
    expect(second.db.prepare("SELECT kind FROM events").all()).toEqual([{ kind: "kept" }]);
    second.db.close();
  });

  it("migrates a schema-16 database without touching its corrections and lessons", () => {
    const folder = tempFolder();
    const old = openDatabase(folder, MIGRATIONS.filter((m) => m.version <= 16));
    old.db
      .prepare("INSERT INTO softwares (id, name, created) VALUES ('s1', 'Notes', '2026-01-01')")
      .run();
    old.db
      .prepare(
        `INSERT INTO corrections (id, software_id, kind, source, what, status, created)
         VALUES (7, 's1', 'strike', 'ask:1:a', 'You struck it', 'read', '2026-01-02')`,
      )
      .run();
    old.db
      .prepare(
        `INSERT INTO lessons (id, correction_id, software_id, destination, topic, text, state, created)
         VALUES (3, 7, 's1', 'premise', 't', 'A line', 'live', '2026-01-03')`,
      )
      .run();
    old.db.close();

    const now = openDatabase(folder);
    expect(now.schemaVersion).toBe(17);
    expect(
      now.db.prepare("SELECT id, kind, what FROM corrections").all(),
    ).toEqual([{ id: 7, kind: "strike", what: "You struck it" }]);
    expect(
      now.db.prepare("SELECT id, correction_id, text FROM lessons").all(),
    ).toEqual([{ id: 3, correction_id: 7, text: "A line" }]);
    expect(now.db.prepare("SELECT COUNT(*) AS n FROM refused_answers").get()).toEqual({ n: 0 });
    now.db.close();
  });

  it("refuses a database written by a newer premise", () => {
    const folder = tempFolder();
    const next = [...MIGRATIONS, { version: 99, name: "future", sql: "SELECT 1" }];
    openDatabase(folder, next).db.close();
    expect(() => openDatabase(folder)).toThrowError(
      expect.objectContaining({ code: "SCHEMA_NEWER_THAN_PREMISE" }) as Error,
    );
  });

  it("says plainly when the data folder cannot be written", () => {
    if (process.getuid?.() === 0) return; // root can write anywhere
    const parent = tempFolder();
    const locked = join(parent, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      expect(() => openDatabase(join(locked, "data"))).toThrow(StorageError);
    } finally {
      chmodSync(locked, 0o700);
    }
  });
});
