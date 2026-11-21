import type { PremiseConfig } from "../config/settings.js";
import {
  SIZE_CLASSES,
  STAGES,
  STAGE_IDS,
  type SizeClass,
  type StageId,
  stageName,
} from "../shared/stages.js";
import type { SizingProposal, SplitPart, WorkItem } from "./work-items.js";

/**
 * Sizing a piece of work (decisions 0168, 0170, 0184): how big it is, which stages of the line it
 * needs, and whether it splits into parts. The sizer, an agent, decides; these are the rules premise
 * holds it to, so a wrong answer cannot skip what must never be skipped.
 */

type Piece = Pick<WorkItem, "kind" | "origin" | "parentId">;

const EARLY_AND_BUILD: readonly StageId[] = [
  "why",
  "who",
  "exists",
  "what",
  "say-back",
  "plan",
  "build",
  "check",
];
const MILESTONE: readonly StageId[] = ["build", "check", "run", "report"];

/** The stages a piece of this kind may go through. */
export function allowedStages(piece: Piece): readonly StageId[] {
  if (piece.parentId === null) return STAGE_IDS;
  if (piece.kind === "milestone") return MILESTONE;
  if (piece.kind === "intake") return STAGE_IDS.filter((s) => s !== "intake");
  // A part of a split piece, or a fix: built and checked on its own. Running it and reporting on it
  // is the whole piece's, once every part is done and the whole is checked.
  return EARLY_AND_BUILD;
}

/** The stages a piece of this kind always goes through, whatever the sizer says. */
export function requiredStages(piece: Piece): readonly StageId[] {
  if (piece.parentId === null) {
    // A new software: its purpose and what it must do are new, so they are drafted and said back
    // (decision 0020), and a plan's first milestone is the smallest version that runs.
    return ["why", "what", "say-back", "plan", "build", "check", "run", "report", "intake"];
  }
  if (piece.kind === "milestone") return MILESTONE;
  // Every piece is checked by an agent that did not build it (decision 0030).
  return ["build", "check"];
}

/** The stages a piece goes through when nobody sized it: all it may have, or for a fix, the least. */
export function defaultStages(piece: Piece): StageId[] {
  if (piece.origin === "fix") return ["build", "check"];
  return [...allowedStages(piece)];
}

/** Whether a piece may be split by the sizer. Parts and fixes are not split again. */
export function maySplit(piece: Piece, config: Pick<PremiseConfig, "line">): boolean {
  return config.line.splitting && piece.origin !== "split" && piece.origin !== "fix";
}

/** A stage named by its id or its plain name ("What exists", "say back"). */
export function stageFromName(name: unknown): StageId | undefined {
  if (typeof name !== "string") return undefined;
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const found = STAGES.find(
    (s) => s.id === key || s.name.toLowerCase().replace(/\s+/g, "-") === key,
  );
  return found?.id ?? (key === "what-exists" ? "exists" : undefined);
}

/**
 * The stages, in the line's order, with what the piece must always have added and what it may not
 * have taken out. Each change is said in a note, so the page can show why.
 */
export function settleStages(
  piece: Piece,
  wanted: readonly StageId[],
): { stages: StageId[]; notes: string[] } {
  const allowed = allowedStages(piece);
  const notes: string[] = [];
  const chosen = new Set<StageId>();
  for (const stage of wanted) {
    if (allowed.includes(stage)) chosen.add(stage);
    else
      notes.push(
        `${stageName(stage)} is not a stage this kind of work goes through, so it was left out.`,
      );
  }
  for (const stage of requiredStages(piece)) {
    if (!chosen.has(stage)) {
      chosen.add(stage);
      notes.push(
        `${stageName(stage)} was added: ${REQUIRED_WHY[stage] ?? "this kind of work always has it."}`,
      );
    }
  }
  if (
    (chosen.has("why") || chosen.has("what")) &&
    !chosen.has("say-back") &&
    allowed.includes("say-back")
  ) {
    chosen.add("say-back");
    notes.push(
      "Say back was added: a change to what the software is for, or to what it must do, is said back before it is built.",
    );
  }
  return { stages: STAGE_IDS.filter((s) => chosen.has(s)), notes };
}

