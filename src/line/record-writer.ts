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

let counter = 0;

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

  private accept(changeId: number, copy: string, serves?: string[]): string {
    const reviewed = this.keeper.applyReview(changeId, { verdict: "consistent" });
    if (reviewed.status === "at-say-back") this.keeper.applySayBack(changeId, true);
    return this.keeper.write(changeId, { workingCopy: copy, ...(serves && { serves }) });
  }
}
