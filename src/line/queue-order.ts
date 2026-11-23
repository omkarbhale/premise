import type { QueuePriority, TimelineEstimate } from "../shared/api-types.js";

/**
 * The order of a software's queued changes, the groups premise proposes, and the rough estimates
 * (decision 0321). Pure: the line engine and the timeline give it what they read.
 */

/** A queued change, as ordering needs it. */
export interface QueuePiece {
  workItemId: number;
  /** Arrival order: the work item's id grows with time. */
  arrival: number;
  size: string;
  priority: QueuePriority;
  /** The person's own placing within its priority; null when premise places it. */
  rank: number | null;
  /** Record items it touches (from triage). */
  touches: string[];
  /**
   * Goes before the software's milestones that have not started: feedback on what has already
   * landed does, unless the person moved it (decision 0321). False when there are none to precede.
   */
  before?: boolean;
}

const SIZE_ORDER: Record<string, number> = { small: 0, medium: 1, large: 2 };

export const QUEUE_PRIORITIES: readonly QueuePriority[] = ["first", "normal", "later"];

export const PRIORITY_WORDS: Readonly<Record<QueuePriority, string>> = {
  first: "Do this first",
  normal: "Normal",
  later: "Can wait",
};

function sizeOrder(size: string): number {
  return SIZE_ORDER[size] ?? 1;
}

function shares(a: QueuePiece, b: QueuePiece): boolean {
  return a.touches.some((t) => b.touches.includes(t));
}

/**
 * The queue's order: priority first; within a priority, the pieces the person placed, in their
 * order; then the rest by size, small first, except that a piece never goes ahead of an earlier
 * piece it touches the same parts as (it may depend on it); then by arrival.
 */
export function orderQueue<T extends QueuePiece>(pieces: readonly T[]): T[] {
  const ordered: T[] = [];
  for (const before of [true, false]) {
    for (const priority of QUEUE_PRIORITIES) {
      const group = pieces.filter((p) => p.priority === priority && Boolean(p.before) === before);
      const placed = group
        .filter((p) => p.rank !== null)
        .sort((a, b) => a.rank! - b.rank! || a.arrival - b.arrival);
      ordered.push(...placed);
      const rest = group.filter((p) => p.rank === null).sort((a, b) => a.arrival - b.arrival);
      // Pick, each time, the smallest piece whose earlier related pieces are all placed already.
      while (rest.length > 0) {
        const ready = rest.filter(
          (p) => !rest.some((q) => q.arrival < p.arrival && q !== p && shares(p, q)),
        );
        const pick = ready.sort(
          (a, b) => sizeOrder(a.size) - sizeOrder(b.size) || a.arrival - b.arrival,
        )[0]!;
        ordered.push(pick);
        rest.splice(rest.indexOf(pick), 1);
      }
    }
  }
  return ordered;
}

/**
 * Move one queued piece up or down by one place. The pieces of its priority get the person's
 * ranks in their current order; moving past a piece of another priority takes on that priority,
 * so the move does what the person sees. Returns the changes to store.
 */
export function moveInQueue(
  pieces: readonly QueuePiece[],
  workItemId: number,
  direction: "up" | "down",
): { workItemId: number; priority: QueuePriority; rank: number; before: boolean }[] {
  const ordered = orderQueue(pieces);
  const at = ordered.findIndex((p) => p.workItemId === workItemId);
  if (at < 0) return [];
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= ordered.length) return [];
  const moved = ordered[at]!;
  const other = ordered[to]!;
  const swapped = [...ordered];
  swapped[at] = other;
  swapped[to] = moved;
  // Passing a piece of another group takes on its group, so the move does what the person sees.
  const priority = other.priority;
  const before = Boolean(other.before);
  const result: { workItemId: number; priority: QueuePriority; rank: number; before: boolean }[] =
    [];
  let rank = 0;
  for (const piece of swapped) {
    const p = piece === moved ? priority : piece.priority;
    const b = piece === moved ? before : Boolean(piece.before);
    if (p !== priority || b !== before) continue;
    result.push({ workItemId: piece.workItemId, priority: p, rank: rank++, before: b });
  }
  return result;
}

