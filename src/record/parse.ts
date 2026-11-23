import type { Diagnostic } from "./diagnostics.js";
import {
  FILE_OF_KIND,
  FROM_PATTERN,
  ID_MENTION,
  ITEM_KINDS,
  type ItemKind,
  KIND_NAMES,
  type Marks,
  PRIORITIES,
  type Priority,
  RECORD_FILES,
  type RecordItem,
  isDate,
} from "./format.js";

export interface ParsedRecord {
  items: RecordItem[];
  diagnostics: Diagnostic[];
}

const ITEM_LINE = /^- \[([A-Z])-(\d+)\] (.+) \(([^()]*)\)$/;
const STRUCK_LINE = /^- ~~\[([A-Z])-(\d+)\] (.+) \(([^()]*)\)~~ struck (\S+): (.+)$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;

function parseMarks(
  raw: string,
  kind: ItemKind,
  problem: (message: string) => void,
): Marks | undefined {
  const tokens = raw.split(";").map((t) => t.trim());
  const marks: Partial<Marks> = {};
  let ok = true;
  const fail = (message: string) => {
    ok = false;
    problem(message);
  };
  const date = tokens.pop();
  if (date === undefined || !isDate(date)) {
    fail(`the last mark must be the date as YYYY-MM-DD; it is "${date ?? ""}"`);
  } else {
    marks.date = date;
  }
  for (const token of tokens) {
    if ((PRIORITIES as readonly string[]).includes(token)) {
      if (marks.priority) fail("it has two priorities");
      marks.priority = token as Priority;
    } else if (token.startsWith("from: ")) {
      const from = token.slice(6);
      if (marks.from !== undefined) fail("it has two `from:` marks");
      else if (!FROM_PATTERN.test(from))
        fail(
          `\`from:\` must be a role written in lower-case letters (such as operator), or assumed or recovered; it is "${from}". The record names roles, never people`,
        );
      marks.from = from;
    } else if (token.startsWith("replaces: ")) {
      const target = token.slice(10);
      if (!/^[A-Z]-[1-9]\d*$/.test(target))
        fail(`\`replaces:\` must name one item ID; it is "${target}"`);
      marks.replaces = target;
    } else if (token === "foundation") {
      if (kind !== "D") fail("only a decision (D) can be marked foundation");
      marks.foundation = true;
    } else if (token === "wait") {
      if (kind !== "M") fail("only a milestone (M) can be marked wait");
      marks.wait = true;
    } else if (token === "left-out") {
      if (kind !== "W") fail("only a W item can be marked left-out");
      marks.leftOut = true;
    } else if (token.startsWith("confirmed: ")) {
      const when = token.slice(11);
      if (!isDate(when)) fail(`\`confirmed:\` must be a date as YYYY-MM-DD; it is "${when}"`);
      marks.confirmed = when;
    } else {
      fail(
        `"${token}" is not a mark premise knows. Marks are: must/should/could (for W), from: <role>, replaces: <ID>, foundation (for D), wait (for M), left-out (for W), confirmed: <date>, then the date`,
      );
    }
  }
  if (marks.from === undefined) fail("it needs `from: <role>`, or `from: assumed`");
  if (kind === "W" && !marks.priority) fail("a W item needs a priority: must, should or could");
  if (kind !== "W" && marks.priority) fail("only a W item has a priority");
  return ok ? (marks as Marks) : undefined;
}

/**
 * Parse every file of a record, given as file name to content. Files that are missing are empty.
 * Returns the items found and every problem, with its file and line.
 */