const REQUIRED_WHY: Partial<Record<StageId, string>> = {
  why: "a new software's purpose is always drafted with you.",
  what: "a new software's must, should and could are always drafted with you.",
  "say-back": "what premise understood about a new software is always said back.",
  plan: "a new software is always planned, smallest running version first.",
  build: "every piece of work is built.",
  check: "every piece of work is checked by an agent that did not build it.",
  run: "the software runs on this machine at the end of its line.",
  report: "every software and every milestone ends with a report.",
  intake: "a software's line ends at Intake, where what you say becomes new work.",
};

const MAX_TITLE = 120;
const MAX_WORDS = 2000;
const MAX_REASON = 1000;

function reason(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_REASON) : "";
}

/** Check what the sizer submitted. Problems are said so the sizer can fix them and submit again. */
export function readSizing(
  piece: Piece,
  args: Record<string, unknown>,
  config: Pick<PremiseConfig, "line">,
): { proposal: SizingProposal } | { problems: string[] } {
  const problems: string[] = [];
  const size = typeof args.size === "string" ? args.size.trim().toLowerCase() : "";
  if (!(SIZE_CLASSES as readonly string[]).includes(size)) {
    problems.push('Give "size" as small, medium or large.');
  }
  const sizeReason = reason(args.size_reason);
  if (!sizeReason) problems.push('Give "size_reason": one sentence on why that size.');
  const stagesReason = reason(args.stages_reason);
  if (!stagesReason) {
    problems.push('Give "stages_reason": why it needs these stages and not the others.');
  }
  const splitReason = reason(args.split_reason);
  if (!splitReason) {
    problems.push('Give "split_reason": why it is split, or why it stays whole.');
  }
  const wanted: StageId[] = [];
  if (!Array.isArray(args.stages) || args.stages.length === 0) {
    problems.push('Give "stages": the stages this piece needs, such as ["build", "check"].');
  } else {
    for (const name of args.stages) {
      const stage = stageFromName(name);
      if (stage) wanted.push(stage);
      else {
        problems.push(`"${String(name)}" is not a stage. The stages are: ${STAGE_IDS.join(", ")}.`);
      }
    }
  }
  const split: SplitPart[] = [];
  const parts = args.split === undefined || args.split === null ? [] : args.split;
  if (!Array.isArray(parts)) {
    problems.push('Give "split" as a list of parts, or an empty list to keep the piece whole.');
  } else if (parts.length > 0) {
    if (!maySplit(piece, config)) {
      problems.push(
        config.line.splitting
          ? "This piece is already a part of a split piece, or a fix, and is not split again. Keep it whole."
          : "Splitting is turned off in premise's settings (line.splitting). Keep it whole.",
      );
    } else if (parts.length === 1) {
      problems.push(
        "A split needs at least two parts. To keep the piece whole, give an empty list.",
      );
    } else if (parts.length > config.line.split_max_parts) {
      problems.push(
        `Split into at most ${config.line.split_max_parts} parts; you gave ${parts.length}. Fewer, larger parts are better.`,
      );
    }
    parts.forEach((part, i) => {
      const p = (typeof part === "string" ? { title: part, words: part } : (part ?? {})) as Record<
        string,
        unknown
      >;
      const title = typeof p.title === "string" ? p.title.trim().replace(/\s+/g, " ") : "";
      const words =
        typeof p.words === "string"
          ? p.words.trim()
          : typeof p.description === "string"
            ? p.description.trim()
            : title;
      if (!title) problems.push(`Part ${i + 1} needs a "title".`);
      else if (title.length > MAX_TITLE)
        problems.push(`Part ${i + 1}'s title is over ${MAX_TITLE} characters.`);
      if (words.length > MAX_WORDS)
        problems.push(`Part ${i + 1}'s words are over ${MAX_WORDS} characters.`);
      split.push({ title: title.slice(0, MAX_TITLE), words: words.slice(0, MAX_WORDS) });
    });
  }
  if (problems.length > 0) return { problems };
  const settled = settleStages(piece, wanted);
  return {
    proposal: {
      size: size as SizeClass,
      sizeReason,
      stages: settled.stages,
      stagesReason,
      split,
      splitReason,
      notes: settled.notes,
    },
  };
}

/** What a piece is, in a few words, for the sizer's brief. */
export function pieceWords(piece: Piece): string {
  if (piece.parentId === null) return "a whole new software";
  switch (piece.kind) {
    case "milestone":
      return "one milestone of a software's confirmed plan";
    case "intake":
      return "one item of new work that came in after the software ran";
    default:
      return piece.origin === "fix"
        ? "a fix for what the check of a whole piece found"
        : "one part of a piece of work that was split";
  }
}
