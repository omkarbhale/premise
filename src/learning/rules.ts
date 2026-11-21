import type { CorrectionKind, LearningDestination } from "../shared/api-types.js";

/**
 * premise's fixed rules for a correction (docs/specs/learning.md 3): what kind of mistake it was,
 * where what it teaches goes, and the line it proposes. They decide when no agent reads the
 * correction (learning.read_with_agent is off, agents cannot start, or the agent gave no reading),
 * and always for the two kinds that need no judgement: an undone split and a checker miss.
 */

export interface Reading {
  mistake: string;
  destination: LearningDestination;
  reason: string;
  /** The proposed line; null when there is nothing to learn. */
  line: string | null;
  /** For premise's own improvements: what recurs, so the same thing is grouped. */
  topic: string | null;
}

export interface CorrectionFacts {
  kind: CorrectionKind;
  what: string;
  said: string | null;
  /** The words of the thing corrected, when there are some (a struck item's text, an action). */
  subject: string | null;
  /** For an edit: what the person wrote instead. */
  replacement: string | null;
  stage: string | null;
}

/** Kinds no agent needs to read: what they teach is plain from the facts. */
export const RULE_ONLY: readonly CorrectionKind[] = ["undo-split", "bug-after-met"];

export function cut(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const at = one.lastIndexOf(" ", max - 1);
  return `${one.slice(0, at > max / 2 ? at : max - 1)}…`;
}

/** A short key for grouping improvements: "checker-miss", "split-too-eagerly". */
export function topicOf(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "other"
  );
}

function because(said: string | null): string {
  const s = said?.trim();
  return s ? `: ${s.replace(/[.\s]+$/, "")}` : "";
}

export function ruleReading(facts: CorrectionFacts): Reading {
  const words = facts.subject?.trim().replace(/[.\s]+$/, "");
  const subject = words ? `“${words}”` : "it";
  switch (facts.kind) {
    case "strike":
      return {
        mistake: "premise assumed something that was wrong",
        destination: "software",
        reason: "A struck item says what is wrong about this software, so it is a lesson for it.",
        line: `Do not assume ${subject}; it was struck${because(facts.said)}.`,
        topic: null,
      };
    case "edit":
      return {
        mistake: "premise had it close, but not right",
        destination: "software",
        reason: "An edit says how this software should be described, so it is a lesson for it.",
        line: facts.replacement
          ? `Where premise wrote ${subject}, the person meant “${facts.replacement}”.`
          : `${subject} needed changing before it was right.`,
        topic: null,
      };
    case "reject-draft":
      return facts.said?.trim()
        ? {
            mistake: "premise's proposal missed what was wanted",
            destination: "software",
            reason: "A proposal sent back for changes is about this software.",
            line: `When proposing, keep in mind: ${facts.said.trim().replace(/[.\s]+$/, "")}.`,
            topic: null,
          }
        : {
            mistake: "premise's proposal missed what was wanted",
            destination: "none",
            reason:
              "No reason was given, so there is nothing to learn from it yet. Say in chat what was wrong and premise takes it in.",
            line: null,
            topic: null,
          };
    case "decline-gate":
      return {
        mistake: "premise asked to do something the person did not want",
        destination: "software",
        reason: "A declined action is about what this software may do.",
        line: `Do not plan on this without asking first${facts.subject ? `: ${facts.subject.replace(/[.\s]+$/, "")}` : ""}${because(facts.said) ? ` (declined${because(facts.said)})` : ""}.`,
        topic: null,
      };
    case "send-back":
      return {
        mistake: "a stage's result was not good enough to go on from",
        destination: "none",
        reason:
          "Sending a stage back says what to redo, not what was wrong, so there is nothing to learn from it without more. Say in chat what was wrong and premise takes it in.",
        line: null,
        topic: null,
      };
    case "undo-split":
      return {
        mistake: "premise split a piece of work that should have stayed whole",
        destination: "premise",
        reason:
          "Whether to split is decided by premise's own sizing, so this is something premise itself should improve.",
        line: "The sizer split a piece of work that the person wanted kept whole; splitting may be too eager.",
        topic: "split-too-eagerly",
      };
    case "bug-after-met":
      return {
        mistake: "premise's check said something worked when it did not",
        destination: "premise",
        reason: "A bug in something premise's check said was met is a miss by premise's own check.",
        line: `The check said ${facts.subject ?? "an item"} was met, but a bug came back against it.`,
        topic: "checker-miss",
      };
  }
}
