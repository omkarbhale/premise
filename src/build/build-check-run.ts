import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentOutcome } from "../agents/agent-runner.js";
import type { ToolBinding, ToolEnvelope } from "../agents/tool-server.js";
import { toolFail, toolOk } from "../agents/tool-server.js";
import {
  EVIDENCE_FOLDER,
  branchFor,
  evidencePath,
  workingCopyPath,
} from "../agents/working-copy.js";
import type { PremiseConfig } from "../config/settings.js";
import type { Briefs } from "../line/briefs.js";
import type { LaterEntry, LaterOutcome, LaterStages, MilestoneRef } from "../line/later-stages.js";
import type { EnqueueInput, Job, WorkQueue } from "../queue/work-queue.js";
import { type RecordItem, formatItemLine } from "../record/format.js";
import { formatTrailerFailures } from "../record/trace.js";
import type { RecordKeeper } from "../record/record-keeper.js";
import type { Runner } from "../runner/runner.js";
import type {
  AskAnswer,
  BuildTaskView,
  BuildView,
  CheckView,
  VerdictValue,
} from "../shared/api-types.js";
import { type Ask, createAsk, listAsks } from "../storage/asks.js";
import { addChatMessage } from "../storage/chat.js";
import { type Database, now, recordEvent } from "../storage/database.js";
import { RecordWriter } from "../line/record-writer.js";

/**
 * Build, Check and Run, for one milestone at a time (docs/architecture/build-check-run.md,
 * decisions 0086-0092, 0122, 0186):
 *
 * - Build: the checker first writes its scenarios from the record (0122); then each task of the
 *   milestone's working plan is one builder job, in its own working copy on a branch of its own,
 *   starting from the commit the task before it made. The server checks what each job left (a
 *   commit with the trace trailer) and pushes its branch into the software's repository. A task
 *   whose builder asked a person waits; the others go on.
 * - Check: a fresh checker session, in its own clone of the exact commit, judges each item with
 *   evidence. A must item not met goes back to the builder as a new task with the evidence, up to
 *   line.check_rounds_before_stop rounds.
 * - Run: the server, never an agent, merges the checked commit, pushes it, and the runner starts
 *   it. The reporter then writes the milestone's report (the line engine has it do so).
 *
 * The orchestration's own notes are kept in the database (settings key build:<software>), so a
 * restart in the middle of a stage carries on.
 */

type TaskStatus = "pending" | "building" | "built" | "waiting" | "stopped";

interface TaskState {
  number: number;
  title: string;
  items: string[];
  /** What done looks like, from the plan. */
  check: string | null;
  /** Made from the checker's evidence. */
  fix: boolean;
  evidence: string | null;
  status: TaskStatus;
  job: number | null;
  /** The last failure premise found in the task's result, and how often in a row. */
  lastFailure: string | null;
  sameFailures: number;
  commit: string | null;
  branch: string | null;
  note: string | null;
  /** The agent's question the task waits on. */
  ask: number | null;
  answers: string[];
}

interface CheckState {
  round: number;
  job: number | null;
  commit: string;
  status: CheckView["status"];
  when: string;
}

interface BuildState {
  milestone: string | null;
  milestoneText: string | null;
  run: number;
  round: number;
  /** The commit the milestone started from. */
  base: string | null;
  scenariosDone: boolean;
  tasks: TaskState[];
  /** The latest built commit, which the next task and the check start from. */
  head: { commit: string; branch: string } | null;
  /** Rounds each item failed in this milestone. */
  failures: Record<string, number>;
  checks: CheckState[];
  /** The checker's corrections to how to build, start or check the software. */
  checkNotes: string[];
  landed: { commit: string; when: string; milestone: string | null } | null;
  /** Record changes builders proposed in this milestone, landed with it. */
  proposals: number[];
  /** Stopped tasks the operator chose to leave. */
  leftStopped: boolean;
}

interface StoredPlan {
  decisions?: { text: string }[];
  milestones: { text: string }[];
  tasks: { title: string; items: string[]; check?: string; milestone?: number }[];
  kind?: string;
  how_to_run?: string;
}

interface StoredScenario {
  name: string;
  items: string[];
  steps: string[];
  expected: string;
  milestone: string | null;
  job: number;
  written: string;
}

export interface BuildCheckRunDeps {
  db: Database;
  queue: WorkQueue;
  config: PremiseConfig;
  keeper: RecordKeeper;
  briefs: Briefs;
  /** Starts the landed commit; absent in tests that do not run software. */
  runner?: Runner;
}

const KEY = (softwareId: string) => `build:${softwareId}`;

const TASK_STOPPED = ["Try the stopped tasks again", "Check what was built"] as const;
const CHECK_STOPPED = ["Give it more rounds", "Land it as it is"] as const;
const CHECK_PROBLEM = ["Check again", "Build again"] as const;
const LAND_PROBLEM = ["Try landing again", "Build again"] as const;

const PURPOSES = [
  "build-task-stopped",
  "build-check-stopped",
  "build-check-problem",
  "build-land-problem",
] as const;
type Purpose = (typeof PURPOSES)[number];

function short(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "none";
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "scenario"
  );
}

function folderName(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_") || "_";
}

export class BuildCheckRun implements LaterStages {
  readonly standIn = false;
  private readonly writer: RecordWriter;

  constructor(private readonly deps: BuildCheckRunDeps) {
    this.writer = new RecordWriter(deps.keeper);
    // The checker's scenarios folder exists before any builder starts, so every builder's session
    // settings deny it by name (decisions 0090, 0153).
    mkdirSync(join(deps.config.data.folder, "scenarios"), { recursive: true });
  }

  private get db(): Database {
    return this.deps.db;
  }
  private get config(): PremiseConfig {
    return this.deps.config;
  }

  // ---- State ----------------------------------------------------------------------------------