export function parseRecord(files: ReadonlyMap<string, string>): ParsedRecord {
  const items: RecordItem[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, RecordItem>();

  for (const spec of RECORD_FILES) {
    const content = files.get(spec.file);
    if (content === undefined || spec.kinds.length === 0) continue;
    const lines = content.split("\n");
    if (lines.at(-1) === "") lines.pop();
    lines.forEach((text, index) => {
      const line = index + 1;
      const bad = (message: string) =>
        diagnostics.push({ code: "MALFORMED", file: spec.file, line, message });
      if (text.trim() === "" || /^#{1,6} \S/.test(text)) return;

      const struck = STRUCK_LINE.exec(text);
      const live = struck ? null : ITEM_LINE.exec(text);
      const m = struck ?? live;
      if (!m) {
        bad(
          text.startsWith("- ")
            ? "this line is not in the record's format. An item looks like `- [W-7] What it must do. (must; from: operator; 2026-11-21)`; a struck one like `- ~~[W-7] ... (...)~~ struck 2026-11-22: why`"
            : "the record holds headings and one item per list line, nothing else. Put this in a list item, or leave it out",
        );
        return;
      }
      const kindLetter = m[1]!;
      if (!(ITEM_KINDS as readonly string[]).includes(kindLetter)) {
        bad(
          `${kindLetter}-${m[2]} has an unknown kind "${kindLetter}". The kinds are ${ITEM_KINDS.join(", ")}`,
        );
        return;
      }
      const kind = kindLetter as ItemKind;
      if (FILE_OF_KIND[kind] !== spec.file) {
        bad(
          `${kind} items (${KIND_NAMES[kind]}) belong in ${FILE_OF_KIND[kind]}, not ${spec.file}`,
        );
        return;
      }
      if (!/^[1-9]\d*$/.test(m[2]!)) {
        bad(`the number in [${kind}-${m[2]}] must be a whole number from 1, without leading zeros`);
        return;
      }
      const number = Number(m[2]);
      const id = `${kind}-${number}`;
      const itemText = m[3]!;
      const marks = parseMarks(m[4]!, kind, (message) => bad(`${id}: ${message}`));
      if (struck) {
        if (!isDate(struck[5]!)) bad(`${id}: "struck" must be followed by a date as YYYY-MM-DD`);
      }
      if (EMAIL.test(itemText) || (struck && EMAIL.test(struck[6]!))) {
        bad(`${id} holds an email address. The record names roles, never people (decision 0081)`);
      }
      if (kind === "D" && !(/\bReason: /.test(itemText) && /\bRejected: /.test(itemText))) {
        bad(
          `${id}: a decision's text states what was decided, then "Reason: ..." and "Rejected: ...", the alternative given up, all in the one "text", such as "Keep tasks in one JSON file. Reason: one user, no server. Rejected: SQLite, more than needed."`,
        );
      }
      if (seen.has(id)) {
        bad(
          `${id} appears twice (first on line ${seen.get(id)!.line} of ${seen.get(id)!.file}). IDs are never reused`,
        );
        return;
      }
      if (!marks) return;
      const item: RecordItem = { id, kind, number, file: spec.file, line, text: itemText, marks };
      if (struck && isDate(struck[5]!)) item.struck = { date: struck[5]!, reason: struck[6]! };
      seen.set(id, item);
      items.push(item);
    });
  }

  // Cross-item checks: replaces links and mentions.
  for (const item of items) {
    const where = (message: string, code: Diagnostic["code"] = "UNKNOWN_ITEM") =>
      diagnostics.push({ code, file: item.file, line: item.line, message });
    const target = item.marks.replaces;
    if (target) {
      const old = seen.get(target);
      if (!old) {
        where(`${item.id} replaces ${target}, which is not in the record`);
      } else if (old.kind !== item.kind) {
        where(
          `${item.id} replaces ${target}, but an item can only replace one of its own kind`,
          "MALFORMED",
        );
      } else if (old.id === item.id) {
        where(`${item.id} cannot replace itself`, "MALFORMED");
      } else {
        if (!old.struck) {
          where(
            `${item.id} replaces ${target}, but ${target} is not struck through. Strike it with the reason`,
            "MALFORMED",
          );
        }
        if (old.replacedBy) {
          where(
            `${target} is replaced by both ${old.replacedBy} and ${item.id}; an item is replaced once`,
            "MALFORMED",
          );
        } else {
          old.replacedBy = item.id;
        }
      }
    }
    const mentioned = new Set<string>();
    for (const part of [item.text, item.struck?.reason ?? ""]) {
      for (const m of part.matchAll(ID_MENTION)) {
        if (m[1] === "I") continue;
        const id = `${m[1]}-${m[2]}`;
        if (id !== item.id && !mentioned.has(id) && !seen.has(id)) {
          mentioned.add(id);
          where(`${item.id} mentions ${id}, which is not in the record`);
        }
      }
    }
  }
  return { items, diagnostics };
}

/** The live (not struck) items of a parsed record. */
export function liveItems(items: readonly RecordItem[]): RecordItem[] {
  return items.filter((i) => !i.struck);
}
