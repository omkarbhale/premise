import { rmSync } from "node:fs";
import type { Operation, Proposer } from "../record/change.js";
import type { Diagnostic } from "../record/diagnostics.js";
import { type RecordKeeper } from "../record/record-keeper.js";

/**
 * How the line engine puts what people decided into the record: always through the record keeper
 * (docs/specs/record-keeper.md). A stage draft the operator confirmed is the operator's decision on
 * purpose, users and priorities (decision 0084), so the line engine gives it the review verdict
 * "consistent" itself, and passes it at the say-back where it replaces something (decision 0183).
 * Each change is written in a working copy of its own and merged with its trace trailer.
 */

export type LandResult =
  | { ok: true; changeId: number; assigned: (string | undefined)[]; sha: string }
  | { ok: false; diagnostics: Diagnostic[] };

export interface LandAllResult {
  landed: number;
  dropped: { changeId: number; what: string; why: string }[];
}

let counter = 0;

/** What a change was about, in a few words per item: "a decision: Keep tasks in a file…". */
export function describeOperations(operations: readonly Operation[]): string {
  return operations
    .map((o) =>
      o.op === "add" || o.op === "replace"
        ? `"${o.text.trim().split(/\s+/).slice(0, 8).join(" ")}${o.text.trim().split(/\s+/).length > 8 ? "…" : ""}"`
        : `${o.op} ${o.id}`,
    )
    .join(", ");
}

/**
 * One line for the changes that did not go in, or nothing when all did. It says what was left out
 * and why; nobody is asked to do anything, because the record keeper has already tried again
 * against the record as it stands.
 */
export function droppedLine(dropped: LandAllResult["dropped"], who: string): string | null {
  if (dropped.length === 0) return null;
  const n = dropped.length;
  const items = dropped.map((d) => d.what).join("; ");
  const why = [...new Set(dropped.map((d) => d.why))].join(" ");
  return `${n === 1 ? `One record change ${who} proposed` : `${n} record changes ${who} proposed`} did not fit the record as it stands now, even when tried again, so ${n === 1 ? "it is" : "they are"} not in it: ${items}. Why: ${why}`;
}

export class RecordWriter {
  constructor(private readonly keeper: RecordKeeper) {}

  /** Propose, accept, write and merge one change. Nothing is written when it is refused. */
  land(
    softwareId: string,
    operations: readonly Operation[],
    reason: string,
    options: { proposer?: Proposer; proposedBy?: string; serves?: string[] } = {},
  ): LandResult {
    if (operations.length === 0) return { ok: true, changeId: 0, assigned: [], sha: "" };
    const key = `line-${Date.now().toString(36)}-${(counter++).toString(36)}`;
    const branch = `record/${key}`;
    const copy = this.keeper.createWorkingCopy(softwareId, key, branch);
    try {
      const proposed = this.keeper.propose(softwareId, operations, reason, {
        workingCopy: copy,
        ...(options.proposer && { proposer: options.proposer }),
        proposedBy: options.proposedBy ?? "line engine",
      });
      if (proposed.status === "rejected") return { ok: false, diagnostics: proposed.diagnostics };
      const sha = this.accept(proposed.changeId, copy, options.serves);
      this.keeper.mergeJob(softwareId, copy, branch);
      return { ok: true, changeId: proposed.changeId, assigned: proposed.assigned, sha };
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }

  /** Accept an agent's proposed change that is still being reviewed, and write it. */
  landProposed(softwareId: string, changeId: number): LandResult {
    const key = `line-${Date.now().toString(36)}-${(counter++).toString(36)}`;
    const branch = `record/${key}`;
    const copy = this.keeper.createWorkingCopy(softwareId, key, branch);
    try {
      const sha = this.accept(changeId, copy);
      this.keeper.mergeJob(softwareId, copy, branch);
      return { ok: true, changeId, assigned: [], sha };
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{ code: "MALFORMED", message: (error as Error).message }],
      };
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }

  /**
   * Land every proposed change of a round, each against the record as it stands (the record
   * keeper applies a change again when an earlier one moved a file it touches). What still does
   * not fit is gathered, so it is said once, in one line, rather than once per change.
   */
  landAllProposed(softwareId: string, changeIds: readonly number[]): LandAllResult {
    const dropped: LandAllResult["dropped"] = [];
    let landed = 0;
    for (const changeId of changeIds) {
      const result = this.landProposed(softwareId, changeId);
      if (result.ok) {
        landed++;
        continue;
      }
      let what = `change ${changeId}`;
      try {
        what = describeOperations(this.keeper.change(changeId).operations);
      } catch {
        // The change is gone; its number is all there is to say.
      }
      dropped.push({ changeId, what, why: result.diagnostics.map((d) => d.message).join(" ") });
    }
    return { landed, dropped };
  }

  private accept(changeId: number, copy: string, serves?: string[]): string {
    const reviewed = this.keeper.applyReview(changeId, { verdict: "consistent" });
    if (reviewed.status === "at-say-back") this.keeper.applySayBack(changeId, true);
    return this.keeper.write(changeId, { workingCopy: copy, ...(serves && { serves }) });
  }
}
