import type { AskItem } from "../shared/api-types.js";

/**
 * The stand-in line's drafts: fixed templates filled with the operator's own words. No AI writes
 * them, so they are generic on purpose; the page says so. The real drafter replaces them.
 */

/** Words that start a new clause: a name stops before them once it has two words. */
const CLAUSE = new Set([
  "where",
  "that",
  "which",
  "who",
  "so",
  "because",
  "when",
  "with",
  "for",
  "to",
]);
/** Words a name should not end on. */
const DANGLING = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "by",
  "to",
  "for",
  "with",
  "in",
  "on",
  "at",
  "my",
  "our",
  "your",
  "i",
  "we",
  "that",
  "which",
  "where",
  "who",
]);

/** A short name from the first words of an idea: "I want a tool that renames photos" → "Tool that renames photos". */
export function nameFromIdea(idea: string): string {
  const words = idea
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const skip = new Set(["a", "an", "the", "i", "we", "want", "need", "would", "like", "to"]);
  while (words.length > 1 && skip.has(words[0]!.toLowerCase())) words.shift();
  const picked: string[] = [];
  for (const word of words) {
    if (picked.length >= 2 && CLAUSE.has(word.toLowerCase())) break;
    if ([...picked, word].join(" ").length > 32 || picked.length >= 5) break;
    picked.push(word);
  }
  while (picked.length > 1 && DANGLING.has(picked[picked.length - 1]!.toLowerCase())) picked.pop();
  const name = picked.join(" ");
  if (!name) return "New software";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The idea shortened to one line for use inside an item. */
export function shortIdea(idea: string, max = 140): string {
  const flat = idea.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function item(key: string, text: string, mark: AskItem["mark"], from?: string): AskItem {
  return from ? { key, text, mark, from } : { key, text, mark };
}

export function whyDraft(idea: string): AskItem[] {
  return [
    item("y1", `In your words: ${shortIdea(idea)}`, "from-role", "operator"),
    item("y2", "Doing this by hand today takes time, or gets skipped.", "assumed"),
    item("y3", "It is worth building only if it saves more effort than it costs.", "assumed"),
    item("y4", "Size: small. A few screens or commands, and short stages.", "assumed"),
  ];
}

export function whoDraft(): AskItem[] {
  return [
    item("u1", "You are its first user, on this machine.", "assumed"),
    item("u2", "Operator (role): you. Decides what it is for and what matters most.", "assumed"),
    item(
      "u3",
      "Nobody else needs a say yet. Anyone can claim an area later, such as the look of the main screen.",
      "assumed",
    ),
  ];
}

export function whatDraft(idea: string): AskItem[] {
  return [
    item(
      "w1",
      `Must: it does what you described: ${shortIdea(idea, 100)}`,
      "from-role",
      "operator",
    ),
    item("w2", "Must: it starts with one command or one link on this machine.", "assumed"),
    item("w3", "Should: it explains itself on first use, without a guide.", "suggestion"),
    item("w4", "Could: it keeps what it needs between uses.", "suggestion"),
  ];
}

export const EXISTS_CHOICES = [
  "Build it",
  "Build on something that exists",
  "Do not build it",
] as const;

export const MILESTONE_CHOICES = ["Go on", "Stop here for now"] as const;

/** A repository name from a software's name: lower case, words joined by hyphens. */
export function repositoryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "new-software";
}
