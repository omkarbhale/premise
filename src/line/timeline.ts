import type { IntakeItem } from "../intake/items.js";
import type { Job } from "../queue/work-queue.js";
import type {
  BuildView,
  QueueNoticeView,
  TimelineAsk,
  TimelineEntry,
  TimelineEstimate,
  TimelineGlance,
  TimelineGroup,
  TimelineMark,
  TimelineOverlap,
  TimelineStep,
  TimelineView,
  TimelineWorker,
} from "../shared/api-types.js";
import { STAGE_IDS, type StageId, stageName, whereNow } from "../shared/stages.js";
import type { Ask } from "../storage/asks.js";
import type { Software } from "../storage/softwares.js";
import type { QueueNotes, QueuedChange } from "./line-queue.js";
import {
  type History,
  durationWords,
  estimatePiece,
  ordinal,
  sumEstimates,
} from "./queue-order.js";
import { splitWaitMarker } from "./milestone-wait.js";
import type { WorkItem } from "./work-items.js";

/**
 * The timeline of one software's line (decision 0320): what is done, what runs now and on which
 * step, and everything queued after it in order, each with why it waits and what starts it. Built
 * from what premise already keeps: the work items, the build of the piece being worked on, the
 * jobs, the open asks and the intake items. Pure, so each state can be tested on its own.
 */

const EARLY: readonly StageId[] = ["why", "who", "exists", "what", "say-back", "plan"];

/** Everything the timeline is built from. */
export interface TimelineFacts {
  software: Software;
  /** Every work item of the software, parents before children, siblings in order. */
  items: WorkItem[];
  active: WorkItem;
  /** What the item's line notes say of its parts. */
  children: (item: WorkItem) => "split" | "plan" | "recover" | undefined;
  queueNotes: (item: WorkItem) => QueueNotes;
  /** The queued changes, in the order the line takes them. */
  queued: QueuedChange[];
  /** The open question or notice of a change, by its work item. */
  changeAsk: (item: WorkItem) => number | undefined;
  /** The build of the piece being worked on, once it reaches Build. */
  build: BuildView | null;
  /** The software's jobs that have not ended. */
  jobs: Job[];
  progress: (jobId: number) => string | null;
  jobWords: (job: Job) => string;
  /** The software's open asks. */
  asks: Ask[];
  intake: IntakeItem[];
  milestones: { id: string; text: string; wait: boolean }[];
  history: History;
  groups: { pieces: QueuedChange[]; about: string }[];
  /** A queued milestone and a queued change that touch the same parts. */
  overlaps: TimelineOverlap[];
  notice: QueueNoticeView | null;
  /** Whether the operator paused this software. */
  paused: boolean;
  /** Whether agents can start at all. */
  agentsReady: boolean;
  now: Date;
}

function clean(text: string): string {
  return text.trim().replace(/[.\s]+$/, "");
}

/** "I-2: Crosshair, sounds" → "Crosshair, sounds". */
function withoutRef(title: string, ref: string | null): string {
  const t = title.trim();
  return ref && t.startsWith(`${ref}:`) ? t.slice(ref.length + 1).trim() : t;
}

function doing(stage: string): string {
  const words = whereNow(stage);
  const at = words.indexOf(": ");
  return at >= 0 ? words.slice(at + 2) : words;
}

function stageMark(stage: StageId, current: string, finished: boolean): TimelineMark {
  if (finished) return "done";
  const at = STAGE_IDS.indexOf(current as StageId);
  const here = STAGE_IDS.indexOf(stage);
  if (at < 0) return "todo";
  return here < at ? "done" : here === at ? "running" : "todo";
}

/** The title of a piece of work, in plain words. */
function titleOf(item: WorkItem, facts: TimelineFacts, parts: WorkItem[]): string {
  if (item.parentId === null) return facts.software.name;
  if (item.kind === "milestone") {
    const n = facts.milestones.findIndex((m) => m.id === item.ref);
    const text = clean(splitWaitMarker(item.title ?? item.ref ?? "").text);
    return n >= 0 ? `Milestone ${n + 1}: ${text}` : `Milestone: ${text}`;
  }
  if (item.kind === "intake") {
    const text = clean(withoutRef(item.title ?? "", item.ref));
    if (item.origin === "bug") return `Your fix ${item.ref ?? ""}: ${text}`.replace("  ", " ");
    if (item.origin === "purpose")
      return `A change of purpose ${item.ref ?? ""}: ${text}`.replace("  ", " ");
    return `Your change ${item.ref ?? ""}: ${text}`.replace("  ", " ");
  }
  if (item.origin === "fix")
    return `Fixing what the check of the whole found: ${clean(item.title ?? "")}`;
  const index = parts.findIndex((p) => p.id === item.id);
  return `Part ${index + 1} of ${parts.length}: ${clean(item.title ?? "a part")}`;
}

