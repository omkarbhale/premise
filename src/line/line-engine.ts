import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentOutcome } from "../agents/agent-runner.js";
import type { ToolBinding, ToolEnvelope } from "../agents/tool-server.js";
import { toolFail, toolOk } from "../agents/tool-server.js";
import type { BudgetGroup, PremiseConfig, StageBudget, FloorKind } from "../config/settings.js";
import { type Gate, GateError, type GateRequest, KIND_LABELS, isFloorKind } from "../gate/gate.js";
import {
  GitHubRepositoryHost,
  LocalRepositoryHost,
  RepositoryHostError,
} from "../git/repository-host.js";
import type { Job, JobKind, WorkQueue } from "../queue/work-queue.js";
import { applyOperations, type Operation } from "../record/change.js";
import { type ItemKind, type RecordItem, formatItemLine } from "../record/format.js";
import { RecordError, type RecordKeeper } from "../record/record-keeper.js";
import { ServiceError, type ChatResult, type StartSoftwareInput } from "../server/services.js";
import type {
  ApprovalView,
  AskAnswer,
  AskView,
  ChatMessage,
  MilestoneView,
  RecordFileView,
  RecordView,
  SoftwareDetail,
  SoftwareSummary,
  StageView,
} from "../shared/api-types.js";
import {
  SIZE_CLASSES,
  STAGES,
  type SizeClass,
  type StageId,
  isStageId,
  stageName,
  stageNumber,
} from "../shared/stages.js";
import { type Ask, closeAsk, createAsk, getAsk, listAsks, setAskItems } from "../storage/asks.js";
import { addChatMessage, countIntakeMessages, listChatMessages } from "../storage/chat.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import {
  type Software,
  createSoftware,
  getSoftware,
  listSoftwares,
  setSoftwarePriority,
  setSoftwareSizeClass,
  setSoftwareStage,
  setSoftwareState,
} from "../storage/softwares.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { nameFromIdea, repositoryName } from "../demo/drafts.js";
import { validateAnswer } from "./answers.js";
import type { BriefName, Briefs } from "./briefs.js";
import {
  type DraftItem,
  DraftError,
  addOperation,
  applyAnswers,
  readDraftItems,
  sizeFrom,
  toAskItem,
} from "./draft-items.js";
import type { LaterStageId, LaterStages, MilestoneRef } from "./later-stages.js";
import { RecordWriter } from "./record-writer.js";
import {
  createWorkItem,
  itemState,
  nextStage,
  rootItem,
  setItemState,
  setWorkItem,
} from "./work-items.js";

/**
 * The line engine (docs/specs/line-engine.md): where each software is on the line, the next step,
 * the jobs for each stage, and every ask in the session, labelled with its role. Stages Why to Plan
 * are run here in their thinnest form (milestone 1 step 2); Build, Check, Run, Report and Intake go
 * through the {@link LaterStages} hand-off. The record is written only through the record keeper;
 * floor actions only through the gate.
 */

const OPERATOR = "operator";
const MAX_IDEA = 4000;
const MAX_CHAT = 4000;
const FINISHED = new Set(["done", "stuck", "failed", "stopped"]);

/** The early stages this engine runs itself. */
type EarlyStage = "why" | "who" | "exists" | "what" | "say-back" | "plan";
const EARLY: readonly EarlyStage[] = ["why", "who", "exists", "what", "say-back", "plan"];
const LATER: readonly LaterStageId[] = ["build", "check", "run", "report"];

const STAGE_JOB: Record<EarlyStage, { kind: JobKind; brief: BriefName; group: BudgetGroup }> = {
  why: { kind: "draft", brief: "Why brief", group: "draft" },
  who: { kind: "draft", brief: "Who brief", group: "draft" },
  exists: { kind: "research", brief: "full look brief", group: "exists" },
  what: { kind: "draft", brief: "What brief", group: "draft" },
  "say-back": { kind: "draft", brief: "say-back brief", group: "say_back" },
  plan: { kind: "plan", brief: "plan brief", group: "plan" },
};

/** Which record file each early stage writes, and the kinds a draft of it may hold. */
const STAGE_KINDS: Record<
  "why" | "who" | "exists" | "what",
  { kind: ItemKind; allowed: ItemKind[] }
> = {
  why: { kind: "Y", allowed: ["Y"] },
  who: { kind: "U", allowed: ["U", "R"] },
  exists: { kind: "E", allowed: ["E"] },
  what: { kind: "W", allowed: ["W"] },
};

const STAGE_OF_KIND: Partial<Record<ItemKind, EarlyStage>> = {
  Y: "why",
  U: "who",
  R: "who",
  E: "exists",
  W: "what",
  D: "plan",
  M: "plan",
};

export const EXISTS_OUTCOMES = [
  "Build it",
  "Build on something that exists",
  "Build something different",
  "Do not build it",
] as const;
const MILESTONE_CHOICES = ["Go on", "Go back to Why"] as const;
const PROBLEM_CHOICES = ["Try again", "Try again with twice the budget"] as const;

/** What an ask is for, kept in its meta. */
type AskPurpose =
  "draft" | "exists" | "say-back" | "milestones" | "stage-problem" | "milestone-reached" | "agent";

/** The line engine's own notes on a software, kept with it in the database. */
interface LineState {
  /** The current stage run (stage_runs.id); jobs of older runs are ignored. */
  run?: number;
  /** After a stage is redone for a struck say-back item, go straight back to the say-back. */
  returnTo?: "say-back";
  /** Budget multiplier the operator gave the current stage run. */
  boost?: number;
  sayBackRounds?: number;
  /** Foundation review round and the objections left open. */
  review?: { round: number; objections: string[] };
  /** The milestone being worked on, from Build to Report. */
  milestone?: string | null;
  /** Record changes agents proposed in this round, accepted when the plan is confirmed. */
  proposed?: number[];
  /** Answers people gave to agents' questions, passed to the next brief. */
  answers?: string[];
}

interface StoredPlan {
  decisions: DraftItem[];
  milestones: DraftItem[];
  tasks: { title: string; items: string[]; check?: string }[];
}

export interface LineEngineOptions {
  db: Database;
  queue: WorkQueue;
  ledger: UsageLedger;
  config: PremiseConfig;
  keeper: RecordKeeper;
  gate: Gate;
  briefs: Briefs;
  later: LaterStages;
  /** False while no agent can start; status lines then say why work waits. */
  agentsReady?: () => boolean;
  /** Writes the report at each milestone's end and when a software is not built. */
  reporter?: {
    write(
      softwareId: string,
      trigger: "milestone" | "do-not-build",
      reference?: string,
    ): Promise<unknown>;
  };
}

export class LineEngine {
  private readonly db: Database;
  private readonly writer: RecordWriter;

  constructor(private readonly options: LineEngineOptions) {
    this.db = options.db;
    this.writer = new RecordWriter(options.keeper);
    options.gate.onDecided((request) => this.gateDecided(request));
    options.gate.registerPerformer("create-repository", (request) =>
      this.createRemoteRepository(request),
    );
  }

  private get queue(): WorkQueue {
    return this.options.queue;
  }
  private get config(): PremiseConfig {
    return this.options.config;
  }

  // ---- State -----------------------------------------------------------------------------------

  private require(id: string): Software {
    const software = getSoftware(this.db, id);
    if (!software) {
      throw new ServiceError(
        "NOT_FOUND",
        "That software is not in premise. Pick one from the list, or start a new one.",
      );
    }
    return software;
  }

  /** The line's notes on a software, kept on its root work item. */
  private state(id: string): LineState {
    return itemState<LineState>(this.db, rootItem(this.db, id).id);
  }

  private setState(id: string, change: Partial<LineState>): LineState {
    const next = { ...this.state(id), ...change };
    for (const key of Object.keys(next) as (keyof LineState)[]) {
      if (next[key] === undefined) delete next[key];
    }
    setItemState(this.db, rootItem(this.db, id).id, next);
    return next;
  }

  private sizeOf(software: Software): SizeClass {
    return (SIZE_CLASSES as readonly string[]).includes(software.sizeClass)
      ? (software.sizeClass as SizeClass)
      : "small";
  }

  /** The effort budget of an early stage for this software, with any boost the operator gave. */
  budgetFor(software: Software, stage: string): StageBudget | null {
    if (!(EARLY as readonly string[]).includes(stage)) return null;
    const base =
      this.config.line.budgets[STAGE_JOB[stage as EarlyStage].group][this.sizeOf(software)];
    const boost = this.state(software.id).boost ?? 1;
    return { turns: base.turns * boost, minutes: base.minutes * boost };
  }

  /** The software's state, on its root item and mirrored on its row. */
  private setLifecycle(id: string, state: Software["state"], why: string): void {
    setSoftwareState(this.db, id, state, why);
    setWorkItem(this.db, rootItem(this.db, id).id, { state });
  }

  /** The next stage the software's root item goes through after `from`. */
  private after(id: string, from: StageId): StageId {
    return nextStage(rootItem(this.db, id), from) ?? "intake";
  }

  private premiseSays(
    softwareId: string,
    text: string,
    routedTo: string | null = null,
  ): ChatMessage {
    return addChatMessage(this.db, { softwareId, author: "premise", text, routedTo });
  }

  // ---- Softwares -------------------------------------------------------------------------------

