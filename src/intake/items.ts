import { type Database, now, recordEvent } from "../storage/database.js";

/**
 * The `intake_items` and `readings` tables (docs/specs/storage.md): every item taken in, numbered
 * `I-n` per software, with what the triager made of it and where it stands. Intake text stays in
 * premise's database; the repository cites only `I-n` (decision 0081).
 */

/** Where an item came from. GitHub issues and the feedback page are interfaces only for now. */
export const INTAKE_SOURCES = ["session", "page", "premise", "github", "feedback"] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

export const INTAKE_KINDS = [
  "bug",
  "wish",
  "change-of-purpose",
  "question",
  "opinion",
  "duplicate",
  "noise",
] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];

export const INTAKE_ROUTES = ["in-normally", "asked-at-once", "held", "merged-or-closed"] as const;
export type IntakeRoute = (typeof INTAKE_ROUTES)[number];

/**
 * Where an item stands, as its sender sees it:
 * - taken: in, not read yet; triaging: the triager is reading it;
 * - asked: waiting on the operator; held: kept for a reading; read: a reading took it in;
 * - waiting: on the line, after the work before it; working: on the line now;
 * - running: its change runs; answered: a question, answered;
 * - merged: joined to another item; closed: closed with its reason; dropped: its work was withdrawn.
 */
export type IntakeStatus =
  | "taken"
  | "triaging"
  | "asked"
  | "held"
  | "read"
  | "waiting"
  | "working"
  | "running"
  | "answered"
  | "merged"
  | "closed"
  | "dropped";

/** A record item the item touches, with why. */
export interface Touch {
  id: string;
  reason: string;
}

export interface IntakeItem {
  id: number;
  softwareId: string;
  number: number;
  source: IntakeSource;
  /** The sender's role: "operator", "a user of the software", or "premise". */
  sender: string;
  text: string;
  status: IntakeStatus;
  kind: IntakeKind | null;
  touches: Touch[];
  size: string | null;
  touchesFloor: boolean;
  /** Whether its work changes what the software must do; null until triaged (decision 0192). */
  changesWhat: boolean | null;
  route: IntakeRoute | null;
  /** Why it went where it went, in plain words. */
  reason: string | null;
  /** Who routed it: the triager, premise's default, or the operator. */
  routedBy: "triager" | "default" | "operator" | null;
  /** For a duplicate: the number of the item it joins. */
  joins: number | null;
  /** For a question: the answer. */
  answer: string | null;
  triageJob: number | null;
  askId: number | null;
  workItemId: number | null;
  readingId: number | null;
  received: string;
  triaged: string | null;
  /** When the change it led to was running. */
  fixRunning: string | null;
  finished: string | null;
  /** Where it lives outside premise, such as "github:owner/repo#12"; null for other sources. */
  externalRef: string | null;
  /** The sender's receipt on the feedback page; null when the item had none. */
  receipt: string | null;
  /** When it was last held (or kept held by the operator); a reading's time count starts here. */
  heldAt: string | null;
}

interface Row {
  id: number;
  software_id: string;
  number: number;
  source: IntakeSource;
  sender: string;
  text: string;
  status: IntakeStatus;
  kind: IntakeKind | null;
  touches: string;
  size: string | null;
  touches_floor: number;
  changes_what: number | null;
  route: IntakeRoute | null;
  reason: string | null;
  routed_by: IntakeItem["routedBy"];
  joins: number | null;
  answer: string | null;
  triage_job: number | null;
  ask_id: number | null;
  work_item_id: number | null;
  reading_id: number | null;
  received: string;
  triaged: string | null;
  fix_running: string | null;
  finished: string | null;
  external_ref: string | null;
  receipt: string | null;
  held_at: string | null;
}

function fromRow(row: Row): IntakeItem {
  return {
    id: row.id,
    softwareId: row.software_id,
    number: row.number,
    source: row.source,
    sender: row.sender,
    text: row.text,
    status: row.status,
    kind: row.kind,
    touches: JSON.parse(row.touches) as Touch[],
    size: row.size,
    touchesFloor: row.touches_floor === 1,
    changesWhat: row.changes_what === null ? null : row.changes_what === 1,
    route: row.route,
    reason: row.reason,
    routedBy: row.routed_by,
    joins: row.joins,
    answer: row.answer,
    triageJob: row.triage_job,
    askId: row.ask_id,
    workItemId: row.work_item_id,
    readingId: row.reading_id,
    received: row.received,
    triaged: row.triaged,
    fixRunning: row.fix_running,
    finished: row.finished,
    externalRef: row.external_ref,
    receipt: row.receipt,
    heldAt: row.held_at,
  };
}

