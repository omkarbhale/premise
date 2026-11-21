import type { AskAnswer, AskItem, AskKind } from "../shared/api-types.js";
import { type Database, now, recordEvent } from "./database.js";

/**
 * The `asks` table (docs/specs/storage.md 4.2): everything asked in the session, each labelled with
 * the role it is for. The line engine and the gate write asks; the page answers them.
 */

export type AskStatus = "open" | "answered" | "withdrawn";

/** Kind-specific parts of an ask that have no column of their own. */
export interface AskExtra {
  bestAttempt?: string;
  choices?: string[];
  approval?: { action: string; why: string; floor: string };
  /** Free use by whoever made the ask, for example the stand-in line's bookkeeping. */
  meta?: Record<string, unknown>;
}

export interface Ask {
  id: number;
  softwareId: string;
  role: string;
  kind: AskKind;
  stage: string | null;
  title: string;
  instruction: string;
  items: AskItem[];
  extra: AskExtra;
  waitingJob: number | null;
  status: AskStatus;
  answer: AskAnswer | null;
  answerSummary: string | null;
  asked: string;
  answered: string | null;
}

interface AskRow {
  id: number;
  software_id: string;
  role: string;
  kind: AskKind;
  stage: string | null;
  title: string;
  instruction: string;
  items: string;
  extra: string;
  waiting_job: number | null;
  status: AskStatus;
  answer: string | null;
  answer_summary: string | null;
  asked: string;
  answered: string | null;
}

function fromRow(row: AskRow): Ask {
  return {
    id: row.id,
    softwareId: row.software_id,
    role: row.role,
    kind: row.kind,
    stage: row.stage,
    title: row.title,
    instruction: row.instruction,
    items: JSON.parse(row.items) as AskItem[],
    extra: JSON.parse(row.extra) as AskExtra,
    waitingJob: row.waiting_job,
    status: row.status,
    answer: row.answer === null ? null : (JSON.parse(row.answer) as AskAnswer),
    answerSummary: row.answer_summary,
    asked: row.asked,
    answered: row.answered,
  };
}

export interface NewAsk {
  softwareId: string;
  role: string;
  kind: AskKind;
  stage?: string | null;
  title: string;
  instruction: string;
  items?: AskItem[];
  extra?: AskExtra;
  waitingJob?: number | null;
}

export function createAsk(db: Database, input: NewAsk): Ask {
  const result = db
    .prepare(
      `INSERT INTO asks (software_id, role, kind, stage, title, instruction, items, extra, waiting_job, asked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.softwareId,
      input.role,
      input.kind,
      input.stage ?? null,
      input.title,
      input.instruction,
      JSON.stringify(input.items ?? []),
      JSON.stringify(input.extra ?? {}),
      input.waitingJob ?? null,
      now(),
    );
  const id = Number(result.lastInsertRowid);
  recordEvent(db, {
    softwareId: input.softwareId,
    module: "asks",
    kind: "ask-opened",
    reference: String(id),
    detail: { kind: input.kind, role: input.role },
  });
  return getAsk(db, id)!;
}

export function getAsk(db: Database, id: number): Ask | undefined {
  const row = db.prepare("SELECT * FROM asks WHERE id = ?").get(id) as AskRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function listAsks(
  db: Database,
  filter: { softwareId?: string; status?: AskStatus } = {},
): Ask[] {
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
  const sql = `SELECT * FROM asks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
  return (db.prepare(sql).all(...args) as unknown as AskRow[]).map(fromRow);
}

/** Close an open ask with its answer. Returns false when it was not open (already answered). */
export function closeAsk(
  db: Database,
  id: number,
  status: Exclude<AskStatus, "open">,
  answer: AskAnswer | null,
  summary: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE asks SET status = ?, answer = ?, answer_summary = ?, answered = ?
       WHERE id = ? AND status = 'open'`,
    )
    .run(status, answer === null ? null : JSON.stringify(answer), summary, now(), id);
  if (Number(result.changes) === 0) return false;
  const ask = getAsk(db, id)!;
  recordEvent(db, {
    softwareId: ask.softwareId,
    module: "asks",
    kind: status === "answered" ? "ask-answered" : "ask-withdrawn",
    reference: String(id),
  });
  return true;
}

/** Replace an open ask's items, for example when a chat message corrects an open draft. */
export function setAskItems(db: Database, id: number, items: AskItem[]): void {
  db.prepare("UPDATE asks SET items = ? WHERE id = ? AND status = 'open'").run(
    JSON.stringify(items),
    id,
  );
  const ask = getAsk(db, id);
  if (ask) {
    recordEvent(db, {
      softwareId: ask.softwareId,
      module: "asks",
      kind: "ask-changed",
      reference: String(id),
    });
  }
}
