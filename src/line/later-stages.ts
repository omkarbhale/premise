import type { AgentOutcome } from "../agents/agent-runner.js";
import type { EnqueueInput, Job } from "../queue/work-queue.js";
import type { AskAnswer, BuildView } from "../shared/api-types.js";
import type { Ask } from "../storage/asks.js";

/**
 * The hand-off between the line engine and the stages after Plan: Build, Check, Run and Report
 * (docs/specs/line-engine.md 5.3, rows 7 to 10). Intake has its own hand-off (intake-hooks.ts). The line engine owns the order of the
 * stages and the milestones; a LaterStages implementation owns what happens inside each.
 *
 * Build, Check and Run are done by src/build (docs/architecture/build-check-run.md); each
 * milestone's report is written by the reporter; Intake is done by src/intake.
 */

export type LaterStageId = "build" | "check" | "run" | "report";

export interface MilestoneRef {
  id: string;
  text: string;
}

/** What a later stage's job ending, or an answer, means for the line. */
export type LaterOutcome =
  /** The stage is done; the line goes to the next stage. */
  | { kind: "next" }
  /** Back to Build with this evidence (a must item not met; docs/specs/line-engine.md 5.7). */
  | { kind: "back-to-build"; evidence: string }
  /** Nothing to do yet: more jobs of the stage are running, or a person is asked. */
  | { kind: "wait" };

/** A later stage being entered for one milestone. */
export interface LaterEntry {
  softwareId: string;
  stage: LaterStageId;
  milestone: MilestoneRef | null;
  /** The stage run the jobs belong to (stage_runs.id). */
  run: number;
  /** Why the stage is entered, in a few words ("check not passed", "plan confirmed"). */
  why: string;
}

export interface LaterStages {
  /** True while these stages are a stand-in; the page says so. */
  readonly standIn: boolean;
  /**
   * The jobs that open a stage for one milestone; the line engine queues them. An empty list means
   * the stage is done at once. Null means the stage is under way already (the implementation
   * queued its own jobs, or asked a person), and ends through finished() or answered().
   */
  jobs(entry: LaterEntry): EnqueueInput[] | null;
  /** A job of the stage ended, whatever its status. */
  finished(job: Job): LaterOutcome;
  /** The server's own part of Run (job kind "run"). */
  runServerJob(job: Job): Promise<AgentOutcome>;
  /** The report written at the end of a milestone, as plain lines for the session. */
  reportLines(softwareId: string, milestone: MilestoneRef | null): string[];
  /**
   * An ask was answered that belongs to these stages: one they made, or an agent's question from
   * one of their jobs. Null when the ask is not theirs.
   */
  answered?(ask: Ask, answer: AskAnswer): LaterOutcome | null;
  /** What the page shows under Build and Running. */
  view?(softwareId: string): BuildView | null;
  /** The software was sent back before these stages: forget the work in progress. */
  reset?(softwareId: string): void;
  /**
   * A claim on an area was released: work that waited on its proposal goes on. Null when nothing
   * of these stages waited on it.
   */
  claimReleased?(softwareId: string, claimId: number): LaterOutcome | null;
  /** An agent of these stages proposed a record change the record keeper accepted for review. */
  proposed?(softwareId: string, changeId: number): void;
}
