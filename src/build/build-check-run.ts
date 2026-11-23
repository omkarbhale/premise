import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentOutcome } from "../agents/agent-runner.js";
import type { ToolBinding, ToolEnvelope } from "../agents/tool-server.js";
import { refusedAnswer, refusedAnswerWords, toolFail, toolOk } from "../agents/tool-server.js";
import {
  EVIDENCE_FOLDER,
  branchFor,
  evidencePath,
  workingCopyPath,
} from "../agents/working-copy.js";
import type { PremiseConfig } from "../config/settings.js";
import type { Briefs } from "../line/briefs.js";
import { againJob, askedAgain } from "../agents/ask-again.js";
import type {
  ChangeWork,
  LaterEntry,
  LaterOutcome,
  LaterStages,
  MilestoneRef,
} from "../line/later-stages.js";
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
import {
  type Ask,
  answerFate,
  createAsk,
  listAsks,
  setAnswerFate,
  setAskMeta,
} from "../storage/asks.js";
import { addChatMessage } from "../storage/chat.js";
import { type Database, now, recordEvent } from "../storage/database.js";
import { RecordWriter, droppedLine } from "../line/record-writer.js";
import { answerWords } from "../line/answers.js";
import { activeWorkItem } from "../line/work-items.js";
import { ASSUMED_DECISION } from "../line/draft-items.js";
import { type Taste, roleWords } from "../taste/taste.js";

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
  /** Claimed areas whose proposal the task waits on (decision 0196); absent in older notes. */
  claims?: number[];
  answers: string[];
}

interface CheckState {
  round: number;
  job: number | null;
  commit: string;
  status: CheckView["status"];
  when: string;
  /** Judged by a scripted agent, which cannot judge software; absent in older notes. */
  scripted?: boolean;
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
  /** Proposals for claimed areas in this milestone (decision 0196); absent in older notes. */
  taste?: TasteState[];
  /**
   * The landed commit would not start (decision 0280): what the start said. Cleared once a start
   * succeeds. Absent in older notes.
   */
  startFailure?: { commit: string; message: string } | null;
  /** Times this milestone was sent back to Build by itself because it would not start. */
  startSendBacks?: number;
  /** The change from intake being built, instead of a milestone (decision 0273). */
  change?: ChangeWork | null;
}

/** One claimed area's proposal, as Build waits on it. */
interface TasteState {
  claim: number;
  /** The job making the proposal. */
  job: number | null;
  /** The proposal put to the role. */
  ask: number | null;
  /** The tasks that build the area; empty holds every task. */
  tasks: number[];
  status: "making" | "asked" | "decided" | "released";
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
  /** Taste claims: a claimed area waits for its role's answer to a proposal (src/taste). */
  taste?: Taste;
}

const KEY = (softwareId: string) => `build:${softwareId}`;

const TASK_STOPPED = ["Try the stopped tasks again", "Check what was built"] as const;
const CHECK_STOPPED = ["Give it more rounds", "Land it as it is"] as const;
const CHECK_PROBLEM = ["Check again", "Build again"] as const;
const LAND_PROBLEM = ["Try landing again", "Build again"] as const;
/** How a landed change's last check ended, as the milestone's report line says it. */
const CHECK_LANDED_WORDS: Partial<Record<CheckView["status"], string>> = {
  passed: "checked, everything it had to check is met",
  "not-fully-verified": "no failure found, not fully verified",
  "not-verified": "not verified: nothing could be checked",
};
const NOTHING_VERIFIED = ["Land it unverified", "Stop here"] as const;
const START_PROBLEM = [
  "Send it back to Build",
  "Try starting it again",
  "Leave it not running",
] as const;

