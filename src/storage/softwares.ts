import { randomUUID } from "node:crypto";
import type { PremiseConfig } from "../config/settings.js";
import { SOFTWARE_EFFORTS, type SoftwareEffort } from "../shared/stages.js";
import { type Database, now, recordEvent } from "./database.js";

export type SoftwareState =
  "active" | "paused-budget" | "paused-usage" | "waiting-milestone" | "ended";

export interface Software {
  id: string;
  name: string;
  priority: number;
  milestoneWaits: boolean;
  /** How much effort the operator wants put into it (decision 0191). */
  effort: SoftwareEffort;
  weeklySharePercent: number | null;
  state: SoftwareState;
  currentStage: string;
  sizeClass: string;
  /** The first words the operator said about it. */
  idea: string;
  created: string;
  /** When the operator paused it, and why; null while it is not paused by the operator. */
  pausedAt: string | null;
  pausedWhy: string | null;
  /** When it was archived: kept, hidden from the main list, restorable. */
  archivedAt: string | null;
}

interface SoftwareRow {
  id: string;
  name: string;
  priority: number;
  milestone_waits: number;
  effort: string;
  weekly_share_percent: number | null;
  state: SoftwareState;
  current_stage: string;
  size_class: string;
  idea: string;
  created: string;
  paused_at: string | null;
  paused_why: string | null;
  archived_at: string | null;
}

function fromRow(row: SoftwareRow): Software {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    milestoneWaits: row.milestone_waits === 1,
    effort: isEffort(row.effort) ? row.effort : "medium",
    weeklySharePercent: row.weekly_share_percent,
    state: row.state,
    currentStage: row.current_stage,
    sizeClass: row.size_class,
    idea: row.idea,
    created: row.created,
    pausedAt: row.paused_at,
    pausedWhy: row.paused_why,
    archivedAt: row.archived_at,
  };
}

export interface NewSoftware {
  name: string;
  idea?: string;
  priority?: number;
  milestoneWaits?: boolean;
  effort?: SoftwareEffort;
  weeklySharePercent?: number | null;
}

export function isEffort(value: unknown): value is SoftwareEffort {
  return (SOFTWARE_EFFORTS as readonly unknown[]).includes(value);
}

/** Add a software, with the configured defaults for what is not given. */
export function createSoftware(
  db: Database,
  input: NewSoftware,
  defaults: PremiseConfig["softwares"],
): Software {
  const id = randomUUID();
  const priority = input.priority ?? defaults.default_priority;
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    throw new Error(`A software's priority must be a whole number from 1 to 5; it is ${priority}.`);
  }
  const effort = input.effort ?? defaults.default_effort;
  if (!isEffort(effort)) {
    throw new Error(`A software's effort is low, medium or high; it is ${String(effort)}.`);
  }
  db.prepare(
    `INSERT INTO softwares (id, name, idea, priority, milestone_waits, effort, weekly_share_percent, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.idea ?? "",
    priority,
    (input.milestoneWaits ?? defaults.default_milestone_waits) ? 1 : 0,
    effort,
    input.weeklySharePercent === undefined
      ? defaults.default_weekly_share_percent
      : input.weeklySharePercent,
    now(),
  );
  recordEvent(db, { softwareId: id, module: "softwares", kind: "software-added", reference: id });
  return getSoftware(db, id)!;
}

export function getSoftware(db: Database, id: string): Software | undefined {
  const row = db.prepare("SELECT * FROM softwares WHERE id = ?").get(id) as SoftwareRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function listSoftwares(db: Database): Software[] {
  return (
    db
      .prepare("SELECT * FROM softwares ORDER BY priority, created")
      .all() as unknown as SoftwareRow[]
  ).map(fromRow);
}

export function setSoftwareState(
  db: Database,
  id: string,
  state: SoftwareState,
  why: string,
): void {
  db.prepare("UPDATE softwares SET state = ? WHERE id = ?").run(state, id);
  recordEvent(db, { softwareId: id, module: "softwares", kind: `state-${state}`, detail: { why } });
}

export function setSoftwarePriority(db: Database, id: string, priority: number): void {
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    throw new Error(`A software's priority must be a whole number from 1 to 5; it is ${priority}.`);
  }
  db.prepare("UPDATE softwares SET priority = ? WHERE id = ?").run(priority, id);
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: "priority-changed",
    detail: { priority },
  });
}

export function setSoftwareEffort(db: Database, id: string, effort: SoftwareEffort): void {
  if (!isEffort(effort)) {
    throw new Error(`A software's effort is low, medium or high; it is ${String(effort)}.`);
  }
  db.prepare("UPDATE softwares SET effort = ? WHERE id = ?").run(effort, id);
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: "effort-changed",
    detail: { effort },
  });
}

export function setSoftwareStage(db: Database, id: string, stage: string, why: string): void {
  db.prepare("UPDATE softwares SET current_stage = ? WHERE id = ?").run(stage, id);
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: "stage-entered",
    detail: { stage, why },
  });
}

export function setSoftwareSizeClass(db: Database, id: string, sizeClass: string): void {
  db.prepare("UPDATE softwares SET size_class = ? WHERE id = ?").run(sizeClass, id);
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: "size-changed",
    detail: { sizeClass },
  });
}

/** Remember where a software's repository lives besides this machine. */
export function setSoftwareRepository(db: Database, id: string, repository: string): void {
  db.prepare("UPDATE softwares SET repository = ? WHERE id = ?").run(repository, id);
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: "repository-set",
    detail: { repository },
  });
}

/**
 * The operator pauses a software, or resumes it (null). A paused software starts no agent job; its
 * asks stay answerable.
 */
export function setSoftwarePaused(db: Database, id: string, why: string | null): void {
  db.prepare("UPDATE softwares SET paused_at = ?, paused_why = ? WHERE id = ?").run(
    why === null ? null : now(),
    why,
    id,
  );
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: why === null ? "software-resumed" : "software-paused",
    ...(why !== null && { detail: { why } }),
  });
}

/** Archive a software (kept, hidden from the main list), or restore it (false). Never deletes. */
export function setSoftwareArchived(db: Database, id: string, archived: boolean): void {
  db.prepare("UPDATE softwares SET archived_at = ? WHERE id = ?").run(archived ? now() : null, id);
  recordEvent(db, {
    softwareId: id,
    module: "softwares",
    kind: archived ? "software-archived" : "software-restored",
  });
}
