import {
  INTAKE_KINDS,
  INTAKE_ROUTES,
  type IntakeKind,
  type IntakeRoute,
  type ShortLine,
  type ShortList,
  type Touch,
} from "./items.js";

/**
 * Reading what the triager submitted (triage_submit), and the rules premise holds it to so a wrong
 * answer cannot send an item where it must never go (decisions 0062, 0094, 0095):
 * - a change of purpose, or anything that touches the floor, is asked of the operator;
 * - only opinions and wishes are held; a bug is never held;
 * - only duplicates and noise are merged or closed;
 * - a question is answered, never built.
 * Every change premise makes is said in a note, which the page shows with the reason.
 */

export interface TriageResult {
  kind: IntakeKind;
  touches: Touch[];
  size: "small" | "medium" | "large";
  touchesFloor: boolean;
  /**
   * Whether building it changes what the software must do (decision 0192). A bug never does: it is
   * something the record already requires, not working, and is built and checked straight away.
   */
  changesWhat: boolean;
  route: IntakeRoute;
  reason: string;
  /** For a duplicate: the number of the item it joins. */
  joins: number | null;
  /** For a question: the answer, from the record. */
  answer: string | null;
  /** What premise changed in the triager's answer, and why. */
  notes: string[];
}

const MAX_REASON = 1000;
const MAX_ANSWER = 3000;
const RECORD_ID = /^[A-Z]-[1-9][0-9]*$/;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function yes(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "yes" || v === "true") return true;
    if (v === "no" || v === "false") return false;
  }
  return undefined;
}

/** An item number from "I-3", "3" or 3. */
export function itemNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const m = /^\s*(?:I-)?([1-9][0-9]*)\s*$/i.exec(value);
    if (m) return Number(m[1]);
  }
  return null;
}

export function readTriage(
  args: Record<string, unknown>,
  context: {
    /** This item's number. */
    number: number;
    /** Numbers of the software's other items, which a duplicate may join. */
    others: ReadonlySet<number>;
    /** Live record item ids. */
    recordIds: ReadonlySet<string>;
  },
): { result: TriageResult } | { problems: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const kind = text(args.kind, 40).toLowerCase().replace(/\s+/g, "-") as IntakeKind;
  if (!(INTAKE_KINDS as readonly string[]).includes(kind)) {
    problems.push(`Give "kind" as one of: ${INTAKE_KINDS.join(", ")}.`);
  }
  let route = text(args.route, 40).toLowerCase().replace(/\s+/g, "-") as IntakeRoute;
  if (!(INTAKE_ROUTES as readonly string[]).includes(route)) {
    problems.push(`Give "route" as one of: ${INTAKE_ROUTES.join(", ")}.`);
  }
  const size = text(args.size, 20).toLowerCase() || "small";
  if (!["small", "medium", "large"].includes(size)) {
    problems.push('Give "size" as small, medium or large.');
  }
  const floor = args.touches_floor === undefined ? false : yes(args.touches_floor);
  if (floor === undefined) problems.push('Give "touches_floor" as yes or no.');
  const reason = text(args.reason, MAX_REASON);
  if (!reason) problems.push('Give "reason": one line on why it goes where it goes.');
  const changes = args.changes_what === undefined ? undefined : yes(args.changes_what);
  if (args.changes_what !== undefined && changes === undefined) {
    problems.push('Give "changes_what" as yes or no.');
  }

  const touches: Touch[] = [];
  const given = args.touches ?? [];
  if (!Array.isArray(given)) {
    problems.push(
      typeof given === "string"
        ? '"touches" came as text. Send it as a JSON list itself, not a text holding a list: "touches": [{"id": "W-3", "reason": "..."}], or [].'
        : 'Give "touches" as a list of {"id": "W-3", "reason": "..."}, or an empty list.',
    );
  } else {
    for (const entry of given) {
      const t = (typeof entry === "string" ? { id: entry } : (entry ?? {})) as Record<
        string,
        unknown
      >;
      const id = text(t.id, 20).toUpperCase();
      const why = text(t.reason, MAX_REASON);
      if (!RECORD_ID.test(id)) {
        problems.push(`"${String(t.id)}" is not a record item ID such as W-3.`);
        continue;
      }
      if (!context.recordIds.has(id)) {
        problems.push(`${id} is not a live item in this software's record. Read the record again.`);
        continue;
      }
      if (!why) {
        problems.push(`Say why the item touches ${id} ("reason").`);
        continue;
      }
      touches.push({ id, reason: why });
    }
  }

  let joins: number | null = null;
  if (kind === "duplicate") {
    joins = itemNumber(args.joins);
    if (joins === null)
      problems.push('A duplicate needs "joins": the item it repeats, such as "I-3".');
    else if (joins === context.number) problems.push("An item cannot join itself.");
    else if (!context.others.has(joins)) {
      problems.push(`I-${joins} is not one of this software's items. Pick one from the list.`);
    }
  }
  const answer = text(args.answer, MAX_ANSWER);
  if (kind === "question" && !answer) {
    problems.push(
      'A question needs "answer": the answer from the record, citing the items it rests on, or plainly that the record does not say.',
    );
  }
  if (problems.length > 0) return { problems };

  // The rules premise holds the triager to.
  if (kind === "duplicate" || kind === "noise") {
    if (route !== "merged-or-closed") {
      notes.push(
        `premise ${kind === "duplicate" ? "merged" : "closed"} it: a ${kind === "duplicate" ? "duplicate joins its item" : "noise item is closed with its reason"}.`,
      );
      route = "merged-or-closed";
    }
  } else if (route === "merged-or-closed") {
    notes.push("premise took it in normally: only duplicates and noise are merged or closed.");
    route = "in-normally";
  }
  if (kind === "question" && route !== "in-normally") {
    notes.push(
      "premise took it in normally: a question is answered from the record, never asked or built.",
    );
    route = "in-normally";
  }
  if (kind === "change-of-purpose" && route !== "asked-at-once") {
    notes.push("premise asks you: only you decide a change of purpose.");
    route = "asked-at-once";
  }
  if (floor && kind !== "question" && route !== "asked-at-once" && route !== "merged-or-closed") {
    notes.push(
      "premise asks you: it touches the floor (data, security, money or acting in someone's name).",
    );
    route = "asked-at-once";
  }
  let changesWhat = kind === "change-of-purpose" || (kind === "wish" && changes !== false);
  if (kind === "bug" && changes === true) {
    notes.push(
      "premise builds and checks it straight away: a bug is something the record already requires that does not work, so what the software must do stays as it is.",
    );
    changesWhat = false;
  }
  if (route === "held" && kind !== "opinion" && kind !== "wish") {
    notes.push(
      `premise took it in normally: a ${kind} is not held; only opinions and some wishes are.`,
    );
    route = "in-normally";
  }
  return {
    result: {
      kind,
      touches,
      size: size as TriageResult["size"],
      touchesFloor: floor === true,
      changesWhat,
      route,
      reason,
      joins,
      answer: kind === "question" ? answer : null,
      notes,
    },
  };
}