/** The tasks of a build, as steps. */
function taskSteps(tasks: BuildView["tasks"]): TimelineStep[] {
  return tasks.map((t) => ({
    text: clean(t.title),
    mark:
      t.status === "built"
        ? "done"
        : t.status === "building"
          ? "running"
          : t.status === "waiting-on-person"
            ? "waiting"
            : t.status === "stopped"
              ? "stopped"
              : "todo",
    ...(t.note && t.status !== "built" && { detail: t.note }),
  }));
}

function checkWords(check: BuildView["checks"][number]): { mark: TimelineMark; detail?: string } {
  switch (check.status) {
    case "writing-scenarios":
    case "checking":
      return { mark: "running" };
    case "passed":
      return { mark: "done", detail: "passed" };
    case "not-fully-verified":
      return { mark: "done", detail: "passed what it could check; some could not be checked" };
    case "not-verified":
      return { mark: "done", detail: "nothing could be checked" };
    case "not-passed": {
      const found =
        check.findings.find((f) => f.blocking)?.text ??
        check.verdicts.find((v) => v.verdict === "not-met")?.text;
      return { mark: "done", detail: found ? `not passed: ${clean(found)}` : "not passed" };
    }
    case "waiting-for-tool":
      return {
        mark: "waiting",
        detail: "waiting: it could not use the software for a reason outside it",
      };
    default:
      return { mark: "stopped", detail: "stopped" };
  }
}

/** The steps of the piece being worked on, with Build, its checks and fix rounds spelled out. */
function liveSteps(item: WorkItem, build: BuildView | null): TimelineStep[] {
  const finished = item.state === "done";
  const steps: TimelineStep[] = [];
  for (const stage of item.stages) {
    if (stage === "intake") continue;
    const mark = stageMark(stage, item.currentStage, finished);
    if (stage === "build" && build && !finished) {
      const own = build.tasks.filter((t) => !t.fix);
      const fixes = build.tasks.filter((t) => t.fix);
      const scenarios = build.checks.find((c) => c.status === "writing-scenarios");
      if (scenarios) {
        steps.push({
          text: "Write how the checker will check it, before building",
          mark: "running",
        });
      }
      steps.push({
        text: own.length
          ? `Build: ${own.length === 1 ? "1 task" : `${own.length} tasks`}`
          : "Build",
        // In a fix round the first round's tasks are built already.
        mark:
          (own.length && own.every((t) => t.status === "built")) ||
          (own.length === 0 && build.round > 1)
            ? "done"
            : mark,
        ...(own.length > 0 && { tasks: taskSteps(own) }),
      });
      const checks = build.checks.filter((c) => c.status !== "writing-scenarios");
      checks.forEach((check, i) => {
        const said = checkWords(check);
        steps.push({
          text: `Check, round ${check.round}`,
          mark: said.mark,
          ...(said.detail && { detail: said.detail }),
        });
        const last = i === checks.length - 1;
        if (check.status === "not-passed" && (fixes.length > 0 || last)) {
          const found = said.detail?.replace(/^not passed: /, "") ?? "";
          steps.push({
            text: found ? `Fixing what the check found: ${found}` : "Fixing what the check found",
            mark:
              fixes.length && fixes.every((t) => t.status === "built")
                ? "done"
                : last
                  ? "running"
                  : "done",
            ...(fixes.length > 0 && { tasks: taskSteps(fixes) }),
          });
        }
      });
      continue;
    }
    if (stage === "check" && build && !finished && build.checks.length > 0) continue;
    steps.push({ text: stepName(stage), mark });
  }
  return steps;
}

function stepName(stage: StageId): string {
  switch (stage) {
    case "build":
      return "Build";
    case "check":
      return "Check against what you asked for";
    case "run":
      return "Start it on this machine";
    case "report":
      return "Report what was done";
    default:
      return stageName(stage);
  }
}

