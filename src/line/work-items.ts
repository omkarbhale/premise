import { STAGE_IDS, type StageId } from "../shared/stages.js";
import { type Database, now, recordEvent } from "../storage/database.js";

/**
 * Work items: what goes through the line (decisions 0181, 0184). A software is its root item. A
 * software's milestones become its child items when the plan is confirmed, and a piece of work the
 * sizer splits gets one child item per part. Each item goes through only the stages its sizing
 * picked, at its own size.
 *
 * One item of a software is worked on at a time (the line's active item); the software's row
 * mirrors the active item's stage, which the work queue and the page read.
 */

export type WorkItemKind = "software" | "milestone" | "module" | "intake";

/**
 * How an item came to be: the software started, a split by the sizer, a plan's milestone, a fix the
 * whole-piece check asked for, an intake item, or a change of purpose the operator confirmed. An
 * existing software taken on is "existing"; the parts its record is recovered in are "recover".
 *
 * For intake: "bug" (something the record requires, not working),
 * "change" (changes what the software must do), "intake" (other new work), "purpose" (a change of
 * what the software is for, which the operator confirmed).
 */
export type WorkItemOrigin =
  "start" | "split" | "plan" | "fix" | "intake" | "purpose" | "existing" | "recover" | "bug" | "change";

/** Who decided a part of an item's sizing. */
export type SizedBy = "sizer" | "operator" | "default";

/** What was decided about an item's size, stages and split, each with its reason. */
export interface Sizing {
  size: { by: SizedBy; reason: string };
  stages: { by: SizedBy; reason: string };
  split: { decision: "split" | "whole"; by: SizedBy; reason: string };
}

/** A part the sizer split a piece into. */
export interface SplitPart {
  title: string;
  words: string;
}

/** What the sizer submitted, kept until its job ends and the line applies it. */
export interface SizingProposal {
  size: string;
  sizeReason: string;
  stages: StageId[];
  stagesReason: string;
  split: SplitPart[];
  splitReason: string;
  /** Notes premise added while checking it, such as a stage it had to add. */
  notes: string[];
}

export interface WorkItem {
  id: number;
  softwareId: string;
  parentId: number | null;
  kind: WorkItemKind;
  origin: WorkItemOrigin;
  /** The part's name; null for a software, whose name is the software's. */
  title: string | null;
  /** What this piece of work is, in words its agents are given. */
  words: string | null;
  /** The record item it stands for, such as M-2 for a milestone. */
  ref: string | null;
  /** Order among its siblings. */
  position: number;
  sizeClass: string;
  currentStage: string;
  /** sizing, active, waiting (on its parts), done, withdrawn; a software's own states too. */
  state: string;
  /** The stages this item goes through, in order; it skips the others. */
  stages: StageId[];
  sizing: Sizing | null;
  proposal: SizingProposal | null;
  created: string;
  sized: string | null;
  buildStarted: string | null;
  finished: string | null;
}

interface Row {
  id: number;
  software_id: string;
  parent_id: number | null;
  kind: WorkItemKind;
  origin: WorkItemOrigin;
  title: string | null;
  words: string | null;
  ref: string | null;
  position: number;
  size_class: string;
  current_stage: string;
  state: string;
  stages: string;
  sizing: string | null;
  proposal: string | null;
  created: string;
  sized: string | null;
  build_started: string | null;
  finished: string | null;
}

function fromRow(row: Row): WorkItem {
  return {
    id: row.id,
    softwareId: row.software_id,
    parentId: row.parent_id,
    kind: row.kind,
    origin: row.origin,
    title: row.title,
    words: row.words,
    ref: row.ref,
    position: row.position,
    sizeClass: row.size_class,
    currentStage: row.current_stage,
    state: row.state,
    stages: JSON.parse(row.stages) as StageId[],
    sizing: row.sizing ? (JSON.parse(row.sizing) as Sizing) : null,
    proposal: row.proposal ? (JSON.parse(row.proposal) as SizingProposal) : null,
    created: row.created,
    sized: row.sized,
    buildStarted: row.build_started,
    finished: row.finished,
  };
}

