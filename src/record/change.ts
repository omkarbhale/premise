import type { Diagnostic } from "./diagnostics.js";
import {
  FILE_OF_KIND,
  ITEM_KINDS,
  type ItemKind,
  type Marks,
  type Priority,
  RECORD_FILES,
  type RecordItem,
  emptyFile,
  formatItemLine,
  isDate,
  itemId,
} from "./format.js";
import { parseRecord } from "./parse.js";

/** What a proposer may ask for. `record_propose` in docs/specs/agent-tools.md. */
export type Operation =
  | {
      op: "add";
      kind: ItemKind;
      text: string;
      from: string;
      priority?: Priority;
      foundation?: boolean;
      wait?: boolean;
    }
  | {
      op: "replace";
      id: string;
      text: string;
      from: string;
      reason: string;
      priority?: Priority;
      foundation?: boolean;
      wait?: boolean;
    }
  | { op: "strike"; id: string; reason: string }
  /** Change a mark that is not the item's meaning: a milestone's wait, or a say-back's confirmation. */
  | { op: "mark"; id: string; wait?: boolean; confirmed?: boolean };

/** Who proposes. A builder may only add decisions (docs/specs/agent-tools.md). */
export interface Proposer {
  agentRole?: "drafter" | "researcher" | "reviewer" | "planner" | "builder" | "checker";
}

export interface AppliedChange {
  /** The record files as they would be after the change. */
  files: Map<string, string>;
  /** Files whose content differs. */
  changedFiles: string[];
  /** The ID each add or replace was given, in operation order (undefined for strike and mark). */
  assigned: (string | undefined)[];
  /** Every ID the change adds or replaces, strikes or marks: what a commit for it traces to. */
  touched: string[];
  /** Items whose replacement or striking must pass the say-back (purpose, users, must items, foundation). */
  sayBackFor: string[];
}

export type ApplyResult =
  { ok: true; change: AppliedChange } | { ok: false; diagnostics: Diagnostic[] };

/** An operation that would replace purpose, users, a must, or a foundation decision. */
export function needsSayBack(item: RecordItem): boolean {
  return (
    item.kind === "Y" ||
    item.kind === "U" ||
    (item.kind === "W" && item.marks.priority === "must") ||
    (item.kind === "D" && item.marks.foundation === true)
  );
}

function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * Apply a proposed change to a record in memory, check the result, and give new items their IDs.
 * Nothing is written: the caller gets the new files, or every reason the change is refused.
 */
