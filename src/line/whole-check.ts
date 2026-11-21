import type { EnqueueInput, Job } from "../queue/work-queue.js";

/**
 * The check of a whole piece of work, once every part it was split into is built and checked
 * (decision 0184). Each part was checked on its own; this checks that the parts work together and
 * that the piece does what its record items say.
 *
 * It is a hand-off to the Check stage: a WholeCheck implementation owns what happens inside it.
 * Until the real Check stage takes it over, {@link StandInWholeCheck} passes every whole piece with
 * a scripted job that checks nothing, and the page says so.
 */

export interface WholePiece {
  /** The work item that was split. */
  itemId: number;
  title: string;
  /** What the piece is, in words. */
  words: string;
  /** The record milestone the piece belongs to, if any. */
  milestone: string | null;
  parts: { itemId: number; title: string }[];
  /** 1 for the first check of this piece; one more after each fix. */
  round: number;
}

/** What a whole-piece check job ending means. */
export type WholeCheckOutcome =
  | { kind: "passed" }
  /** Not passed: a fix goes through the line as a new part, with this evidence. */
  | { kind: "not-passed"; evidence: string }
  /** More jobs of the check are still running. */
  | { kind: "wait" };

export interface WholeCheck {
  /** True while this is a stand-in; the page says so. */
  readonly standIn: boolean;
  /** The jobs that check a whole piece. None means it passes at once. */
  jobs(softwareId: string, piece: WholePiece): EnqueueInput[];
  /** One of those jobs ended done. */
  finished(job: Job): WholeCheckOutcome;
}

/** A whole-piece check that checks nothing, and says so. */
export class StandInWholeCheck implements WholeCheck {
  readonly standIn = true;

  jobs(softwareId: string, piece: WholePiece): EnqueueInput[] {
    return [
      {
        softwareId,
        kind: "check",
        stage: "check",
        payload: {
          standIn: true,
          brief: `Stand-in check of the whole of "${piece.title}" (${piece.parts.length} parts, round ${piece.round}). Nothing is really checked.`,
        },
      },
    ];
  }

  finished(): WholeCheckOutcome {
    return { kind: "passed" };
  }
}