/** Take an item in: it gets the next `I-n` of its software. */
export function addIntakeItem(
  db: Database,
  input: {
    softwareId: string;
    source: IntakeSource;
    sender: string;
    text: string;
    externalRef?: string;
    receipt?: string;
  },
): IntakeItem {
  const next =
    (
      db
        .prepare("SELECT MAX(number) AS n FROM intake_items WHERE software_id = ?")
        .get(input.softwareId) as { n: number | null }
    ).n ?? 0;
  const row = db
    .prepare(
      `INSERT INTO intake_items (software_id, number, source, sender, text, status, received, external_ref, receipt)
       VALUES (?, ?, ?, ?, ?, 'taken', ?, ?, ?)`,
    )
    .run(
      input.softwareId,
      next + 1,
      input.source,
      input.sender,
      input.text,
      now(),
      input.externalRef ?? null,
      input.receipt ?? null,
    );
  const id = Number(row.lastInsertRowid);
  recordEvent(db, {
    softwareId: input.softwareId,
    module: "intake",
    kind: "taken",
    reference: `I-${next + 1}`,
    detail: { source: input.source },
  });
  return getIntakeItem(db, id)!;
}

export function getIntakeItem(db: Database, id: number): IntakeItem | undefined {
  const row = db.prepare("SELECT * FROM intake_items WHERE id = ?").get(id) as Row | undefined;
  return row ? fromRow(row) : undefined;
}

export function intakeItemByNumber(
  db: Database,
  softwareId: string,
  number: number,
): IntakeItem | undefined {
  const row = db
    .prepare("SELECT * FROM intake_items WHERE software_id = ? AND number = ?")
    .get(softwareId, number) as Row | undefined;
  return row ? fromRow(row) : undefined;
}

export function intakeItemByExternalRef(
  db: Database,
  softwareId: string,
  externalRef: string,
): IntakeItem | undefined {
  const row = db
    .prepare("SELECT * FROM intake_items WHERE software_id = ? AND external_ref = ?")
    .get(softwareId, externalRef) as Row | undefined;
  return row ? fromRow(row) : undefined;
}

export function intakeItemByReceipt(db: Database, receipt: string): IntakeItem | undefined {
  const row = db.prepare("SELECT * FROM intake_items WHERE receipt = ?").get(receipt) as
    Row | undefined;
  return row ? fromRow(row) : undefined;
}

export function intakeItemOfWork(db: Database, workItemId: number): IntakeItem | undefined {
  const row = db
    .prepare("SELECT * FROM intake_items WHERE work_item_id = ? ORDER BY id LIMIT 1")
    .get(workItemId) as Row | undefined;
  return row ? fromRow(row) : undefined;
}

/** A software's items, newest first; or every software's when none is given. */
export function listIntakeItems(
  db: Database,
  filter: { softwareId?: string; status?: IntakeStatus } = {},
): IntakeItem[] {
  const where: string[] = [];
  const args: string[] = [];
  if (filter.softwareId) {
    where.push("software_id = ?");
    args.push(filter.softwareId);
  }
  if (filter.status) {
    where.push("status = ?");
    args.push(filter.status);
  }
  const rows = db
    .prepare(
      `SELECT * FROM intake_items ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC`,
    )
    .all(...args) as unknown as Row[];
  return rows.map(fromRow);
}

export interface IntakeChange {
  status?: IntakeStatus;
  kind?: IntakeKind | null;
  touches?: Touch[];
  size?: string | null;
  touchesFloor?: boolean;
  changesWhat?: boolean | null;
  route?: IntakeRoute | null;
  reason?: string | null;
  routedBy?: IntakeItem["routedBy"];
  joins?: number | null;
  answer?: string | null;
  triageJob?: number | null;
  askId?: number | null;
  workItemId?: number | null;
  readingId?: number | null;
  triaged?: string | null;
  fixRunning?: string | null;
  finished?: string | null;
  heldAt?: string | null;
}

const COLUMNS: Record<keyof IntakeChange, string> = {
  status: "status",
  kind: "kind",
  touches: "touches",
  size: "size",
  touchesFloor: "touches_floor",
  changesWhat: "changes_what",
  route: "route",
  reason: "reason",
  routedBy: "routed_by",
  joins: "joins",
  answer: "answer",
  triageJob: "triage_job",
  askId: "ask_id",
  workItemId: "work_item_id",
  readingId: "reading_id",
  triaged: "triaged",
  fixRunning: "fix_running",
  finished: "finished",
  heldAt: "held_at",
};

export function setIntakeItem(db: Database, id: number, change: IntakeChange): void {
  for (const [key, column] of Object.entries(COLUMNS) as [keyof IntakeChange, string][]) {
    const value = change[key];
    if (value === undefined) continue;
    const stored =
      key === "touches"
        ? JSON.stringify(value)
        : key === "touchesFloor" || key === "changesWhat"
          ? value === null
            ? null
            : value
              ? 1
              : 0
          : (value as string | number | null);
    db.prepare(`UPDATE intake_items SET ${column} = ? WHERE id = ?`).run(stored, id);
  }
}

