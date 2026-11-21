import type { AskItem, AskKind } from "./api";

/** Plain words for premise's own terms, used wherever the term appears on the page. */
export const TERMS = {
  record:
    "The record is the short list of what was decided about a software (why, who, what, and the technical choices), kept with its code. Each item has an ID such as W-3.",
  sayBack:
    "Say back: before any code is written, premise lists what it understood and assumed. You strike anything wrong.",
  floor:
    "The floor: things premise never does without asking first, such as creating something outside this machine, spending money or deleting data.",
  role: "A role is a label for who should decide, not an account: the operator decides what the software is for; a designer who claimed a part decides how it looks; someone who holds an outside account does what only they can. In this session you answer for every role.",
  intake:
    "Intake: what you say that is not an answer, and problems or wishes reported on the Intake tab, are taken in. An agent reads each against the record: most become new work on the line, a question is answered, and only what needs it is held or asked of you.",
  standIn:
    "Stand-in: a part of premise that does not exist yet, so what you see there is scripted or kept without doing the real work. It is marked wherever it appears.",
  effort:
    "Effort: how much premise puts into a software. Low builds only what you asked for. Medium adds what premise recommends, in a later milestone. High adds everything premise could add. It also sets how long the steps before building may take. Change it at any time.",
  mocked:
    "Mocked: usage-ledger, which will report real usage and cost, does not exist yet. Until it does, these figures are made up so you can see where they will appear.",
  agentSession:
    "An agent session is one piece of work by an AI agent, such as drafting a list or building one part. It counts work, not money.",
} as const;

/**
 * One short plain gloss for each premise word, shown in place the first time the word appears on
 * the page (see Define), and in the Help glossary.
 */
export const GLOSS = {
  waitingOnYou: "the questions premise needs you to answer",
  agent: "an AI worker premise gives one job to",
  scriptedAgents: "stand-in workers that follow a fixed script and call no AI",
  step: "one of the eleven stages of the work, from Why to Report",
  line: "the steps a software goes through, from idea to running",
  record:
    "a short list of what was decided about the software, kept with its code; each item has an ID such as W-3",
  milestone: "a stopping point that ends with running software and a report",
  intake: "where what you say after it runs, such as a problem or a wish, is taken in",
  approval: "premise asks before it does anything outside this machine",
  standIn: "a part that is not built yet, so it is scripted and marked",
  mocked: "made-up figures, until usage-ledger exists to measure the real ones",
  usage: "how much of your Claude plan the work used",
  sayBack: "premise lists what it understood and assumed so you can strike what is wrong",
} as const;

export type GlossTerm = keyof typeof GLOSS;

export const ASK_KIND_LABEL: Record<AskKind, string> = {
  question: "A question",
  draft: "A list to check",
  "say-back": "Say back",
  proposal: "A proposal",
  approval: "Approval needed",
  needed: "Something only a person can do",
  scope: "How much to build",
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
  prototype: "Writing a proposal for a claimed part",
  check: "Checking",
  size: "Sizing the work",
  triage: "Reading new items",
  reading: "Reading held items",
  report: "Writing a report",
  run: "Starting the software",
  recover: "Recovering a record from the code",
};

/** A label for a kind of job, starting with a capital even for kinds premise has no words for. */
export function jobLabel(kind: string): string {
  return JOB_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

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
