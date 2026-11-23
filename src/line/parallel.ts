/**
 * Whether a piece of work may be built at the same time as the others in flight on one software
 * (decision 0313). Independence is decided, never assumed: the sizer names the parts of the
 * software each piece will touch (folders, files, modules, record items) and whether it changes a
 * foundation decision. Two pieces run at once only when what they touch does not overlap and
 * neither changes a foundation decision; when premise is unsure, they go one after another.
 *
 * Pure: the line engine gives it what it knows and records the answer with its reason.
 */

/** What one piece of work in flight (or about to be) says it touches. */
export interface Footprint {
  /** The work item. */
  item: number;
  /** The piece in plain words, as the person knows it ("I-2 (the shield fix)"). */
  label: string;
  /** The parts it touches, as the sizer (and triage) named them. Empty: not known. */
  touches: string[];
  /** It changes a foundation decision, or what the software is for. */
  foundation: boolean;
}

export interface InFlight extends Footprint {
  /** True when it is being built now; false when it waits for another piece itself. */
  building: boolean;
}

export type FlightDecision =
  { go: true; reason: string } | { go: false; waitsFor: number[]; reason: string };

/** Names that mean the whole software, so they overlap with everything. */
const WHOLE = new Set(["", ".", "*", "**", "all", "everything", "the whole software"]);

/** One touched part, written the same way whoever named it. */
export function normalTouch(part: string): string {
  return part
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/(\/\*\*?)+$/, "")
    .replace(/\/+$/, "");
}

/** The parts the sizer named, cleaned up and without repeats. */
export function cleanTouches(parts: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const text = part.trim().replace(/\s+/g, " ").slice(0, 120);
    const key = normalTouch(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Whether two named parts are, or contain, the same part of the software. */
export function partsOverlap(a: string, b: string): boolean {
  const x = normalTouch(a);
  const y = normalTouch(b);
  if (WHOLE.has(x) || WHOLE.has(y)) return true;
  if (x === y) return true;
  if (y.startsWith(`${x}/`) || x.startsWith(`${y}/`)) return true;
  // A module named on its own ("combat") is the folder of that name anywhere ("src/combat/x.ts").
  if (!x.includes("/") && y.split("/").some((s) => s === x || s.replace(/\.[^.]+$/, "") === x)) {
    return true;
  }
  if (!y.includes("/") && x.split("/").some((s) => s === y || s.replace(/\.[^.]+$/, "") === y)) {
    return true;
  }
  return false;
}

/** The parts two pieces both touch, named as the more general of each pair. */
export function sharedParts(a: readonly string[], b: readonly string[]): string[] {
  const shared: string[] = [];
  for (const x of a) {
    for (const y of b) {
      if (!partsOverlap(x, y)) continue;
      const general = normalTouch(x).length <= normalTouch(y).length ? x : y;
      if (!shared.some((s) => normalTouch(s) === normalTouch(general))) shared.push(general);
    }
  }
  return shared;
}

function names(pieces: readonly Footprint[]): string {
  const labels = pieces.map((p) => p.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/**
 * Whether `piece` may be built now, beside `others` (the pieces of the same software in flight
 * before it: building, or waiting themselves), with at most `cap` building at once.
 */
export function decideFlight(
  piece: Footprint,
  others: readonly InFlight[],
  cap: number,
): FlightDecision {
  if (others.length === 0) {
    return { go: true, reason: "Nothing else of this software is being built, so it starts now." };
  }
  if (piece.touches.length === 0) {
    return {
      go: false,
      waitsFor: others.map((o) => o.item),
      reason: `Waits for ${names(others)}: premise does not know which parts this one touches, so it goes after the work already in flight.`,
    };
  }
  if (piece.foundation) {
    return {
      go: false,
      waitsFor: others.map((o) => o.item),
      reason: `Waits for ${names(others)}: it changes a foundation decision everything else builds on, so it goes alone.`,
    };
  }
  const unsure = others.filter((o) => o.touches.length === 0);
  if (unsure.length > 0) {
    return {
      go: false,
      waitsFor: unsure.map((o) => o.item),
      reason: `Waits for ${names(unsure)}: premise does not know which parts ${unsure.length === 1 ? "that one touches" : "those touch"}, so they go one after another.`,
    };
  }
  const foundation = others.filter((o) => o.foundation);
  if (foundation.length > 0) {
    return {
      go: false,
      waitsFor: foundation.map((o) => o.item),
      reason: `Waits for ${names(foundation)}: ${foundation.length === 1 ? "it changes" : "they change"} a foundation decision this one builds on.`,
    };
  }
  const clashes = others
    .map((o) => ({ other: o, shared: sharedParts(piece.touches, o.touches) }))
    .filter((c) => c.shared.length > 0);
  if (clashes.length > 0) {
    const first = clashes[0]!;
    const more = clashes.length > 1 ? ` (and ${names(clashes.slice(1).map((c) => c.other))})` : "";
    return {
      go: false,
      waitsFor: clashes.map((c) => c.other.item),
      reason: `Waits for ${first.other.label}${more}: both change ${first.shared.join(", ")}.`,
    };
  }
  const building = others.filter((o) => o.building);
  if (building.length >= cap) {
    return {
      go: false,
      waitsFor: building.map((o) => o.item),
      reason: `Waits: ${building.length === 1 ? "1 piece is" : `${building.length} pieces are`} already being built, the most this software builds at once. You can change that on the Line tab.`,
    };
  }
  if (building.length === 0) {
    return {
      go: true,
      reason: `Starts now: it touches other parts than ${names(others)}, which ${others.length === 1 ? "waits" : "wait"} for other work.`,
    };
  }
  return {
    go: true,
    reason: `Built alongside ${names(building)}: they change different parts (this one: ${piece.touches.join(", ")}; ${building.map((b) => `${b.label}: ${b.touches.join(", ")}`).join("; ")}).`,
  };
}
