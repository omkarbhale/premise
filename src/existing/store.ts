import { type Database, now, recordEvent } from "../storage/database.js";

/**
 * What premise keeps about a software it took on from an existing repository (decision 0189):
 * where it came from, how far taking it on has got, how to build, start and check it as recovered,
 * and whether its record has been added to the operator's repository through the gate.
 */

export type SourceKind = "folder" | "address";

export type TakeOnStatus = "copying" | "copy-failed" | "recovering" | "taken-on" | "stopped";

/** The record in the operator's own repository: not asked yet, asked, added, refused or failed. */
export type RecordStatus = "not-yet" | "asked" | "added" | "refused" | "failed";

/** How to build, start and check the software, as the drafter recovered it. */
export interface RecoveredRun {
  build?: string;
  start?: string;
  check?: string;
  /** The machine-readable block the runner reads, when the drafter could write one. */
  premiseRun?: string;
}

export interface ExistingSoftware {
  softwareId: string;
  /** The folder path or clone address, as the operator gave it. */
  source: string;
  sourceKind: SourceKind;
  status: TakeOnStatus;
  problem: string | null;
  /** The branch premise copied, and the commit it was at. */
  sourceBranch: string | null;
  baseCommit: string | null;
  /** Commits in the copied history. */
  commits: number;
  run: RecoveredRun;
  /** What premise would need to build, start or check it, in plain words. */
  couldNotCheck: string[];
  recordStatus: RecordStatus;
  recordRequest: number | null;
  recordNote: string | null;
  created: string;
}

interface Row {
  software_id: string;
  source: string;
  source_kind: SourceKind;
  status: TakeOnStatus;
  problem: string | null;
  source_branch: string | null;
  base_commit: string | null;
  commits: number;
  run: string;
  could_not_check: string;
  record_status: RecordStatus;
  record_request: number | null;
  record_note: string | null;
  created: string;
}

function fromRow(row: Row): ExistingSoftware {
  return {
    softwareId: row.software_id,
    source: row.source,
    sourceKind: row.source_kind,
    status: row.status,
    problem: row.problem,
    sourceBranch: row.source_branch,
    baseCommit: row.base_commit,
    commits: row.commits,
    run: JSON.parse(row.run) as RecoveredRun,
    couldNotCheck: JSON.parse(row.could_not_check) as string[],
    recordStatus: row.record_status,
    recordRequest: row.record_request,
    recordNote: row.record_note,
    created: row.created,
  };
}

export function addExisting(
  db: Database,
  input: { softwareId: string; source: string; sourceKind: SourceKind },
): ExistingSoftware {
  db.prepare(
    `INSERT INTO existing_softwares (software_id, source, source_kind, status, created)
     VALUES (?, ?, ?, 'copying', ?)`,
  ).run(input.softwareId, input.source, input.sourceKind, now());
  recordEvent(db, {
    softwareId: input.softwareId,
    module: "existing",
    kind: "take-on-started",
    detail: { sourceKind: input.sourceKind },
  });
  return getExisting(db, input.softwareId)!;
}

export function getExisting(db: Database, softwareId: string): ExistingSoftware | undefined {
  const row = db
    .prepare("SELECT * FROM existing_softwares WHERE software_id = ?")
    .get(softwareId) as Row | undefined;
  return row ? fromRow(row) : undefined;
}

export function listExisting(db: Database, status?: TakeOnStatus): ExistingSoftware[] {
  const rows = (status
    ? db.prepare("SELECT * FROM existing_softwares WHERE status = ?").all(status)
    : db.prepare("SELECT * FROM existing_softwares").all()) as unknown as Row[];
  return rows.map(fromRow);
}

export interface ExistingChange {
  status?: TakeOnStatus;
  problem?: string | null;
  sourceBranch?: string | null;
  baseCommit?: string | null;
  commits?: number;
  run?: RecoveredRun;
  couldNotCheck?: string[];
  recordStatus?: RecordStatus;
  recordRequest?: number | null;
  recordNote?: string | null;
}

const COLUMNS: Record<keyof ExistingChange, string> = {
  status: "status",
  problem: "problem",
  sourceBranch: "source_branch",
  baseCommit: "base_commit",
  commits: "commits",
  run: "run",
  couldNotCheck: "could_not_check",
  recordStatus: "record_status",
  recordRequest: "record_request",
  recordNote: "record_note",
};

export function setExisting(db: Database, softwareId: string, change: ExistingChange): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(COLUMNS) as [keyof ExistingChange, string][]) {
    if (!(key in change)) continue;
    const value = change[key];
    sets.push(`${column} = ?`);
    values.push(
      value === undefined
        ? null
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : (value as string | number | null),
    );
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE existing_softwares SET ${sets.join(", ")} WHERE software_id = ?`).run(
    ...values,
    softwareId,
  );
  if (change.status || change.recordStatus) {
    recordEvent(db, {
      softwareId,
      module: "existing",
      kind: change.status ? `take-on-${change.status}` : `record-${change.recordStatus}`,
    });
  }
}
