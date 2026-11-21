import type { AskItem, AskKind } from "./api";

/** Plain words for premise's own terms, used wherever the term appears on the page. */
export const TERMS = {
  record:
    "The record is the short list of what was decided about a software (why, who, what, and the technical choices), kept with its code. Each item has an ID such as W-3.",
  sayBack:
    "Say back: before any code is written, premise lists what it understood and assumed. You strike anything wrong.",
  floor:
    "The floor: things premise never does without asking first, such as creating something outside this machine, spending money or deleting data.",
  role: "Each question says which role it is for (for example the operator: whoever decides what the software is for). In this session you answer for every role.",
  intake:
    "Intake: what you say that is not an answer, and problems or wishes reported on the Intake tab, are taken in. An agent reads each against the record: most become new work on the line, a question is answered, and only what needs it is held or asked of you.",
  standIn:
    "Stand-in: a part of premise that does not exist yet, so what you see there is scripted or kept without doing the real work. It is marked wherever it appears.",
  mocked:
    "Mocked: usage-ledger, which will report real usage and cost, does not exist yet. Until it does, these figures are made up so you can see where they will appear.",
} as const;

export const ASK_KIND_LABEL: Record<AskKind, string> = {
  question: "A question",
  draft: "A list to check",
  "say-back": "Say back",
  proposal: "A proposal",
  approval: "Approval needed",
  needed: "Something only a person can do",
};

export function markLabel(item: AskItem): string {
  if (item.mark === "assumed") return "premise assumed";
  if (item.mark === "suggestion") return "premise suggests";
  if (item.mark === "recovered") return "recovered from the code";
  return item.from === "operator" ? "you said" : `from the ${item.from ?? "operator"}`;
}

/** What a job kind means, for the activity list. */
export const JOB_LABEL: Record<string, string> = {
  draft: "Drafting a list",
  research: "Looking at what exists",
  review: "Reviewing a change",
  plan: "Planning",
  build: "Building",
  prototype: "Making a prototype",
  check: "Checking",
  triage: "Reading new items",
  reading: "Reading held items",
  report: "Writing a report",
  run: "Starting the software",
  size: "Sizing the work",
  recover: "Recovering a record from the code",
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