/** The step the piece is on, in one line ("Build, task 3 of 7: bots peek corners"). */
function stepLine(item: WorkItem, build: BuildView | null): string {
  if (item.state === "sizing") return "Sizing: deciding how big it is and which steps it needs";
  const stage = item.currentStage;
  if (EARLY.includes(stage as StageId)) return `${stageName(stage)}: ${doing(stage)}`;
  if (stage === "build") {
    if (!build) return "Build: about to start";
    const fixRound = build.round > 1;
    const tasks = build.tasks.filter((t) => t.fix === fixRound);
    const shown = tasks.length ? tasks : build.tasks;
    const at =
      shown.findIndex((t) => t.status === "building") >= 0
        ? shown.findIndex((t) => t.status === "building")
        : shown.findIndex((t) => t.status === "waiting-on-person") >= 0
          ? shown.findIndex((t) => t.status === "waiting-on-person")
          : shown.findIndex((t) => t.status === "waiting-to-start");
    const label = fixRound ? "Fixing what the check found" : "Build";
    if (shown.length === 0) {
      return build.checks.some((c) => c.status === "writing-scenarios")
        ? "Build: writing how the checker will check it, before building"
        : "Build: planning the tasks";
    }
    if (at < 0) return `${label}: all ${shown.length} tasks built`;
    return `${label}, task ${at + 1} of ${shown.length}: ${clean(shown[at]!.title)}`;
  }
  if (stage === "check") {
    return `Check${build ? `, round ${build.round}` : ""}: a separate agent checks it against what you asked for`;
  }
  if (stage === "run") return "Start: starting it on this machine";
  if (stage === "report") return "Report: writing what was done";
  return stageName(stage);
}

function workersOf(ids: Set<number>, facts: TimelineFacts): TimelineWorker[] {
  return facts.jobs
    .filter((j) => ids.has(Number(j.payload.item)))
    .map((j) => ({
      role: facts.jobWords(j),
      status:
        j.status === "running"
          ? ("running" as const)
          : j.status === "queued"
            ? ("queued" as const)
            : ("waiting" as const),
      since: j.started ?? j.created,
      progress: j.status === "running" ? facts.progress(j.id) : null,
    }));
}

function subtree(item: WorkItem, items: WorkItem[]): Set<number> {
  const ids = new Set([item.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of items) {
      if (i.parentId !== null && ids.has(i.parentId) && !ids.has(i.id)) {
        ids.add(i.id);
        grew = true;
      }
    }
  }
  return ids;
}

function blank(
  key: string,
  kind: TimelineEntry["kind"],
  title: string,
  ref: string | null,
): TimelineEntry {
  return {
    key,
    kind,
    title,
    ref,
    state: "queued",
    step: null,
    who: [],
    steps: [],
    why: null,
    startsWhen: null,
    asks: [],
    outcome: null,
    place: null,
    estimate: null,
    queue: null,
    milestone: null,
    finished: null,
  };
}

function askOf(ask: Ask): TimelineAsk {
  return { id: ask.id, title: ask.title, notice: ask.extra.meta?.notice === true };
}

/** The wait before a piece starts, in words: "starts in about 2 hours". */
function waitWords(wait: TimelineEstimate): TimelineEstimate {
  if (!wait.enough) return { ...wait, words: "not enough history yet to say when it starts" };
  if ((wait.minutes ?? 0) === 0) return { ...wait, words: "it is next to start" };
  return { ...wait, words: `starts in about ${durationWords(wait.minutes ?? 0)}` };
}

