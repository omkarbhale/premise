/**
 * Hedges in a person's words (decision 0300). In the first real runs a drafter turned the owner's
 * "perhaps" into a plain statement, and a lesson turned "I don't know if it should care about that"
 * into "it is out of scope". Words that leave a choice open are kept open: an item or a lesson that
 * rests on hedged words keeps the hedge.
 */

/** Words that say the person is not sure. */
const UNSURE =
  /\b(perhaps|maybe|not sure|unsure|i don'?t know|i do not know|don'?t know (if|whether)|not certain|might|possibly|probably|i think|i guess|or not|either)\b/i;

/** Whether words are hedged: unsure words, or a choice between things ("A or B"). */
export function isHedged(text: string): boolean {
  return UNSURE.test(text) || /\bor\b/i.test(text);
}

/** Whether words say a person was unsure (not only that they named alternatives). */
export function isUnsure(text: string): boolean {
  return UNSURE.test(text);
}

/** Whether a line keeps a hedge: it is unsure itself, keeps the alternatives, or says it is open. */
export function keepsHedge(text: string): boolean {
  return (
    isHedged(text) ||
    /\b(open choice|left open|not decided|undecided|unclear|not settled|to be decided)\b/i.test(
      text,
    )
  );
}

/** The sentences of a person's words that say they were unsure, each at most `max` characters. */
export function unsureSentences(text: string, max = 200): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && isUnsure(s))
    .map((s) => (s.length > max ? `${s.slice(0, max - 1)}…` : s));
}