export function applyOperations(
  current: ReadonlyMap<string, string>,
  operations: readonly Operation[],
  context: { today: string; proposer?: Proposer },
): ApplyResult {
  const diagnostics: Diagnostic[] = [];
  const refuse = (code: Diagnostic["code"], message: string) => diagnostics.push({ code, message });

  if (operations.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "MALFORMED",
          message: "The change has no operations. Say what to add, replace or strike.",
        },
      ],
    };
  }
  if (!isDate(context.today)) throw new Error(`today must be YYYY-MM-DD; it is ${context.today}`);

  const before = parseRecord(current);
  if (before.diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "MALFORMED",
          message:
            "The record as it stands is not valid, so no change can be added to it until it is repaired:",
        },
        ...before.diagnostics,
      ],
    };
  }

  const files = new Map<string, string[]>();
  for (const spec of RECORD_FILES) {
    const content = current.get(spec.file);
    if (content !== undefined) files.set(spec.file, splitLines(content));
  }
  const byId = new Map(before.items.map((i) => [i.id, i]));
  const nextNumber = new Map<ItemKind, number>();
  for (const kind of ITEM_KINDS) {
    nextNumber.set(
      kind,
      Math.max(0, ...before.items.filter((i) => i.kind === kind).map((i) => i.number)) + 1,
    );
  }
  const assigned: (string | undefined)[] = [];
  const touched = new Set<string>();
  const sayBack = new Set<string>();
  const struckNow = new Set<string>();

  const lineAt = (file: string, id: string): number => {
    const lines = files.get(file) ?? [];
    return lines.findIndex((l) => l.startsWith(`- [${id}] `) || l.startsWith(`- ~~[${id}] `));
  };
  const append = (file: string, line: string) => {
    const spec = RECORD_FILES.find((f) => f.file === file)!;
    const lines = files.get(file) ?? splitLines(emptyFile(spec));
    lines.push(line);
    files.set(file, lines);
  };

  operations.forEach((operation, index) => {
    const at = `Operation ${index + 1} (${operation.op})`;
    if (
      context.proposer?.agentRole === "builder" &&
      !(operation.op === "add" && operation.kind === "D")
    ) {
      refuse(
        "NOT_ALLOWED",
        `${at}: a builder may only add decisions (D items). Ask the operator or the planner for anything else.`,
      );
      assigned.push(undefined);
      return;
    }
    switch (operation.op) {
      case "add": {
        assigned.push(undefined);
        if (!(ITEM_KINDS as readonly string[]).includes(operation.kind)) {
          return refuse(
            "MALFORMED",
            `${at}: "${operation.kind}" is not a kind of item. The kinds are ${ITEM_KINDS.join(", ")}.`,
          );
        }
        const number = nextNumber.get(operation.kind)!;
        const id = itemId(operation.kind, number);
        const problem = checkNewItem(at, operation, operation.kind);
        if (problem) return refuse("MALFORMED", problem);
        nextNumber.set(operation.kind, number + 1);
        const marks: Marks = { from: operation.from, date: context.today };
        if (operation.priority) marks.priority = operation.priority;
        if (operation.foundation) marks.foundation = true;
        if (operation.wait) marks.wait = true;
        append(
          FILE_OF_KIND[operation.kind],
          formatItemLine({ id, text: operation.text.trim(), marks }),
        );
        assigned[index] = id;
        touched.add(id);
        return;
      }
      case "replace": {
        assigned.push(undefined);
        const old = byId.get(operation.id);
        if (!old) return refuse("UNKNOWN_ITEM", `${at}: ${operation.id} is not in the record.`);
        if (old.struck || struckNow.has(old.id)) {
          return refuse(
            "NOT_ALLOWED",
            `${at}: ${old.id} is already struck through${old.replacedBy ? ` (replaced by ${old.replacedBy})` : ""}. Replace the live item instead.`,
          );
        }
        if (!operation.reason || operation.reason.trim().length === 0) {
          return refuse("MALFORMED", `${at}: say why ${old.id} is replaced (a reason).`);
        }
        if (/[\r\n]/.test(operation.reason)) {
          return refuse("MALFORMED", `${at}: a reason is one line. Shorten it.`);
        }
        const problem = checkNewItem(at, operation, old.kind);
        if (problem) return refuse("MALFORMED", problem);
        const number = nextNumber.get(old.kind)!;
        const id = itemId(old.kind, number);
        nextNumber.set(old.kind, number + 1);
        const marks: Marks = { from: operation.from, replaces: old.id, date: context.today };
        const priority = operation.priority ?? old.marks.priority;
        if (priority) marks.priority = priority;
        const foundation = operation.foundation ?? old.marks.foundation;
        if (foundation) marks.foundation = true;
        const wait = operation.wait ?? old.marks.wait;
        if (wait) marks.wait = true;
        const lines = files.get(old.file)!;
        const position = lineAt(old.file, old.id);
        lines[position] = formatItemLine({
          ...old,
          struck: { date: context.today, reason: `${operation.reason.trim()} (replaced by ${id})` },
        });
        append(old.file, formatItemLine({ id, text: operation.text.trim(), marks }));
        struckNow.add(old.id);
        assigned[index] = id;
        touched.add(id);
        touched.add(old.id);
        if (needsSayBack(old) || (foundation && old.kind === "D")) sayBack.add(old.id);
        return;
      }
      case "strike": {
        assigned.push(undefined);
        const old = byId.get(operation.id);
        if (!old) return refuse("UNKNOWN_ITEM", `${at}: ${operation.id} is not in the record.`);
        if (old.struck || struckNow.has(old.id)) {
          return refuse("NOT_ALLOWED", `${at}: ${old.id} is already struck through.`);
        }
        if (!operation.reason || operation.reason.trim().length === 0) {
          return refuse(
            "MALFORMED",
            `${at}: say why ${old.id} is dropped (a reason). Dropped items stay, with their reason.`,
          );
        }
        if (/[\r\n]/.test(operation.reason)) {
          return refuse("MALFORMED", `${at}: a reason is one line. Shorten it.`);
        }
        const lines = files.get(old.file)!;
        lines[lineAt(old.file, old.id)] = formatItemLine({
          ...old,
          struck: { date: context.today, reason: operation.reason.trim() },
        });
        struckNow.add(old.id);
        touched.add(old.id);
        if (needsSayBack(old)) sayBack.add(old.id);
        return;
      }
      case "mark": {
        assigned.push(undefined);
        const old = byId.get(operation.id);
        if (!old) return refuse("UNKNOWN_ITEM", `${at}: ${operation.id} is not in the record.`);
        if (old.struck || struckNow.has(old.id)) {
          return refuse(
            "NOT_ALLOWED",
            `${at}: ${old.id} is struck through, so its marks stay as they were.`,
          );
        }
        if (operation.wait !== undefined && old.kind !== "M") {
          return refuse("MALFORMED", `${at}: only a milestone (M) has a wait mark.`);
        }
        if (operation.wait === undefined && operation.confirmed === undefined) {
          return refuse("MALFORMED", `${at}: say which mark to change: wait or confirmed.`);
        }
        const marks: Marks = { ...old.marks };
        if (operation.wait !== undefined) {
          if (operation.wait) marks.wait = true;
          else delete marks.wait;
        }
        if (operation.confirmed) marks.confirmed = context.today;
        const lines = files.get(old.file)!;
        lines[lineAt(old.file, old.id)] = formatItemLine({ ...old, marks });
        touched.add(old.id);
        return;
      }
      default:
        assigned.push(undefined);
        refuse(
          "MALFORMED",
          `${at}: premise does not know this operation. Use add, replace, strike or mark.`,
        );
    }
  });

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const after = new Map<string, string>();
  for (const [file, lines] of files) after.set(file, lines.join("\n") + "\n");
  const result = parseRecord(after);
  if (result.diagnostics.length > 0) return { ok: false, diagnostics: result.diagnostics };

  const changedFiles = [...after.keys()].filter((file) => after.get(file) !== current.get(file));
  return {
    ok: true,
    change: {
      files: after,
      changedFiles,
      assigned,
      touched: [...touched],
      sayBackFor: [...sayBack],
    },
  };
}

function checkNewItem(
  at: string,
  operation: {
    text: string;
    from: string;
    priority?: Priority;
    foundation?: boolean;
    wait?: boolean;
  },
  kind: ItemKind,
): string | undefined {
  if (typeof operation.text !== "string" || operation.text.trim().length === 0) {
    return `${at}: the item needs its text.`;
  }
  if (/[\r\n]/.test(operation.text)) {
    return `${at}: an item is one line. Split it into several items, or shorten it.`;
  }
  if (typeof operation.from !== "string" || operation.from.length === 0) {
    return `${at}: say who it is from: a role such as operator, or assumed.`;
  }
  if (kind === "W" && operation.priority === undefined && !("id" in operation)) {
    return `${at}: a W item needs a priority: must, should or could.`;
  }
  if (kind !== "W" && operation.priority !== undefined) {
    return `${at}: only a W item has a priority.`;
  }
  if (operation.foundation && kind !== "D") return `${at}: only a decision (D) can be foundation.`;
  if (operation.wait && kind !== "M") return `${at}: only a milestone (M) can have a wait.`;
  return undefined;
}