function lower(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** Build the timeline. */
export function buildTimeline(facts: TimelineFacts): TimelineView {
  const { software, items, active } = facts;
  const root = items.find((i) => i.parentId === null) ?? active;
  const chain = new Set<number>();
  for (let at: WorkItem | undefined = active; at; at = items.find((i) => i.id === at!.parentId)) {
    chain.add(at.id);
    if (at.parentId === null) break;
  }
  const ended = software.state === "ended";
  const done: TimelineEntry[] = [];
  const now: TimelineEntry[] = [];
  const next: TimelineEntry[] = [];
  const placed = new Set<number>();

  // Asks are shown where the work waits: a change's own question at the change, an intake
  // question at its item, the rest at the work running now.
  const asksLeft = [...facts.asks];
  const takeAsks = (match: (a: Ask) => boolean): TimelineAsk[] => {
    const taken = asksLeft.filter(match);
    for (const a of taken) asksLeft.splice(asksLeft.indexOf(a), 1);
    return taken.map(askOf);
  };

  const finishWith = (entry: TimelineEntry, item: WorkItem) => {
    entry.state = item.state === "dropped" ? "dropped" : "done";
    entry.finished = item.finished;
    entry.outcome = item.state === "dropped" ? "Dropped: it will not be built." : "Done.";
    done.push(entry);
  };

  const running = (entry: TimelineEntry, item: WorkItem, ids: Set<number>, line: WorkItem) => {
    entry.state = "running";
    entry.step = stepLine(line, facts.build);
    entry.who = workersOf(ids, facts);
    now.push(entry);
  };

  // 1. Understanding: the software's own Why to Plan.
  const early = root.stages.filter((s) => EARLY.includes(s));
  const children = items.filter((i) => i.parentId === root.id);
  const own = children.filter((c) => c.kind !== "intake" && c.state !== "withdrawn");
  if (early.length > 0) {
    const entry = blank("understand", "understand", "Understanding what you want", null);
    const rootActive = active.id === root.id && EARLY.includes(root.currentStage as StageId);
    const past = !rootActive && (own.length > 0 || !EARLY.includes(root.currentStage as StageId));
    entry.steps = early.map((s) => ({
      text: stageName(s),
      mark: past ? "done" : stageMark(s, root.currentStage, false),
    }));
    if (rootActive && !ended) running(entry, root, new Set([root.id]), root);
    else if (past) {
      entry.state = "done";
      entry.outcome = "Done: what you want is in the record, with the plan.";
      done.push(entry);
    } else next.push(entry);
  }

  // 2. The software's own work: its milestones or parts, or the software built as one.
  const waitingMilestone = software.state === "waiting-milestone";
  /** Queued own work, in order, with whether premise stops after it. */
  const queuedOwn: { entry: TimelineEntry; waitAfter: boolean }[] = [];
  let ownRunning: { entry: TimelineEntry; waitAfter: boolean } | null = null;
  if (own.length > 0) {
    const parts = own.filter((c) => c.kind === "module" || c.origin === "split");
    for (const item of own) {
      const ids = subtree(item, items);
      const kind: TimelineEntry["kind"] =
        item.kind === "milestone" ? "milestone" : item.origin === "fix" ? "fix" : "part";
      const entry = blank(`w${item.id}`, kind, titleOf(item, facts, parts), item.ref);
      placed.add(item.id);
      if (item.state === "done" || item.state === "dropped") {
        finishWith(entry, item);
        continue;
      }
      const milestone = facts.milestones.find((m) => m.id === item.ref);
      if (milestone) entry.milestone = { id: milestone.id, wait: milestone.wait };
      if (chain.has(item.id) && !ended) {
        const split = facts.children(item) === "split";
        if (split) {
          const mine = items.filter((p) => p.parentId === item.id && p.state !== "withdrawn");
          entry.steps = mine.map((p, i) => ({
            text: `Part ${i + 1} of ${mine.length}: ${clean(p.title ?? "")}`,
            mark: p.state === "done" ? "done" : chain.has(p.id) ? "running" : "todo",
            ...(chain.has(p.id) && { tasks: liveSteps(p, facts.build) }),
          }));
          entry.steps.push({
            text: "Check the parts work together",
            mark: active.id === item.id ? "running" : "todo",
          });
        } else entry.steps = liveSteps(item, facts.build);
        running(entry, item, ids, active);
        if (active.id !== item.id && active.parentId === item.id) {
          const mine = items.filter((p) => p.parentId === item.id && p.state !== "withdrawn");
          const n = mine.findIndex((p) => p.id === active.id);
          entry.step = `Part ${n + 1} of ${mine.length}, ${clean(active.title ?? "")}: ${lower(entry.step ?? "")}`;
        }
        if (waitingMilestone) {
          entry.state = "waiting-on-you";
          entry.step = "Stopped after this milestone: try it, then say go on";
          entry.asks = takeAsks((a) => a.extra.meta?.purpose === "milestone-reached");
          // Its work is all done; it waits only for the person.
          entry.steps = entry.steps.map((st) =>
            st.mark === "running" ? { ...st, mark: "done" } : st,
          );
        }
        ownRunning = { entry, waitAfter: waitingMilestone || milestone?.wait === true };
        continue;
      }
      entry.state = "queued";
      entry.estimate = {
        wait: waitWords({ enough: false, minutes: null, sessions: null, words: "" }),
        work: estimatePiece(facts.history, "milestone", item.sizeClass),
      };
      queuedOwn.push({ entry, waitAfter: milestone?.wait === true });
    }
  } else if (root.stages.some((s) => !EARLY.includes(s) && s !== "intake")) {
    // No milestones (yet): the software is built as one piece after the plan.
    const later = root.stages.filter((s) => !EARLY.includes(s) && s !== "intake");
    const rootLater =
      !EARLY.includes(root.currentStage as StageId) && root.currentStage !== "intake";
    const entry = blank("build", "build", `Build ${software.name}`, null);
    if (rootLater && active.id === root.id && !ended) {
      entry.steps = liveSteps({ ...root, stages: later }, facts.build);
      running(entry, root, new Set([root.id]), root);
      if (waitingMilestone) {
        entry.state = "waiting-on-you";
        entry.asks = takeAsks((a) => a.extra.meta?.purpose === "milestone-reached");
      }
      ownRunning = { entry, waitAfter: waitingMilestone };
    } else if (root.currentStage === "intake") {
      entry.state = "done";
      entry.outcome = "Done.";
      done.push(entry);
    } else if (!ended) {
      entry.title = "Build it: the milestones the plan makes";
      entry.why = "The plan is not made yet: it decides what is built, in which milestones.";
      entry.startsWhen = "Starts when you confirm the plan.";
      queuedOwn.push({ entry, waitAfter: false });
    }
  }

  // 3. Changes from intake: done, running, then the queue in the order the line takes it.
  const changes = children.filter((c) => c.kind === "intake");
  const changeEntry = (item: WorkItem): TimelineEntry => {
    const entry = blank(`w${item.id}`, "change", titleOf(item, facts, []), item.ref);
    const together = facts.queueNotes(item).together ?? [];
    if (together.length > 0) {
      entry.queue = {
        workItemId: item.id,
        priority: facts.queueNotes(item).priority ?? "normal",
        canMoveUp: false,
        canMoveDown: false,
        together: [item.ref ?? "", ...together.map((t) => t.ref)].filter(Boolean),
        canSplit: false,
        placement: null,
      };
    }
    const ask = facts.changeAsk(item);
    if (ask !== undefined) entry.asks = takeAsks((a) => a.id === ask);
    for (const i of facts.intake.filter((x) => x.workItemId === item.id && x.askId)) {
      entry.asks.push(...takeAsks((a) => a.id === i.askId));
    }
    return entry;
  };
  for (const item of changes
    .filter((c) => c.state === "done" || c.state === "dropped")
    .sort((a, b) => (a.finished ?? "").localeCompare(b.finished ?? ""))) {
    const entry = changeEntry(item);
    finishWith(entry, item);
    const ran = facts.intake.find((i) => i.workItemId === item.id)?.status === "running";
    if (entry.state === "done" && ran) entry.outcome = "Done: it is in the running software.";
  }
  let changeRunning: { entry: TimelineEntry; remaining: TimelineEstimate } | null = null;
  for (const item of changes.filter((c) => chain.has(c.id) && c.state !== "done")) {
    if (ended) break;
    const entry = changeEntry(item);
    if (active.parentId === item.id) {
      // A change split into steps: each step is a part.
      const mine = items.filter((p) => p.parentId === item.id && p.state !== "withdrawn");
      entry.steps = mine.map((p, i) => ({
        text: `Step ${i + 1} of ${mine.length}: ${clean(p.title ?? "")}`,
        mark: p.state === "done" ? "done" : chain.has(p.id) ? "running" : "todo",
        ...(chain.has(p.id) && { tasks: liveSteps(p, facts.build) }),
      }));
    } else entry.steps = liveSteps(item, facts.build);
    running(entry, item, subtree(item, items), active);
    if (entry.asks.some((a) => !a.notice)) entry.state = "waiting-on-you";
    const work = estimatePiece(facts.history, "change", item.sizeClass);
    const started = Date.parse(item.sized ?? item.created);
    const elapsed = Math.max(0, (facts.now.getTime() - started) / 60_000);
    const remaining: TimelineEstimate = work.enough
      ? {
          enough: true,
          minutes: Math.max(1, Math.round((work.minutes ?? 0) - elapsed)),
          sessions: work.sessions,
          words: "",
        }
      : work;
    entry.estimate = { wait: { ...remaining, words: "running now" }, work };
    changeRunning = { entry, remaining };
    placed.add(item.id);
  }

  // The order of what is queued: feedback on what landed before the milestones not started yet,
  // then those milestones, then anything new (decision 0321).
  const queue = ended ? [] : facts.queued;
  type Queued =
    { own: { entry: TimelineEntry; waitAfter: boolean } } | { change: QueuedChange; index: number };
  const order: Queued[] = [
    ...queue.flatMap((change, index) => (change.before ? [{ change, index }] : [])),
    ...queuedOwn.map((own) => ({ own })),
    ...queue.flatMap((change, index) => (change.before ? [] : [{ change, index }])),
  ];
  const ownStillGoing = ownRunning !== null || queuedOwn.length > 0;
  let prev: { title: string; waitAfter: boolean } | null = changeRunning
    ? { title: changeRunning.entry.title, waitAfter: false }
    : ownRunning
      ? { title: ownRunning.entry.title, waitAfter: ownRunning.waitAfter }
      : null;
  const waits: TimelineEstimate[] = [];
  if (changeRunning) waits.push(changeRunning.remaining);
  if (ownRunning) {
    // What is left of the software's own running work has no estimate yet.
    waits.push({ enough: false, minutes: null, sessions: null, words: "" });
  }
  let place = 0;
  let waitingForGoOn = waitingMilestone;
  for (const at of order) {
    place++;
    if ("own" in at) {
      const { entry, waitAfter } = at.own;
      if (entry.kind !== "build" || entry.why === null) {
        if (prev?.waitAfter) {
          entry.why = `${ordinal(place)} in line. Waits for you to say go on after ${lower(prev.title)}.`;
          entry.startsWhen = "Starts when you say go on.";
          waitingForGoOn = true;
        } else if (prev) {
          entry.why = `${ordinal(place)} in line, after ${lower(prev.title)}: ${entry.kind === "milestone" ? "milestones are built in order" : "one piece at a time"}.`;
          entry.startsWhen = waitingForGoOn
            ? `Starts after you say go on, once ${lower(prev.title)} is done.`
            : `Starts when ${lower(prev.title)} is done.`;
        } else {
          entry.why = "After the plan is confirmed.";
          entry.startsWhen = "Starts when the plan is confirmed.";
        }
      }
      entry.place = place;
      if (entry.estimate) {
        entry.estimate = { wait: waitWords(sumEstimates(waits)), work: entry.estimate.work };
        waits.push(entry.estimate.work);
      } else waits.push({ enough: false, minutes: null, sessions: null, words: "" });
      next.push(entry);
      prev = { title: entry.title, waitAfter };
      continue;
    }
    const { change: q, index } = at;
    const item = q.item;
    const entry = changeEntry(item);
    const notes = facts.queueNotes(item);
    entry.place = place;
    const work = estimatePiece(facts.history, "change", q.size);
    entry.estimate = { wait: waitWords(sumEstimates(waits)), work };
    waits.push(work);
    entry.queue = {
      workItemId: item.id,
      priority: notes.priority ?? "normal",
      canMoveUp: index > 0,
      canMoveDown: index < queue.length - 1,
      together: entry.queue?.together ?? [],
      canSplit: (entry.queue?.together.length ?? 0) > 0,
      placement:
        q.placedBy === "no-milestones"
          ? null
          : { before: Boolean(q.before), by: q.placedBy as "feedback" | "new" | "person" },
    };
    const prior = index > 0 ? queue[index - 1]! : null;
    const shared = prior ? q.touches.some((t) => prior.touches.includes(t)) : false;
    const reason =
      q.placedBy === "feedback"
        ? " It is feedback on what has already landed, so it goes before the milestones not started yet."
        : q.placedBy === "new"
          ? " It asks for something new, so it goes after the software's milestones."
          : q.placedBy === "person"
            ? q.before
              ? " You put it before the milestones not started yet."
              : " You put it after the software's milestones."
            : "";
    const after = prev ? lower(prev.title) : "the work before it";
    if (software.pausedAt) {
      entry.why = `${ordinal(place)} in line. Paused: you paused this software, so nothing new starts.`;
      entry.startsWhen = "Starts in its turn once you resume it.";
    } else {
      entry.why = `${ordinal(place)} in line, after ${after}${shared ? ": both change the same parts" : ""}.${reason}`;
      entry.startsWhen = prev?.waitAfter
        ? `Starts after you say go on after ${after}.`
        : ownStillGoing && !q.before && !prev
          ? "Starts when the software's own work is done."
          : `Starts when ${after} is done.`;
    }
    if (entry.asks.some((a) => !a.notice)) entry.state = "waiting-on-you";
    next.push(entry);
    prev = { title: entry.title, waitAfter: false };
    placed.add(item.id);
  }

  // 4. Items taken in that are not on the line yet: being read, or waiting on your answer.
  const reading = facts.intake
    .filter((i) => i.workItemId === null && ["taken", "triaging", "asked"].includes(i.status))
    .sort((a, b) => a.id - b.id);
  for (const item of reading) {
    const entry = blank(
      `i${item.id}`,
      "intake",
      `I-${item.number}: ${clean(item.text).slice(0, 80)}`,
      `I-${item.number}`,
    );
    if (item.status === "asked") {
      entry.state = "waiting-on-you";
      entry.why = "Waits for your answer: premise is not sure this should be built.";
      entry.startsWhen = "Joins the queue if you say go ahead.";
      entry.asks = takeAsks((a) => a.id === item.askId);
    } else {
      entry.state = "being-read";
      entry.why =
        item.status === "triaging"
          ? "Being read: an agent is working out what it is and what it touches."
          : "Taken in: an agent reads it next.";
      entry.startsWhen = "Joins the queue once it is read, in its turn.";
    }
    next.push(entry);
  }

  // Whatever is left waits at the work running now, or at the first thing next.
  const home = now[0] ?? next[0];
  if (home && asksLeft.length > 0) {
    home.asks.push(...asksLeft.map(askOf));
    if (home.state === "running" && home.asks.some((a) => !a.notice)) home.state = "waiting-on-you";
  }

  const groups: TimelineGroup[] = facts.groups.map((g) => ({
    workItemIds: g.pieces.map((p) => p.workItemId),
    refs: g.pieces.map((p) => p.item.ref ?? ""),
    about: g.about,
  }));
  const total = sumEstimates(queue.map((q) => estimatePiece(facts.history, "change", q.size)));
  const overlaps = ended ? [] : facts.overlaps;
  const view: TimelineView = {
    softwareId: software.id,
    headline: "",
    done,
    now,
    next,
    groups,
    overlaps,
    notice: facts.notice,
    queue: { length: queue.length, total },
  };
  view.headline = headline(view, software, facts);
  return view;
}

function headline(view: TimelineView, software: Software, facts: TimelineFacts): string {
  if (software.state === "ended") return "Ended: nothing more is built unless you send it back.";
  const first = view.now[0];
  const upNext = view.next[0];
  const nextWords = upNext ? ` Next: ${lower(upNext.title)}.` : "";
  if (!first) {
    if (upNext) return `Nothing is running now.${nextWords}`;
    return "Nothing is running and nothing is queued. Say in the conversation what to change next.";
  }
  const paused = facts.paused ? " (paused: nothing new starts)" : "";
  const many = view.now.length > 1 ? ` and ${view.now.length - 1} more side by side` : "";
  const lead = first.state === "waiting-on-you" ? "Waiting on you" : "Now";
  const step = first.step ? ` (${first.step.replace(/[.\s]+$/, "")})` : "";
  return `${lead}: ${first.title}${step}${many}${paused}.${nextWords}`;
}

/** The timeline in one glance, for the software list and Activity. */
export function glanceOf(view: TimelineView): TimelineGlance {
  const first = view.now[0];
  const upNext = view.next[0];
  return {
    now: first ? `${first.title}${first.step ? ` · ${first.step}` : ""}` : null,
    next: upNext
      ? `${upNext.title}${upNext.state === "waiting-on-you" ? " (waits for you)" : ""}`
      : null,
    queue: view.queue.length,
    total: view.queue.length > 0 ? view.queue.total.words : null,
  };
}