export function createWorkItem(
  db: Database,
  input: {
    softwareId: string;
    parentId?: number | null;
    kind: WorkItemKind;
    origin?: WorkItemOrigin;
    title?: string | null;
    words?: string | null;
    ref?: string | null;
    position?: number;
    sizeClass?: string;
    stages?: readonly StageId[];
    state?: string;
  },
): WorkItem {
  const stages = input.stages ?? STAGE_IDS;
  const row = db
    .prepare(
      `INSERT INTO work_items (software_id, parent_id, kind, origin, title, words, ref, position,
         size_class, current_stage, state, stages, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.softwareId,
      input.parentId ?? null,
      input.kind,
      input.origin ?? "start",
      input.title ?? null,
      input.words ?? null,
      input.ref ?? null,
      input.position ?? 0,
      input.sizeClass ?? "small",
      stages[0] ?? "why",
      input.state ?? "active",
      JSON.stringify(stages),
      now(),
    );
  const id = Number(row.lastInsertRowid);
  recordEvent(db, {
    softwareId: input.softwareId,
    module: "line",
    kind: "work-item-added",
    reference: String(id),
    detail: {
      kind: input.kind,
      origin: input.origin ?? "start",
      parent: input.parentId ?? null,
      ...(input.title && { title: input.title }),
    },
  });
  return getWorkItem(db, id)!;
}

export function getWorkItem(db: Database, id: number): WorkItem | undefined {
  const row = db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as Row | undefined;
  return row ? fromRow(row) : undefined;
}

/** Every item of a software, parents before their children, siblings in order. */
export function listWorkItems(db: Database, softwareId: string): WorkItem[] {
  const rows = db
    .prepare("SELECT * FROM work_items WHERE software_id = ? ORDER BY id")
    .all(softwareId) as unknown as Row[];
  const items = rows.map(fromRow);
  const ordered: WorkItem[] = [];
  const visit = (parent: number | null) => {
    for (const item of items
      .filter((i) => i.parentId === parent)
      .sort((a, b) => a.position - b.position || a.id - b.id)) {
      ordered.push(item);
      visit(item.id);
    }
  };
  visit(null);
  return ordered;
}

/** An item's children, in order. */
export function childItems(db: Database, parentId: number): WorkItem[] {
  const rows = db
    .prepare("SELECT * FROM work_items WHERE parent_id = ? ORDER BY position, id")
    .all(parentId) as unknown as Row[];
  return rows.map(fromRow);
}

/** The item, its parent, and so on up to the software's root. */
export function ancestry(db: Database, item: WorkItem): WorkItem[] {
  const chain = [item];
  let at = item;
  while (at.parentId !== null) {
    const parent = getWorkItem(db, at.parentId);
    if (!parent) break;
    chain.push(parent);
    at = parent;
  }
  return chain;
}

/** A software's root item: the software itself going through the line. Made when missing. */
export function rootItem(db: Database, softwareId: string): WorkItem {
  const row = db
    .prepare(
      "SELECT * FROM work_items WHERE software_id = ? AND parent_id IS NULL ORDER BY id LIMIT 1",
    )
    .get(softwareId) as Row | undefined;
  return row ? fromRow(row) : createWorkItem(db, { softwareId, kind: "software" });
}

export function setWorkItem(
  db: Database,
  id: number,
  change: {
    currentStage?: string;
    state?: string;
    sizeClass?: string;
    stages?: readonly StageId[];
    sizing?: Sizing;
    proposal?: SizingProposal | null;
    sized?: string;
    buildStarted?: string;
    finished?: string | null;
  },
): void {
  const columns: [string, unknown][] = [
    ["current_stage", change.currentStage],
    ["state", change.state],
    ["size_class", change.sizeClass],
    ["stages", change.stages && JSON.stringify(change.stages)],
    ["sizing", change.sizing && JSON.stringify(change.sizing)],
    [
      "proposal",
      change.proposal === undefined
        ? undefined
        : change.proposal === null
          ? null
          : JSON.stringify(change.proposal),
    ],
    ["sized", change.sized],
    ["build_started", change.buildStarted],
    ["finished", change.finished],
  ];
  for (const [column, value] of columns) {
    if (value === undefined) continue;
    db.prepare(`UPDATE work_items SET ${column} = ? WHERE id = ?`).run(value as string | null, id);
  }
}

export function itemState<T>(db: Database, id: number): T {
  const row = db.prepare("SELECT line_state FROM work_items WHERE id = ?").get(id) as
    { line_state: string } | undefined;
  return (row ? JSON.parse(row.line_state) : {}) as T;
}

export function setItemState(db: Database, id: number, state: object): void {
  db.prepare("UPDATE work_items SET line_state = ? WHERE id = ?").run(JSON.stringify(state), id);
}

/** The stage after `from` that this item goes through, or undefined at the end of its line. */
export function nextStage(item: Pick<WorkItem, "stages">, from: StageId): StageId | undefined {
  const order = STAGE_IDS.indexOf(from);
  return item.stages.find((s) => STAGE_IDS.indexOf(s) > order);
}

/** Minutes from an item's creation to its first build, or null while it has not reached Build. */
export function minutesBeforeBuild(
  item: Pick<WorkItem, "created" | "buildStarted">,
): number | null {
  if (!item.buildStarted) return null;
  const minutes = (Date.parse(item.buildStarted) - Date.parse(item.created)) / 60_000;
  return Math.max(0, Math.round(minutes * 10) / 10);
}
