import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RecordItem } from "../record/format.js";
import type { DraftItem } from "./draft-items.js";

/**
 * Planning and building a change that came in through intake (decisions 0273 and 0274). A change
 * is planned as a change: the planner returns only the decisions it changes or adds, each with its
 * reason, and the task or few tasks it needs. The software's milestones and the tasks already built
 * are not planned, asked or built again. The change's plan is kept beside the software's plan, one
 * file per work item, never over it.
 */

/** A decision the change adds, or one it replaces. */
export interface ChangeDecision {
  text: string;
  reason: string;
  /** The alternative given up; the record needs one for every decision. */
  rejected?: string;
  foundation: boolean;
  /** The decision it replaces, such as "D-6". */
  replaces?: string;
}

export interface ChangeTask {
  title: string;
  items: string[];
  check?: string;
}

export interface ChangePlan {
  ref: string;
  decisions: ChangeDecision[];
  tasks: ChangeTask[];
}

/**
 * What the line keeps about a change on its work item. What the person's words gave is put in the
 * record at once; premise's own additions are only offered (decision 0274).
 */
export interface ChangeNotes {
  /** Record items taken from the change's words, and those premise assumed. */
  items: string[];
  assumed: string[];
  /** premise's own additions: never built unless the person adds them. */
  suggestions: { key: string; text: string; added?: string }[];
  /** Decisions of the change put into the record. */
  decisions?: string[];
  /** The pieces whose plan's decisions are in the record already. */
  landedFor?: number[];
  /** A real choice the person's words left open, in the drafter's words. */
  openChoice?: string;
  /** The drafted What, kept until the drafter's job ends. */
  draft?: DraftItem[];
  /** How the person was told before building: asked once, or told without waiting. */
  decided?: "asked" | "told";
  /** The ask that asked, or the notice that told. */
  ask?: number;
}

/** When premise asks about a change before building it (decision 0274). */
export const CHANGE_QUESTIONS = ["every-change", "when-it-matters", "never"] as const;
export type ChangeQuestions = (typeof CHANGE_QUESTIONS)[number];

export const CHANGE_QUESTION_WORDS: Record<ChangeQuestions, string> = {
  "every-change": "Ask about every change before building it",
  "when-it-matters": "Ask only when it matters; otherwise build and tell me",
  never: "Never ask: build and tell me",
};

export function isChangeQuestions(value: unknown): value is ChangeQuestions {
  return (CHANGE_QUESTIONS as readonly unknown[]).includes(value);
}

/**
 * A change's decision as the record holds it: what was decided, "Reason: ..." and "Rejected: ...".
 * Where the planner gave no alternative, keeping the decision replaced (or doing without) is it.
 */
export function decisionText(d: ChangeDecision, ref: string): string {
  if (/\bReason:/i.test(d.text) && /\bRejected:/i.test(d.text)) return d.text;
  const what = d.text.replace(/[.\s]+$/, "").replace(/[()]/g, "");
  const reason = (d.reason || `the change ${ref} needs it`)
    .replace(/[.\s]+$/, "")
    .replace(/[()]/g, "");
  const rejected = (
    d.rejected || (d.replaces ? `keeping ${d.replaces} as it was` : "doing without it")
  )
    .replace(/[.\s]+$/, "")
    .replace(/[()]/g, "");
  return `${what}. Reason: ${reason}. Rejected: ${rejected}.`;
}

/** Why a change needs the person before it is built; empty when it does not. */
export function reasonsToAsk(
  plan: ChangePlan | null,
  notes: Pick<ChangeNotes, "openChoice">,
  record: readonly RecordItem[],
): string[] {
  const reasons: string[] = [];
  for (const d of plan?.decisions ?? []) {
    const old = d.replaces ? record.find((i) => i.id === d.replaces) : undefined;
    if (old?.marks.foundation) {
      reasons.push(
        `It replaces the foundation decision ${old.id} ("${old.text}"): ${d.reason || d.text}`,
      );
    } else if (d.foundation) {
      reasons.push(`It adds a foundation decision, costly to undo: ${d.text}`);
    }
  }
  if (notes.openChoice) reasons.push(`Your words left a choice open: ${notes.openChoice}`);
  return reasons;
}

function folder(dataFolder: string, softwareId: string): string {
  return join(dataFolder, "plans", softwareId, "changes");
}

