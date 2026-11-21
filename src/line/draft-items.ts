import type { Operation } from "../record/change.js";
import {
  FROM_PATTERN,
  ITEM_KINDS,
  type ItemKind,
  PRIORITIES,
  type Priority,
} from "../record/format.js";
import type { AskItem, ItemAnswer } from "../shared/api-types.js";
import { SIZE_CLASSES, type SizeClass } from "../shared/stages.js";

/**
 * Turning what an agent submits with draft_submit into the items a person sees, and what a person
 * answered into record changes. Agents are told to write items in the record's line format, but
 * a draft is accepted leniently: a leading ID or prefix and trailing marks are read, not required.
 */

/** One drafted item, with what the record needs beyond its words. */
export interface DraftItem {
  key: string;
  text: string;
  /** "size" is the size class proposed at Why; it sets the software's size, not a record item. */
  kind: ItemKind | "size";
  /** "assumed", or the role it came from. */
  from: string;
  /** True when premise offers it as its own idea. */
  suggestion?: boolean;
  priority?: Priority;
  foundation?: boolean;
  wait?: boolean;
  /** Record items it stands for (say-back), or sources (What exists). */
  refs?: string[];
}

export class DraftError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "DraftError";
  }
}

const LEADING_ID = /^\s*(?:[-*]\s+)?(?:~~)?\[?([YUREWTDM])(?:-(\d+))?\]?\s*[:.)-]?\s+/;
const TRAILING_MARKS = /\s*\(([^()]*\bfrom:\s*[^()]*)\)\s*$/;

function oneLine(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A size class from text such as "Size: small (a few screens)". */
export function sizeFrom(text: string): SizeClass | undefined {
  const m = /\b(small|medium|large)\b/i.exec(text);
  const size = m?.[1]?.toLowerCase();
  return (SIZE_CLASSES as readonly string[]).includes(size ?? "") ? (size as SizeClass) : undefined;
}

/** "must: Add a book" → priority and the rest. */
export function priorityFrom(text: string): { priority?: Priority; rest: string } {
  const m = /^\s*(must|should|could)\s*[:-]\s*/i.exec(text);
  if (!m) return { rest: text.trim() };
  return { priority: m[1]!.toLowerCase() as Priority, rest: text.slice(m[0].length).trim() };
}

/**
 * Read a list of drafted items. `defaultKind` is the stage's kind (Y at Why, and so on);
 * `allowed` the kinds the stage may hold.
 */
export function readDraftItems(
  raw: unknown,
  options: {
    defaultKind: ItemKind;
    allowed: readonly ItemKind[];
    allowSize?: boolean;
    max?: number;
  },
): DraftItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DraftError(["Give the draft as a list of items, at least one."]);
  }
  if (options.max !== undefined && raw.length > options.max) {
    throw new DraftError([
      `Give at most ${options.max} items; you gave ${raw.length}. Keep the ones that matter most.`,
    ]);
  }
  const problems: string[] = [];
  const items: DraftItem[] = [];
  raw.forEach((entry, i) => {
    const at = `Item ${i + 1}`;
    const value: Record<string, unknown> =
      typeof entry === "string"
        ? { text: entry }
        : entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
    let text = str(value.text);
    if (!text) {
      problems.push(`${at} has no text.`);
      return;
    }
    text = oneLine(text);
    let kind: ItemKind | "size" | undefined;
    const given = str(value.kind)?.toUpperCase();
    if (given === "SIZE") kind = "size";
    else if (given && (ITEM_KINDS as readonly string[]).includes(given)) kind = given as ItemKind;
    const lead = LEADING_ID.exec(text);
    if (lead) {
      kind ??= lead[1] as ItemKind;
      text = text.slice(lead[0].length).replace(/~~\s*$/, "");
    }
    let from = str(value.from) ?? str(value.mark);
    let priority = (PRIORITIES as readonly string[]).includes(String(value.priority))
      ? (value.priority as Priority)
      : undefined;
    let foundation = value.foundation === true;
    const marks = TRAILING_MARKS.exec(text);
    if (marks) {
      text = text.slice(0, marks.index).trim();
      for (const part of marks[1]!.split(";").map((p) => p.trim())) {
        if (part.startsWith("from:")) from ??= part.slice(5).trim();
        else if ((PRIORITIES as readonly string[]).includes(part)) priority ??= part as Priority;
        else if (part === "foundation") foundation = true;
      }
    }
    if (/^size\s*:/i.test(text) && options.allowSize) kind = "size";
    kind ??= options.defaultKind;
    if (kind !== "size" && !options.allowed.includes(kind)) {
      problems.push(
        `${at} is a ${kind} item, which this stage does not hold (${options.allowed.join(", ")}).`,
      );
      return;
    }
    if (kind === "W") {
      const p = priorityFrom(text);
      priority ??= p.priority;
      text = p.rest;
      priority ??= "should";
    }
    const suggestion = from === "suggestion" || value.suggestion === true;
    if (!from || from === "suggestion" || from === "premise") from = "assumed";
    from = from.toLowerCase().replace(/\s+/g, "-");
    if (!FROM_PATTERN.test(from)) from = "assumed";
    const refs = Array.isArray(value.refs)
      ? value.refs.filter((r): r is string => typeof r === "string")
      : Array.isArray(value.sources)
        ? value.sources.filter((r): r is string => typeof r === "string")
        : undefined;
    items.push({
      key: `k${i + 1}`,
      text,
      kind,
      from,
      ...(suggestion && { suggestion }),
      ...(priority && kind === "W" && { priority }),
      ...(foundation && kind === "D" && { foundation }),
      ...(value.wait === true && { wait: true }),
      ...(refs && refs.length > 0 && { refs }),
    });
  });
  if (problems.length) throw new DraftError(problems);
  return items;
}

