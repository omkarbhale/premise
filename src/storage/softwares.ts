import { randomUUID } from "node:crypto";
import type { PremiseConfig } from "../config/settings.js";
import { type Database, now, recordEvent } from "./database.js";

export type SoftwareState =
  "active" | "paused-budget" | "paused-usage" | "waiting-milestone" | "ended";

export interface Software {
  id: string;
  name: string;
  priority: number;
  milestoneWaits: boolean;
  weeklySharePercent: number | null;
  state: SoftwareState;
  currentStage: string;
  created: string;
}

interface SoftwareRow {
  id: string;
  name: string;
  priority: number;
  milestone_waits: number;
  weekly_share_percent: number | null;
  state: SoftwareState;
  current_stage: string;
  created: string;
}

function fromRow(row: SoftwareRow): Software {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    milestoneWaits: row.milestone_waits === 1,
    weeklySharePercent: row.weekly_share_percent,
    state: row.state,
    currentStage: row.current_stage,
    created: row.created,
  };
}

export interface NewSoftware {
  name: string;
  priority?: number;
  milestoneWaits?: boolean;
  weeklySharePercent?: number | null;
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
  db.prepare(
    `INSERT INTO softwares (id, name, priority, milestone_waits, weekly_share_percent, created)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    priority,
    (input.milestoneWaits ?? defaults.default_milestone_waits) ? 1 : 0,
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