const PURPOSES = [
  "build-task-stopped",
  "build-check-stopped",
  "build-check-problem",
  "build-land-problem",
  "build-nothing-verified",
  "build-start-problem",
] as const;
type Purpose = (typeof PURPOSES)[number];

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

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
      change: state.change ?? null,
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
      taste: [],
      startFailure: null,
      startSendBacks: 0,
    };
  }

  // ---- Claimed areas (decisions 0102, 0196) -------------------------------------------------

  /**
   * Before building a milestone, each claimed area still undecided gets a proposal: a planner job
   * writes one or two described options for the claiming role. The tasks that build the area wait
   * for the role's answer; the others go on once the proposals are made.
   */
  private startProposals(softwareId: string, state: BuildState): void {
    const taste = this.deps.taste;
    if (!taste) return;
    state.taste = [];
    for (const claim of taste.list(softwareId).filter((c) => c.status === "open" && !c.decided)) {
      const open = taste.openProposal(claim);
      if (open) {
        // Asked before (an earlier milestone, or before a send-back): it still holds its tasks.
        const entry: TasteState = {
          claim: claim.id,
          job: null,
          ask: open.id,
          tasks: this.heldTasks(open),
          status: "asked",
        };
        state.taste.push(entry);
        this.hold(state, entry);
        continue;
      }
      const job = this.enqueue(softwareId, state, this.proposalJob(softwareId, state, claim));
      state.taste.push({ claim: claim.id, job, ask: null, tasks: [], status: "making" });
    }
    if (state.taste.some((t) => t.status === "making")) {
      const areas = state.taste
        .filter((t) => t.status === "making")
        .map((t) => taste.get(t.claim)!.area);
      this.say(
        softwareId,
        `Before building, premise prepares a proposal for ${areas.length === 1 ? "the claimed area" : "each claimed area"}: ${areas.join("; ")}. Building starts once ${areas.length === 1 ? "it is" : "they are"} ready; only the work on a claimed area then waits for its answer.`,
      );
    }
    this.save(softwareId, state);
  }

  private proposalJob(
    softwareId: string,
    state: BuildState,
    claim: { id: number; role: string; area: string },
  ): EnqueueInput {
    const tasks = state.tasks.map((t) => ({ number: t.number, title: t.title }));
    return {
      softwareId,
      kind: "prototype",
      stage: "build",
      payload: {
        purpose: "proposal",
        claim: claim.id,
        brief: this.deps.briefs.make(
          "proposal brief",
          {
            software_name: this.name(softwareId),
            area: claim.area,
            role: roleWords(claim.role),
            record: this.recordText(softwareId),
            tasks: tasks.map((t) => `${t.number}. ${t.title}`).join("\n") || "none planned yet",
            options_max: String(this.config.taste.options_max),
            kind: this.kind(softwareId),
            budget: this.budgetText("prototype"),
          },
          softwareId,
        ),
        context: {
          stage: "build",
          name: this.name(softwareId),
          purpose: "proposal",
          claim: { id: claim.id, role: claim.role, area: claim.area },
          tasks,
          milestone: state.milestone,
        },
      },
    };
  }

  /** The tasks a proposal holds, by number: those it names, or none named (every task). */
  private heldTasks(ask: Ask): number[] {
    const named = ask.extra.meta?.tasks;
    return Array.isArray(named) ? named.map(Number).filter((n) => Number.isInteger(n)) : [];
  }

  /** Hold the tasks that build a claimed area until its role answers. */
  private hold(state: BuildState, entry: TasteState): void {
    const claim = this.deps.taste?.get(entry.claim);
    const wanted = new Set(entry.tasks);
    const named = state.tasks.filter((t) => wanted.has(t.number));
    const held = (named.length > 0 ? named : state.tasks).filter(
      (t) => t.status === "pending" || t.status === "waiting",
    );
    for (const task of held) {
      task.claims = [...new Set([...(task.claims ?? []), entry.claim])];
      task.status = "waiting";
      task.note = `Waiting for the ${roleWords(claim?.role ?? "operator")} to keep or correct the proposal for ${claim?.area ?? "a claimed area"}.`;
    }
  }

  /** A claimed area is decided or released: its tasks go on unless something else holds them. */
  private unhold(state: BuildState, claimId: number, answer: string | null): void {
    for (const task of state.tasks) {
      if (!task.claims?.includes(claimId)) continue;
      task.claims = task.claims.filter((c) => c !== claimId);
      if (answer) task.answers.push(answer);
      if (task.status === "waiting" && task.claims.length === 0 && task.ask === null) {
        task.status = "pending";
        task.note = null;
      }
    }
  }

  private proposalEnded(job: Job, state: BuildState): LaterOutcome {
    const taste = this.deps.taste;
    const entry = (state.taste ?? []).find((t) => t.job === job.id);
    if (!taste || !entry || entry.status !== "making") return this.progress(job.softwareId, state);
    const claim = taste.get(entry.claim);
    if (!claim || claim.status === "released") {
      entry.status = "released";
      this.save(job.softwareId, state);
      return this.progress(job.softwareId, state);
    }
    const refused = job.status === "stopped" ? null : refusedAnswer(this.db, job);
    const ask =
      taste.openProposal(claim) ??
      taste.noProposal(
        claim,
        refused
          ? `the agent ${refusedAnswerWords(refused)}`
          : job.status === "done"
            ? "the agent finished without one"
            : `the agent ${job.status === "stopped" ? "was stopped" : `did not finish: ${job.result ?? "no reason was given"}`}`,
        job.id,
      );
    entry.ask = ask.id;
    entry.tasks = this.heldTasks(ask);
    entry.status = "asked";
    this.hold(state, entry);
    const who = roleWords(claim.role);
    const free = state.tasks.some((t) => t.status === "pending");
    this.say(
      job.softwareId,
      `A proposal for ${claim.area} is ready for the ${who === "operator" ? "operator (you)" : who}, under Waiting on you. That part is built after the answer${free ? "; the rest of the work goes on now" : ""}.`,
    );
    this.save(job.softwareId, state);
    return this.progress(job.softwareId, state);
  }

  claimReleased(softwareId: string, claimId: number): LaterOutcome | null {
    const state = this.load(softwareId);
    const entry = state?.taste?.find(
      (t) => t.claim === claimId && (t.status === "making" || t.status === "asked"),
    );
    if (!state || !entry) return null;
    entry.status = "released";
    this.unhold(state, claimId, null);
    this.save(softwareId, state);
    return this.progress(softwareId, state);
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
    // A decision the plan assumed is judged and reported, but it is not something the builder
    // can fix, so it never holds up landing (decision 0300).
    if (item.kind === "D" && ASSUMED_DECISION.test(item.text)) return false;
    return item.kind !== "W" || item.marks.priority === "must";
  }

  /** The plan's decisions that rest on something not checked or on a condition (decision 0300). */
  private assumedDecisions(softwareId: string): string[] {
    return this.items(softwareId)
      .filter((i) => i.kind === "D" && ASSUMED_DECISION.test(i.text))
      .map((i) => i.id);
  }

  /**
   * What the agents do not have, by the person's choice or because a person could not provide it
   * (decision 0300): a tool they went on without, or a condition a must needs that could not be met.
   */
  private notAvailable(softwareId: string): string {
    const rows = this.db
      .prepare(
        `SELECT kind, reference, detail FROM events WHERE software_id = ? AND module = 'line'
           AND kind IN ('tool-without', 'tool-installed', 'condition-unmet', 'condition-met') ORDER BY id`,
      )
      .all(softwareId) as { kind: string; reference: string | null; detail: string | null }[];
    const lines = new Map<string, string | null>();
    for (const row of rows) {
      const detail = JSON.parse(row.detail ?? "{}") as { tool?: string; condition?: string };
      const key = `${row.kind.startsWith("tool") ? "tool" : "condition"}:${row.reference}`;
      if (row.kind === "tool-without") {
        lines.set(
          key,
          `- ${detail.tool}: not available here; the person chose to go on without it.`,
        );
      } else if (row.kind === "condition-unmet") {
        lines.set(
          key,
          `- ${row.reference} works only if ${detail.condition}, and a person could not do that yet.`,
        );
      } else {
        lines.set(key, null);
      }
    }
    return [...lines.values()].filter((l): l is string => l !== null).join("\n");
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
      const change = entry.change ?? null;
      const fixRound =
        entry.why === "check not passed" &&
        state !== null &&
        state.milestone === (milestone?.id ?? null) &&
        (state.change?.ref ?? null) === (change?.ref ?? null);
      if (!fixRound) {
        const before = state;
        state = this.fresh(entry.run, milestone);
        state.change = change;
        state.landed = before?.landed ?? null;
        state.checkNotes = before?.checkNotes ?? [];
        state.base = this.repositoryHead(softwareId);
        state.tasks = change
          ? this.changeTasks(softwareId, change)
          : this.planTasks(softwareId, milestone);
      }
      const current = state!;
      current.run = entry.run;
      this.save(softwareId, current);
      if (!fixRound) this.startProposals(softwareId, current);
      if (!fixRound && !this.scenariosCover(softwareId, current)) {
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
        "No task produced a commit, so there is nothing to check or start. Try the tasks again, or send the software back to Plan from the Line tab.",
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

  /** A change's own tasks (decision 0273); never the software's whole plan. */
  private changeTasks(softwareId: string, change: ChangeWork): TaskState[] {
    const known = new Set(this.items(softwareId).map((i) => i.id));
    const tasks = change.tasks.length
      ? change.tasks
      : [{ title: `${change.ref}: ${change.title}`, items: change.touched }];
    return tasks.map((t, i) =>
      this.task(
        i + 1,
        t.title,
        t.items.filter((x) => known.has(x)),
        t.check ?? null,
      ),
    );
  }

  /**
   * The items a check of a change judges: those the change touches, plus every must item already
   * met, so nothing that worked is broken unseen (decision 0273). With no verdict recorded yet,
   * every must item counts as met.
   */
  changeItemsToCheck(softwareId: string, change: ChangeWork): string[] {
    const live = this.items(softwareId);
    const known = new Set(live.map((i) => i.id));
    const musts = live
      .filter((i) => i.kind === "W" && i.marks.priority === "must" && !i.marks.leftOut)
      .map((i) => i.id);
    const latest = this.latestVerdicts(softwareId);
    const anyJudged = musts.some((m) => latest.has(m));
    const met = musts.filter((m) => !anyJudged || latest.get(m) === "met");
    return [...new Set([...change.touched.filter((i) => known.has(i)), ...met])];
  }

  /** The last verdict each item got, over every check of the software. */
  private latestVerdicts(softwareId: string): Map<string, VerdictValue> {
    const rows = this.db
      .prepare(
        "SELECT reference, detail FROM events WHERE software_id = ? AND module = 'checker' AND kind = 'verdict' ORDER BY id",
      )
      .all(softwareId) as { reference: string; detail: string }[];
    const found = new Map<string, VerdictValue>();
    for (const row of rows) {
      found.set(row.reference, (JSON.parse(row.detail) as { verdict: VerdictValue }).verdict);
    }
    return found;
  }

  /** The items the check of the work in progress judges: a change's, or a milestone's. */
  private checkedItems(softwareId: string, state: BuildState): string[] {
    return state.change
      ? this.changeItemsToCheck(softwareId, state.change)
      : this.itemsToCheck(softwareId, state.milestone);
  }

  private scenariosCover(softwareId: string, state: BuildState): boolean {
    const items = this.checkedItems(softwareId, state);
    const covered = new Set(this.scenarios(softwareId).flatMap((s) => s.items));
    return items.every((i) => covered.has(i));
  }

  private budgetText(kind: "build" | "check" | "prototype"): string {
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
    const items = this.checkedItems(softwareId, state);
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
      payload: {
        // The work item the job serves, unless the job already names one (decision 0270).
        item: activeWorkItem(this.db, softwareId).id,
        ...input.payload,
        run: state.run,
        milestone: state.milestone,
      },
    });
    return id;
  }

  private checkJob(softwareId: string, state: BuildState): EnqueueInput {
    // The checker also judges the decisions the plan assumed without checking (decision 0300).
    const items = [
      ...this.checkedItems(softwareId, state),
      ...(state.change ? [] : this.assumedDecisions(softwareId)),
    ].filter((id, n, all) => all.indexOf(id) === n);
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
            not_available: this.notAvailable(softwareId) || "none",
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
        if (job.kind === "prototype") return this.proposalEnded(job, state);
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
      setAskMeta(this.db, asked.id, { waitedOn: `task ${task.number}` });
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
    if (!asked) this.takeHeldAnswers(job, task);
    this.save(id, state);
    return this.progress(id, state);
  }

  /**
   * Answers given while the task's builder was still working (decision 0310): a session cannot
   * read an answer mid-way, so the task is built again with them, or they go with its next try. A
   * task that stopped keeps nothing: the line engine takes such an answer in as intake.
   */
  private takeHeldAnswers(job: Job, task: TaskState): void {
    const held = listAsks(this.db, { softwareId: job.softwareId, status: "answered" }).filter(
      (a) => {
        const fate = answerFate(a);
        return fate?.state === "held" && fate.job === job.id;
      },
    );
    if (held.length === 0 || (task.status !== "built" && task.status !== "pending")) return;
    const titles = held.map((a) => `"${a.title}"`).join(" and ");
    if (task.status === "built") {
      task.status = "pending";
      task.note = `Built again with your answer to ${titles}.`;
      this.say(
        job.softwareId,
        `Task ${task.number}'s builder finished before it could read your answer to ${titles}, so the task is built again with it next.`,
      );
    }
    for (const ask of held) {
      setAnswerFate(this.db, ask.id, {
        state: "given",
        to: `task ${task.number} (${task.title}), built again with your answer`,
      });
    }
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
    // Proposals are made before any task starts, so a task that builds a claimed area is held first.
    if ((state.taste ?? []).some((t) => t.status === "making")) return { kind: "wait" };
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
      : this.checkedItems(id, state);
    const verdicts = this.verdictsOf(job.id);
    if (items.length > 0 && verdicts.size === 0 && !askedAgain(job)) {
      // No verdict at all: the checker is asked once more, with the exact shape (decision 0277).
      check.job = this.deps.queue.enqueue(againJob(job, "verdict_submit"));
      check.status = "checking";
      this.save(id, state);
      this.say(
        id,
        "The checker finished without any verdict; premise asks it once more, saying exactly what the answer must look like.",
      );
      return { kind: "wait" };
    }
    const refused = items.some((i) => !verdicts.has(i)) ? refusedAnswer(this.db, job) : null;
    const none = refused
      ? `The checker gave no verdict for this item: it ${refusedAnswerWords(refused, 200)}.`
      : "The checker gave no verdict for this item.";
    for (const item of items) {
      if (!verdicts.has(item)) {
        this.recordVerdict(id, job, item, "could-not-check", none);
        verdicts.set(item, { verdict: "could-not-check", evidence: none });
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
    // A "met" on made-up data only is said with it, so the caveat is not lost (decision 0280).
    const madeUp = [...verdicts.values()].filter(
      (v) => v.verdict === "met" && v.judgedOn === "made-up",
    ).length;
    const tally = `${counts.met} met${madeUp > 0 ? ` (${madeUp} of them only on made-up data)` : ""}, ${counts["not-met"]} not met, ${counts["could-not-check"]} could not check`;
    // A decision the plan assumed and the checker found false is said at once (decision 0300).
    const assumed = new Set(this.assumedDecisions(id));
    const broken = [...verdicts.entries()].filter(
      ([item, v]) => v.verdict === "not-met" && assumed.has(item),
    );
    if (broken.length > 0) {
      this.say(
        id,
        `The check found that ${broken.length === 1 ? "something the plan assumed without checking does not hold" : `${broken.length} things the plan assumed without checking do not hold`}: ${broken.map(([item, v]) => `${item}: ${v.evidence}`).join("; ")}. That is not the builder's to fix, so it does not hold up landing; it is in the report. If it matters, say in chat what to do instead, or send the software back to Plan.`,
      );
    }
    // A check that could not run the software for a reason outside it (a program the agents lack)
    // is not a failed round: the line waits on the ask for that program instead (decision 0310).
    const tool = this.openToolAsk(id);
    const unchecked = [...verdicts.entries()].some(
      ([item, v]) => v.verdict === "could-not-check" && this.isMust(id, item),
    );
    if (tool && (failing.length > 0 || blocking.length > 0 || unchecked)) {
      check.status = "waiting-for-tool";
      setAskMeta(this.db, tool.ask.id, { waitedOn: "the check" });
      this.save(id, state);
      this.say(
        id,
        `The check of commit ${short(check.commit)} could not use ${this.name(id)} as a person would: the agents need ${tool.name}, and it is not here (${tally}). That is not a fault in ${this.name(id)}, so this round does not count toward the stop after ${this.config.line.check_rounds_before_stop} failed rounds. The check runs again once you answer "${tool.ask.title}" under Waiting on you.`,
      );
      return { kind: "wait" };
    }
    if (failing.length === 0 && blocking.length === 0) {
      return this.noFailureFound(job, state, check, verdicts, tally);
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
    // The fix round names the items that were not met, never an earlier task's (decision 0310).
    const notMet = failing.length
      ? failing.map(([item]) => item)
      : [...verdicts.entries()].filter(([, v]) => v.verdict === "not-met").map(([item]) => item);
    this.fixRound(state, evidence, notMet);
    this.save(id, state);
    this.say(
      id,
      `The check of commit ${short(check.commit)} did not pass (${tally}). It goes back to the builder with the checker's evidence; round ${state.round} of ${limit}.`,
    );
    return { kind: "back-to-build", evidence };
  }

  /**
   * No must item failed and nothing blocks (decision 0197). It has passed only when every must item
   * was met. When some were met and others could not be checked, it lands and runs, marked not fully
   * verified. When none could be verified, premise asks the person once (or lands it unverified, as
   * line.when_nothing_verified says).
   */
  private noFailureFound(
    job: Job,
    state: BuildState,
    check: CheckState,
    verdicts: Map<string, { verdict: VerdictValue; evidence: string }>,
    tally: string,
  ): LaterOutcome {
    const id = job.softwareId;
    const all = [...verdicts.keys()];
    const musts = all.filter((item) => this.isMust(id, item));
    const required = musts.length > 0 ? musts : all;
    const unverified = required.filter((item) => verdicts.get(item)?.verdict !== "met");
    const verified = required.length - unverified.length;
    const scripted = this.checkedByScript(job.id);
    check.scripted = scripted;
    const scriptNote = scripted
      ? " The agents are scripted: they cannot judge software, so this check proves nothing about whether it works."
      : "";
    const which = unverified
      .map((item) => `${item} (${verdicts.get(item)?.evidence ?? "no reason given"})`)
      .join("; ");
    const about = `The check of commit ${short(check.commit)}`;
    if (required.length > 0 && unverified.length === 0) {
      check.status = "passed";
      this.save(id, state);
      this.say(
        id,
        `${about} passed: all ${required.length} ${required.length === 1 ? "thing" : "things"} it had to check ${required.length === 1 ? "is" : "are"} met (${tally}). It lands next.${scriptNote}`,
      );
      return { kind: "next" };
    }
    if (verified > 0) {
      check.status = "not-fully-verified";
      this.save(id, state);
      this.say(
        id,
        `${about} found no failure, but ${unverified.length} of ${required.length} ${required.length === 1 ? "thing" : "things"} could not be verified (${tally}). Not verified: ${which}. It lands and runs, marked not fully verified; the report says what is needed to check the rest.${scriptNote}`,
      );
      return { kind: "next" };
    }
    check.status = "not-verified";
    if (this.config.line.when_nothing_verified === "land") {
      this.save(id, state);
      this.say(
        id,
        `${about} found no failure, but could verify none of the ${required.length} ${required.length === 1 ? "thing" : "things"} you asked for (${tally}): ${which}. It lands unverified, because the settings say to land without asking; the report says how to try it yourself.${scriptNote}`,
      );
      return { kind: "next" };
    }
    this.save(id, state);
    this.say(
      id,
      `${about} found no failure, but could verify none of the things you asked for (${tally}). premise does not land it without asking you: see Waiting on you.${scriptNote}`,
    );
    createAsk(this.db, {
      softwareId: id,
      role: "operator",
      kind: "question",
      stage: "check",
      title: "Nothing could be checked: land it anyway?",
      instruction: [
        `premise could not check any of the ${required.length} ${required.length === 1 ? "thing" : "things"} you asked for, so it does not know whether this version works.${scriptNote}`,
        `What could not be checked, and why: ${which}.`,
        `To try it yourself: ${this.howToRun(id)} (the built version is commit ${short(check.commit)}; once landed, the Report says exactly how to start it).`,
        `Land it unverified (it starts, and the report says it is not verified), or stop here. Or write what the checker needs, such as how to start it or a test account, and premise checks again.`,
      ].join("\n"),
      extra: {
        choices: [...NOTHING_VERIFIED],
        meta: { purpose: "build-nothing-verified" satisfies Purpose },
      },
    });
    return { kind: "wait" };
  }

  /** Whether the checker that judged this job was a scripted agent, which judges nothing. */
  private checkedByScript(jobId: number): boolean {
    const row = this.db
      .prepare("SELECT runtime FROM agent_sessions WHERE job_id = ? ORDER BY id DESC LIMIT 1")
      .get(jobId) as { runtime: string } | undefined;
    return row?.runtime === "scripted";
  }

  /**
   * A fix round: one task made from the checker's evidence. It names the items that were not met,
   * in its title, its items and so its trace line (decision 0310); never the first task's items.
   * With none (only a finding failed) it names none, and the builder names what its commit serves.
   */
  private fixRound(state: BuildState, evidence: string, items: string[], title?: string): void {
    state.round += 1;
    state.leftStopped = false;
    const served = [...new Set(items)];
    state.tasks = [
      this.task(
        1,
        title ??
          (served.length
            ? `Fix what the check found: ${served.join(", ")} not met`
            : "Fix what the check found"),
        served,
        "Every item named in the evidence is met when the software is used as a user would.",
        { evidence },
      ),
    ];
  }

  /** The open ask for a program the agents lack, if any (decision 0300). */
  private openToolAsk(softwareId: string): { ask: Ask; name: string } | null {
    for (const ask of listAsks(this.db, { softwareId, status: "open" })) {
      const tool = ask.extra.meta?.tool as { name?: unknown } | undefined;
      if (ask.kind === "needed" && typeof tool?.name === "string") return { ask, name: tool.name };
    }
    return null;
  }

  /** A program the check waited on was answered: the same commit is checked again (0310). */
  private toolAnsweredForCheck(id: string, state: BuildState, ask: Ask): LaterOutcome | null {
    if (ask.extra.meta?.tool === undefined) return null;
    const check = state.checks.at(-1);
    if (!check || check.status !== "waiting-for-tool") return null;
    const other = this.openToolAsk(id);
    if (other) {
      setAnswerFate(this.db, ask.id, {
        state: "given",
        to: `the check of commit ${short(check.commit)}, which runs again once "${other.ask.title}" is answered too`,
      });
      return { kind: "wait" };
    }
    setAnswerFate(this.db, ask.id, {
      state: "given",
      to: `the check of commit ${short(check.commit)}, which runs again now`,
    });
    this.startCheck(id, state);
    return { kind: "wait" };
  }

  private runEnded(job: Job, state: BuildState): LaterOutcome {
    if (job.status === "done") {
      if (!state.startFailure) return { kind: "next" };
      return this.wouldNotStart(job.softwareId, state);
    }
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

  /**
   * Built and checked, but it would not start (decision 0280). The line holds at Run. The first
   * time (line.start_send_backs) it goes back to Build by itself, with the start's output as the
   * evidence; after that premise asks the person.
   */
  private wouldNotStart(id: string, state: BuildState): LaterOutcome {
    const failure = state.startFailure!;
    const output = failure.message;
    const allowed = this.config.line.start_send_backs;
    const sent = state.startSendBacks ?? 0;
    if (sent < allowed) {
      state.startSendBacks = sent + 1;
      this.sendBackToBuild(id, state, this.startEvidence(failure));
      this.say(
        id,
        `Built and checked, but it would not start. premise started it from a clean copy exactly as premise/run.md says, and it ended like this:\n${output}\nIt goes back to Build by itself${allowed > 1 ? ` (${sent + 1} of ${allowed})` : ""}, with this output, so the builder can make it start. Nobody needs to do anything yet.`,
      );
      return { kind: "back-to-build", evidence: "it would not start" };
    }
    this.save(id, state);
    this.say(
      id,
      `Built and checked, but it would not start${sent === 0 ? "" : `, even after going back to Build ${sent === 1 ? "once" : `${sent} times`}`}. What to do is under Waiting on you.`,
    );
    createAsk(this.db, {
      softwareId: id,
      role: "operator",
      kind: "question",
      stage: "run",
      title: "Built and checked, but it would not start",
      instruction: [
        `premise started commit ${short(failure.commit)} from a clean copy exactly as premise/run.md says, and it would not start. Its last lines of output:`,
        output,
        sent > 0
          ? `It already went back to Build ${sent === 1 ? "once" : `${sent} times`} with this output, and still does not start.`
          : "",
        `"Send it back to Build" has the builder fix it with this output. "Try starting it again" starts the same version again, for when the cause was outside it (the machine, a missing program you have now installed). "Leave it not running" goes on without a running version; the report says it is not running. You can also write what the builder needs to know.`,
      ]
        .filter(Boolean)
        .join("\n"),
      extra: {
        choices: [...START_PROBLEM],
        meta: { purpose: "build-start-problem" satisfies Purpose },
      },
    });
    return { kind: "wait" };
  }

  private startEvidence(failure: { commit: string; message: string }): string {
    return [
      `premise landed commit ${short(failure.commit)} and started it from a clean copy exactly as premise/run.md says: first each "build:" line in order, then the "start:" or "sample:" line. It would not start:`,
      failure.message,
      `Make it start that way from a clean copy: put every step needed before the start (installing what it depends on, building) on its own "build:" line in the premise-run block, and make the start or sample line work after them. Run them yourself from a fresh clone before you finish.`,
    ].join("\n");
  }

  /** Back to Build on the landed code, with this evidence. */
  private sendBackToBuild(id: string, state: BuildState, evidence: string): void {
    this.fixRound(
      state,
      evidence,
      state.tasks.flatMap((t) => t.items),
      "Make it start from a clean copy",
    );
    state.startFailure = null;
    state.head = null;
    state.base = this.repositoryHead(id);
    this.save(id, state);
  }

  // ---- People's answers -----------------------------------------------------------------------

  answered(ask: Ask, answer: AskAnswer): LaterOutcome | null {
    const id = ask.softwareId;
    const state = this.load(id);
    if (!state) return null;
    const purpose = ask.extra.meta?.purpose as string | undefined;
    const text = answer.kind === "text" ? answer.text.trim() : "";
    if (purpose === "taste-proposal") {
      const entry = (state.taste ?? []).find((t) => t.ask === ask.id && t.status === "asked");
      if (!entry) return null;
      entry.status = "decided";
      const area = String(ask.extra.meta?.area ?? "the claimed area");
      const words = answerWords(ask, answer);
      this.unhold(
        state,
        entry.claim,
        `The ${roleWords(ask.role)} decided how ${area} should be: ${words}`,
      );
      this.save(id, state);
      return this.progress(id, state);
    }
    if (purpose === "agent") {
      const task = state.tasks.find(
        (t) => t.ask === ask.id || (t.job !== null && t.job === ask.extra.meta?.job),
      );
      if (!task) return this.toolAnsweredForCheck(id, state, ask);
      const words = `${ask.title} → ${text || answerWords(ask, answer, "builder")}`;
      const where = `task ${task.number} (${task.title})`;
      if (task.status !== "waiting") {
        const job = task.job === null ? undefined : this.deps.queue.get(task.job);
        const working =
          task.status === "building" &&
          job !== undefined &&
          ["queued", "running", "waiting", "paused"].includes(job.status);
        if (!working && task.status !== "pending") return null; // nothing will read it: intake
        // Answered while the builder still works: a session cannot read it mid-way, so it is held
        // and the task is built again with it once this attempt ends (decision 0310).
        task.answers.push(words);
        this.save(id, state);
        setAnswerFate(
          this.db,
          ask.id,
          working && job.status !== "queued"
            ? {
                state: "held",
                job: job.id,
                to: `${where}: its builder is still working and cannot read it now, so the task is built again with your answer once this attempt ends`,
              }
            : { state: "given", to: `${where}, which starts with your answer` },
        );
        return null;
      }
      task.answers.push(words);
      task.ask = null;
      const held = (task.claims ?? []).length > 0;
      if (!held) {
        task.status = "pending";
        task.note = null;
      }
      setAnswerFate(this.db, ask.id, {
        state: "given",
        to: held
          ? `${where}, which starts with your answer once the proposal it also waits on is answered`
          : `${where}, which starts again now with your answer`,
      });
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
        this.fixRound(
          state,
          this.lastEvidence(state) || "The operator asked for more rounds.",
          this.lastNotMet(state),
        );
        this.save(id, state);
        return { kind: "back-to-build", evidence: "more rounds were given" };
      case "build-check-problem":
        if (text === CHECK_PROBLEM[0]) {
          this.startCheck(id, state);
          return { kind: "wait" };
        }
        this.fixRound(
          state,
          "The operator asked for the change to be built again.",
          state.tasks.flatMap((t) => t.items),
          "Build it again",
        );
        this.save(id, state);
        return { kind: "back-to-build", evidence: "the operator asked to build again" };
      case "build-nothing-verified": {
        if (text === NOTHING_VERIFIED[0]) {
          this.say(
            id,
            "You said: land it unverified. It lands and starts; the report marks it not verified and says how to try it.",
          );
          return { kind: "next" };
        }
        if (text === NOTHING_VERIFIED[1]) {
          this.say(
            id,
            "Stopped: nothing lands, and what runs now stays as it is. To go on, say in chat what the checker needs, or send the software back to Build or Plan from the Line tab.",
          );
          return { kind: "wait" };
        }
        state.checkNotes = [...state.checkNotes, `From the operator: ${text}`].slice(-5);
        if (!state.head) return { kind: "wait" };
        this.say(id, "Thanks: the checker gets that, and checks the same version again.");
        this.startCheck(id, state);
        return { kind: "wait" };
      }
      case "build-start-problem": {
        const failure = state.startFailure;
        if (text === START_PROBLEM[1]) {
          this.say(id, "Starting the same version again.");
          this.enqueue(id, state, {
            softwareId: id,
            kind: "run",
            stage: "run",
            payload: { startOnly: true },
          });
          return { kind: "wait" };
        }
        if (text === START_PROBLEM[2]) {
          state.startFailure = null;
          this.save(id, state);
          this.say(
            id,
            "You said: leave it not running. The line goes on; the report says it would not start, and nothing claims it works. Press Start under Running to try again any time.",
          );
          return { kind: "next" };
        }
        const words = text && text !== START_PROBLEM[0] ? `\nFrom the operator: ${text}` : "";
        this.sendBackToBuild(
          id,
          state,
          (failure
            ? this.startEvidence(failure)
            : "The operator sent it back to Build because it would not start.") + words,
        );
        this.say(id, "Back to Build, with the start's output for the builder.");
        return { kind: "back-to-build", evidence: "it would not start" };
      }
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
          state.tasks.flatMap((t) => t.items),
          "Build it again on the current code",
        );
        state.head = null;
        state.base = this.repositoryHead(id);
        this.save(id, state);
        return { kind: "back-to-build", evidence: "the change could not land" };
    }
  }

  /** The items the last check found not met: what a fix round given by the person names. */
  private lastNotMet(state: BuildState): string[] {
    const last = [...state.checks].reverse().find((c) => c.job !== null);
    if (!last?.job) return [];
    return [...this.verdictsOf(last.job).entries()]
      .filter(([, v]) => v.verdict === "not-met")
      .map(([item]) => item);
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
    if (job.payload.startOnly === true) {
      const landed = this.load(id)?.landed?.commit ?? null;
      if (!landed) {
        return {
          kind: "failed",
          summary: "Nothing has landed, so there is nothing to start.",
          failureSignature: "start-nothing",
        };
      }
      return this.startLanded(id, landed);
    }
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
    const proposals = this.writer.landAllProposed(id, state?.proposals ?? []);
    const dropped = droppedLine(proposals.dropped, "a builder");
    if (dropped) {
      recordEvent(this.db, {
        softwareId: id,
        module: "build",
        kind: "record-changes-dropped",
        detail: { dropped: proposals.dropped },
      });
      notes.push(dropped);
    }
    const repo = keeper.repositoryPath(id);
    const head = keeper.git.headCommit(repo) ?? merged;
    if (keeper.git.remoteUrl(repo, "origin") !== undefined) {
      try {
        const failures = keeper.pushChecked(
          repo,
          "origin",
          this.config.record.default_branch,
          this.config.github.timeout_minutes * 60_000,
        );
        if (failures.length) {
          notes.push(
            `It was not pushed to the second copy: ${failures.length} commit(s) failed the trace check.`,
          );
        } else {
          notes.push("It is pushed to the software's second copy.");
        }
      } catch (error) {
        const message = (error as Error).message;
        notes.push(
          message.includes("took longer")
            ? "Pushing to the second copy took too long and was stopped. premise pushes again after the next change lands."
            : `It was not pushed to the second copy: ${message}`,
        );
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
    return this.startLanded(id, head);
  }

  /**
   * Start the landed commit. A start that fails is noted in the build notes, and runEnded holds the
   * line at Run for it (decision 0280): it is not "run done".
   */
  private async startLanded(id: string, commit: string): Promise<AgentOutcome> {
    const runner = this.deps.runner;
    if (!runner) return { kind: "done", summary: `Landed as ${short(commit)}.` };
    try {
      const view = await runner.start(id, commit);
      const how =
        view.state === "running"
          ? `It is running: open ${view.link}.`
          : view.state === "finished"
            ? `It is a command: ${view.command ?? "see run.md"}. A sample run's output is under Running.`
            : "It is built; how to start it is under Running.";
      const state = this.load(id);
      if (state) {
        state.startFailure = null;
        this.save(id, state);
      }
      this.say(id, how);
      return { kind: "done", summary: how };
    } catch (error) {
      const message = (error as Error).message;
      const state = this.load(id);
      if (state) {
        state.startFailure = { commit, message };
        this.save(id, state);
      }
      return {
        kind: "done",
        summary: `Landed as ${short(commit)}, but it would not start: ${firstLine(message)}`,
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
    const clean: {
      item: string;
      verdict: VerdictValue;
      evidence: string;
      judgedOn: "real" | "made-up" | null;
      tryItOn: string | null;
    }[] = [];
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
      const judgedOn = v.judged_on === "real" || v.judged_on === "made-up" ? v.judged_on : null;
      const tryItOn =
        typeof v.try_it_on === "string" && v.try_it_on.trim() ? v.try_it_on.trim() : null;
      const where = `Verdict ${n + 1}${item ? ` (${item})` : ""}`;
      if (!known.has(item)) problems.push(`${where}: name a record item, such as W-1.`);
      if (!["met", "not-met", "could-not-check"].includes(verdict)) {
        problems.push(`${where}: the verdict is met, not-met or could-not-check.`);
      }
      if (!evidence)
        problems.push(
          `${where}: give the evidence (output, a response, a log line, or the file saved in ${EVIDENCE_FOLDER}/).`,
        );
      if (judgedOn === null) {
        problems.push(
          `${where}: say what it was judged on. Add "judged_on": "real" (the real data, service or environment the software is for) or "made-up" (stand-ins only). Example: { "item": "W-1", "verdict": "met", "evidence": "...", "judged_on": "real" }.`,
        );
      } else if (verdict === "met" && judgedOn === "made-up") {
        // The real data, service or tool was out of reach: that is could-not-check (0300).
        problems.push(
          `${where}: met on made-up data only is not met. When the real data, service or tool was out of your reach, the verdict is could-not-check, with "try_it_on": what a person should try. Example: { "item": "${item || "W-1"}", "verdict": "could-not-check", "evidence": "Worked on my own sample input only; the real status line was not reachable here.", "judged_on": "made-up", "try_it_on": "one real session with the status line set" }. If what you used is the real thing the software is for, say "judged_on": "real".`,
        );
      } else if ((judgedOn === "made-up" || verdict === "could-not-check") && !tryItOn) {
        problems.push(
          `${where}: add "try_it_on": what a person should try or do to check it, such as "one real session with the status line set".`,
        );
      }
      clean.push({ item, verdict: verdict as VerdictValue, evidence, judgedOn, tryItOn });
    });
    if (problems.length)
      return toolFail("MALFORMED", "The verdicts cannot be taken as they are.", problems);
    for (const v of clean) {
      this.recordVerdict(job.softwareId, job, v.item, v.verdict, v.evidence, v.judgedOn, v.tryItOn);
    }
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
    if (typeof args.seen_on_screen === "boolean") {
      // Whether anybody saw it on a screen; the report says so when nobody did (decision 0310).
      recordEvent(this.db, {
        softwareId: job.softwareId,
        module: "checker",
        kind: "screen",
        reference: String(job.id),
        detail: { seen: args.seen_on_screen, commit: job.payload.commit ?? null },
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
    judgedOn: "real" | "made-up" | null = null,
    tryItOn: string | null = null,
  ): void {
    recordEvent(this.db, {
      softwareId,
      module: "checker",
      kind: "verdict",
      reference: item,
      detail: {
        verdict,
        evidence,
        ...(judgedOn && { judgedOn }),
        ...(tryItOn && (judgedOn === "made-up" || verdict === "could-not-check") && { tryItOn }),
        commit: job.payload.commit ?? null,
        job: job.id,
        round: job.payload.round ?? null,
        milestone: job.payload.milestone ?? null,
      },
    });
  }

  private verdictsOf(
    jobId: number,
  ): Map<string, { verdict: VerdictValue; evidence: string; judgedOn?: "real" | "made-up" }> {
    const rows = this.db
      .prepare(
        "SELECT reference, detail FROM events WHERE module = 'checker' AND kind = 'verdict' AND json_extract(detail, '$.job') = ? ORDER BY id",
      )
      .all(jobId) as { reference: string; detail: string }[];
    const found = new Map<
      string,
      { verdict: VerdictValue; evidence: string; judgedOn?: "real" | "made-up" }
    >();
    for (const row of rows) {
      const detail = JSON.parse(row.detail) as {
        verdict: VerdictValue;
        evidence: string;
        judgedOn?: "real" | "made-up";
      };
      found.set(row.reference, {
        verdict: detail.verdict,
        evidence: detail.evidence,
        ...(detail.judgedOn && { judgedOn: detail.judgedOn }),
      });
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
    if (state?.change) return this.changeReportLines(softwareId, state, state.change);
    const lines: string[] = [];
    const about = milestone ? `${milestone.id} reached` : "Reached the end of the plan";
    const check = state ? [...state.checks].reverse().find((c) => c.job !== null) : undefined;
    if (state?.landed) {
      lines.push(
        `${about}: commit ${short(state.landed.commit)} is built and landed${check ? ` (check round ${check.round}: ${CHECK_LANDED_WORDS[check.status] ?? "landed as it was, with what the check found still open"})` : ""}.`,
      );
      const notRunning = this.notRunning(softwareId);
      if (notRunning) lines.push(notRunning);
    } else {
      lines.push(`${about}, but nothing landed.`);
    }
    return lines;
  }

  /**
   * Said when the latest start of this software failed: it is built and checked, but not running,
   * so nobody is asked to try it. Null when it runs, or nothing was started.
   */
  notRunning(softwareId: string): string | null {
    const latest = this.deps.runner?.history(softwareId, 1)[0];
    if (!latest || (latest.status !== "failed" && latest.status !== "crashed")) return null;
    return latest.status === "crashed"
      ? "It started, but kept stopping by itself, so it is not running now. The Report has its last output."
      : "It is built and checked, but it would not start, so there is nothing to try yet. The Report has its last lines of output.";
  }

  /**
   * Record items planned only for a milestone after the one being built: the person chose them for
   * later, so they are not built yet (decision 0280). Read from the plan's tasks, like
   * itemsToCheck.
   */
  laterItems(softwareId: string): { item: string; milestone: string }[] {
    const order = this.milestoneIds(softwareId).map((m) => m.id);
    if (order.length < 2) return [];
    const state = this.load(softwareId);
    const current = state?.milestone ?? state?.landed?.milestone ?? null;
    const at = current ? order.indexOf(current) : 0;
    const first = new Map<string, number>();
    const byMilestone = this.tasksByMilestone(softwareId);
    order.forEach((id, i) => {
      for (const task of byMilestone.get(id) ?? []) {
        for (const item of task.items) {
          if (!first.has(item) || first.get(item)! > i) first.set(item, i);
        }
      }
    });
    return [...first.entries()]
      .filter(([, i]) => i > Math.max(at, 0))
      .map(([item, i]) => ({ item, milestone: order[i]! }));
  }

  /**
   * What a change's report says (decision 0273): what changed, what was checked again, and what
   * was not, against the commit that landed.
   */
  private changeReportLines(softwareId: string, state: BuildState, change: ChangeWork): string[] {
    const live = this.items(softwareId);
    const checked = this.changeItemsToCheck(softwareId, change);
    const touched = new Set(change.touched);
    const check = [...state.checks].reverse().find((c) => c.job !== null);
    const verdicts = check?.job ? this.verdictsOf(check.job) : new Map();
    const said = (id: string) => {
      const v = verdicts.get(id)?.verdict;
      return v
        ? `${id} ${v === "met" ? "met" : v === "not-met" ? "not met" : "could not be checked"}`
        : id;
    };
    const again = checked.filter((i) => !touched.has(i));
    const notChecked = live
      .filter((i) => ["W", "T"].includes(i.kind) && !i.marks.leftOut && !checked.includes(i.id))
      .map((i) => i.id);
    return [
      state.landed
        ? `${change.ref} changed: ${state.tasks.map((t) => t.title.replace(/\.$/, "")).join("; ")}. Commit ${short(state.landed.commit)} is built and landed${check ? ` (check round ${check.round}: ${CHECK_LANDED_WORDS[check.status] ?? "landed as it was, with what the check found still open"})` : ""}.`
        : `${change.ref}: nothing landed.`,
      `Checked for the change: ${
        checked
          .filter((i) => touched.has(i))
          .map(said)
          .join(", ") || "no record item named"
      }.`,
      again.length
        ? `Checked again so nothing that worked is broken: ${again.map(said).join(", ")}.`
        : "No other must item needed checking again.",
      notChecked.length
        ? `Not checked again (the change does not touch them): ${notChecked.join(", ")}.`
        : "Every item of the record was checked.",
    ];
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
      ...(c.scripted && { scripted: true }),
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
      ...(state.change && { change: { ref: state.change.ref, title: state.change.title } }),
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