/**
 * The short list a reading ends in, from reading_submit. Every line names the items behind it, so
 * the operator sees how many people are asking and can read them; items must be ones this
 * reading read. Going back to Why must come with the items that are the evidence for it.
 */
export function readShortList(
  args: Record<string, unknown>,
  context: { read: ReadonlySet<number> },
): { list: ShortList } | { problems: string[] } {
  const problems: string[] = [];
  const itemsOf = (value: unknown, where: string): number[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      problems.push(`${where}: give "items" as a list of item numbers such as "I-3".`);
      return [];
    }
    const numbers: number[] = [];
    for (const v of value) {
      const n = itemNumber(v);
      if (n === null)
        problems.push(`${where}: "${String(v)}" is not an item number such as "I-3".`);
      else if (!context.read.has(n))
        problems.push(`${where}: I-${n} was not among the items read. Use only the items given.`);
      else if (!numbers.includes(n)) numbers.push(n);
    }
    return numbers;
  };
  const lines = (value: unknown, name: string): ShortLine[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      problems.push(`Give "${name}" as a list of lines, each { "line": "...", "items": ["I-3"] }.`);
      return [];
    }
    return value.slice(0, 10).flatMap((v, index): ShortLine[] => {
      const where = `${name} line ${index + 1}`;
      if (typeof v === "string") {
        const t = text(v, 400);
        if (!t) return [];
        problems.push(
          `${where}: say which items are behind it: { "line": "...", "items": ["I-3"] }.`,
        );
        return [];
      }
      const o = (v ?? {}) as Record<string, unknown>;
      const t = text(o.line ?? o.text, 400);
      if (!t) {
        problems.push(`${where}: give "line", the short sentence.`);
        return [];
      }
      const items = itemsOf(o.items, where);
      if (items.length === 0) problems.push(`${where}: name at least one item behind it.`);
      return [{ text: t, items, decision: null }];
    });
  };
  const wanted = lines(args.wanted, "wanted");
  const recurring = lines(args.recurring, "recurring");
  const purpose = text(args.purpose, MAX_REASON);
  if (!purpose) {
    problems.push(
      'Give "purpose": whether the software\'s purpose or users should change, and why, in one or two lines.',
    );
  }
  const back = args.back_to_why === undefined ? false : yes(args.back_to_why);
  if (back === undefined) problems.push('Give "back_to_why" as yes or no.');
  const notWanted = itemsOf(args.not_wanted, "not_wanted");
  if (back === true && notWanted.length === 0) {
    problems.push(
      'Going back to Why needs its evidence: give "not_wanted", the items that say people do not want what the software does.',
    );
  }
  if (wanted.length === 0 && recurring.length === 0) {
    problems.push('Give at least one line under "wanted" or "recurring".');
  }
  if (problems.length > 0) return { problems };
  return { list: { wanted, recurring, purpose, backToWhy: back === true, notWanted } };
}
