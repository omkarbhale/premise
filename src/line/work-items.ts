import { STAGE_IDS, type StageId } from "../shared/stages.js";
import { type Database, now, recordEvent } from "../storage/database.js";

/**
 * Work items: what goes through the line (decision 0181). Today only a software's root item
 * exists, holding every stage. The table already allows a software's milestones, modules and intake
 * items to go through the line at their own size, as children of another item, with only the
 * stages they need; the line engine does not make such items yet.
 *
 * The root item's stage, state and size are mirrored on the software's row, which the work queue
 * and the page read.
 */

export type WorkItemKind = "software" | "milestone" | "module" | "intake";

export interface WorkItem {
  id: number;
  softwareId: string;
  parentId: number | null;
  kind: WorkItemKind;
  sizeClass: string;
  currentStage: string;
  state: string;
  /** The stages this item goes through, in order; it skips the others. */
  stages: StageId[];
  created: string;
}

interface Row {
  id: number;
  software_id: string;
  parent_id: number | null;
  kind: WorkItemKind;
  size_class: string;
  current_stage: string;
  state: string;
  stages: string;
  created: string;
}

function fromRow(row: Row): WorkItem {
  return {
    id: row.id,
    softwareId: row.software_id,
    parentId: row.parent_id,
    kind: row.kind,
    sizeClass: row.size_class,
    currentStage: row.current_stage,
    state: row.state,
    stages: JSON.parse(row.stages) as StageId[],
    created: row.created,
  };
}

export function createWorkItem(
  db: Database,
  input: {
    softwareId: string;
    parentId?: number | null;
    kind: WorkItemKind;
    sizeClass?: string;
    stages?: readonly StageId[];
  },
): WorkItem {
  const stages = input.stages ?? STAGE_IDS;
  const row = db
    .prepare(
      `INSERT INTO work_items (software_id, parent_id, kind, size_class, current_stage, stages, created)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.softwareId,
      input.parentId ?? null,
      input.kind,
      input.sizeClass ?? "small",
      stages[0] ?? "why",
      JSON.stringify(stages),
      now(),
    );
  const id = Number(row.lastInsertRowid);
  recordEvent(db, {
    softwareId: input.softwareId,
    module: "line",
    kind: "work-item-added",
    reference: String(id),
    detail: { kind: input.kind },
  });
  return getWorkItem(db, id)!;
}

export function getWorkItem(db: Database, id: number): WorkItem | undefined {
  const row = db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as Row | undefined;
  return row ? fromRow(row) : undefined;
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
  change: { currentStage?: string; state?: string; sizeClass?: string },
): void {
  if (change.currentStage !== undefined) {
    db.prepare("UPDATE work_items SET current_stage = ? WHERE id = ?").run(change.currentStage, id);
  }
  if (change.state !== undefined) {
    db.prepare("UPDATE work_items SET state = ? WHERE id = ?").run(change.state, id);
  }
  if (change.sizeClass !== undefined) {
    db.prepare("UPDATE work_items SET size_class = ? WHERE id = ?").run(change.sizeClass, id);
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
export function nextStage(item: WorkItem, from: StageId): StageId | undefined {
  const order = STAGE_IDS.indexOf(from);
  return item.stages.find((s) => STAGE_IDS.indexOf(s) > order);
}