  private statusLine(software: Software, openAsks: number, jobs: Job[]): string {
    if (software.state === "ended") {
      return "Ended: you decided not to build it. Send it back to any stage to pick it up again.";
    }
    if (software.state === "waiting-milestone") {
      return "Stopped after a milestone. Try it, then say go on under Waiting on you.";
    }
    if (software.state === "paused-budget") return "Paused: its effort budget is used up.";
    if (software.state === "paused-usage") return "Paused until the usage limit resets.";
    if (openAsks > 0) {
      return `Waiting on you: ${openAsks === 1 ? "1 thing" : `${openAsks} things`} to answer under Waiting on you.`;
    }
    const running = jobs.find((j) => j.status === "running");
    if (running) return `Agents are working: ${jobWords(running)}.`;
    const queued = jobs.find((j) => j.status === "queued");
    if (queued && queued.kind !== "run" && this.options.agentsReady?.() === false) {
      return `Waiting: the ${jobWords(queued)} cannot start until real agents are set up. The note at the top of the page says how.`;
    }
    if (queued) return `Queued: ${jobWords(queued)} starts when an agent is free.`;
    if (software.currentStage === "intake") {
      return "Reached the end of the line. Say in chat what to change next.";
    }
    return "Working.";
  }

  private summary(software: Software): SoftwareSummary {
    const openAsks = listAsks(this.db, { softwareId: software.id, status: "open" }).length;
    const jobs = this.queue.list().filter((j) => j.softwareId === software.id);
    return {
      id: software.id,
      name: software.name,
      stage: isStageId(software.currentStage) ? software.currentStage : "why",
      state: software.state,
      status: this.statusLine(software, openAsks, jobs),
      sizeClass: this.sizeOf(software),
      priority: software.priority,
      milestoneWaits: software.milestoneWaits,
      openAsks,
      created: software.created,
    };
  }

  async softwareList(): Promise<SoftwareSummary[]> {
    return listSoftwares(this.db).map((s) => this.summary(s));
  }

  private milestones(softwareId: string): { id: string; text: string; wait: boolean }[] {
    try {
      return this.options.keeper.effortPlan(softwareId).milestones;
    } catch {
      return [];
    }
  }

  async softwareDetail(id: string): Promise<SoftwareDetail> {
    const software = this.require(id);
    const current = stageNumber(software.currentStage);
    const stages: StageView[] = STAGES.map((s, i) => ({
      id: s.id,
      name: s.name,
      plain: s.plain,
      position: i + 1 < current ? "done" : i + 1 === current ? "current" : "ahead",
    }));
    const usage = await this.options.ledger.softwareUsage(id);
    const state = this.state(id);
    const reached = this.reachedMilestones(id);
    const milestones: MilestoneView[] = this.milestones(id).map((m) => ({
      id: m.id,
      text: m.text,
      wait: m.wait,
      position: reached.has(m.id) ? "reached" : state.milestone === m.id ? "current" : "ahead",
    }));
    const approvals: ApprovalView[] = this.options.gate.standing(id).map((a) => ({
      id: a.id,
      softwareId: a.softwareId,
      kind: a.kind,
      label: KIND_LABELS[a.kind],
      role: a.role,
      given: a.given,
    }));
    const budget = this.budgetFor(software, software.currentStage);
    const used = state.run
      ? ((
          this.db.prepare("SELECT used_minutes FROM stage_runs WHERE id = ?").get(state.run) as
            { used_minutes: number } | undefined
        )?.used_minutes ?? 0)
      : 0;
    return {
      ...this.summary(software),
      idea: software.idea,
      stages,
      usage: {
        mocked: usage.mocked,
        sessions: usage.sessions,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        weeklyShare: usage.weeklyShare,
      },
      milestones,
      approvals,
      budget: budget ? { ...budget, usedMinutes: Math.round(used * 10) / 10 } : null,
    };
  }