export function readChangePlan(
  dataFolder: string,
  softwareId: string,
  itemId: number,
): ChangePlan | null {
  const file = join(folder(dataFolder, softwareId), `${itemId}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ChangePlan;
  } catch {
    return null;
  }
}

export function removeChangePlan(dataFolder: string, softwareId: string, itemId: number): void {
  for (const ext of ["json", "md"])
    rmSync(join(folder(dataFolder, softwareId), `${itemId}.${ext}`), { force: true });
}

export function writeChangePlan(
  dataFolder: string,
  softwareId: string,
  itemId: number,
  plan: ChangePlan,
): void {
  const dir = folder(dataFolder, softwareId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${itemId}.json`), JSON.stringify(plan, null, 2));
  writeFileSync(
    join(dir, `${itemId}.md`),
    [
      `# Plan for the change ${plan.ref}`,
      "",
      "The software's own plan and milestones are not changed by it.",
      "",
      ...(plan.decisions.length
        ? [
            "## Decisions it changes or adds",
            "",
            ...plan.decisions.map(
              (d) =>
                `- ${d.text}${d.replaces ? ` (replaces ${d.replaces})` : ""}${d.foundation ? " [foundation]" : ""}: ${d.reason}`,
            ),
            "",
          ]
        : []),
      "## Tasks",
      "",
      ...plan.tasks.map(
        (t, i) =>
          `${i + 1}. ${t.title}${t.items.length ? ` (serves ${t.items.join(", ")})` : ""}${t.check ? `. Check: ${t.check}` : ""}`,
      ),
      "",
    ].join("\n"),
  );
}

const text = (value: unknown, max = 600): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * What the planner submitted for a change, checked. It gives "items" (the decisions the change
 * changes or adds) and "tasks"; milestones are refused, because a change has none.
 */
export function readChangeSubmission(
  args: Record<string, unknown>,
  context: { ref: string; record: readonly RecordItem[]; maxTasks: number },
): { plan: ChangePlan } | { problems: string[] } {
  const problems: string[] = [];
  const live = new Map(context.record.map((i) => [i.id, i]));
  if (Array.isArray(args.milestones) && args.milestones.length > 0) {
    problems.push(
      `This plan is for the change ${context.ref} only: give no "milestones". The software's milestones stay as they are and are not built again.`,
    );
  }
  const decisions: ChangeDecision[] = [];
  const given = args.items ?? [];
  if (!Array.isArray(given)) {
    problems.push('Give "items" as a list of decisions, or an empty list when none change.');
  } else {
    given.forEach((raw, i) => {
      const v = (typeof raw === "string" ? { text: raw } : (raw ?? {})) as Record<string, unknown>;
      const words = text(v.text).replace(/^\s*\[?D(?:-\d+)?\]?\s*[:.)-]?\s+/, "");
      if (!words) {
        problems.push(`Decision ${i + 1} has no "text".`);
        return;
      }
      const replaces = text(v.replaces, 20).toUpperCase();
      if (replaces) {
        const old = live.get(replaces);
        if (!old || old.kind !== "D") {
          problems.push(
            `Decision ${i + 1} replaces ${replaces}, which is not a live decision in the record.`,
          );
          return;
        }
      }
      const rejected = text(v.rejected) || text(v.alternative);
      decisions.push({
        text: words,
        reason: text(v.reason) || text(v.why),
        ...(rejected && { rejected }),
        foundation:
          v.foundation === true ||
          (replaces ? live.get(replaces)!.marks.foundation === true : false),
        ...(replaces && { replaces }),
      });
    });
  }
  const tasks: ChangeTask[] = [];
  if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
    problems.push(
      `Give "tasks": the task or few tasks the change ${context.ref} needs, each naming the record items it serves.`,
    );
  } else {
    if (args.tasks.length > context.maxTasks) {
      problems.push(
        `A change needs few tasks: give at most ${context.maxTasks}, folding any whose outcome another delivers. If the change is really larger, say so in one line; the sizer can split it.`,
      );
    }
    args.tasks.forEach((raw, i) => {
      const v = (typeof raw === "string" ? { title: raw } : (raw ?? {})) as Record<string, unknown>;
      const title = text(v.title, 300);
      if (!title) {
        problems.push(`Task ${i + 1} has no "title".`);
        return;
      }
      const items = Array.isArray(v.items)
        ? v.items.filter((x): x is string => typeof x === "string").map((x) => x.trim())
        : [];
      const unknown = items.filter((x) => !live.has(x) && x !== context.ref);
      if (unknown.length) {
        problems.push(
          `Task ${i + 1} names ${unknown.join(", ")}, not in the record. Read the record again.`,
        );
      }
      if (!items.some((x) => live.has(x))) {
        problems.push(`Task ${i + 1} serves no record item: name the items it serves in "items".`);
      }
      tasks.push({
        title,
        items: items.filter((x) => live.has(x)),
        ...(text(v.check) && { check: text(v.check) }),
      });
    });
  }
  if (problems.length) return { problems };
  return { plan: { ref: context.ref, decisions, tasks } };
}
