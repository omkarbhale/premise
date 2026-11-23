import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which piece of work in flight the code running now serves (decision 0313). A software's line has
 * one piece in front, the one whose early stages are worked on and whose stage the software's row
 * shows; a piece that reached Build may go on beside it, in its own lane, on its own branch. Every
 * entry into the line for a lane (a job of it ending, an answer to its ask, one of its agents'
 * tool calls, landing it) runs inside that lane, so the line's notes, the work item being served
 * and the build notes are that piece's, not the one in front.
 *
 * Outside any lane, everything is the piece in front, as before.
 */
export interface Lane {
  softwareId: string;
  /** The work item in flight. */
  item: number;
}

const storage = new AsyncLocalStorage<Lane | null>();

/** Run `work` for one lane, or for the piece in front when `lane` is null. */
export function inLane<T>(lane: Lane | null, work: () => T): T {
  return storage.run(lane, work);
}

/** Run `work` outside every lane: what it starts does not inherit the lane it was called from. */
export function outsideLanes<T>(work: () => T): T {
  return storage.run(null, work);
}

/** The lane the code running now serves, when it serves one of this software's lanes. */
export function currentLane(softwareId?: string): Lane | null {
  const lane = storage.getStore() ?? null;
  if (!lane) return null;
  if (softwareId !== undefined && lane.softwareId !== softwareId) return null;
  return lane;
}