  async startSoftware(input: StartSoftwareInput): Promise<SoftwareSummary> {
    const idea = (input.idea ?? "").trim();
    if (!idea) {
      throw new ServiceError(
        "INVALID",
        "Write a sentence or two about what the software should do, then start it.",
      );
    }
    if (idea.length > MAX_IDEA) {
      throw new ServiceError(
        "INVALID",
        `That is ${idea.length} characters; keep the first description under ${MAX_IDEA}. You can add detail in chat later.`,
      );
    }
    const given = input.name?.trim();
    if (given && given.length > 80) {
      throw new ServiceError("INVALID", "Keep the name under 80 characters.");
    }
    const taken = new Set(listSoftwares(this.db).map((s) => s.name.toLowerCase()));
    if (given && taken.has(given.toLowerCase())) {
      throw new ServiceError(
        "NAME_TAKEN",
        `There is already a software called "${given}". Choose another name, or leave the name empty.`,
      );
    }
    let name = given || nameFromIdea(idea);
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${nameFromIdea(idea)} ${n}`;

    const software = transaction(this.db, () => {
      const created = createSoftware(this.db, { name, idea }, this.config.softwares);
      addChatMessage(this.db, {
        softwareId: created.id,
        author: "person",
        text: idea,
        routedTo: "start",
      });
      createWorkItem(this.db, { softwareId: created.id, kind: "software" });
      this.options.keeper.createRepository(created.id);
      this.enterStage(created, "why", "started");
      return created;
    });
    this.queue.tick();
    return this.summary(getSoftware(this.db, software.id)!);
  }

  /** Stop a software's jobs and withdraw its open asks (approvals stay: they belong to the gate). */
  private clearWork(id: string, why: string): void {
    for (const job of this.queue.list()) {
      if (job.softwareId === id && !FINISHED.has(job.status)) {
        this.markHandled(job.id);
        this.queue.stop(job.id);
      }
    }
    for (const ask of listAsks(this.db, { softwareId: id, status: "open" })) {
      if (ask.extra.meta?.gateRequest !== undefined) continue;
      closeAsk(this.db, ask.id, "withdrawn", null, why);
    }
  }

  async sendBack(id: string, stage: StageId): Promise<void> {
    const software = this.require(id);
    if (!isStageId(stage)) {
      throw new ServiceError(
        "INVALID",
        `"${String(stage)}" is not a stage. The stages are: ${STAGES.map((s) => s.name).join(", ")}.`,
      );
    }
    if (stageNumber(stage) > stageNumber(software.currentStage)) {
      throw new ServiceError(
        "INVALID",
        `${software.name} has not reached ${stageName(stage)} yet; it can only be sent back to ${stageName(software.currentStage)} or an earlier stage.`,
      );
    }
    transaction(this.db, () => {
      this.clearWork(id, `Withdrawn: sent back to ${stageName(stage)}.`);
      if (software.state !== "active") this.setLifecycle(id, "active", "sent back");
      this.setState(id, { returnTo: undefined, boost: undefined, review: undefined });
      this.premiseSays(
        id,
        `Sent back to ${stageName(stage)}. The stages after it will be done again.`,
      );
      this.enterStage(getSoftware(this.db, id)!, stage, "sent back");
    });
    this.queue.tick();
  }

  async setSize(id: string, size: SizeClass): Promise<void> {
    const software = this.require(id);
    if (!(SIZE_CLASSES as readonly string[]).includes(size)) {
      throw new ServiceError("INVALID", `The size must be small, medium or large.`);
    }
    if (software.sizeClass === size) return;
    transaction(this.db, () => {
      setSoftwareSizeClass(this.db, id, size);
      setWorkItem(this.db, rootItem(this.db, id).id, { sizeClass: size });
      const budget = this.budgetFor(getSoftware(this.db, id)!, software.currentStage);
      this.premiseSays(
        id,
        `Size is now ${size}.${budget ? ` This stage may now take up to ${budget.turns} agent turns and ${budget.minutes} minutes.` : " Each stage before building gets a budget to match."}`,
      );
    });
  }

  async setPriority(id: string, priority: number): Promise<void> {
    this.require(id);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      throw new ServiceError(
        "INVALID",
        "The priority must be a whole number from 1 (most important) to 5.",
      );
    }
    setSoftwarePriority(this.db, id, priority);
    this.queue.tick();
  }

  /** Turn a milestone's wait on or off; premise stops after it until the operator says go on. */
  async setMilestoneWait(id: string, milestoneId: string, wait: boolean): Promise<void> {
    this.require(id);
    const milestone = this.milestones(id).find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new ServiceError(
        "NOT_FOUND",
        `${milestoneId} is not one of this software's milestones.`,
      );
    }
    if (milestone.wait === wait) return;
    const landed = this.writer.land(
      id,
      [{ op: "mark", id: milestoneId, wait }],
      wait
        ? `The operator asked to stop after ${milestoneId}.`
        : `The operator asked not to stop after ${milestoneId}.`,
    );
    if (!landed.ok) {
      throw new ServiceError(
        "INVALID",
        `The record refused the change: ${landed.diagnostics.map((d) => d.message).join(" ")}`,
      );
    }
    this.db
      .prepare("UPDATE softwares SET milestone_waits = ? WHERE id = ?")
      .run(this.milestones(id).some((m) => m.wait) ? 1 : 0, id);
    this.premiseSays(
      id,
      wait
        ? `premise will stop after ${milestoneId} until you say go on.`
        : `premise will not stop after ${milestoneId}.`,
    );
  }

  async withdrawApproval(id: number): Promise<void> {
    try {
      const approval = this.options.gate.withdraw(id);
      this.premiseSays(
        approval.softwareId,
        `Withdrawn: premise will ask again before ${KIND_LABELS[approval.kind]}. What was already done stays done.`,
      );
    } catch (error) {
      if (error instanceof GateError) throw new ServiceError("NOT_FOUND", error.message);
      throw error;
    }
  }

  // ---- Entering stages ------------------------------------------------------------------------

  /** Close the current stage run and open one for the stage. */
  private openRun(
    software: Software,
    stage: string,
    why: string,
    milestone: string | null = null,
  ): number {
    const state = this.state(software.id);
    if (state.run) {
      this.db
        .prepare(
          "UPDATE stage_runs SET exited = ?, exit_reason = ? WHERE id = ? AND exited IS NULL",
        )
        .run(now(), why, state.run);
      recordEvent(this.db, {
        softwareId: software.id,
        module: "line",
        kind: "stage-left",
        reference: String(state.run),
        detail: { why },
      });
    }
    const fresh = getSoftware(this.db, software.id)!;
    const budget = this.budgetFor({ ...fresh, currentStage: stage }, stage);
    const item = rootItem(this.db, software.id);
    const row = this.db
      .prepare(
        `INSERT INTO stage_runs (software_id, work_item_id, stage, milestone, entered, budget_turns, budget_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        software.id,
        item.id,
        stage,
        milestone,
        now(),
        budget?.turns ?? null,
        budget?.minutes ?? null,
      );
    const run = Number(row.lastInsertRowid);
    setWorkItem(this.db, item.id, { currentStage: stage });
    setSoftwareStage(this.db, software.id, stage, why);
    this.setState(software.id, { run, ...(budget ? {} : { boost: undefined }) });
    return run;
  }

  /** Put a software at a stage and start that stage's work. */
  private enterStage(software: Software, stage: StageId, why: string): void {
    if ((EARLY as readonly string[]).includes(stage)) {
      this.setState(software.id, { boost: undefined });
      if (stage === "say-back" && why !== "items struck")
        this.setState(software.id, { sayBackRounds: 0 });
      if (stage === "plan") this.setState(software.id, { review: { round: 0, objections: [] } });
      this.openRun(software, stage, why);
      this.queueStageJob(getSoftware(this.db, software.id)!, stage as EarlyStage, "draft");
      this.premiseSays(software.id, ENTER_WORDS[stage as EarlyStage]);
      return;
    }
    if ((LATER as readonly string[]).includes(stage)) {
      const first = this.milestones(software.id)[0];
      this.enterLater(
        software,
        stage as LaterStageId,
        first ? { id: first.id, text: first.text } : null,
        why,
      );
      return;
    }
    // Intake: the end of the line.
    this.openRun(software, "intake", why);
    this.setState(software.id, { milestone: undefined });
    this.premiseSays(
      software.id,
      "That is the whole line. Anything you say in chat from now on is taken as new work.",
    );
  }

  private enterLater(
    software: Software,
    stage: LaterStageId,
    milestone: MilestoneRef | null,
    why: string,
  ): void {
    this.openRun(software, stage, why, milestone?.id ?? null);
    this.setState(software.id, { milestone: milestone?.id ?? null });
    const jobs = this.options.later.jobs(software.id, stage, milestone);
    const run = this.state(software.id).run!;
    for (const job of jobs) {
      this.queue.enqueue({
        ...job,
        payload: { ...job.payload, run, milestone: milestone?.id ?? null },
      });
    }
    const about = milestone ? ` ${milestone.id}: ${milestone.text}` : "";
    const later = this.options.later.standIn ? " (stand-in: nothing is really done yet)" : "";
    switch (stage) {
      case "build":
        this.premiseSays(
          software.id,
          `Building${about}${later}. Nobody needs to watch; the page updates as it goes.`,
        );
        break;
      case "check":
        this.premiseSays(
          software.id,
          `Checking the build against what you asked for, in a separate session${later}.`,
        );
        break;
      case "run":
        this.premiseSays(software.id, `Starting it on this machine${later}.`);
        break;
      case "report":
        this.writeReport(software, milestone);
        break;
    }
    if (jobs.length === 0 && stage !== "report") this.afterLater(software.id, stage);
  }

  /** A later stage finished: on to the next one, or the milestone's end. */
  private afterLater(softwareId: string, stage: LaterStageId): void {
    const software = getSoftware(this.db, softwareId)!;
    const milestone = this.currentMilestone(softwareId);
    const next = LATER[LATER.indexOf(stage) + 1];
    if (next) {
      this.enterLater(software, next, milestone, `${stage} done`);
    }
  }

  /** Have the reporter write a report from recorded facts (after this transaction commits). */
  private report(
    softwareId: string,
    trigger: "milestone" | "do-not-build",
    reference?: string,
  ): void {
    const reporter = this.options.reporter;
    if (!reporter) {
      recordEvent(this.db, {
        softwareId,
        module: "reporter",
        kind: "report-written",
        ...(reference && { reference }),
      });
      return;
    }
    setImmediate(() => {
      reporter
        .write(softwareId, trigger, reference)
        .catch((error: unknown) =>
          this.premiseSays(
            softwareId,
            `The report could not be written: ${(error as Error).message}`,
          ),
        );
    });
  }

  private currentMilestone(softwareId: string): MilestoneRef | null {
    const id = this.state(softwareId).milestone;
    const found = this.milestones(softwareId).find((m) => m.id === id);
    return found ? { id: found.id, text: found.text } : null;
  }

  private reachedMilestones(softwareId: string): Set<string> {
    const rows = this.db
      .prepare(
        "SELECT reference FROM events WHERE software_id = ? AND module = 'line' AND kind = 'milestone-reached'",
      )
      .all(softwareId) as { reference: string }[];
    return new Set(rows.map((r) => r.reference));
  }

  private writeReport(software: Software, milestone: MilestoneRef | null): void {
    this.report(software.id, "milestone", milestone?.id);
    for (const line of this.options.later.reportLines(software.id, milestone)) {
      this.premiseSays(software.id, line);
    }
    this.premiseSays(software.id, "The report is ready: open the Report tab.");
    if (milestone) {
      recordEvent(this.db, {
        softwareId: software.id,
        module: "line",
        kind: "milestone-reached",
        reference: milestone.id,
      });
    }
    const all = this.milestones(software.id);
    const index = milestone ? all.findIndex((m) => m.id === milestone.id) : -1;
    const nextMilestone = index >= 0 ? all[index + 1] : undefined;
    const waits = index >= 0 && all[index]!.wait;
    if (waits) {
      this.setLifecycle(software.id, "waiting-milestone", `${milestone!.id} reached`);
      createAsk(this.db, {
        softwareId: software.id,
        role: OPERATOR,
        kind: "question",
        stage: "report",
        title: `${milestone!.id} reached: go on?`,
        instruction: `You asked premise to stop after this milestone. Try the software and read the report, then say go on${nextMilestone ? ` to ${nextMilestone.id}: ${nextMilestone.text}` : " to the end of the line"}. If it is solving the wrong problem, go back to Why.`,
        extra: {
          choices: [...MILESTONE_CHOICES],
          meta: { purpose: "milestone-reached", milestone: milestone!.id },
        },
      });
      return;
    }
    this.nextMilestone(software.id, nextMilestone);
  }

  private nextMilestone(softwareId: string, next: { id: string; text: string } | undefined): void {
    const software = getSoftware(this.db, softwareId)!;
    if (next) {
      this.enterLater(software, "build", { id: next.id, text: next.text }, "next milestone");
    } else {
      this.enterStage(software, "intake", "last milestone reported");
    }
  }

  // ---- Jobs -----------------------------------------------------------------------------------

  private recordLines(softwareId: string, filter: { includeStruck?: boolean } = {}): RecordItem[] {
    try {
      return this.options.keeper.list(softwareId, { includeStruck: filter.includeStruck ?? false });
    } catch {
      return [];
    }
  }

  private recordText(softwareId: string, kinds?: ItemKind[]): string {
    return this.recordLines(softwareId)
      .filter((i) => !kinds || kinds.includes(i.kind))
      .map((i) => formatItemLine(i))
      .join("\n");
  }

  private struckText(softwareId: string, stage: EarlyStage): string {
    const kinds = Object.entries(STAGE_OF_KIND)
      .filter(([, s]) => s === stage)
      .map(([k]) => k as ItemKind);
    const struck = this.recordLines(softwareId, { includeStruck: true })
      .filter((i) => i.struck && kinds.includes(i.kind))
      .map((i) => `- ${i.id} ${i.text}: struck, because ${i.struck!.reason}`);
    const answers = (this.state(softwareId).answers ?? []).map((a) => `- ${a}`);
    return [
      ...struck,
      ...(answers.length ? ["Answers people gave to your questions:", ...answers] : []),
    ].join("\n");
  }

  private briefFor(
    software: Software,
    stage: EarlyStage,
    purpose: string,
    extra: Record<string, string> = {},
  ): string {
    const budget = this.budgetFor(software, stage)!;
    const state = this.state(software.id);
    const name: BriefName =
      purpose === "correction"
        ? "chat corrections brief"
        : purpose === "review"
          ? "contradiction review brief"
          : purpose === "revision"
            ? "foundation revision brief"
            : STAGE_JOB[stage].brief;
    return this.options.briefs.make(name, {
      software_name: software.name,
      stage: stageName(stage),
      operator_words: software.idea,
      record: this.recordText(software.id),
      struck_items: this.struckText(software.id, stage),
      size_class: stage === "why" ? "none" : this.sizeOf(software),
      budget: `${budget.turns} agent turns and ${budget.minutes} minutes`,
      exists_outcome: this.recordText(software.id, ["E"]),
      say_back_reason:
        state.returnTo === "say-back" || (state.sayBackRounds ?? 0) > 0
          ? "items were struck at the last say-back and their stages were redone"
          : "a new software",
      change: "none",
      claimed_areas: "none",
      working_copy: "none",
      proposed_change: "none",
      decision: "none",
      exists_look: "none",
      ...extra,
    });
  }

  private queueStageJob(
    software: Software,
    stage: EarlyStage,
    purpose: string,
    extra: Record<string, string> = {},
    context: Record<string, unknown> = {},
  ): number {
    const budget = this.budgetFor(software, stage)!;
    const run = this.state(software.id).run;
    const kind: JobKind = purpose === "review" ? "review" : STAGE_JOB[stage].kind;
    return this.queue.enqueue({
      softwareId: software.id,
      kind,
      stage,
      payload: {
        run,
        purpose,
        brief: this.briefFor(software, stage, purpose, extra),
        limits: { turns: budget.turns, minutes: budget.minutes },
        context: { stage, purpose, name: software.name, idea: software.idea, ...context },
      },
    });
  }

  private isHandled(jobId: number): boolean {
    return (
      this.db
        .prepare(
          "SELECT 1 FROM events WHERE module = 'line' AND kind = 'job-handled' AND reference = ? LIMIT 1",
        )
        .get(String(jobId)) !== undefined
    );
  }

  private markHandled(jobId: number): void {
    if (this.isHandled(jobId)) return;
    const job = this.queue.get(jobId);
    recordEvent(this.db, {
      softwareId: job?.softwareId ?? null,
      module: "line",
      kind: "job-handled",
      reference: String(jobId),
    });
  }

  /** The job belongs to the software's current stage run. */
  private isCurrent(job: Job): boolean {
    const software = getSoftware(this.db, job.softwareId);
    return (
      Boolean(software) &&
      job.payload.run === this.state(job.softwareId).run &&
      job.payload.run !== undefined
    );
  }

  /** The work queue says a job changed: when one of the line's jobs ended, move its software on. */
  jobChanged(job: Job): void {
    if (!FINISHED.has(job.status) || this.isHandled(job.id)) return;
    if (!this.isCurrent(job)) {
      this.markHandled(job.id);
      return;
    }
    transaction(this.db, () => {
      this.markHandled(job.id);
      this.addUsedMinutes(job);
      const software = getSoftware(this.db, job.softwareId)!;
      if ((LATER as readonly string[]).includes(job.stage ?? "")) {
        this.laterJobEnded(software, job);
        return;
      }
      if (job.status !== "done") {
        if (job.payload.purpose === "correction") {
          this.premiseSays(
            software.id,
            "premise could not work your chat message into the draft; it is on the list as you wrote it.",
          );
          return;
        }
        this.stageProblem(software, job);
        return;
      }
      this.earlyJobDone(software, job);
    });
    this.queue.tick();
  }

  private addUsedMinutes(job: Job): void {
    if (!job.started || !job.finished) return;
    const minutes = (Date.parse(job.finished) - Date.parse(job.started)) / 60_000;
    this.db
      .prepare("UPDATE stage_runs SET used_minutes = used_minutes + ? WHERE id = ?")
      .run(Math.max(0, minutes), job.payload.run as number);
  }

  private laterJobEnded(software: Software, job: Job): void {
    const stage = job.stage as LaterStageId;
    if (job.status !== "done") {
      this.premiseSays(
        software.id,
        `The ${jobWords(job)} ${job.status === "stopped" ? "was stopped" : "did not finish"}: ${job.result ?? "no reason was given"}. Send ${software.name} back to ${stageName(stage)} to try again.`,
      );
      return;
    }
    const outcome = this.options.later.finished(job);
    if (outcome.kind === "wait") return;
    if (outcome.kind === "back-to-build") {
      this.premiseSays(software.id, `Back to building: ${outcome.evidence}`);
      this.enterLater(software, "build", this.currentMilestone(software.id), "check not passed");
      return;
    }
    // The stage is done when none of its jobs are left.
    const open = this.queue
      .list()
      .some(
        (j) =>
          j.softwareId === software.id &&
          j.payload.run === job.payload.run &&
          !FINISHED.has(j.status),
      );
    if (!open) this.afterLater(software.id, stage);
  }

  private openAskOfJob(jobId: number): Ask | undefined {
    return listAsks(this.db, { status: "open" }).find((a) => a.extra.meta?.job === jobId);
  }

  private earlyJobDone(software: Software, job: Job): void {
    const stage = job.stage as EarlyStage;
    const purpose = String(job.payload.purpose ?? "draft");
    if (purpose === "correction") return;
    if (stage === "plan") {
      this.planJobDone(software, job, purpose);
      return;
    }
    if (this.openAskOfJob(job.id)) return;
    // Finished without submitting a draft.
    this.stageProblem(software, job, "finished without a draft");
  }

  /** A stage ended without what it needed: the operator decides how to go on (spec 5.2). */
  private stageProblem(software: Software, job: Job, what?: string): void {
    const open = listAsks(this.db, { softwareId: software.id, status: "open" }).some(
      (a) => a.stage === job.stage && a.extra.meta?.gateRequest === undefined,
    );
    const reason =
      what ??
      (job.status === "stuck"
        ? `ran out of its budget or got stuck: ${job.result ?? "no reason was given"}`
        : job.status === "stopped"
          ? "was stopped"
          : `failed: ${job.result ?? "no reason was given"}`);
    if (open) {
      this.premiseSays(
        software.id,
        `The ${jobWords(job)} ${reason}. The draft it made so far is under Waiting on you.`,
      );
      return;
    }
    const stage = stageName(job.stage ?? "");
    createAsk(this.db, {
      softwareId: software.id,
      role: OPERATOR,
      kind: "question",
      stage: job.stage,
      title: `${stage} did not finish: try again?`,
      instruction: `The ${jobWords(job)} ${reason}. Nothing was lost. Try again, or give it twice the budget. You can also make the software larger on the Line tab, or send it back to an earlier stage.`,
      extra: { choices: [...PROBLEM_CHOICES], meta: { purpose: "stage-problem" } },
    });
  }

  // ---- Plan -----------------------------------------------------------------------------------

  private planFolder(softwareId: string): string {
    return join(this.config.data.folder, "plans", softwareId);
  }

  private readPlan(softwareId: string): StoredPlan | null {
    const file = join(this.planFolder(softwareId), "plan.json");
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as StoredPlan;
  }

  private writePlan(softwareId: string, plan: StoredPlan | null): void {
    const folder = this.planFolder(softwareId);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "plan.json");
    if (!plan) {
      if (existsSync(file)) writeFileSync(file, "null");
      return;
    }
    writeFileSync(file, JSON.stringify(plan, null, 2));
    const lines = [
      "# Working plan",
      "",
      "Tasks in order. The first is the smallest version that runs.",
      "",
      ...plan.tasks.map(
        (t, i) =>
          `${i + 1}. ${t.title}${t.items.length ? ` (serves ${t.items.join(", ")})` : ""}${t.check ? `. Check: ${t.check}` : ""}`,
      ),
      "",
    ];
    writeFileSync(join(folder, "plan.md"), lines.join("\n"));
  }

  private planJobDone(software: Software, job: Job, purpose: string): void {
    const plan = this.readPlan(software.id);
    if (!plan) {
      this.stageProblem(software, job, "finished without a plan");
      return;
    }
    const state = this.state(software.id);
    const review = state.review ?? { round: 0, objections: [] };
    const foundations = plan.decisions.filter((d) => d.foundation);
    if (purpose === "draft" && foundations.length > 0 && review.round === 0) {
      this.setState(software.id, { review: { round: 1, objections: [] } });
      this.premiseSays(
        software.id,
        `The planner made ${plan.decisions.length} technical choices. A second agent is reviewing the ${foundations.length === 1 ? "one" : foundations.length} that would be costly to change later.`,
      );
      this.queueStageJob(
        software,
        "plan",
        "review",
        {
          proposed_change: foundations.map((d) => `- ${d.text}`).join("\n"),
          decision: foundations.map((d) => `- ${d.text}`).join("\n"),
        },
        { decisions: foundations.map((d) => d.text) },
      );
      return;
    }
    if (purpose === "review" && review.objections.length > 0 && review.round === 1) {
      this.setState(software.id, { review: { round: 2, objections: review.objections } });
      this.premiseSays(
        software.id,
        `The reviewer objected to a technical choice; the planner is looking at it again.`,
      );
      this.queueStageJob(software, "plan", "revision", {
        review: review.objections.map((o) => `- ${o}`).join("\n"),
      });
      return;
    }
    if (purpose === "revision" && review.objections.length > 0) {
      this.premiseSays(
        software.id,
        `The reviewer's objection stays open: ${review.objections.join(" ")} premise goes on with the planner's choice; send the software back to Plan to look again.`,
      );
    }
    this.askMilestones(software, plan);
  }

  private askMilestones(software: Software, plan: StoredPlan): void {
    const defaults = software.milestoneWaits;
    const items = plan.milestones.map((m) => ({ ...m, wait: m.wait ?? defaults }));
    createAsk(this.db, {
      softwareId: software.id,
      role: OPERATOR,
      kind: "draft",
      stage: "plan",
      title: "Milestones: is this the right order?",
      instruction:
        "Each milestone ends with running software and a report. Tick a milestone to make premise stop after it until you say go on. Strike or edit milestones, then confirm; the technical choices are in the Record tab afterwards.",
      items: items.map(toAskItem),
      extra: { meta: { purpose: "milestones", items } },
    });
    this.premiseSays(
      software.id,
      `The plan is ready: ${plan.tasks.length} ${plan.tasks.length === 1 ? "task" : "tasks"} in ${items.length} ${items.length === 1 ? "milestone" : "milestones"}. Check the milestones under Waiting on you.`,
    );
  }

  // ---- Asks -----------------------------------------------------------------------------------

  private askView(ask: Ask, names: Map<string, string>): AskView {
    return {
      id: ask.id,
      softwareId: ask.softwareId,
      softwareName: names.get(ask.softwareId) ?? "a removed software",
      role: ask.role,
      kind: ask.kind,
      stage: ask.stage && isStageId(ask.stage) ? ask.stage : null,
      title: ask.title,
      instruction: ask.instruction,
      items: ask.items,
      ...(ask.extra.bestAttempt !== undefined && { bestAttempt: ask.extra.bestAttempt }),
      ...(ask.extra.choices !== undefined && { choices: ask.extra.choices }),
      ...(ask.extra.approval !== undefined && { approval: ask.extra.approval }),
      status: ask.status,
      ...(ask.answerSummary !== null && { answerSummary: ask.answerSummary }),
      asked: ask.asked,
      ...(ask.answered !== null && { answered: ask.answered }),
    };
  }

  private softwareNames(): Map<string, string> {
    return new Map(listSoftwares(this.db).map((s) => [s.id, s.name]));
  }

  async askList(
    filter: { softwareId?: string; status?: "open" | "answered" } = {},
  ): Promise<AskView[]> {
    const names = this.softwareNames();
    const asks = listAsks(this.db, filter).filter((a) => a.status !== "withdrawn" || filter.status);
    const open = asks.filter((a) => a.status === "open");
    const closed = asks.filter((a) => a.status !== "open").reverse();
    return [...open, ...closed].map((a) => this.askView(a, names));
  }

  async answer(id: number, answer: AskAnswer): Promise<AskView> {
    const ask = getAsk(this.db, id);
    if (!ask) {
      throw new ServiceError(
        "NOT_FOUND",
        "That question is not in premise any more. Reload the page.",
      );
    }
    if (ask.status !== "open") {
      throw new ServiceError(
        "ASK_CLOSED",
        ask.status === "withdrawn"
          ? `This was withdrawn before your answer arrived (${ask.answerSummary ?? "it no longer applies"}). Nothing was changed.`
          : `This was already answered (${ask.answerSummary ?? "answer recorded"}). Nothing was changed.`,
      );
    }
    const summary = validateAnswer(ask, answer);
    const software = this.require(ask.softwareId);

    if (ask.extra.meta?.gateRequest !== undefined && answer.kind === "approval") {
      try {
        this.options.gate.answerCard(id, answer.decision, summary, answer.reason);
      } catch (error) {
        if (error instanceof GateError) {
          throw new ServiceError(
            error.code === "NOT_APPROVABLE_AS_KIND" ? "INVALID" : "ASK_CLOSED",
            error.message,
          );
        }
        throw error;
      }
      this.queue.tick();
      return this.askView(getAsk(this.db, id)!, this.softwareNames());
    }

    // Record changes first: if the record refuses them, the ask stays open and nothing moved.
    const effects = this.recordEffects(software, ask, answer);
    transaction(this.db, () => {
      if (!closeAsk(this.db, id, "answered", answer, summary)) {
        throw new ServiceError(
          "ASK_CLOSED",
          "This was answered a moment ago. Nothing was changed.",
        );
      }
      effects();
    });
    this.queue.tick();
    return this.askView(getAsk(this.db, id)!, this.softwareNames());
  }

  private land(
    softwareId: string,
    operations: Operation[],
    reason: string,
    serves?: string[],
  ): (string | undefined)[] {
    try {
      const landed = this.writer.land(softwareId, operations, reason, {
        ...(serves && { serves }),
      });
      if (!landed.ok) {
        throw new ServiceError(
          "INVALID",
          `premise could not put this into the record: ${landed.diagnostics.map((d) => d.message).join(" ")} Edit the item it names, then confirm again.`,
        );
      }
      return landed.assigned;
    } catch (error) {
      if (error instanceof RecordError) {
        throw new ServiceError(
          "INVALID",
          `premise could not put this into the record: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Land a confirmed list: every item is added; struck ones are then struck with their reason. */
  private landList(
    softwareId: string,
    items: readonly DraftItem[],
    answer: AskAnswer,
    reason: string,
  ): { keptSize?: SizeClass; struckIds: string[] } {
    const answers = new Map((answer.kind === "items" ? answer.items : []).map((a) => [a.key, a]));
    const corrected = applyAnswers(items, answer.kind === "items" ? answer.items : []);
    const kept = new Map(corrected.keep.map((k) => [k.item.key, k]));
    const struck = new Map(corrected.struck.map((k) => [k.item.key, k.reason]));
    let keptSize: SizeClass | undefined;
    const ops: Operation[] = [];
    const struckAt: { index: number; reason: string }[] = [];
    // In the draft's order, so the record's IDs follow the list the person saw.
    for (const item of items) {
      if (item.kind === "size") {
        const entry = kept.get(item.key);
        if (entry) keptSize = sizeFrom(entry.text) ?? keptSize;
        continue;
      }
      const entry = kept.get(item.key) ?? {
        item,
        text: item.kind === "W" ? `${item.priority ?? "should"}: ${item.text}` : item.text,
        edited: false,
      };
      const op = addOperation(entry);
      if (!op) continue;
      if (struck.has(item.key) && answers.get(item.key)?.decision === "strike") {
        struckAt.push({ index: ops.length, reason: struck.get(item.key)! });
      }
      ops.push(op);
    }
    const assigned = this.land(softwareId, ops, reason);
    const struckIds = struckAt.map((s) => assigned[s.index]).filter((x): x is string => Boolean(x));
    if (struckAt.length > 0) {
      this.land(
        softwareId,
        struckAt.map((s, i) => ({ op: "strike" as const, id: struckIds[i]!, reason: s.reason })),
        "The operator struck these from the draft.",
      );
    }
    return { ...(keptSize && { keptSize }), struckIds };
  }

  /**
   * What answering an ask does to the record (done now, before the ask closes) and to the line
   * (returned, done inside the transaction that closes the ask).
   */
  private recordEffects(software: Software, ask: Ask, answer: AskAnswer): () => void {
    const id = software.id;
    const purpose = ask.extra.meta?.purpose as AskPurpose | undefined;
    const items = (ask.extra.meta?.items ?? []) as DraftItem[];
    const stage = ask.stage as StageId;
    switch (purpose) {
      case "draft": {
        const { keptSize } = this.landList(
          id,
          items,
          answer,
          `The operator confirmed the ${stageName(stage)} draft.`,
        );
        return () => {
          if (keptSize && keptSize !== software.sizeClass) {
            setSoftwareSizeClass(this.db, id, keptSize);
            setWorkItem(this.db, rootItem(this.db, id).id, { sizeClass: keptSize });
            this.premiseSays(
              id,
              `Size set to ${keptSize}: each stage before building gets a ${keptSize} software's budget.`,
            );
          }
          const next: StageId =
            this.state(id).returnTo === "say-back" ? "say-back" : this.after(id, stage);
          if (next === "say-back") this.setState(id, { returnTo: undefined });
          this.enterStage(getSoftware(this.db, id)!, next, `${stage} confirmed`);
        };
      }
      case "exists": {
        const text = answer.kind === "text" ? answer.text.trim() : "";
        const notBuild = /^do not build/i.test(text);
        const findings = items
          .map((item) => addOperation({ item, text: item.text, edited: false })!)
          .filter(Boolean);
        this.land(
          id,
          [
            ...findings,
            { op: "add", kind: "E", text: `Outcome: ${text.replace(/[()]/g, "")}`, from: OPERATOR },
          ],
          "The operator decided what to do about what already exists.",
        );
        return () => {
          if (notBuild) {
            this.setLifecycle(id, "ended", "operator decided not to build");
            this.openRun(software, "report", "not built");
            this.report(id, "do-not-build");
            this.premiseSays(
              id,
              `${software.name} will not be built. The report says why. If you change your mind, send it back to any stage.`,
            );
            return;
          }
          const next: StageId =
            this.state(id).returnTo === "say-back" ? "say-back" : this.after(id, "exists");
          if (next === "say-back") this.setState(id, { returnTo: undefined });
          this.enterStage(getSoftware(this.db, id)!, next, "outcome decided");
        };
      }
      case "say-back":
        return this.sayBackEffects(software, items, answer);
      case "milestones":
        return this.milestoneEffects(software, items, answer);
      case "stage-problem": {
        const text = answer.kind === "text" ? answer.text : "";
        return () => {
          const boost = text === PROBLEM_CHOICES[1] ? (this.state(id).boost ?? 1) * 2 : undefined;
          const current = software.currentStage as StageId;
          this.enterStage(software, current, "tried again");
          if (boost) {
            this.setState(id, { boost });
            // The job just queued carries the old budget; give it the new one.
            const job = this.queue
              .list("queued")
              .find((j) => j.softwareId === id && j.payload.run === this.state(id).run);
            if (job) {
              const budget = this.budgetFor(getSoftware(this.db, id)!, current)!;
              this.db
                .prepare("UPDATE jobs SET payload = ? WHERE id = ?")
                .run(JSON.stringify({ ...job.payload, limits: budget }), job.id);
            }
            this.premiseSays(id, `This stage now has twice the budget.`);
          }
        };
      }
      case "milestone-reached": {
        const text = answer.kind === "text" ? answer.text : "";
        return () => {
          if (/^go back/i.test(text)) {
            this.setLifecycle(id, "active", "operator went back to Why");
            this.clearWork(id, "Withdrawn: sent back to Why.");
            this.premiseSays(
              id,
              "Back to Why: the stages after it will be done again with what you say now.",
            );
            this.enterStage(getSoftware(this.db, id)!, "why", "operator went back to Why");
            return;
          }
          this.setLifecycle(id, "active", "operator said go on");
          const all = this.milestones(id);
          const at = all.findIndex((m) => m.id === ask.extra.meta?.milestone);
          this.nextMilestone(id, at >= 0 ? all[at + 1] : undefined);
        };
      }
      case "agent":
      default: {
        const said = answer.kind === "text" ? answer.text : JSON.stringify(answer);
        return () => {
          const answers = [...(this.state(id).answers ?? []), `${ask.title} → ${said}`].slice(-10);
          this.setState(id, { answers });
          this.premiseSays(id, "Noted. The agent's next step gets your answer.");
        };
      }
    }
  }

  private sayBackEffects(
    software: Software,
    items: readonly DraftItem[],
    answer: AskAnswer,
  ): () => void {
    const id = software.id;
    const struck = applyAnswers(items, answer.kind === "items" ? answer.items : []).struck;
    if (struck.length === 0) {
      return () => {
        this.premiseSays(
          id,
          "Nothing struck: premise has understood what matters. On to the plan.",
        );
        this.enterStage(software, this.after(id, "say-back"), "say-back passed");
      };
    }
    const live = new Map(this.recordLines(id).map((i) => [i.id, i]));
    const strikes: Operation[] = [];
    let earliest: EarlyStage = "plan";
    const rank = (s: EarlyStage) => EARLY.indexOf(s);
    for (const { item, reason } of struck) {
      const refs = (item.refs ?? []).filter((r) => live.has(r));
      for (const ref of refs) {
        if (!strikes.some((s) => s.op === "strike" && s.id === ref)) {
          strikes.push({ op: "strike", id: ref, reason: `Struck at the say back: ${reason}` });
        }
        const s = STAGE_OF_KIND[live.get(ref)!.kind] ?? "what";
        if (rank(s) < rank(earliest)) earliest = s;
      }
      if (refs.length === 0) {
        const s = item.kind === "size" ? "why" : (STAGE_OF_KIND[item.kind] ?? "what");
        if (rank(s) < rank(earliest)) earliest = s;
      }
    }
    if (earliest === "plan" || earliest === "say-back") earliest = "what";
    if (strikes.length > 0) this.land(id, strikes, "The operator struck these at the say back.");
    return () => {
      const rounds = (this.state(id).sayBackRounds ?? 0) + 1;
      this.setState(id, { returnTo: "say-back", sayBackRounds: rounds });
      const n = struck.length;
      this.premiseSays(
        id,
        `Struck ${n === 1 ? "1 item" : `${n} items`}${strikes.length ? `, and the record now has ${strikes.length === 1 ? "it" : "them"} struck too` : ""}. Back to ${stageName(earliest)} to redo that part; then premise says back again.${rounds >= 3 ? " This is the third round: if it keeps coming back wrong, say in chat what premise keeps missing." : ""}`,
      );
      this.enterStage(getSoftware(this.db, id)!, earliest, "items struck");
    };
  }

  private milestoneEffects(
    software: Software,
    items: readonly DraftItem[],
    answer: AskAnswer,
  ): () => void {
    const id = software.id;
    const plan = this.readPlan(id) ?? { decisions: [], milestones: [], tasks: [] };
    const corrected = applyAnswers(items, answer.kind === "items" ? answer.items : []);
    if (corrected.keep.length === 0) {
      throw new ServiceError(
        "INVALID",
        "Keep at least one milestone: the first is the smallest version that runs.",
      );
    }
    // Agents' own proposals for this round go in first, then the plan's decisions and milestones.
    for (const changeId of this.state(id).proposed ?? []) {
      const landed = this.writer.landProposed(id, changeId);
      if (!landed.ok) {
        this.premiseSays(
          id,
          `One change an agent proposed did not go into the record: ${landed.diagnostics.map((d) => d.message).join(" ")}`,
        );
      }
    }
    const decisions = plan.decisions
      .map((item) => addOperation({ item, text: item.text, edited: false }))
      .filter((op): op is NonNullable<typeof op> => op !== null);
    const milestones = corrected.keep
      .map((entry) => addOperation({ ...entry, item: { ...entry.item, kind: "M" } }))
      .filter((op): op is NonNullable<typeof op> => op !== null);
    this.land(id, [...decisions, ...milestones], "The operator confirmed the plan's milestones.");
    return () => {
      this.setState(id, { proposed: undefined });
      const waits = this.milestones(id).some((m) => m.wait);
      this.db
        .prepare("UPDATE softwares SET milestone_waits = ? WHERE id = ?")
        .run(waits ? 1 : 0, id);
      this.repositoryStep(getSoftware(this.db, id)!);
      const first = this.milestones(id)[0];
      this.enterLater(
        getSoftware(this.db, id)!,
        "build",
        first ? { id: first.id, text: first.text } : null,
        "plan confirmed",
      );
    };
  }

  // ---- The repository outside this machine, through the gate ------------------------------------

  private repositoryStep(software: Software): void {
    const remote = this.config.line.remote;
    const name = repositoryName(software.name);
    if (remote === "none") return;
    if (remote === "local") {
      void this.createRemoteRepository({ softwareId: software.id } as GateRequest).then((result) =>
        this.premiseSays(software.id, result.outcome),
      );
      return;
    }
    const visibility = this.config.runner.default_visibility;
    const kind: FloorKind = visibility === "public" ? "make-public" : "publish";
    this.options.gate.request({
      softwareId: software.id,
      kind,
      action: `Create a ${visibility} repository named ${name} on your GitHub account, and push ${software.name}'s code and record to it.`,
      why: "So the software and its record are kept off this machine too. Until then they live only in premise's data folder.",
      requestedBy: "line engine",
      perform: "create-repository",
      stage: "plan",
      waiting: "copying the software to GitHub; building goes on meanwhile",
    });
  }

  private async createRemoteRepository(
    request: Pick<GateRequest, "softwareId">,
  ): Promise<{ ok: boolean; outcome: string }> {
    const software = getSoftware(this.db, request.softwareId);
    if (!software) return { ok: false, outcome: "The software is not in premise any more." };
    const name = repositoryName(software.name);
    const host =
      this.config.line.remote === "local"
        ? new LocalRepositoryHost(this.options.keeper.git, join(this.config.data.folder, "remotes"))
        : new GitHubRepositoryHost();
    try {
      const created = await host.createRepository({
        softwareId: software.id,
        name,
        visibility: this.config.runner.default_visibility,
      });
      this.options.keeper.setRemote(software.id, created.url);
      const repo = this.options.keeper.repositoryPath(software.id);
      const failures = this.options.keeper.pushChecked(
        repo,
        "origin",
        this.config.record.default_branch,
      );
      if (failures.length > 0) {
        return {
          ok: false,
          outcome: `The copy was made, but nothing was pushed: ${failures.length} commit(s) failed the trace check.`,
        };
      }
      return { ok: true, outcome: `${software.name} now has a second copy: ${created.url}.` };
    } catch (error) {
      if (error instanceof RepositoryHostError) return { ok: false, outcome: error.message };
      return { ok: false, outcome: `The copy could not be made: ${(error as Error).message}` };
    }
  }

  /** The gate decided, or finished carrying out, a request: say so in the session. */
  private gateDecided(request: GateRequest): void {
    const software = getSoftware(this.db, request.softwareId);
    if (!software) return;
    switch (request.status) {
      case "refused":
        this.premiseSays(
          software.id,
          request.perform === "create-repository"
            ? `Declined: nothing was created, and ${software.name} stays on this machine. Everything else goes on.`
            : `Declined: ${request.action} The ${request.requestedBy} was told, and finds another way.`,
        );
        break;
      case "done":
        this.premiseSays(software.id, `Done: ${request.outcome ?? request.action}`);
        break;
      case "failed":
        this.premiseSays(software.id, `Not done: ${request.outcome ?? "the action failed."}`);
        break;
      default:
        break;
    }
    this.queue.tick();
  }

  // ---- Conversation ---------------------------------------------------------------------------

  async chatMessages(softwareId: string): Promise<ChatMessage[]> {
    this.require(softwareId);
    return listChatMessages(this.db, softwareId);
  }

  /** The draft that chat goes to: the current stage's open list. */
  private openDraft(softwareId: string, stage: string): Ask | undefined {
    return listAsks(this.db, { softwareId, status: "open" }).find(
      (a) => a.kind === "draft" && a.stage === stage,
    );
  }

  async chat(softwareId: string, raw: string): Promise<ChatResult> {
    const software = this.require(softwareId);
    const text = (raw ?? "").trim();
    if (!text) throw new ServiceError("INVALID", "Write something before sending.");
    if (text.length > MAX_CHAT) {
      throw new ServiceError(
        "INVALID",
        `That message is ${text.length} characters; keep it under ${MAX_CHAT}, or send it in parts.`,
      );
    }
    const result = transaction(this.db, () => {
      const draft = this.openDraft(softwareId, software.currentStage);
      if (draft) {
        const items = (draft.extra.meta?.items ?? []) as DraftItem[];
        const stage = software.currentStage as EarlyStage;
        const kind: ItemKind =
          draft.extra.meta?.purpose === "milestones"
            ? "M"
            : (STAGE_KINDS[stage as "why"]?.kind ?? "W");
        const key = `c${items.length + 1}-${Date.now().toString(36)}`;
        const added: DraftItem = {
          key,
          text: text.replace(/\s+/g, " "),
          kind,
          from: OPERATOR,
          ...(kind === "W" && { priority: "should" as const }),
          ...(kind === "M" && { wait: software.milestoneWaits }),
        };
        const nextItems = [...items, added];
        setAskItems(this.db, draft.id, [...draft.items, toAskItem(added)]);
        this.db
          .prepare("UPDATE asks SET extra = ? WHERE id = ?")
          .run(
            JSON.stringify({ ...draft.extra, meta: { ...draft.extra.meta, items: nextItems } }),
            draft.id,
          );
        const said = addChatMessage(this.db, {
          softwareId,
          author: "person",
          text,
          routedTo: `draft:${draft.id}`,
          askId: draft.id,
        });
        const reply = this.premiseSays(
          softwareId,
          `Added to the open ${stageName(draft.stage ?? "")} list as a new item, in your words. Keep, strike or edit it there, then confirm the list.`,
        );
        if (draft.extra.meta?.purpose === "draft" && (EARLY as readonly string[]).includes(stage)) {
          this.queueStageJob(
            software,
            stage,
            "correction",
            {
              draft: nextItems.map((i) => `- ${i.text}`).join("\n"),
              message: text,
            },
            { message: text, draftAsk: draft.id, addedKey: key },
          );
        }
        return { said, reply };
      }
      const number = countIntakeMessages(this.db, softwareId) + 1;
      const said = addChatMessage(this.db, {
        softwareId,
        author: "person",
        text,
        routedTo: `intake:I-${number}`,
      });
      const reply = this.premiseSays(
        softwareId,
        this.options.later.takeIn(softwareId, text, number, software.currentStage === "intake"),
      );
      return { said, reply };
    });
    this.queue.tick();
    return result;
  }

  // ---- Agents' tools --------------------------------------------------------------------------

  /** The job behind a tool call, when it still belongs to its software's current stage. */
  private jobOf(binding: ToolBinding): Job | ToolEnvelope {
    const job = this.queue.get(binding.jobId);
    if (!job || job.softwareId !== binding.softwareId)
      return toolFail("TASK_CLOSED", "This task is not in premise any more. Stop.");
    if (FINISHED.has(job.status)) return toolFail("TASK_CLOSED", "This task has ended. Stop.");
    if (job.payload.run !== undefined && !this.isCurrent(job)) {
      return toolFail(
        "TASK_CLOSED",
        "The software has moved to another stage since this task started. Stop; nothing you submit now is used.",
      );
    }
    return job;
  }

  /** draft_submit: a stage's draft becomes a list on the page, under the operator. */
  draftSubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    const software = getSoftware(this.db, job.softwareId)!;
    const stage = (
      typeof args.stage === "string" ? args.stage.toLowerCase().replace(/\s+/g, "-") : ""
    ) as string;
    const kindGiven = args.kind === "say-back";
    const target = (
      kindGiven ? "say-back" : stage === "what-exists" ? "exists" : stage
    ) as EarlyStage;
    if (target !== job.stage) {
      return toolFail(
        "MALFORMED",
        `This task is for the ${stageName(job.stage ?? "")} stage; submit a draft for that stage ("${job.stage}").`,
      );
    }
    try {
      return transaction(this.db, () => this.acceptDraft(software, job, target, args));
    } catch (error) {
      if (error instanceof DraftError)
        return toolFail("MALFORMED", "The draft cannot be shown as it is.", error.problems);
      throw error;
    }
  }

  private dryRun(softwareId: string, operations: Operation[]): string[] {
    if (operations.length === 0) return [];
    const result = applyOperations(this.options.keeper.readFiles(softwareId), operations, {
      today: new Date().toISOString().slice(0, 10),
    });
    return result.ok ? [] : result.diagnostics.map((d) => d.message);
  }

  private acceptDraft(
    software: Software,
    job: Job,
    stage: EarlyStage,
    args: Record<string, unknown>,
  ): ToolEnvelope {
    const id = software.id;
    const replaced = this.openDraftOfStage(id, stage);
    const replace = (newAsk: Ask) => {
      if (replaced && replaced.id !== newAsk.id)
        closeAsk(this.db, replaced.id, "withdrawn", null, "Replaced by a corrected draft.");
    };
    if (stage === "plan") {
      const decisions = readDraftItems(args.items, { defaultKind: "D", allowed: ["D", "M"] });
      const fromItems = decisions.filter((d) => d.kind === "M");
      const listed = Array.isArray(args.milestones)
        ? readDraftItems(args.milestones, { defaultKind: "M", allowed: ["M"] })
        : [];
      const milestones = [...fromItems, ...listed].map((m, i) => ({
        ...m,
        kind: "M" as const,
        key: `m${i + 1}`,
      }));
      const ds = decisions.filter((d) => d.kind === "D");
      const problems = this.dryRun(
        id,
        ds.map((item) => addOperation({ item, text: item.text, edited: false })!),
      );
      if (problems.length)
        return toolFail("MALFORMED", "Some decisions would not fit the record.", problems);
      if (milestones.length === 0) {
        return toolFail(
          "MALFORMED",
          'Give the software\'s milestones as "milestones": a short list, the first being the smallest version that runs.',
        );
      }
      const tasks = Array.isArray(args.tasks)
        ? args.tasks.map((t, i) => {
            const v = (typeof t === "string" ? { title: t } : (t ?? {})) as Record<string, unknown>;
            return {
              title: typeof v.title === "string" ? v.title : `Task ${i + 1}`,
              items: Array.isArray(v.items)
                ? v.items.filter((x): x is string => typeof x === "string")
                : [],
              ...(typeof v.check === "string" && { check: v.check }),
            };
          })
        : [];
      this.writePlan(id, { decisions: ds, milestones, tasks });
      return toolOk({
        status: "received",
        note: "premise keeps the plan. The operator sees the milestones once you finish.",
      });
    }

    if (stage === "exists") {
      const items = readDraftItems(args.items ?? [], { defaultKind: "E", allowed: ["E"] });
      const outcome = typeof args.outcome === "string" ? args.outcome : "";
      const recommended =
        EXISTS_OUTCOMES.find((o) => o.toLowerCase() === outcome.toLowerCase()) ??
        (/do not|don't/i.test(outcome)
          ? EXISTS_OUTCOMES[3]
          : /different/i.test(outcome)
            ? EXISTS_OUTCOMES[2]
            : /build on/i.test(outcome)
              ? EXISTS_OUTCOMES[1]
              : EXISTS_OUTCOMES[0]);
      const problems = this.dryRun(
        id,
        items.map((item) => addOperation({ item, text: item.text, edited: false })!),
      );
      if (problems.length)
        return toolFail("MALFORMED", "Some items would not fit the record.", problems);
      const why =
        typeof args.reason === "string" && args.reason.trim() ? ` ${args.reason.trim()}` : "";
      const ask = createAsk(this.db, {
        softwareId: id,
        role: OPERATOR,
        kind: "question",
        stage: "exists",
        title: "Build it, build on something, or not build it?",
        instruction: `This is what already exists${items.length ? "" : " (nothing was found)"}. premise recommends: ${recommended}.${why} Pick one, or write your own answer.`,
        items: items.map(toAskItem),
        extra: {
          bestAttempt: recommended,
          choices: [...EXISTS_OUTCOMES],
          meta: { purpose: "exists", items, job: job.id },
        },
      });
      replace(ask);
      return toolOk({
        draft_id: ask.id,
        status: "shown",
        note: "The operator decides the outcome.",
      });
    }

    if (stage === "say-back") {
      const items = readDraftItems(args.items, {
        defaultKind: "Y",
        allowed: ["Y", "U", "R", "E", "W", "D", "M"],
        allowSize: true,
        max: this.config.line.say_back_max_items,
      });
      const ask = createAsk(this.db, {
        softwareId: id,
        role: OPERATOR,
        kind: "say-back",
        stage: "say-back",
        title: "Say back: what I understood",
        instruction:
          "Before any code is written: this is what premise understood and assumed. Strike anything wrong and say why; each struck item goes back to its stage. Whatever you leave is taken as right.",
        items: items.map(toAskItem),
        extra: { meta: { purpose: "say-back", items, job: job.id } },
      });
      replace(ask);
      return toolOk({ draft_id: ask.id, status: "shown" });
    }

    const kinds = STAGE_KINDS[stage];
    const items = readDraftItems(args.items, {
      defaultKind: kinds.kind,
      allowed: kinds.allowed,
      allowSize: stage === "why",
      ...(stage === "why" && { max: this.config.line.why_items_max + 1 }),
    });
    const problems = this.dryRun(
      id,
      items
        .map((item) => addOperation({ item, text: item.text, edited: false }))
        .filter((o): o is NonNullable<typeof o> => o !== null),
    );
    if (problems.length)
      return toolFail("MALFORMED", "Some items would not fit the record.", problems);
    const ask = createAsk(this.db, {
      softwareId: id,
      role: OPERATOR,
      kind: "draft",
      stage,
      title: DRAFT_TITLES[stage as "why"],
      instruction: DRAFT_INSTRUCTIONS[stage as "why"],
      items: items.map(toAskItem),
      extra: { meta: { purpose: "draft", items, job: job.id } },
    });
    replace(ask);
    if (replaced)
      this.premiseSays(id, `The ${stageName(stage)} list was redrafted with your correction.`);
    return toolOk({
      draft_id: ask.id,
      status: "shown",
      note: "The operator strikes, keeps or edits each item.",
    });
  }

  private openDraftOfStage(softwareId: string, stage: EarlyStage): Ask | undefined {
    return listAsks(this.db, { softwareId, status: "open" }).find(
      (a) =>
        a.stage === stage &&
        ["draft", "say-back", "exists"].includes(String(a.extra.meta?.purpose)),
    );
  }

  /** record_read: the record's live lines, or the named items or files. */
  recordRead(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const wanted = Array.isArray(args.items)
      ? args.items.filter((x): x is string => typeof x === "string")
      : [];
    const all = this.recordLines(binding.softwareId, {
      includeStruck: args.include_struck === true,
    });
    const lines = all.filter(
      (i) => wanted.length === 0 || wanted.includes(i.id) || wanted.includes(i.file),
    );
    const unknown = wanted.filter((w) => /^[A-Z]-\d+$/.test(w) && !all.some((i) => i.id === w));
    if (unknown.length)
      return toolFail(
        "UNKNOWN_ITEM",
        `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in the record. Read it without names to see the IDs there are.`,
      );
    return toolOk({
      lines: lines.map((i) => ({ id: i.id, file: i.file, line: formatItemLine(i) })),
    });
  }

  /** record_propose: checked by the record keeper; accepted later with the stage's confirmation. */
  recordPropose(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    if (!Array.isArray(args.operations) || typeof args.reason !== "string") {
      return toolFail("MALFORMED", 'Give "operations" (a list) and one "reason".');
    }
    const result = this.options.keeper.propose(
      job.softwareId,
      args.operations as Operation[],
      args.reason,
      {
        proposer: { agentRole: binding.role as "drafter" },
        proposedBy: `${binding.role}, job ${job.id}`,
      },
    );
    if (result.status === "rejected") {
      const code = result.diagnostics[0]?.code;
      return toolFail(
        code === "UNKNOWN_ITEM" || code === "CONFLICT" || code === "NOT_ALLOWED"
          ? code
          : "MALFORMED",
        "The record keeper refused the change.",
        result.diagnostics.map((d) => d.message),
      );
    }
    this.setState(job.softwareId, {
      proposed: [...(this.state(job.softwareId).proposed ?? []), result.changeId],
    });
    return toolOk({
      change_id: result.changeId,
      status: result.status,
      note: "Checked. It goes into the record when the operator confirms the plan.",
    });
  }

  /** ask: a question for a person, under its role. The agent carries on; the answer reaches its next brief. */
  askPerson(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    const role =
      String(args.role ?? OPERATOR)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-") || OPERATOR;
    const items = (args.items as unknown[]).map((t) => String(t).trim()).filter(Boolean);
    const kind = args.kind as "question" | "proposal" | "needed";
    const ask = createAsk(this.db, {
      softwareId: job.softwareId,
      role,
      kind,
      stage: job.stage,
      title:
        kind === "needed"
          ? "Something is needed from you"
          : items.length === 1
            ? items[0]!.slice(0, 120)
            : `A question from the ${binding.role}`,
      instruction:
        kind === "needed"
          ? `The ${binding.role} needs this to go on. Mark it done when it is, or say why it cannot be done.`
          : `The ${binding.role} asks this while working on ${stageName(job.stage ?? "")}. Answer in your own words; the rest of the work goes on.`,
      items:
        items.length > 1
          ? items.map((text, i) => ({ key: `q${i + 1}`, text, mark: "assumed" as const }))
          : [],
      waitingJob: job.id,
      extra: { meta: { purpose: "agent", job: job.id } },
    });
    return toolOk({
      ask_id: ask.id,
      status: "asked",
      note: "Carry on with your best attempt and say in task_finish what waits on the answer; it reaches the next brief.",
    });
  }

  /** gate_request: a floor action goes to the gate. */
  gateRequest(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    if (!isFloorKind(args.kind)) {
      return toolFail(
        "MALFORMED",
        `"${String(args.kind)}" is not a floor kind. Use one of: delete-data, credentials, expose, access, spend, make-public, publish, post.`,
      );
    }
    try {
      const request = this.options.gate.request({
        softwareId: job.softwareId,
        kind: args.kind,
        action: String(args.action ?? ""),
        why: String(args.why ?? ""),
        items: Array.isArray(args.items)
          ? args.items.filter((x): x is string => typeof x === "string")
          : [],
        requestedBy: `${binding.role}, job ${job.id}`,
        jobId: job.id,
        waiting: `the ${binding.role}'s work on ${stageName(job.stage ?? "")}`,
        stage: job.stage,
      });
      return toolOk({
        request_id: request.id,
        status: request.status === "asked" ? "asked" : "approved",
        note:
          request.status === "asked"
            ? "The operator is asked in the session. Do not wait: finish what you can without it and say in task_finish what waits on it."
            : "A standing approval covers it. The server, not you, carries it out.",
      });
    } catch (error) {
      if (error instanceof GateError) return toolFail("MALFORMED", error.message);
      throw error;
    }
  }

  /** review_submit: the reviewer's verdict on the plan's foundation decisions. */
  reviewSubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    if (!Array.isArray(args.reviews))
      return toolFail("MALFORMED", 'Give "reviews": a list of verdicts.');
    const objections: string[] = [];
    for (const r of args.reviews as Record<string, unknown>[]) {
      const verdict = String(r?.verdict ?? "");
      if (!["agree", "object", "consistent", "conflicting"].includes(verdict)) {
        return toolFail(
          "MALFORMED",
          'Each review needs a verdict: "agree" or "object" for a decision, "consistent" or "conflicting" for a change.',
        );
      }
      if (verdict === "object" || verdict === "conflicting") {
        objections.push(
          `${typeof r.decision === "string" ? `${r.decision}: ` : ""}${typeof r.reasons === "string" ? r.reasons : "no reason given"}`,
        );
      }
    }
    const review = this.state(job.softwareId).review ?? { round: 1, objections: [] };
    this.setState(job.softwareId, { review: { ...review, objections } });
    return toolOk({ status: "received", objections: objections.length });
  }

  /** task_finish: a correction job saying the message was not about the draft hands it to intake. */
  taskFinished(binding: ToolBinding, account: { status: string; note: string | null }): void {
    const job = this.queue.get(binding.jobId);
    if (!job || job.payload.purpose !== "correction") return;
    if (!/not about the draft/i.test(account.note ?? "")) return;
    const context = job.payload.context as
      { draftAsk?: number; addedKey?: string; message?: string } | undefined;
    const draft = context?.draftAsk ? getAsk(this.db, context.draftAsk) : undefined;
    transaction(this.db, () => {
      if (draft && draft.status === "open" && context?.addedKey) {
        setAskItems(
          this.db,
          draft.id,
          draft.items.filter((i) => i.key !== context.addedKey),
        );
        const items = ((draft.extra.meta?.items ?? []) as DraftItem[]).filter(
          (i) => i.key !== context.addedKey,
        );
        this.db
          .prepare("UPDATE asks SET extra = ? WHERE id = ?")
          .run(JSON.stringify({ ...draft.extra, meta: { ...draft.extra.meta, items } }), draft.id);
      }
      const number = countIntakeMessages(this.db, job.softwareId) + 1;
      addChatMessage(this.db, {
        softwareId: job.softwareId,
        author: "premise",
        text: `That message was not about the open list, so it was taken off it. ${this.options.later.takeIn(job.softwareId, context?.message ?? "", number, false)}`,
        routedTo: `intake:I-${number}`,
      });
    });
  }

  /** The server's part of Run. */
  runServerJob(job: Job): Promise<AgentOutcome> {
    return this.options.later.runServerJob(job);
  }

  // ---- Record and report ----------------------------------------------------------------------

  async recordView(softwareId: string): Promise<RecordView> {
    this.require(softwareId);
    const items = this.recordLines(softwareId, { includeStruck: true });
    const files: RecordFileView[] = RECORD_VIEW_FILES.map((f) => ({
      file: f.file,
      title: f.title,
      plain: f.plain,
      items: items
        .filter((i) => i.file === f.file)
        .map((i) => ({
          id: i.id,
          text: i.text,
          marks: itemMarks(i),
          status: i.struck ? ("struck" as const) : ("live" as const),
          ...(i.marks.replaces && { replaces: i.marks.replaces }),
          ...(i.struck && { reason: i.struck.reason }),
        })),
    }));
    return { softwareId, source: "record", files };
  }
}