  private load(softwareId: string): BuildState | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY(softwareId)) as
      { value: string } | undefined;
    return row ? (JSON.parse(row.value) as BuildState) : null;
  }

  private save(softwareId: string, state: BuildState): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, changed) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, changed = excluded.changed`,
      )
      .run(KEY(softwareId), JSON.stringify(state), now());
  }

  reset(softwareId: string): void {
    const state = this.load(softwareId);
    if (!state) return;
    // What landed stays known; the work in progress is forgotten.
    this.save(softwareId, {
      ...this.fresh(state.run, null),
      landed: state.landed,
      checkNotes: state.checkNotes,
    });
  }

  private fresh(run: number, milestone: MilestoneRef | null): BuildState {
    return {
      milestone: milestone?.id ?? null,
      milestoneText: milestone?.text ?? null,
      run,
      round: 1,
      base: null,
      scenariosDone: false,
      tasks: [],
      head: null,
      failures: {},
      checks: [],
      checkNotes: [],
      landed: null,
      proposals: [],
      leftStopped: false,
    };
  }

  private say(softwareId: string, text: string): void {
    addChatMessage(this.db, { softwareId, author: "premise", text });
  }

  // ---- The plan and the record ---------------------------------------------------------------

  private plan(softwareId: string): StoredPlan {
    const file = join(this.config.data.folder, "plans", softwareId, "plan.json");
    if (!existsSync(file)) return { milestones: [], tasks: [] };
    try {
      return (
        (JSON.parse(readFileSync(file, "utf8")) as StoredPlan | null) ?? {
          milestones: [],
          tasks: [],
        }
      );
    } catch {
      return { milestones: [], tasks: [] };
    }
  }

  private items(softwareId: string): RecordItem[] {
    try {
      return this.deps.keeper.list(softwareId);
    } catch {
      return [];
    }
  }

  private milestoneIds(softwareId: string): { id: string; text: string }[] {
    try {
      return this.deps.keeper.effortPlan(softwareId).milestones;
    } catch {
      return [];
    }
  }

  /**
   * Which record milestone each plan task belongs to (decision 0186): the one it names, matched by
   * the planner's milestone text; otherwise task 1 goes to the first milestone, task 2 to the
   * second, and every task after that to the last.
   */
  private tasksByMilestone(softwareId: string): Map<string, StoredPlan["tasks"]> {
    const plan = this.plan(softwareId);
    const milestones = this.milestoneIds(softwareId);
    const byId = new Map<string, StoredPlan["tasks"]>(milestones.map((m) => [m.id, []]));
    if (milestones.length === 0) return byId;
    plan.tasks.forEach((task, index) => {
      let target: string | undefined;
      if (typeof task.milestone === "number") {
        const text = plan.milestones[task.milestone - 1]?.text;
        target = milestones.find((m) => m.text === text)?.id ?? milestones[task.milestone - 1]?.id;
      }
      target ??= milestones[Math.min(index, milestones.length - 1)]!.id;
      byId.get(target)!.push(task);
    });
    return byId;
  }

  /**
   * The items a check judges: those the milestone's tasks serve, plus every must item served by a
   * milestone already landed, so nothing that worked is broken unseen. Items planned for a later
   * milestone are not judged yet (decision 0186).
   */
  itemsToCheck(softwareId: string, milestone: string | null): string[] {
    const live = this.items(softwareId);
    const known = new Set(live.map((i) => i.id));
    const must = new Set(
      live
        .filter((i) => i.kind === "W" && i.marks.priority === "must" && !i.marks.leftOut)
        .map((i) => i.id),
    );
    const order = this.milestoneIds(softwareId).map((m) => m.id);
    const at = milestone ? order.indexOf(milestone) : order.length - 1;
    const byMilestone = this.tasksByMilestone(softwareId);
    const own = new Set<string>();
    const earlier = new Set<string>();
    order.forEach((id, i) => {
      for (const task of byMilestone.get(id) ?? []) {
        for (const item of task.items) {
          if (!known.has(item)) continue;
          if (i === at) own.add(item);
          else if (i < at && must.has(item)) earlier.add(item);
        }
      }
    });
    if (own.size === 0) {
      if (at === order.length - 1 || order.length === 0) must.forEach((m) => own.add(m));
      else if (milestone && known.has(milestone)) own.add(milestone);
    }
    return [...new Set([...own, ...earlier])];
  }

  private itemLines(softwareId: string, ids: readonly string[]): string {
    const items = this.items(softwareId);
    return ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is RecordItem => Boolean(i))
      .map((i) => formatItemLine(i))
      .join("\n");
  }

  private recordText(softwareId: string): string {
    return this.items(softwareId)
      .map((i) => formatItemLine(i))
      .join("\n");
  }

  private isMust(softwareId: string, id: string): boolean {
    const item = this.items(softwareId).find((i) => i.id === id);
    if (!item) return true;
    return item.kind !== "W" || item.marks.priority === "must";
  }

  // ---- Scenarios ------------------------------------------------------------------------------

  private scenarioFolder(softwareId: string): string {
    return join(this.config.data.folder, "scenarios", folderName(softwareId));
  }

  private scenarios(softwareId: string): StoredScenario[] {
    const folder = this.scenarioFolder(softwareId);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(folder, f), "utf8")) as StoredScenario;
        } catch {
          return null;
        }
      })
      .filter((s): s is StoredScenario => s !== null);
  }

  private scenarioText(softwareId: string, items: readonly string[]): string {
    const wanted = new Set(items);
    return this.scenarios(softwareId)
      .filter((s) => s.items.length === 0 || s.items.some((i) => wanted.has(i)))
      .map(
        (s) =>
          `Scenario "${s.name}" (checks ${s.items.join(", ") || "no named item"}):\n${s.steps
            .map((step, i) => `  ${i + 1}. ${step}`)
            .join("\n")}\n  Expected: ${s.expected}`,
      )
      .join("\n\n");
  }

  // ---- Entering stages ------------------------------------------------------------------------

  /**
   * Opens a stage for a milestone. This module queues the stage's jobs itself, so it knows each
   * job's id; it returns null while the stage is under way (it ends through finished() or
   * answered()) and an empty list when the stage has nothing to do.
   */
  jobs(entry: LaterEntry): EnqueueInput[] | null {
    const { softwareId, stage, milestone } = entry;
    let state = this.load(softwareId);
    if (stage === "build") {
      const fixRound =
        entry.why === "check not passed" &&
        state !== null &&
        state.milestone === (milestone?.id ?? null);
      if (!fixRound) {
        const before = state;
        state = this.fresh(entry.run, milestone);
        state.landed = before?.landed ?? null;
        state.checkNotes = before?.checkNotes ?? [];
        state.base = this.repositoryHead(softwareId);
        state.tasks = this.planTasks(softwareId, milestone);
      }
      const current = state!;
      current.run = entry.run;
      this.save(softwareId, current);
      if (!fixRound && !this.scenariosCover(softwareId, milestone)) {
        this.enqueue(softwareId, current, this.scenarioJob(softwareId, current));
        return null;
      }
      current.scenariosDone = true;
      this.save(softwareId, current);
      const outcome = this.progress(softwareId, current);
      return outcome.kind === "next" ? [] : null;
    }
    if (!state) state = this.fresh(entry.run, milestone);
    state.run = entry.run;
    this.save(softwareId, state);
    if (stage === "check") {
      if (!state.head) {
        this.nothingBuilt(softwareId, state);
        return null;
      }
      this.startCheck(softwareId, state);
      return null;
    }
    if (stage === "run") {
      if (!state.head) {
        this.nothingBuilt(softwareId, state);
        return null;
      }
      this.enqueue(softwareId, state, {
        softwareId,
        kind: "run",
        stage: "run",
        payload: { commit: state.head.commit, branch: state.head.branch },
      });
      return null;
    }
    return [];
  }

  private startCheck(softwareId: string, state: BuildState): void {
    const input = this.checkJob(softwareId, state);
    const job = this.enqueue(softwareId, state, input);
    state.checks[state.checks.length - 1]!.job = job;
    this.save(softwareId, state);
  }

  private nothingBuilt(softwareId: string, state: BuildState): void {
    this.save(softwareId, state);
    createAsk(this.db, {
      softwareId,
      role: "operator",
      kind: "question",
      stage: "build",
      title: "Nothing was built to check",
      instruction:
        "No task of this milestone produced a commit, so there is nothing to check or start. Try the tasks again, or send the software back to Plan from the Line tab.",
      extra: {
        choices: [...TASK_STOPPED],
        meta: { purpose: "build-task-stopped" satisfies Purpose },
      },
    });
  }

  private repositoryHead(softwareId: string): string | null {
    const repo = this.deps.keeper.repositoryPath(softwareId);
    if (!existsSync(join(repo, ".git"))) return null;
    return this.deps.keeper.git.headCommit(repo) ?? null;
  }

  private planTasks(softwareId: string, milestone: MilestoneRef | null): TaskState[] {
    const byMilestone = this.tasksByMilestone(softwareId);
    const planned = milestone
      ? (byMilestone.get(milestone.id) ?? [])
      : [...byMilestone.values()].flat();
    const known = new Set(this.items(softwareId).map((i) => i.id));
    const tasks = planned.length
      ? planned
      : [
          {
            title: milestone ? `${milestone.text}` : "The smallest version that runs, with run.md",
            items: milestone ? [milestone.id] : [],
          },
        ];
    return tasks.map((t, i) =>
      this.task(
        i + 1,
        t.title,
        t.items.filter((x) => known.has(x)),
        t.check ?? null,
      ),
    );
  }

  private task(
    number: number,
    title: string,
    items: string[],
    check: string | null,
    fix: { evidence: string } | null = null,
  ): TaskState {
    return {
      number,
      title,
      items,
      check,
      fix: fix !== null,
      evidence: fix?.evidence ?? null,
      status: "pending",
      job: null,
      lastFailure: null,
      sameFailures: 0,
      commit: null,
      branch: null,
      note: null,
      ask: null,
      answers: [],
    };
  }

  private scenariosCover(softwareId: string, milestone: MilestoneRef | null): boolean {
    const items = this.itemsToCheck(softwareId, milestone?.id ?? null);
    const covered = new Set(this.scenarios(softwareId).flatMap((s) => s.items));
    return items.every((i) => covered.has(i));
  }

  private budgetText(kind: "build" | "check"): string {
    const task = this.config.agents.tasks[kind];
    return `${task.max_turns} agent turns and ${task.max_minutes} minutes`;
  }

  private howToRun(softwareId: string): string {
    const plan = this.plan(softwareId);
    return (
      plan.how_to_run?.trim() || "The plan says nothing more; work it out and write it in run.md."
    );
  }

  private kind(softwareId: string): string {
    return (
      this.plan(softwareId).kind?.trim() ||
      "not named in the plan: read run.md and the decisions to see what it is"
    );
  }

  private scenarioJob(softwareId: string, state: BuildState): EnqueueInput {
    const items = this.itemsToCheck(softwareId, state.milestone);
    return {
      softwareId,
      kind: "check",
      stage: "build",
      items,
      payload: {
        purpose: "scenarios",
        brief: this.deps.briefs.make(
          "scenario brief",
          {
            software_name: this.name(softwareId),
            record: this.recordText(softwareId),
            items_to_check: this.itemLines(softwareId, items),
            kind: this.kind(softwareId),
          },
          softwareId,
        ),
        context: {
          stage: "build",
          name: this.name(softwareId),
          purpose: "scenarios",
          items,
          milestone: state.milestone,
        },
      },
    };
  }

  private name(softwareId: string): string {
    const row = this.db.prepare("SELECT name FROM softwares WHERE id = ?").get(softwareId) as
      { name: string } | undefined;
    return row?.name ?? softwareId;
  }

  /** Queue the next task waiting to start, and say which. Null when none waits to start. */
  private nextTaskJob(softwareId: string, state: BuildState): EnqueueInput | null {
    const task = state.tasks.find((t) => t.status === "pending");
    if (!task) return null;
    const answers = task.answers.length
      ? `\n\nAnswers a person gave to the questions asked for this task:\n${task.answers.map((a) => `- ${a}`).join("\n")}`
      : "";
    const retry = task.lastFailure && task.note ? `\n\nYour previous attempt: ${task.note}` : "";
    const ref = state.head?.commit ?? state.base ?? undefined;
    // The exact trailer line, in the brief and in the working copy's commit hook (decision 0192).
    const trace = task.items.length
      ? `${this.config.record.trailer}: ${task.items.join(", ")}`
      : undefined;
    task.status = "building";
    task.job = null;
    this.save(softwareId, state);
    return {
      softwareId,
      kind: "build",
      stage: "build",
      items: task.items,
      payload: {
        purpose: task.fix ? "fix" : "task",
        task: task.number,
        round: state.round,
        ...(ref && { ref }),
        repository: this.deps.keeper.repositoryPath(softwareId),
        ...(trace && { trace }),
        brief:
          this.deps.briefs.make(
            "build task brief",
            {
              trace:
                trace ??
                `${this.config.record.trailer}: followed by the IDs of the record items the commit serves`,
              software_name: this.name(softwareId),
              task: `${task.number}. ${task.title}${task.check ? `\nDone looks like: ${task.check}` : ""}`,
              items:
                this.itemLines(softwareId, task.items) || "none named; serve the task as written",
              record: this.recordText(softwareId),
              working_copy: "the folder you start in",
              branch: "the branch you start on, made for this task",
              registries: this.config.agents.network.allowed_domains.join(", "),
              earlier_rounds: task.evidence ?? "none",
              how_to_run: [
                this.howToRun(softwareId),
                ...state.checkNotes.map((n) => `The checker noted: ${n}`),
              ].join("\n"),
              budget: this.budgetText("build"),
            },
            softwareId,
          ) +
          answers +
          retry,
        context: {
          stage: "build",
          name: this.name(softwareId),
          purpose: task.fix ? "fix" : "task",
          task: { number: task.number, title: task.title, items: task.items, check: task.check },
          evidence: task.evidence,
          answers: task.answers,
          milestone: state.milestone,
          round: state.round,
        },
      },
    };
  }

  private enqueue(softwareId: string, state: BuildState, input: EnqueueInput): number {
    const id = this.deps.queue.enqueue({
      ...input,
      payload: { ...input.payload, run: state.run, milestone: state.milestone },
    });
    return id;
  }

  private checkJob(softwareId: string, state: BuildState): EnqueueInput {
    const items = this.itemsToCheck(softwareId, state.milestone);
    const commit = state.head!.commit;
    state.checks.push({ round: state.round, job: null, commit, status: "checking", when: now() });
    this.save(softwareId, state);
    return {
      softwareId,
      kind: "check",
      stage: "check",
      items,
      payload: {
        purpose: "check",
        commit,
        ref: commit,
        round: state.round,
        repository: this.deps.keeper.repositoryPath(softwareId),
        brief: this.deps.briefs.make(
          "check brief",
          {
            software_name: this.name(softwareId),
            commit,
            record: this.recordText(softwareId),
            items_to_check: this.itemLines(softwareId, items),
            scenarios:
              this.scenarioText(softwareId, items) || "none were written; judge from the record",
            kind: this.kind(softwareId),
            working_copy: "the folder you start in, a clean copy of that commit",
            evidence_folder: `${EVIDENCE_FOLDER}/ inside your working copy (premise keeps it)`,
            check_notes: state.checkNotes.join("\n") || "none",
            budget: this.budgetText("check"),
          },
          softwareId,
        ),
        context: {
          stage: "check",
          name: this.name(softwareId),
          purpose: "check",
          commit,
          items,
          milestone: state.milestone,
          round: state.round,
          scenarios: this.scenarios(softwareId).filter((s) =>
            s.items.some((i) => items.includes(i)),
          ),
        },
      },
    };
  }

  // ---- Jobs ending ----------------------------------------------------------------------------

  finished(job: Job): LaterOutcome {
    const state = this.load(job.softwareId);
    if (!state) return { kind: "next" };
    switch (job.stage) {
      case "build":
        return job.payload.purpose === "scenarios"
          ? this.scenariosEnded(job, state)
          : this.taskEnded(job, state);
      case "check":
        return this.checkEnded(job, state);
      case "run":
        return this.runEnded(job, state);
      default:
        return { kind: "next" };
    }
  }

  private scenariosEnded(job: Job, state: BuildState): LaterOutcome {
    state.scenariosDone = true;
    const written = this.scenarios(job.softwareId).filter((s) => s.job === job.id).length;
    this.say(
      job.softwareId,
      job.status === "done"
        ? `The checker wrote ${written} ${written === 1 ? "scenario" : "scenarios"} from the record, kept where builders cannot read them. Building starts now.`
        : `The checker could not write its scenarios first (${job.result ?? "no reason given"}). Building goes on; the check will judge from the record alone.`,
    );
    this.save(job.softwareId, state);
    return this.progress(job.softwareId, state);
  }

  private taskEnded(job: Job, state: BuildState): LaterOutcome {
    const task = state.tasks.find((t) => t.job === job.id);
    if (!task) return { kind: "wait" };
    const id = job.softwareId;
    const asked = listAsks(this.db, { softwareId: id, status: "open" }).find(
      (a) => a.extra.meta?.purpose === "agent" && a.extra.meta?.job === job.id,
    );
    if (asked) {
      task.status = "waiting";
      task.ask = asked.id;
      task.note = `Waiting for your answer: ${asked.title}`;
      this.say(
        id,
        `Task ${task.number} waits for your answer under Waiting on you; the other tasks go on.`,
      );
    } else if (job.status === "done") {
      const result = this.inspect(job, state);
      if ("unchanged" in result) {
        task.status = "built";
        task.commit = state.head?.commit ?? null;
        task.note =
          "Nothing new was needed: the builder found it already done. The check judges it.";
        this.say(
          id,
          `Task ${task.number} of ${state.tasks.length} needed no change: the builder found it already done by an earlier task. The check will judge it.`,
        );
      } else if ("commit" in result) {
        task.status = "built";
        task.commit = result.commit;
        task.branch = result.branch;
        task.note = null;
        state.head = { commit: result.commit, branch: result.branch };
        this.say(
          id,
          task.fix
            ? `The fix is built: commit ${short(result.commit)}. It is checked again in a fresh session.`
            : `Task ${task.number} of ${state.tasks.length} is built: commit ${short(result.commit)}.`,
        );
      } else {
        this.taskFailed(id, state, task, result.signature, result.message);
      }
    } else {
      task.status = "stopped";
      task.note =
        job.status === "stopped"
          ? "It was stopped."
          : `It stopped: ${job.result ?? "no reason was given"}`;
      this.say(id, `Task ${task.number} stopped. ${task.note}`);
    }
    this.save(id, state);
    return this.progress(id, state);
  }

  /** premise's own look at what a build job left: a commit, traced, pushed into the repository. */
  private inspect(
    job: Job,
    state: BuildState,
  ):
    | { commit: string; branch: string }
    | { unchanged: true }
    | { signature: string; message: string } {
    const { keeper } = this.deps;
    const copy = workingCopyPath(this.config.data.folder, job.softwareId, job.id);
    const branch = branchFor(job.id);
    if (!existsSync(join(copy, ".git"))) {
      return {
        signature: "no-working-copy",
        message: "The builder's working copy is not there, so nothing it did can be used.",
      };
    }
    const from = (typeof job.payload.ref === "string" ? job.payload.ref : null) ?? state.base;
    let commits;
    try {
      commits = keeper.git.log(copy, from ? [branch, "--not", from] : [branch]);
    } catch {
      return {
        signature: "no-branch",
        message: `The builder's branch ${branch} is missing from its working copy.`,
      };
    }
    if (commits.length === 0) {
      // Nothing to commit can be right: an earlier task may already have done this one. The
      // builder says so with task_finish "done"; the check still judges the result (0184).
      if (this.finishedDone(job.id)) return { unchanged: true };
      return {
        signature: "no-commit",
        message: "The builder finished without committing anything.",
      };
    }
    const failures = keeper.checkCommits(copy, commits);
    if (failures.length > 0) {
      return {
        signature: "trace",
        message: `Its commits do not name the record items they serve:\n${formatTrailerFailures(failures)}`,
      };
    }
    try {
      keeper.git.push(copy, "origin", branch);
    } catch (error) {
      return {
        signature: "push",
        message: `premise could not take the commit into the software's repository: ${(error as Error).message}`,
      };
    }
    return { commit: keeper.git.log(copy, [branch, "-1"])[0]!.sha, branch };
  }

  /** The builder ended its job with task_finish "done" (an event the tool server records). */
  private finishedDone(jobId: number): boolean {
    const rows = this.db
      .prepare(
        "SELECT detail FROM events WHERE module = 'agent-tools' AND kind = 'tool-call' AND reference = ?",
      )
      .all(String(jobId)) as { detail: string }[];
    return rows.some((r) => {
      const d = JSON.parse(r.detail) as {
        tool?: string;
        ok?: boolean;
        input?: { status?: string };
      };
      return d.tool === "task_finish" && d.ok === true && d.input?.status === "done";
    });
  }

  private taskFailed(
    softwareId: string,
    state: BuildState,
    task: TaskState,
    signature: string,
    message: string,
  ): void {
    const same = task.lastFailure === signature ? task.sameFailures + 1 : 1;
    task.lastFailure = signature;
    task.sameFailures = same;
    task.note = message;
    const limit = this.config.queue.same_failure_limit;
    if (same >= limit) {
      task.status = "stopped";
      task.note = `The same problem ${same} times: ${message}`;
      this.say(softwareId, `Task ${task.number} stopped. ${task.note}`);
      return;
    }
    task.status = "pending";
    this.say(softwareId, `Task ${task.number} is tried again (${same} of ${limit}): ${message}`);
  }

  /** What the build stage does next once a job of it ended or a person answered. */
  private progress(softwareId: string, state: BuildState): LaterOutcome {
    if (state.tasks.some((t) => t.status === "building")) return { kind: "wait" };
    const next = this.nextTaskJob(softwareId, state);
    if (next) {
      const task = state.tasks.find((t) => t.status === "building")!;
      task.job = this.enqueue(softwareId, state, next);
      this.save(softwareId, state);
      return { kind: "wait" };
    }
    if (state.tasks.some((t) => t.status === "waiting")) return { kind: "wait" };
    const stopped = state.tasks.filter((t) => t.status === "stopped");
    if (stopped.length > 0 && !state.leftStopped) {
      createAsk(this.db, {
        softwareId,
        role: "operator",
        kind: "question",
        stage: "build",
        title: `${stopped.length === 1 ? `Task ${stopped[0]!.number} stopped` : `${stopped.length} tasks stopped`}: what now?`,
        instruction: `${stopped.map((t) => `Task ${t.number} (${t.title}): ${t.note ?? "it stopped"}`).join(" ")} Try again, or check what was built so far without ${stopped.length === 1 ? "it" : "them"}.`,
        extra: {
          choices: [...TASK_STOPPED],
          meta: { purpose: "build-task-stopped" satisfies Purpose },
        },
      });
      return { kind: "wait" };
    }
    if (!state.head) {
      this.nothingBuilt(softwareId, state);
      return { kind: "wait" };
    }
    return { kind: "next" };
  }

  private checkEnded(job: Job, state: BuildState): LaterOutcome {
    const id = job.softwareId;
    const check = state.checks.find((c) => c.job === job.id);
    if (!check) return { kind: "wait" };
    check.when = now();
    if (job.status !== "done") {
      check.status = "did-not-finish";
      this.save(id, state);
      createAsk(this.db, {
        softwareId: id,
        role: "operator",
        kind: "question",
        stage: "check",
        title: "The check did not finish",
        instruction: `The checker ${job.status === "stopped" ? "was stopped" : `did not finish: ${job.result ?? "no reason was given"}`}. Nothing lands without a check. Check again, or have the builder build it again.`,
        extra: {
          choices: [...CHECK_PROBLEM],
          meta: { purpose: "build-check-problem" satisfies Purpose },
        },
      });
      return { kind: "wait" };
    }
    const items = Array.isArray(
      job.payload.context && (job.payload.context as { items?: unknown }).items,
    )
      ? (job.payload.context as { items: string[] }).items
      : this.itemsToCheck(id, state.milestone);
    const verdicts = this.verdictsOf(job.id);
    for (const item of items) {
      if (!verdicts.has(item)) {
        this.recordVerdict(
          id,
          job,
          item,
          "could-not-check",
          "The checker gave no verdict for this item.",
        );
        verdicts.set(item, {
          verdict: "could-not-check",
          evidence: "The checker gave no verdict for this item.",
        });
      }
    }
    const findings = this.findingsOf(job.id);
    const failing = [...verdicts.entries()].filter(
      ([item, v]) => v.verdict === "not-met" && this.isMust(id, item),
    );
    const blocking = findings.filter((f) => f.blocking);
    const counts = [...verdicts.values()].reduce<Record<VerdictValue, number>>(
      (all, v) => ({ ...all, [v.verdict]: all[v.verdict] + 1 }),
      { met: 0, "not-met": 0, "could-not-check": 0 },
    );
    const tally = `${counts.met} met, ${counts["not-met"]} not met, ${counts["could-not-check"]} could not check`;
    const notChecked = [...verdicts.entries()].filter(([, v]) => v.verdict === "could-not-check");
    if (failing.length === 0 && blocking.length === 0) {
      check.status = "passed";
      this.save(id, state);
      this.say(
        id,
        `The check of commit ${short(check.commit)} passed: ${tally}.${notChecked.length ? ` Not checked: ${notChecked.map(([i, v]) => `${i} (${v.evidence})`).join("; ")}.` : ""} It lands next.`,
      );
      return { kind: "next" };
    }
    for (const [item] of failing) state.failures[item] = (state.failures[item] ?? 0) + 1;
    if (blocking.length) state.failures["finding"] = (state.failures["finding"] ?? 0) + 1;
    const limit = this.config.line.check_rounds_before_stop;
    const stuck = Object.entries(state.failures).filter(([, n]) => n >= limit);
    const evidence = [
      ...failing.map(([item, v]) => `${item} not met: ${v.evidence}`),
      ...blocking.map((f) => `Finding: ${f.text}`),
    ].join("\n");
    if (stuck.length > 0) {
      check.status = "stopped";
      this.save(id, state);
      this.say(
        id,
        `The check of commit ${short(check.commit)} did not pass after ${limit} ${limit === 1 ? "round" : "rounds"}, so building stops here: ${tally}.`,
      );
      createAsk(this.db, {
        softwareId: id,
        role: "operator",
        kind: "question",
        stage: "check",
        title: `The check failed ${limit} rounds: what now?`,
        instruction: `These still fail after ${limit} rounds:\n${evidence}\nA builder could not fix them from the checker's evidence alone. Give it more rounds, or land it as it is and take what is wrong as new work. If an item asks for something only a person can provide, it says so above.`,
        extra: {
          choices: [...CHECK_STOPPED],
          meta: { purpose: "build-check-stopped" satisfies Purpose },
        },
      });
      return { kind: "wait" };
    }
    check.status = "not-passed";
    this.fixRound(
      state,
      evidence,
      failing.map(([item]) => item),
    );
    this.save(id, state);
    this.say(
      id,
      `The check of commit ${short(check.commit)} did not pass (${tally}). It goes back to the builder with the checker's evidence; round ${state.round} of ${limit}.`,
    );
    return { kind: "back-to-build", evidence };
  }

  private fixRound(state: BuildState, evidence: string, items: string[]): void {
    state.round += 1;
    state.leftStopped = false;
    const served = items.length ? items : [...new Set(state.tasks.flatMap((t) => t.items))];
    state.tasks = [
      this.task(
        1,
        "Fix what the check found",
        served,
        "Every item named in the evidence is met when the software is used as a user would.",
        { evidence },
      ),
    ];
  }

  private runEnded(job: Job, state: BuildState): LaterOutcome {
    if (job.status === "done") return { kind: "next" };
    this.save(job.softwareId, state);
    createAsk(this.db, {
      softwareId: job.softwareId,
      role: "operator",
      kind: "question",
      stage: "run",
      title: "The checked change could not land",
      instruction: `premise could not merge the checked commit ${short(state.head?.commit)} into the software: ${job.result ?? "no reason was given"}. Nothing that ran before is changed. Try again, or have the builder build it again.`,
      extra: {
        choices: [...LAND_PROBLEM],
        meta: { purpose: "build-land-problem" satisfies Purpose },
      },
    });
    return { kind: "wait" };
  }

  // ---- People's answers -----------------------------------------------------------------------

  answered(ask: Ask, answer: AskAnswer): LaterOutcome | null {
    const id = ask.softwareId;
    const state = this.load(id);
    if (!state) return null;
    const purpose = ask.extra.meta?.purpose as string | undefined;
    const text = answer.kind === "text" ? answer.text.trim() : "";
    if (purpose === "agent") {
      const task = state.tasks.find(
        (t) => t.ask === ask.id || (t.job !== null && t.job === ask.extra.meta?.job),
      );
      if (!task) return null;
      if (task.status !== "waiting") {
        // Answered while the builder still works: the answer reaches its next attempt, if any.
        task.answers.push(`${ask.title} → ${text || JSON.stringify(answer)}`);
        this.save(id, state);
        return null;
      }
      task.answers.push(`${ask.title} → ${text || JSON.stringify(answer)}`);
      task.status = "pending";
      task.ask = null;
      task.note = null;
      this.save(id, state);
      return this.progress(id, state);
    }
    if (!(PURPOSES as readonly string[]).includes(purpose ?? "")) return null;
    switch (purpose as Purpose) {
      case "build-task-stopped":
        if (text === TASK_STOPPED[1]) {
          state.leftStopped = true;
          if (!state.head) {
            this.save(id, state);
            this.say(
              id,
              "Nothing was built yet, so there is nothing to check. The tasks are tried again.",
            );
          } else {
            this.save(id, state);
            return { kind: "next" };
          }
        }
        for (const t of state.tasks) {
          if (t.status === "stopped" || (!state.head && t.status !== "built")) {
            t.status = "pending";
            t.sameFailures = 0;
            t.lastFailure = null;
          }
        }
        state.leftStopped = false;
        this.save(id, state);
        return this.progress(id, state);
      case "build-check-stopped":
        if (text === CHECK_STOPPED[1]) {
          this.say(id, "Landing it as it is. What the check found stays in the report as open.");
          return { kind: "next" };
        }
        state.failures = {};
        this.fixRound(state, this.lastEvidence(state) || "The operator asked for more rounds.", []);
        this.save(id, state);
        return { kind: "back-to-build", evidence: "more rounds were given" };
      case "build-check-problem":
        if (text === CHECK_PROBLEM[0]) {
          this.startCheck(id, state);
          return { kind: "wait" };
        }
        this.fixRound(state, "The operator asked for the change to be built again.", []);
        this.save(id, state);
        return { kind: "back-to-build", evidence: "the operator asked to build again" };
      case "build-land-problem":
        if (text === LAND_PROBLEM[0]) {
          if (!state.head) return { kind: "wait" };
          this.enqueue(id, state, {
            softwareId: id,
            kind: "run",
            stage: "run",
            payload: { commit: state.head.commit, branch: state.head.branch },
          });
          return { kind: "wait" };
        }
        this.fixRound(
          state,
          "The checked change could not be merged; build it again on the current code.",
          [],
        );
        state.head = null;
        state.base = this.repositoryHead(id);
        this.save(id, state);
        return { kind: "back-to-build", evidence: "the change could not land" };
    }
  }

  private lastEvidence(state: BuildState): string {
    const last = [...state.checks].reverse().find((c) => c.job !== null);
    if (!last?.job) return "";
    return [...this.verdictsOf(last.job).entries()]
      .filter(([, v]) => v.verdict === "not-met")
      .map(([item, v]) => `${item} not met: ${v.evidence}`)
      .join("\n");
  }

  // ---- Landing and running (the server's part of Run) ----------------------------------------

  async runServerJob(job: Job): Promise<AgentOutcome> {
    const id = job.softwareId;
    const branch = typeof job.payload.branch === "string" ? job.payload.branch : null;
    const commit = typeof job.payload.commit === "string" ? job.payload.commit : null;
    if (!branch || !commit) {
      return {
        kind: "failed",
        summary: "There is no checked commit to land.",
        failureSignature: "land-nothing",
      };
    }
    const { keeper } = this.deps;
    let merged: string;
    try {
      merged = keeper.mergeBranch(id, branch);
    } catch (error) {
      const message = (error as Error).message;
      return {
        kind: "failed",
        summary: `premise could not merge it: ${message}`,
        failureSignature: `land:${message.slice(0, 80)}`,
      };
    }
    const state = this.load(id);
    const notes: string[] = [];
    for (const change of state?.proposals ?? []) {
      const landed = this.writer.landProposed(id, change);
      if (!landed.ok) {
        notes.push(
          `A record change the builder proposed did not go in: ${landed.diagnostics.map((d) => d.message).join(" ")}`,
        );
      }
    }
    const repo = keeper.repositoryPath(id);
    const head = keeper.git.headCommit(repo) ?? merged;
    if (keeper.git.remoteUrl(repo, "origin") !== undefined) {
      try {
        const failures = keeper.pushChecked(repo, "origin", this.config.record.default_branch);
        if (failures.length) {
          notes.push(
            `It was not pushed to the second copy: ${failures.length} commit(s) failed the trace check.`,
          );
        } else {
          notes.push("It is pushed to the software's second copy.");
        }
      } catch (error) {
        notes.push(`It was not pushed to the second copy: ${(error as Error).message}`);
      }
    }
    recordEvent(this.db, {
      softwareId: id,
      module: "build",
      kind: "landed",
      reference: head,
      detail: { checked: commit, milestone: job.payload.milestone ?? null },
    });
    if (state) {
      state.landed = { commit: head, when: now(), milestone: state.milestone };
      state.proposals = [];
      this.save(id, state);
    }
    this.say(
      id,
      `Landed: the checked commit ${short(commit)} is merged as ${short(head)}. ${notes.join(" ")}`.trim(),
    );
    if (!this.deps.runner) return { kind: "done", summary: `Landed as ${short(head)}.` };
    try {
      const view = await this.deps.runner.start(id, head);
      const how =
        view.state === "running"
          ? `It is running: open ${view.link}.`
          : view.state === "finished"
            ? `It is a command: ${view.command ?? "see run.md"}. A sample run's output is under Running.`
            : "It is built; how to start it is under Running.";
      this.say(id, how);
      return { kind: "done", summary: how };
    } catch (error) {
      const message = (error as Error).message;
      this.say(
        id,
        `It landed, but it did not start: ${message} The report says so; say in chat what to do, or send it back to Build.`,
      );
      return {
        kind: "done",
        summary: `Landed as ${short(head)}, but it did not start: ${message}`,
      };
    }
  }

  // ---- Agent tools: scenarios, verdicts, proposals --------------------------------------------

  private checkerJob(binding: ToolBinding, purposes: string[]): Job | ToolEnvelope {
    const job = this.deps.queue.get(binding.jobId);
    if (!job || job.softwareId !== binding.softwareId || job.kind !== "check") {
      return toolFail("TASK_CLOSED", "This task is not a check. Stop.");
    }
    if (!purposes.includes(String(job.payload.purpose))) {
      return toolFail(
        "NOT_ALLOWED",
        job.payload.purpose === "scenarios"
          ? "This session writes scenarios only. Save them with scenario_write and stop; the verdicts come in a separate check."
          : "This session judges a commit. Submit the verdicts with verdict_submit.",
      );
    }
    return job;
  }

  scenarioWrite(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.checkerJob(binding, ["scenarios", "check"]);
    if (!("id" in job)) return job;
    const problems: string[] = [];
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (!name) problems.push('Give the scenario a "name".');
    const items = Array.isArray(args.items)
      ? args.items.filter((x): x is string => typeof x === "string")
      : [];
    const known = new Set(this.items(job.softwareId).map((i) => i.id));
    const unknown = items.filter((i) => !known.has(i));
    if (unknown.length)
      problems.push(`${unknown.join(", ")} not in the record; name items that are.`);
    const steps = Array.isArray(args.steps)
      ? args.steps.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
    if (steps.length === 0) problems.push('Give the "steps" a user takes, at least one.');
    const expected = typeof args.expected === "string" ? args.expected.trim() : "";
    if (!expected) problems.push('Say what the user must see, as "expected".');
    if (problems.length)
      return toolFail("MALFORMED", "The scenario cannot be kept as it is.", problems);
    const folder = this.scenarioFolder(job.softwareId);
    mkdirSync(folder, { recursive: true });
    const count = readdirSync(folder).filter((f) => f.endsWith(".json")).length;
    const scenario: StoredScenario = {
      name,
      items,
      steps,
      expected,
      milestone: (job.payload.milestone as string | null | undefined) ?? null,
      job: job.id,
      written: now(),
    };
    writeFileSync(
      join(folder, `${String(count + 1).padStart(3, "0")}-${slug(name)}.json`),
      JSON.stringify(scenario, null, 2),
    );
    recordEvent(this.db, {
      softwareId: job.softwareId,
      module: "checker",
      kind: "scenario-written",
      reference: String(job.id),
      detail: { name, items },
    });
    return toolOk({
      status: "saved",
      note: "Kept in premise's data folder, out of every builder's reach.",
    });
  }

  verdictSubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.checkerJob(binding, ["check"]);
    if (!("id" in job)) return job;
    if (!Array.isArray(args.verdicts)) {
      return toolFail("MALFORMED", 'Give "verdicts": a list of { item, verdict, evidence }.');
    }
    const known = new Set(this.items(job.softwareId).map((i) => i.id));
    const problems: string[] = [];
    const clean: { item: string; verdict: VerdictValue; evidence: string }[] = [];
    (args.verdicts as unknown[]).forEach((raw, n) => {
      const v = (raw ?? {}) as Record<string, unknown>;
      const item = typeof v.item === "string" ? v.item.trim() : "";
      const verdict =
        typeof v.verdict === "string"
          ? v.verdict
              .trim()
              .toLowerCase()
              .replace(/[\s_]+/g, "-")
          : "";
      const evidence = typeof v.evidence === "string" ? v.evidence.trim() : "";
      const where = `Verdict ${n + 1}${item ? ` (${item})` : ""}`;
      if (!known.has(item)) problems.push(`${where}: name a record item, such as W-1.`);
      if (!["met", "not-met", "could-not-check"].includes(verdict)) {
        problems.push(`${where}: the verdict is met, not-met or could-not-check.`);
      }
      if (!evidence)
        problems.push(
          `${where}: give the evidence (output, a response, a log line, or the file saved in ${EVIDENCE_FOLDER}/).`,
        );
      clean.push({ item, verdict: verdict as VerdictValue, evidence });
    });
    if (problems.length)
      return toolFail("MALFORMED", "The verdicts cannot be taken as they are.", problems);
    for (const v of clean) this.recordVerdict(job.softwareId, job, v.item, v.verdict, v.evidence);
    const findings = Array.isArray(args.findings) ? args.findings : [];
    for (const f of findings) {
      const text =
        typeof f === "string"
          ? f
          : typeof (f as { text?: unknown })?.text === "string"
            ? (f as { text: string }).text
            : "";
      if (!text.trim()) continue;
      const blocking =
        typeof f === "object" && f !== null && (f as { blocking?: unknown }).blocking === true;
      recordEvent(this.db, {
        softwareId: job.softwareId,
        module: "checker",
        kind: "finding",
        reference: String(job.id),
        detail: { text: text.trim(), blocking, commit: job.payload.commit ?? null },
      });
    }
    if (typeof args.run_notes === "string" && args.run_notes.trim()) {
      const state = this.load(job.softwareId);
      if (state) {
        state.checkNotes = [...state.checkNotes, args.run_notes.trim()].slice(-5);
        this.save(job.softwareId, state);
      }
    }
    return toolOk({
      status: "received",
      verdicts: clean.length,
      note: "premise decides what happens next from these. Do not soften them later.",
    });
  }

  /** A builder's record_propose that the record keeper accepted, kept to land with the milestone. */
  proposed(softwareId: string, changeId: number): void {
    const state = this.load(softwareId);
    if (!state) return;
    state.proposals = [...state.proposals, changeId];
    this.save(softwareId, state);
  }

  private recordVerdict(
    softwareId: string,
    job: Job,
    item: string,
    verdict: VerdictValue,
    evidence: string,
  ): void {
    recordEvent(this.db, {
      softwareId,
      module: "checker",
      kind: "verdict",
      reference: item,
      detail: {
        verdict,
        evidence,
        commit: job.payload.commit ?? null,
        job: job.id,
        round: job.payload.round ?? null,
        milestone: job.payload.milestone ?? null,
      },
    });
  }

  private verdictsOf(jobId: number): Map<string, { verdict: VerdictValue; evidence: string }> {
    const rows = this.db
      .prepare(
        "SELECT reference, detail FROM events WHERE module = 'checker' AND kind = 'verdict' AND json_extract(detail, '$.job') = ? ORDER BY id",
      )
      .all(jobId) as { reference: string; detail: string }[];
    const found = new Map<string, { verdict: VerdictValue; evidence: string }>();
    for (const row of rows) {
      const detail = JSON.parse(row.detail) as { verdict: VerdictValue; evidence: string };
      found.set(row.reference, { verdict: detail.verdict, evidence: detail.evidence });
    }
    return found;
  }

  private findingsOf(jobId: number): { text: string; blocking: boolean }[] {
    const rows = this.db
      .prepare(
        "SELECT detail FROM events WHERE module = 'checker' AND kind = 'finding' AND reference = ? ORDER BY id",
      )
      .all(String(jobId)) as { detail: string }[];
    return rows.map((r) => JSON.parse(r.detail) as { text: string; blocking: boolean });
  }

  // ---- Report and page ------------------------------------------------------------------------

  reportLines(softwareId: string, milestone: MilestoneRef | null): string[] {
    const state = this.load(softwareId);
    const lines: string[] = [];
    const about = milestone ? `${milestone.id} reached` : "Reached the end of the plan";
    const check = state ? [...state.checks].reverse().find((c) => c.job !== null) : undefined;
    if (state?.landed) {
      lines.push(
        `${about}: commit ${short(state.landed.commit)} is built, checked and landed${check ? ` (check round ${check.round}, ${check.status === "passed" ? "passed" : "landed as it was"})` : ""}.`,
      );
    } else {
      lines.push(`${about}, but nothing landed.`);
    }
    return lines;
  }

  view(softwareId: string): BuildView | null {
    const state = this.load(softwareId);
    if (!state) return null;
    const texts = new Map(this.items(softwareId).map((i) => [i.id, i.text]));
    const tasks: BuildTaskView[] = state.tasks.map((t) => ({
      number: t.number,
      title: t.title,
      items: t.items,
      status:
        t.status === "pending"
          ? "waiting-to-start"
          : t.status === "waiting"
            ? "waiting-on-person"
            : t.status,
      commit: t.commit,
      note: t.note,
      fix: t.fix,
    }));
    const checks: CheckView[] = state.checks.map((c) => ({
      round: c.round,
      commit: c.commit,
      status: c.status,
      when: c.when,
      verdicts: c.job
        ? [...this.verdictsOf(c.job).entries()].map(([item, v]) => ({
            item,
            text: texts.get(item) ?? "",
            verdict: v.verdict,
            evidence: v.evidence,
          }))
        : [],
      findings: c.job ? this.findingsOf(c.job) : [],
    }));
    if (!state.scenariosDone && state.tasks.every((t) => t.status === "pending")) {
      checks.push({
        round: state.round,
        commit: "",
        status: "writing-scenarios",
        when: now(),
        verdicts: [],
        findings: [],
      });
    }
    const waiting = listAsks(this.db, { softwareId, status: "open" })
      .filter((a) => a.stage === "build" || a.stage === "check" || a.stage === "run")
      .map((a) => a.title);
    return {
      milestone: state.milestone ? { id: state.milestone, text: state.milestoneText ?? "" } : null,
      round: state.round,
      roundsAllowed: this.config.line.check_rounds_before_stop,
      scenarios: this.scenarios(softwareId).length,
      tasks,
      checks,
      landed: state.landed,
      waiting,
    };
  }

  /** For tests and the page: where a check job's evidence is kept. */
  evidenceFolder(softwareId: string, jobId: number): string {
    return evidencePath(this.config.data.folder, softwareId, jobId);
  }
}
