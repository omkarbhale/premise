import type { AgentOutcome } from "../agents/agent-runner.js";
import type { EnqueueInput, Job } from "../queue/work-queue.js";

/**
 * The hand-off between the line engine and the stages built next: Build, Check, Run, Report and
 * Intake (docs/specs/line-engine.md 5.3, rows 7 to 11). The line engine owns the order of the
 * stages and the milestones; a LaterStages implementation owns what happens inside each.
 *
 * Until those stages exist, {@link StandInLaterStages} completes them with scripted jobs that build,
 * check and start nothing. Everything it does is labelled as a stand-in on the page.
 */

export type LaterStageId = "build" | "check" | "run" | "report";

export interface MilestoneRef {
  id: string;
  text: string;
}

/** What a later stage's job ending means for the line. */
export type LaterOutcome =
  /** The stage is done; the line goes to the next stage. */
  | { kind: "next" }
  /** Back to Build with this evidence (a must item not met; docs/specs/line-engine.md 5.7). */
  | { kind: "back-to-build"; evidence: string }
  /** Nothing to do yet: more jobs of the stage are still running. */
  | { kind: "wait" };

export interface LaterStages {
  /** True while these stages are a stand-in; the page says so. */
  readonly standIn: boolean;
  /** The jobs that open a stage for one milestone. None means the stage is done at once. */
  jobs(softwareId: string, stage: LaterStageId, milestone: MilestoneRef | null): EnqueueInput[];
  /** A job of the stage ended done. */
  finished(job: Job): LaterOutcome;
  /** The server's own part of Run (job kind "run"). */
  runServerJob(job: Job): Promise<AgentOutcome>;
  /** The report written at the end of a milestone, as plain lines for the session. */
  reportLines(softwareId: string, milestone: MilestoneRef | null): string[];
  /** A chat message at Intake, or when no draft is open. Returns premise's one-line answer. */
  takeIn(softwareId: string, text: string, intakeNumber: number, atIntake: boolean): string;
}

/** Scripted Build, Check, Run, Report and Intake: they do nothing, and say so. */
export class StandInLaterStages implements LaterStages {
  readonly standIn = true;

  constructor(private readonly stepSeconds: () => number) {}

  jobs(softwareId: string, stage: LaterStageId, milestone: MilestoneRef | null): EnqueueInput[] {
    const about = milestone ? ` (${milestone.id}: ${milestone.text})` : "";
    const brief = `Stand-in ${stage} for this software${about}. Nothing is really ${stage === "build" ? "built" : stage === "check" ? "checked" : "started"}.`;
    switch (stage) {
      case "build":
        return [{ softwareId, kind: "build", stage, payload: { standIn: true, brief } }];
      case "check":
        return [{ softwareId, kind: "check", stage, payload: { standIn: true, brief } }];
      case "run":
        return [{ softwareId, kind: "run", stage, payload: { standIn: true, brief } }];
      case "report":
        return [];
    }
  }

  finished(): LaterOutcome {
    return { kind: "next" };
  }

  runServerJob(): Promise<AgentOutcome> {
    const seconds = this.stepSeconds();
    return new Promise((resolve) =>
      setTimeout(
        () => resolve({ kind: "done", summary: "Stand-in: nothing was started on this machine." }),
        seconds * 1000,
      ),
    );
  }

  reportLines(_softwareId: string, milestone: MilestoneRef | null): string[] {
    return [
      `${milestone ? `${milestone.id} reached` : "Reached the end of the plan"} (stand-in): building, checking and running are not built into premise yet, so nothing was really built, checked or started.`,
    ];
  }

  takeIn(_softwareId: string, _text: string, n: number, atIntake: boolean): string {
    return `Taken as I-${n}. ${atIntake ? "It goes into the line as new work." : "It is kept as new work for after this round reaches Intake."}`;
  }
}