const ENTER_WORDS: Record<EarlyStage, string> = {
  why: "First, why it is worth building. A drafter is writing a short list from your words; it appears under Waiting on you.",
  who: "Next, who it is for and who decides what. A drafter is writing that list now.",
  exists: "Looking at what already exists, so nothing is built for nothing. A researcher is on it.",
  what: "Next, what it must do. A drafter is writing that list now; add anything missing in chat.",
  "say-back":
    "Before planning, premise is writing down what it understood, for you to strike anything wrong.",
  plan: "Planning: a planner is choosing how to build it and in what order, smallest running version first.",
};

const DRAFT_TITLES: Record<"why" | "who" | "what", string> = {
  why: "Why build it: is this right?",
  who: "Who it is for: is this right?",
  what: "What it must do: is this right?",
};

const DRAFT_INSTRUCTIONS: Record<"why" | "who" | "what", string> = {
  why: "Strike anything wrong and edit anything half right. Whatever you leave alone is kept. Items marked assumed are premise's guesses. Then confirm.",
  who: "Strike anyone who does not belong and edit what is half right. Roles are who decides what; usually that is only you. Then confirm.",
  what: "Each line says must, should or could. Strike what it should not do, edit what is half right, then confirm. Add anything missing in chat.",
};

const RECORD_VIEW_FILES = [
  { file: "why.md", title: "Why", plain: "The problem, and why to build" },
  { file: "who.md", title: "Who", plain: "Who it is for, and the roles it needs" },
  {
    file: "exists.md",
    title: "What exists",
    plain: "What already exists, and what was decided about it",
  },
  { file: "what.md", title: "What", plain: "What it must, should and could do" },
  { file: "decisions.md", title: "Decisions", plain: "Technical choices, each with its reason" },
  {
    file: "milestones.md",
    title: "Milestones",
    plain: "The order of the work; each ends with running software",
  },
];

function itemMarks(item: RecordItem): string[] {
  return [
    item.marks.priority,
    item.marks.from === "assumed" ? "assumed" : `from: ${item.marks.from}`,
    item.marks.foundation ? "foundation" : undefined,
    item.marks.wait ? "stop after it" : undefined,
    item.marks.date,
  ].filter((m): m is string => Boolean(m));
}

/** A job in plain words, for status lines. */
export function jobWords(job: Pick<Job, "kind" | "payload">): string {
  const purpose = job.payload.purpose;
  if (purpose === "correction") return "drafter, working in your correction";
  if (purpose === "review") return "reviewer, checking the plan's costly choices";
  if (purpose === "revision") return "planner, revising the plan";
  switch (job.kind) {
    case "draft":
      return "drafter";
    case "research":
      return "researcher";
    case "plan":
      return "planner";
    case "build":
      return "builder";
    case "check":
      return "checker";
    case "run":
      return "start on this machine";
    default:
      return job.kind;
  }
}