/**
 * Queued pieces that touch the same parts, grouped (two or more), leaving out any group the
 * person already kept apart. Groups join through any shared part.
 */
export function proposeGroups<T extends QueuePiece>(
  pieces: readonly T[],
  keptApart: readonly (readonly number[])[],
): { pieces: T[]; shared: string[] }[] {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let at = id;
    while (parent.get(at) !== at) at = parent.get(at)!;
    return at;
  };
  for (const p of pieces) parent.set(p.workItemId, p.workItemId);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (shares(pieces[i]!, pieces[j]!)) {
        parent.set(find(pieces[j]!.workItemId), find(pieces[i]!.workItemId));
      }
    }
  }
  const groups = new Map<number, T[]>();
  for (const p of pieces) {
    const root = find(p.workItemId);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .filter((g) => {
      const ids = g.map((p) => p.workItemId);
      // Kept apart once: not proposed again unless a new piece joins it.
      return !keptApart.some((k) => ids.every((id) => k.includes(id)));
    })
    .map((g) => {
      const counts = new Map<string, number>();
      for (const p of g)
        for (const t of new Set(p.touches)) counts.set(t, (counts.get(t) ?? 0) + 1);
      const shared = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([t]) => t);
      return { pieces: g, shared };
    });
}

/** What one finished piece of work took, measured by premise. */
export interface MeasuredPiece {
  group: "change" | "milestone";
  size: string;
  minutes: number;
  sessions: number;
}

/** Per kind and size: the typical minutes and sessions, from finished work. */
export interface History {
  pieces: readonly MeasuredPiece[];
  /** How many finished pieces an estimate needs. */
  minPieces: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const NOT_ENOUGH: TimelineEstimate = {
  enough: false,
  minutes: null,
  sessions: null,
  words: "not enough history yet",
};

/**
 * A rough estimate of one piece from finished pieces of its kind and size, or of its kind at any
 * size when too few of its size have finished; "not enough history yet" otherwise.
 */
export function estimatePiece(
  history: History,
  group: MeasuredPiece["group"],
  size: string,
): TimelineEstimate {
  const same = history.pieces.filter((p) => p.group === group && p.size === size);
  const kind = history.pieces.filter((p) => p.group === group);
  const basis =
    same.length >= history.minPieces ? same : kind.length >= history.minPieces ? kind : null;
  if (!basis) return NOT_ENOUGH;
  const minutes = Math.max(1, Math.round(median(basis.map((p) => p.minutes))));
  const sessions = Math.max(1, Math.round(median(basis.map((p) => p.sessions))));
  return estimate(minutes, sessions);
}

/** Estimates added together; not enough history in any part makes the sum not enough. */
export function sumEstimates(parts: readonly TimelineEstimate[]): TimelineEstimate {
  if (parts.length === 0) return estimate(0, 0);
  if (parts.some((p) => !p.enough)) return NOT_ENOUGH;
  return estimate(
    parts.reduce((n, p) => n + (p.minutes ?? 0), 0),
    parts.reduce((n, p) => n + (p.sessions ?? 0), 0),
  );
}

export function estimate(minutes: number, sessions: number): TimelineEstimate {
  return {
    enough: true,
    minutes,
    sessions,
    words:
      minutes === 0
        ? "nothing before it"
        : `about ${durationWords(minutes)}, ${sessions === 1 ? "1 agent session" : `${sessions} agent sessions`}`,
  };
}

/** "40 minutes", "3 hours", "2 days". */
export function durationWords(minutes: number): string {
  if (minutes < 90)
    return `${Math.max(1, Math.round(minutes))} minute${Math.round(minutes) === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  if (hours < 36) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