/** Minutes from an item arriving to the change it led to running; null until it runs. */
export function minutesToRunning(item: Pick<IntakeItem, "received" | "fixRunning">): number | null {
  if (!item.fixRunning) return null;
  const minutes = (Date.parse(item.fixRunning) - Date.parse(item.received)) / 60_000;
  return Math.max(0, Math.round(minutes * 10) / 10);
}

// ---- Readings ----------------------------------------------------------------------------------

export type ReadingTrigger = "count" | "time" | "operator";

/** What the operator did with one line of a short list. */
export interface LineDecision {
  choice: "work" | "keep" | "close";
  /** The operator's reason, when they gave one. */
  reason: string | null;
  at: string;
}

/** One line of a short list, with the items behind it. */
export interface ShortLine {
  text: string;
  /** The numbers of the items behind it; how many people are asking is its length. */
  items: number[];
  decision: LineDecision | null;
}

/** The short list a reading ends in. */
export interface ShortList {
  wanted: ShortLine[];
  recurring: ShortLine[];
  purpose: string;
  backToWhy: boolean;
  /** The items that say people do not want what the software does; the evidence for going back to Why. */
  notWanted: number[];
}

/** Short lists written before lines carried their items were plain text; read them as lines. */
function normaliseShortList(raw: unknown): ShortList {
  const list = raw as Partial<Record<keyof ShortList, unknown>>;
  const lines = (value: unknown): ShortLine[] =>
    (Array.isArray(value) ? value : []).map((v) =>
      typeof v === "string"
        ? { text: v, items: [], decision: null }
        : {
            text: String((v as ShortLine).text ?? ""),
            items: Array.isArray((v as ShortLine).items) ? (v as ShortLine).items : [],
            decision: (v as ShortLine).decision ?? null,
          },
    );
  return {
    wanted: lines(list.wanted),
    recurring: lines(list.recurring),
    purpose: String(list.purpose ?? ""),
    backToWhy: list.backToWhy === true,
    notWanted: Array.isArray(list.notWanted) ? (list.notWanted as number[]) : [],
  };
}

export interface Reading {
  id: number;
  softwareId: string;
  trigger: ReadingTrigger;
  /** The item numbers read. */
  items: number[];
  shortList: ShortList | null;
  status: "reading" | "done" | "failed";
  jobId: number | null;
  askId: number | null;
  created: string;
  finished: string | null;
}

interface ReadingRow {
  id: number;
  software_id: string;
  trigger: ReadingTrigger;
  items: string;
  short_list: string | null;
  status: Reading["status"];
  job_id: number | null;
  ask_id: number | null;
  created: string;
  finished: string | null;
}

function readingFromRow(row: ReadingRow): Reading {
  return {
    id: row.id,
    softwareId: row.software_id,
    trigger: row.trigger,
    items: JSON.parse(row.items) as number[],
    shortList: row.short_list ? normaliseShortList(JSON.parse(row.short_list)) : null,
    status: row.status,
    jobId: row.job_id,
    askId: row.ask_id,
    created: row.created,
    finished: row.finished,
  };
}

export function addReading(
  db: Database,
  input: { softwareId: string; trigger: ReadingTrigger; items: number[] },
): Reading {
  const row = db
    .prepare(
      "INSERT INTO readings (software_id, trigger, items, status, created) VALUES (?, ?, ?, 'reading', ?)",
    )
    .run(input.softwareId, input.trigger, JSON.stringify(input.items), now());
  return getReading(db, Number(row.lastInsertRowid))!;
}

export function getReading(db: Database, id: number): Reading | undefined {
  const row = db.prepare("SELECT * FROM readings WHERE id = ?").get(id) as ReadingRow | undefined;
  return row ? readingFromRow(row) : undefined;
}

export function listReadings(db: Database, softwareId: string): Reading[] {
  const rows = db
    .prepare("SELECT * FROM readings WHERE software_id = ? ORDER BY id DESC")
    .all(softwareId) as unknown as ReadingRow[];
  return rows.map(readingFromRow);
}

export function setReading(
  db: Database,
  id: number,
  change: {
    status?: Reading["status"];
    shortList?: ShortList;
    jobId?: number;
    askId?: number;
    finished?: string;
  },
): void {
  if (change.status)
    db.prepare("UPDATE readings SET status = ? WHERE id = ?").run(change.status, id);
  if (change.shortList)
    db.prepare("UPDATE readings SET short_list = ? WHERE id = ?").run(
      JSON.stringify(change.shortList),
      id,
    );
  if (change.jobId !== undefined)
    db.prepare("UPDATE readings SET job_id = ? WHERE id = ?").run(change.jobId, id);
  if (change.askId !== undefined)
    db.prepare("UPDATE readings SET ask_id = ? WHERE id = ?").run(change.askId, id);
  if (change.finished)
    db.prepare("UPDATE readings SET finished = ? WHERE id = ?").run(change.finished, id);
}
