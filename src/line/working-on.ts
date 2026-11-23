import type { Job } from "../queue/work-queue.js";
import type { AnswerFateView, WorkingJobView, WorkingView } from "../shared/api-types.js";
import { stageName } from "../shared/stages.js";
import { type Ask, answerFate, listAsks } from "../storage/asks.js";
import type { Database } from "../storage/database.js";

/**
 * What is being worked on, in plain words (decision 0310; the owner: "a builder is working but I
 * don't know what on, and I also don't know if both my answers will be worked on"). For each job of
 * a software that has not ended: what it is doing, the record items it serves, and the person's
 * answers it carries. And the person's recent answers, each with where it went.
 */

/** Record item words by id, for one software; undefined when the item is not known. */
export type ItemText = (softwareId: string, item: string) => string | undefined;

const LIVE = new Set(["queued", "running", "waiting", "paused"]);

/** How many of the person's recent answers the page lists with where they went. */
export const RECENT_ANSWERS = 6;

function context(job: Job): Record<string, unknown> {
  const c = job.payload.context;
  return c && typeof c === "object" ? (c as Record<string, unknown>) : {};
}

function firstLine(text: string, max = 160): string {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const flat = line.replace(/\s+/g, " ");
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** What one job is doing, in one plain sentence without the agent's name. */
export function jobDoing(job: Job): string {
  const c = context(job);
  const purpose = String(job.payload.purpose ?? c.purpose ?? "");
  const task = c.task as { number?: number; title?: string } | undefined;
  switch (job.kind) {
    case "build": {
      if (purpose === "fix") {
        const evidence = typeof c.evidence === "string" ? c.evidence : "";
        // "W-3 not met: shields are missing" reads as the finding itself.
        const found = firstLine(evidence.replace(/^\s*[A-Z]+-\d+ not met:\s*/, ""));
        return found ? `Fixing what the check found: ${found}` : "Fixing what the check found";
      }
      if (purpose === "proposal") return "Writing a proposal for a part you claimed";
      return task?.title
        ? `Building task ${task.number ?? ""}: ${task.title}`.replace("task : ", "task: ")
        : "Building";
    }
    case "check":
      if (purpose === "scenarios")
        return "Writing the checks from your record, before anything is built";
      if (job.payload.whole === true) return "Checking that the parts work together";
      return typeof c.commit === "string"
        ? `Checking commit ${c.commit.slice(0, 7)} as a user would, item by item`
        : "Checking what was built, as a user would";
    case "run":
      return "Landing the checked change and starting it on this machine";
    case "draft":
      return purpose === "correction"
        ? `Working your chat message into the ${stageName(job.stage ?? "")} list`
        : `Drafting the ${stageName(job.stage ?? "")} list for you to check`;
    case "research":
      return "Looking at what already exists";
    case "plan":
      if (purpose === "review") return "Reviewing the plan's costly choices";
      if (purpose === "revision") return "Revising the plan";
      return "Planning how to build it";
    case "prototype":
      return "Writing a proposal for a part you claimed";
    case "size":
      return "Sizing the work: which steps it needs";
    case "recover":
      return "Reading the existing code to recover its record";
    case "triage":
      return typeof c.number === "number"
        ? `Reading intake item I-${c.number} against the record, to decide where it goes`
        : "Reading an intake item against the record, to decide where it goes";
    case "reading":
      return "Reading a batch of feedback";
    default:
      return stageName(job.stage ?? "") || "Working";
  }
}

/** The record items a job serves, with their words. */
export function jobItems(job: Job, itemText: ItemText): { id: string; text: string }[] {
  const c = context(job);
  const task = c.task as { items?: unknown } | undefined;
  const ids = job.items.length
    ? job.items
    : Array.isArray(task?.items)
      ? (task.items as unknown[]).filter((i): i is string => typeof i === "string")
      : Array.isArray(c.items)
        ? (c.items as unknown[]).filter((i): i is string => typeof i === "string")
        : [];
  return ids.map((id) => ({ id, text: itemText(job.softwareId, id) ?? "" }));
}

/** The person's answers a job carries: in its brief, or given to it. */
export function jobAnswers(job: Job, asks: Ask[]): string[] {
  const c = context(job);
  const inBrief = Array.isArray(c.answers)
    ? (c.answers as unknown[]).filter((a): a is string => typeof a === "string")
    : [];
  const given = asks
    .filter((a) => answerFate(a)?.job === job.id)
    .map((a) => `${a.title} → ${a.answerSummary ?? "answered"}`);
  return [...new Set([...inBrief, ...given])];
}

export function workingJob(job: Job, itemText: ItemText, asks: Ask[]): WorkingJobView {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status as WorkingJobView["status"],
    doing: jobDoing(job),
    items: jobItems(job, itemText),
    answers: jobAnswers(job, asks),
  };
}

/** Where one answer went, in plain words. */
export function fateView(ask: Ask): AnswerFateView | null {
  const fate = answerFate(ask);
  if (!fate || ask.status !== "answered") return null;
  return {
    askId: ask.id,
    title: ask.title,
    answer: ask.answerSummary ?? "",
    answered: ask.answered ?? fate.at,
    state: fate.state,
    to: fate.to,
    ...(fate.intake && { intake: fate.intake }),
  };
}

/** What is being worked on for one software, and where the person's recent answers went. */
export function workingView(
  db: Database,
  jobs: Job[],
  softwareId: string,
  itemText: ItemText,
): WorkingView {
  const asks = listAsks(db, { softwareId });
  const live = jobs.filter((j) => j.softwareId === softwareId && LIVE.has(j.status));
  const answers = asks
    .map(fateView)
    .filter((f): f is AnswerFateView => f !== null)
    .sort((a, b) => b.answered.localeCompare(a.answered) || b.askId - a.askId)
    .slice(0, RECENT_ANSWERS);
  return { jobs: live.map((j) => workingJob(j, itemText, asks)), answers };
}