/** How an item shows on its card. */
export function displayText(item: DraftItem): string {
  if (item.kind === "W") return `${item.priority ?? "should"}: ${item.text}`;
  return item.text;
}

export function toAskItem(item: DraftItem): AskItem {
  const mark = item.suggestion ? "suggestion" : item.from === "assumed" ? "assumed" : "from-role";
  return {
    key: item.key,
    text: displayText(item),
    mark,
    ...(mark === "from-role" && { from: item.from }),
    ...(item.wait !== undefined && { wait: item.wait }),
    ...(item.refs && { refs: item.refs }),
  };
}

export interface Corrected {
  /** Items to add, with the text as the person left it. */
  keep: { item: DraftItem; text: string; edited: boolean; wait?: boolean }[];
  struck: { item: DraftItem; reason: string }[];
}

/** Apply a person's item answers to a draft. */
export function applyAnswers(
  items: readonly DraftItem[],
  answers: readonly ItemAnswer[],
): Corrected {
  const byKey = new Map(answers.map((a) => [a.key, a]));
  const out: Corrected = { keep: [], struck: [] };
  for (const item of items) {
    const answer = byKey.get(item.key);
    if (answer?.decision === "strike") {
      out.struck.push({ item, reason: oneLine(answer.reason ?? "") || "Struck by the operator." });
    } else if (answer?.decision === "edit") {
      out.keep.push({
        item,
        text: oneLine(answer.text),
        edited: true,
        ...(answer.wait !== undefined && { wait: answer.wait }),
      });
    } else {
      out.keep.push({
        item,
        text: displayText(item),
        edited: false,
        ...(answer?.decision === "keep" && answer.wait !== undefined && { wait: answer.wait }),
      });
    }
  }
  return out;
}

/** The record operation that adds a kept item (an edited one is the operator's). */
export function addOperation(
  entry: Corrected["keep"][number],
  operatorRole = "operator",
): Extract<Operation, { op: "add" }> | null {
  const { item } = entry;
  if (item.kind === "size") return null;
  let text = entry.text.replace(/[()]/g, (c) => (c === "(" ? "[" : "]"));
  let priority = item.priority;
  if (item.kind === "W") {
    const p = priorityFrom(text);
    priority = p.priority ?? priority ?? "should";
    text = p.rest;
  }
  if (item.suggestion && !entry.edited && !/suggestion/i.test(text)) text = `Suggestion: ${text}`;
  return {
    op: "add",
    kind: item.kind,
    text,
    from: entry.edited ? operatorRole : item.from,
    ...(item.kind === "W" && { priority }),
    ...(item.kind === "D" && item.foundation && { foundation: true }),
    ...(item.kind === "M" && (entry.wait ?? item.wait) && { wait: true }),
  };
}
