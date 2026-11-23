/**
 * The choices at What exists, named for what they mean and what they change (the owner, after the
 * first real runs: "What is the difference between build it and build something different? ... I
 * couldn't understand what that different is from premise"). Only the choices that apply are shown,
 * each with one line on what choosing it changes. A choice other than premise's recommendation is
 * an overrule: premise keeps the person's one line of why (decision 0300).
 */

/** What a choice at What exists does, whatever its words. */
export type ExistsOutcome = "build" | "build-on" | "anyway" | "not-build";

/** The researcher's findings, as far as the choices need them. */
export interface ExistsLook {
  /** The outcome the researcher recommends. */
  recommended: ExistsOutcome;
  /** What already does the job, if anything: "use <name>" instead of building. */
  alternative?: string;
  /** What it could be built on top of, if anything. */
  base?: string;
  /** What nothing out there does: the gap building it fills. */
  gap?: string;
}

export interface ExistsChoices {
  choices: string[];
  /** The choice premise recommends: one of `choices`. */
  recommended: string;
  /** For each choice, one line on what choosing it changes. */
  notes: Record<string, string>;
}

const cut = (text: string, max: number) => {
  const clean = text
    .replace(/[()\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

/** The researcher's outcome in its own words, read leniently, as one of the four outcomes. */
export function outcomeFromWords(words: string): ExistsOutcome {
  const text = words.trim().toLowerCase();
  if (/^(do not|don't|dont|not) build|^use\b|^stop/.test(text)) return "not-build";
  if (/anyway/.test(text)) return "anyway";
  if (/^build (it )?on\b|on top of|build on something/.test(text)) return "build-on";
  return "build";
}

/** The choices for a new software's What exists: only those that apply, each saying what it means. */
export function existsChoices(look: ExistsLook): ExistsChoices {
  const alternative = look.alternative ? cut(look.alternative, 60) : "";
  const base = look.base ? cut(look.base, 60) : look.recommended === "build-on" ? alternative : "";
  const gap = look.gap ? cut(look.gap, 80) : "";
  const choices: string[] = [];
  const notes: Record<string, string> = {};
  const add = (choice: string, note: string) => {
    choices.push(choice);
    notes[choice] = note;
  };
  const something = alternative !== "" || look.recommended === "not-build";
  const notBuild = alternative ? `Do not build: use ${alternative}` : "Do not build it";
  const onTop = base ? `Build it on top of ${base}` : "Build it on top of what was found";
  // "Nothing out there does this" is said only with the gap the researcher named: premise never
  // claims a search found nothing when none was made.
  const fresh = something
    ? "Build it anyway"
    : gap
      ? `Build it: nothing out there does this (${gap})`
      : "Build it";
  const stop = () =>
    add(
      notBuild,
      `premise stops here and builds nothing; you get a short report on why${alternative ? ` and how to use ${alternative} instead` : ""}.`,
    );
  if (something) stop();
  if (base || look.recommended === "build-on") {
    add(
      onTop,
      `premise plans it on top of ${base || "what was found"} and builds only what that lacks.`,
    );
  }
  add(
    fresh,
    something
      ? `premise builds its own from scratch although ${alternative || "something"} already does the job, and keeps your one line of why in the record.`
      : "premise goes on to what it must do and builds it from scratch.",
  );
  // Stopping is always possible, though not recommended when nothing does the job.
  if (!something) stop();
  const byOutcome: Record<ExistsOutcome, string> = {
    "not-build": notBuild,
    "build-on": onTop,
    anyway: fresh,
    build: fresh,
  };
  const recommended = choices.includes(byOutcome[look.recommended])
    ? byOutcome[look.recommended]
    : choices[0]!;
  // premise's recommendation is shown first.
  const ordered = [recommended, ...choices.filter((c) => c !== recommended)];
  return { choices: ordered, recommended, notes };
}

/**
 * What a person's answer at What exists does: one of the four outcomes, or "own" for words of
 * their own that are not one of them.
 */
export function answerOutcome(text: string): ExistsOutcome | "own" {
  const t = text.trim().toLowerCase();
  if (/^(do not|don't|dont) build/.test(t)) return "not-build";
  if (/^build (it )?on( top of)?\b|^build on something/.test(t)) return "build-on";
  if (/^build it anyway\b/.test(t)) return "anyway";
  if (/^build it\b/.test(t)) return "build";
  return "own";
}

/** Two outcomes mean the same work when both build it from scratch. */
const same = (a: ExistsOutcome | "own", b: ExistsOutcome | "own") =>
  a === b || ((a === "build" || a === "anyway") && (b === "build" || b === "anyway"));

/**
 * Whether an answer goes against premise's recommendation. With taken-on software the choices are
 * fixed words, so any other answer overrules it; at a new software's What exists, what counts is
 * the outcome, so "Build it" is not an overrule of "Build it: nothing out there does this".
 */
export function isOverrule(recommended: string | undefined, answer: string): boolean {
  if (!recommended) return false;
  const chosen = answer.trim();
  if (!chosen) return false;
  if (chosen.toLowerCase() === recommended.trim().toLowerCase()) return false;
  const rec = answerOutcome(recommended);
  if (rec === "own") return true;
  return !same(rec, answerOutcome(chosen));
}

/** The record line that keeps an overrule and its why, as a Why item from the person. */
export function overruleLine(recommended: string, chosen: string, why: string): string {
  return `Overruled: ${cut(why, 300)}. premise recommended "${cut(recommended, 80)}"; the operator chose "${cut(chosen, 120)}".`;
}

/** Whether a record line is an overrule kept by {@link overruleLine}. */
export const OVERRULE_LINE = /^Overruled:\s/;
