import type { AskAnswer } from "../shared/api-types.js";
import type { Ask } from "../storage/asks.js";
import type { WorkItem } from "./work-items.js";

/**
 * The hand-off between the line engine and intake (docs/specs/intake.md). Chat that is not an
 * answer or a correction is taken in by intake; an answer to one of intake's asks is intake's to
 * act on; and intake follows the work items its items became, to tell their senders where they
 * stand. Intake asks the line for work through {@link IntakeLine}.
 */
export interface IntakeHooks {
  /** A chat message that is intake. Returns premise's one-line answer ("Taken as I-14 …"). */
  takeIn(softwareId: string, text: string): { number: number; reply: string };
  /** premise raises an item itself, such as a check that stopped. */
  raise(softwareId: string, text: string): void;
  /** One of intake's own asks was answered: the change to make, inside the answer's transaction. */
  answered(ask: Ask, answer: AskAnswer): (() => void) | null;
  /** A work item entered a stage, or ended ("done", "dropped", "withdrawn"). */
  workItemMoved(item: WorkItem, where: string): void;
  /**
   * Hold the items of a change still waiting its turn, to be read later with other held items
   * (decision 0321). False when its work has started.
   */
  holdWork?(workItemId: number, reason: string): boolean;
}

/** What intake needs from the line: put an item's work on it. */
export interface IntakeLine {
  /**
   * Put a piece of work on the line for an intake item, after any work before it. A change of
   * purpose always goes through Why and a say-back.
   */
  takeWork(
    softwareId: string,
    work: {
      ref: string;
      title: string;
      words: string;
      purpose: boolean;
      kind: string;
      /** Whether it changes what the software must do; a bug never does (decision 0192). */
      changesWhat?: boolean;
    },
  ): WorkItem;
  /** Send the whole software back to Why, with the operator (a reading's short list). */
  backToWhy(softwareId: string): Promise<void>;
  /**
   * Take back an intake item's work that is still waiting its turn, so the item can be triaged
   * again. False when the work has started, and is left as it is.
   */
  withdrawWaitingWork(workItemId: number): boolean;
}
