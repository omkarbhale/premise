import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentOutcome } from "../agents/agent-runner.js";
import { ANSWER_SHAPES, againJob, askedAgain } from "../agents/ask-again.js";
import type { ToolBinding, ToolEnvelope } from "../agents/tool-server.js";
import { toolFail, toolOk } from "../agents/tool-server.js";
import {
  type BudgetGroup,
  FLOOR_KINDS,
  type PremiseConfig,
  type StageBudget,
  type FloorKind,
} from "../config/settings.js";
import {
  type Gate,
  GateError,
  type GateRequest,
  type PerformResult,
  isFloorKind,
} from "../gate/gate.js";
import { GitHubCli, type GitHubLogin } from "../git/github.js";
import {
  GitHubRepositoryHost,
  LocalRepositoryHost,
  RepositoryHostError,
  validRepositoryName,
} from "../git/repository-host.js";
import type { Job, JobKind, WorkQueue } from "../queue/work-queue.js";
import { applyOperations, type Operation } from "../record/change.js";
import { type ItemKind, type RecordItem, formatItemLine } from "../record/format.js";
import { RecordError, type RecordKeeper } from "../record/record-keeper.js";
import { intakeItemOfWork } from "../intake/items.js";
import { secretWritten, secretsFile } from "../runner/secrets.js";
import { type Taste, roleLabel, roleWords } from "../taste/taste.js";
import {
  ServiceError,
  type BringInInput,
  type ChatResult,
  type StartSoftwareInput,
} from "../server/services.js";
import type {
  ApprovalView,
  ClaimView,
  EarlierAnswer,
  AskAnswer,
  AskView,
  ChangeView,
  ChatMessage,
  ExistingView,
  MilestoneView,
  RecordFileView,
  RecordView,
  SoftwareDetail,
  SoftwareSummary,
  StageView,
  WorkItemView,
} from "../shared/api-types.js";
import {
  EFFORT_WORDS,
  SIZE_CLASSES,
  STAGES,
  STAGE_IDS,
  type SizeClass,
  type SoftwareEffort,
  type StageId,
  isStageId,
  stageName,
  stageNumber,
} from "../shared/stages.js";
import { type Ask, closeAsk, createAsk, getAsk, listAsks, setAskItems } from "../storage/asks.js";
import { addChatMessage, listChatMessages } from "../storage/chat.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import {
  type Software,
  createSoftware,
  getSoftware,
  isEffort,
  listSoftwares,
  setSoftwareEffort,
  setSoftwarePriority,
  setSoftwareSizeClass,
  setSoftwareStage,
  setSoftwareState,
} from "../storage/softwares.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { nameFromIdea, repositoryName } from "../demo/drafts.js";
import {
  type Recovery,
  mergeRun,
  readRecovery,
  recoveryOperations,
  runFile,
  runProblems,
  traceFile,
  traceLinks,
  unconfirmed,
} from "../existing/recovery.js";
import {
  SourceError,
  copySource,
  nameFromSource,
  pushRecordBranch,
  readSource,
} from "../existing/source.js";
import {
  type ExistingSoftware,
  addExisting,
  copyNotReady,
  getExisting,
  listExisting,
  setExisting,
} from "../existing/store.js";
import { answerWords, validateAnswer } from "./answers.js";
import type { BriefName, Briefs } from "./briefs.js";
import {
  type DraftItem,
  DraftError,
  addOperation,
  applyAnswers,
  checkOperatorQuotes,
  readDraftItems,
  sameWords,
  sizeFrom,
  toAskItem,
  toFindingItem,
} from "./draft-items.js";
import type { IntakeHooks, IntakeLine } from "./intake-hooks.js";
import type {
  ChangeWork,
  LaterOutcome,
  LaterStageId,
  LaterStages,
  MilestoneRef,
} from "./later-stages.js";
import {
  type ChangeNotes,
  type ChangePlan,
  type ChangeQuestions,
  CHANGE_QUESTION_WORDS,
  decisionText,
  isChangeQuestions,
  readChangePlan,
  readChangeSubmission,
  reasonsToAsk,
  removeChangePlan,
  writeChangePlan,
} from "./change-plan.js";
import { RecordWriter, droppedLine } from "./record-writer.js";
import {
  allowedStages,
  defaultStages,
  maySplit,
  pieceWords,
  readSizing,
  requiredStages,
  settleStages,
} from "./sizing.js";
import {
  type ScopeChoice,
  choiceFrom,
  cutForEffort,
  placeFor,
  scopeCuts,
  scopeTiers,
  scopeWords,
} from "./scope.js";
import { planProblems, waitAfterFirst } from "./plan-checks.js";
import { StandInWholeCheck, type WholeCheck } from "./whole-check.js";
import {
  type SizedBy,
  type Sizing,
  type SizingProposal,
  type WorkItem,
  type WorkItemOrigin,
  ancestry,
  childItems,
  createWorkItem,
  activeWorkItem,
  getWorkItem,
  itemState,
  listWorkItems,
  minutesBeforeBuild,
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
/** What exists now, for software premise took on: is all of it still needed? (decision 0189) */
export const EXISTING_OUTCOMES = [
  "Keep it as it is",
  "Use what exists for part of it",
  "Stop: it is no longer needed",
] as const;
const MILESTONE_CHOICES = ["Go on", "Go back to Why"] as const;
const PROBLEM_CHOICES = ["Try again", "Try again with twice the budget"] as const;
const TRY_AGAIN = "Try again";
const KEEP_HERE = "Keep it on this machine";

/** What an ask is for, kept in its meta. */
type AskPurpose =
  | "draft"
  | "exists"
  | "scope"
  | "say-back"
  | "recovered-say-back"
  | "milestones"
  | "stage-problem"
  | "milestone-reached"
  | "start-command"
  | "taste-proposal"
  | "repository-retry"
  | "change-confirm"
  | "change-notice"
  | "agent";

/** The line's notes on one work item, kept with the item. */
interface ItemNotes {
  /** The item's parts: made by a split, a confirmed plan's milestones, or recovery part by part. */
  children?: "split" | "plan" | "recover";
  /** The last stage the item went through itself before its parts took over; null for a split. */
  handedOffAt?: StageId | null;
  /** When its parts are done, the item goes on after this stage. */
  resumeAfter?: StageId;
  /** Rounds of the whole-piece check so far. */
  wholeRound?: number;
  /** For an intake item's work: what the triager found it is (bug, wish, ...). */
  intakeKind?: string;
  /** For existing software: what the drafter's recovery submitted, used when its job ends. */
  recovery?: Recovery;
  /** For an intake item's work: what its change is and how the person was told (0273, 0274). */
  change?: ChangeNotes;
}

/** Fixes the whole-piece check may ask for before premise goes on and reports it. */
const WHOLE_CHECK_ROUNDS = 3;

/** The line engine's own notes on a software, kept with it in the database. */
interface LineState extends ItemNotes {
  /** The work item being worked on now; the software's root item when not set. */
  item?: number;
  /** The current stage run (stage_runs.id); jobs of older runs are ignored. */
  run?: number;
  /** After a stage is redone for a struck say-back item, go straight back to the say-back. */
  returnTo?: "say-back";
  /** Budget multiplier the operator gave the current stage run. */
  boost?: number;
  sayBackRounds?: number;
  /** Foundation review round, the objections left open, and whether the reviewer answered. */
  review?: { round: number; objections: string[]; submitted?: boolean };
  /** The milestone being worked on, from Build to Report. */
  milestone?: string | null;
  /** Record changes agents proposed in this round, accepted when the plan is confirmed. */
  proposed?: number[];
  /** Answers people gave to agents' questions, passed to the next brief. */
  answers?: string[];
  /** What the operator chose at the scope check (decision 0191); none when it was not needed. */
  scope?: ScopeChoice;
  /** The name of the GitHub repository premise asked to create (decision 0260). */
  repositoryName?: string;
  /** When premise asks about a change before building it, chosen for this software (0274). */
  changeQuestions?: ChangeQuestions;
}

interface StoredPlan {
  decisions: DraftItem[];
  milestones: DraftItem[];
  /** Ordered tasks; "milestone" is the 1-based number of the plan's milestone it belongs to. */
  tasks: { title: string; items: string[]; check?: string; milestone?: number }[];
  /** What kind of software it is, in the planner's words (no fixed list; decision 0167). */
  kind?: string;
  /** How to build, start and check this software, for the builder and the checker. */
  how_to_run?: string;
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
  /** Intake: chat that is not an answer, and the work intake items become. */
  intake: IntakeHooks;
  /** Taste claims and their proposals (src/taste). */
  taste: Taste;
  /** The check of a whole piece once its parts are done; a labelled stand-in when not given. */
  wholeCheck?: WholeCheck;
  /** False while no agent can start; status lines then say why work waits. */
  agentsReady?: () => boolean;
  /**
   * True when the agents are real (not scripted, not a scripted demo). Only then does premise act
   * outside this machine: create a GitHub repository, or push to a repository elsewhere (0260).
   */
  realAgents?: () => boolean;
  /** The GitHub CLI the server uses; from the github settings when not given. */
  github?: GitHubCli;
  /** Writes the report at each milestone's end and when a software is not built. */
  reporter?: {
    write(
      softwareId: string,
      trigger: "milestone" | "do-not-build" | "change-running",
      reference?: string,
    ): Promise<unknown>;
  };
}

export class LineEngine implements IntakeLine {
  private readonly db: Database;
  private readonly writer: RecordWriter;
  private readonly wholeCheck: WholeCheck;
  private readonly deferred = new Set<Promise<void>>();
  private afterCommit: (() => void)[] = [];

  constructor(private readonly options: LineEngineOptions) {
    this.db = options.db;
    this.writer = new RecordWriter(options.keeper);
    this.wholeCheck = options.wholeCheck ?? new StandInWholeCheck();
    options.gate.onDecided((request) => this.gateDecided(request));
    options.gate.registerPerformer(
      "create-repository",
      (request) => this.createRemoteRepository(request),
      { onCutOff: (request) => this.repositoryCutOff(request) },
    );
    options.gate.registerPerformer("add-record", (request) => this.addRecordToRepository(request));
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
    return asSize(software.sizeClass);
  }

  /** The effort budget of an early stage for the piece being worked on, with any boost given. */
  budgetFor(software: Software, stage: string): StageBudget | null {
    if (!(EARLY as readonly string[]).includes(stage)) return null;
    const item = this.active(software.id);
    const size = asSize(item.sizeClass);
    const group =
      stage === "why" && this.isRecovery(item) ? "recover" : STAGE_JOB[stage as EarlyStage].group;
    const base = this.config.line.budgets[group][size];
    const boost = this.state(software.id).boost ?? 1;
    // Effort scales the stages before building (decision 0191).
    const percent =
      software.effort === "low"
        ? this.config.line.low_effort_budget_percent
        : software.effort === "high"
          ? this.config.line.high_effort_budget_percent
          : 100;
    const scaled = (n: number) => Math.max(1, Math.round((n * percent) / 100));
    return { turns: scaled(base.turns) * boost, minutes: scaled(base.minutes) * boost };
  }

  /** The software's state, on its row. Its work items keep their own states. */
  private setLifecycle(id: string, state: Software["state"], why: string): void {
    setSoftwareState(this.db, id, state, why);
  }

  /** The work item being worked on now: one of the software's items, or the software itself. */
  private active(softwareId: string): WorkItem {
    return activeWorkItem(this.db, softwareId);
  }

  private notes(item: WorkItem): ItemNotes {
    return itemState<ItemNotes>(this.db, item.id);
  }

  private setNotes(item: WorkItem, change: Partial<ItemNotes>): void {
    const next: Record<string, unknown> = { ...itemState(this.db, item.id), ...change };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    setItemState(this.db, item.id, next);
  }

  // ---- Changes from intake (decisions 0273, 0274) ----------------------------------------------

  /** The change a piece belongs to: the intake item's work it is, or a step of it. */
  private changeOf(item: WorkItem): WorkItem | null {
    return ancestry(this.db, item).find((i) => i.kind === "intake") ?? null;
  }

  private changeNotes(change: WorkItem): ChangeNotes {
    return this.notes(change).change ?? { items: [], assumed: [], suggestions: [] };
  }

  private setChangeNotes(change: WorkItem, update: Partial<ChangeNotes>): void {
    const next: ChangeNotes = { ...this.changeNotes(change), ...update };
    for (const key of Object.keys(next) as (keyof ChangeNotes)[]) {
      if (next[key] === undefined) delete next[key];
    }
    this.setNotes(change, { change: next });
  }

  /** The change's words without its reference: "I-1: Sort by author" → "Sort by author". */
  private changeTitle(change: WorkItem): string {
    const title = (change.title ?? "").trim();
    const ref = change.ref ?? "";
    return (ref && title.startsWith(`${ref}:`) ? title.slice(ref.length + 1) : title).trim();
  }

  /**
   * When premise asks about this software's changes before building them: the software's own
   * choice, else the setting, else its effort (high asks about every change) (decision 0274).
   */
  changeQuestionsOf(software: Software): ChangeQuestions {
    return (
      this.state(software.id).changeQuestions ??
      this.config.line.change_questions ??
      (software.effort === "high" ? "every-change" : "when-it-matters")
    );
  }

  async setChangeQuestions(id: string, value: unknown): Promise<void> {
    const software = this.require(id);
    if (!isChangeQuestions(value)) {
      throw new ServiceError(
        "INVALID",
        "Choose when premise asks about a change: every-change, when-it-matters or never.",
      );
    }
    transaction(this.db, () => {
      this.setState(id, { changeQuestions: value });
      this.premiseSays(
        id,
        `From now on, for ${software.name}'s changes: ${CHANGE_QUESTION_WORDS[value].toLowerCase()}. A bug is never asked about.`,
      );
    });
  }

  private changePlanOf(softwareId: string, item: WorkItem): ChangePlan | null {
    return readChangePlan(this.config.data.folder, softwareId, item.id);
  }

  /** Record items the intake item's triage found the change touches. */
  private triageTouches(change: WorkItem): string[] {
    return intakeItemOfWork(this.db, change.id)?.touches.map((t) => t.id) ?? [];
  }

  /** What Build and Check need to build only this change (decision 0273). */
  private changeWork(softwareId: string): ChangeWork | null {
    const item = this.active(softwareId);
    const change = this.changeOf(item);
    if (!change) return null;
    const notes = this.changeNotes(change);
    const plan = this.changePlanOf(softwareId, item);
    const live = new Set(this.recordLines(softwareId).map((i) => i.id));
    const own = [...notes.items, ...notes.assumed, ...(notes.decisions ?? [])];
    const tasks = plan?.tasks ?? [];
    const touched = [
      ...new Set([...tasks.flatMap((t) => t.items), ...own, ...this.triageTouches(change)]),
    ].filter((i) => live.has(i));
    const title = item.id === change.id ? this.changeTitle(change) : (item.title ?? "");
    return {
      ref: change.ref ?? "the change",
      title,
      tasks:
        tasks.length > 0
          ? tasks
          : [
              {
                title: `${change.ref ?? "The change"}: ${title}`,
                items: touched,
                ...(item.words && { check: item.words }),
              },
            ],
      touched,
    };
  }

  /**
   * Before a change is built (decision 0274): at most one blocking question, and only when it
   * matters (it replaces a foundation decision or is otherwise costly to undo, or the person's words
   * left a real choice open) or the software's setting asks about every change. Otherwise premise
   * says what it understood and assumed, and builds at once; each line stays strikeable. True when
   * premise asked and the line waits for the answer.
   */
  private holdForChange(software: Software, item: WorkItem): boolean {
    const change = this.changeOf(item);
    if (!change) return false;
    const notes = this.changeNotes(change);
    const plan = this.changePlanOf(software.id, item);
    if (notes.decided || change.origin === "bug") {
      // Asked or told once already (or a bug, never asked): a later step's decisions go in as made.
      this.landChangeDecisions(software.id, change, item, plan, plan?.decisions ?? []);
      return false;
    }
    const mode = this.changeQuestionsOf(software);
    const reasons = reasonsToAsk(plan, notes, this.recordLines(software.id));
    // A change of purpose was said back already: that was its one question.
    const asks =
      change.origin !== "purpose" &&
      (mode === "every-change" || (mode === "when-it-matters" && reasons.length > 0));
    if (asks) {
      this.askChange(software, change, item, plan, reasons);
      return true;
    }
    this.tellChange(software, change, item, plan);
    return false;
  }

  /** What the person answered about each decision at this change's last answered question, by the line shown. */
  private earlierAnswers(notes: ChangeNotes): Map<string, EarlierAnswer> {
    const out = new Map<string, EarlierAnswer>();
    const ask = notes.ask === undefined ? undefined : getAsk(this.db, notes.ask);
    if (!ask || ask.status !== "answered" || ask.extra.meta?.purpose !== "change-confirm")
      return out;
    const meta = ask.extra.meta as { items?: DraftItem[] };
    const given = new Map(
      (ask.answer?.kind === "items" ? ask.answer.items : []).map((a) => [a.key, a]),
    );
    for (const i of meta.items ?? []) {
      if (!/^d\d+$/.test(i.key)) continue;
      const a = given.get(i.key);
      if (a?.decision === "strike") {
        out.set(i.text, { decision: "strike", ...(a.reason && { reason: a.reason }) });
      } else if (a?.decision === "edit") {
        out.set(i.text, { decision: "edit", text: a.text });
      }
    }
    return out;
  }

  /** A decision as the person edited it: their words, without the "(replaces ...)" and "Why: ..." the question showed. */
  private editedDecision(
    d: ChangePlan["decisions"][number],
    shown: string,
  ): ChangePlan["decisions"][number] {
    const suffix = this.decisionLine(d).slice(d.text.length);
    const words = suffix && shown.endsWith(suffix) ? shown.slice(0, -suffix.length) : shown;
    return { ...d, text: words.trim() || d.text };
  }

  /** The change's lines a person can strike: what it took from their words, and what it assumed. */
  private changeLines(softwareId: string, notes: ChangeNotes): DraftItem[] {
    const lines = this.recordLines(softwareId);
    return [...notes.items, ...notes.assumed]
      .map((id) => lines.find((l) => l.id === id))
      .filter((l): l is RecordItem => Boolean(l))
      .map((l) => ({
        key: `r-${l.id}`,
        text: l.text,
        kind: l.kind,
        from: notes.assumed.includes(l.id) ? "assumed" : l.marks.from || OPERATOR,
        ...(l.kind === "W" && l.marks.priority && { priority: l.marks.priority }),
        refs: [l.id],
      }));
  }

  private decisionLine(d: ChangePlan["decisions"][number]): string {
    return `${d.text}${d.replaces ? ` (replaces ${d.replaces})` : ""}${d.reason ? `. Why: ${d.reason}` : ""}`;
  }

  private tasksWords(plan: ChangePlan | null, change: WorkItem): string {
    return plan?.tasks.length
      ? plan.tasks.map((t, i) => `${i + 1}. ${t.title.replace(/\.$/, "")}`).join("; ")
      : `one task: ${this.changeTitle(change)}`;
  }

  /** The one question about a change, carrying everything together. */
  private askChange(
    software: Software,
    change: WorkItem,
    item: WorkItem,
    plan: ChangePlan | null,
    reasons: string[],
  ): void {
    const notes = this.changeNotes(change);
    const earlier = this.earlierAnswers(notes);
    const decisions: DraftItem[] = (plan?.decisions ?? []).map((d, i) => ({
      key: `d${i + 1}`,
      text: this.decisionLine(d),
      kind: "D",
      from: "assumed",
      ...(earlier.has(this.decisionLine(d)) && { earlier: earlier.get(this.decisionLine(d)) }),
      ...(d.foundation && { foundation: true }),
      ...(d.replaces && { refs: [d.replaces] }),
    }));
    const items = [...this.changeLines(software.id, notes), ...decisions];
    const ref = change.ref ?? "this change";
    const offered = notes.suggestions.filter((x) => !x.added);
    const ask = createAsk(this.db, {
      softwareId: software.id,
      role: OPERATOR,
      kind: "draft",
      stage: "build",
      title: `Your change ${ref}: check this once before it is built`,
      instruction: [
        reasons.length
          ? `premise asks first because ${reasons.map(lowerFirst).join("; ")}.`
          : "You asked premise to check every change with you before building it.",
        `Below: what premise took from your words, what it assumed (marked assumed: not checked with you), and the decisions the change makes. It will build ${this.tasksWords(plan, change)}.`,
        earlier.size
          ? "Where you answered a decision before, your earlier answer is selected: confirm it or change it."
          : "",
        "Strike any line that is wrong and say why, or edit it; what you keep is built. This is the only question about this change.",
        offered.length
          ? `premise could also add, but builds none of it unless you add it: ${offered.map((x) => x.text).join("; ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      items: items.map(toAskItem),
      extra: {
        meta: {
          purpose: "change-confirm",
          items,
          change: change.id,
          piece: item.id,
          ...(offered.length && { suggestions: notes.suggestions }),
        },
      },
    });
    this.setChangeNotes(change, { ask: ask.id });
    this.premiseSays(
      software.id,
      `Your change ${ref} is ready to build. Before it is, one question: ${reasons[0] ? lowerFirst(reasons[0]) : "you asked to check every change"}. It is under Waiting on you.`,
    );
  }

  /** Build at once and say, without waiting, what was understood and assumed (decision 0274). */
  private tellChange(
    software: Software,
    change: WorkItem,
    item: WorkItem,
    plan: ChangePlan | null,
  ): void {
    const notes = this.changeNotes(change);
    this.landChangeDecisions(software.id, change, item, plan, plan?.decisions ?? []);
    const fresh = this.changeNotes(change);
    const lines = this.changeLines(software.id, fresh);
    const records = this.recordLines(software.id);
    const decisions: DraftItem[] = (fresh.decisions ?? [])
      .map((id) => records.find((r) => r.id === id))
      .filter((r): r is RecordItem => Boolean(r))
      .map((r) => ({ key: `r-${r.id}`, text: r.text, kind: "D", from: "assumed", refs: [r.id] }));
    const items = [...lines, ...decisions];
    const offered = notes.suggestions.filter((x) => !x.added);
    const ref = change.ref ?? "this change";
    const plain = (t: string) => t.replace(/[.\s]+$/, "");
    const understood = lines.filter((l) => l.from !== "assumed").map((l) => plain(l.text));
    const assumed = [...lines.filter((l) => l.from === "assumed"), ...decisions].map((l) =>
      plain(l.text),
    );
    let askId: number | undefined;
    if (items.length > 0 || offered.length > 0) {
      const ask = createAsk(this.db, {
        softwareId: software.id,
        role: OPERATOR,
        kind: "draft",
        stage: null,
        title: `Your change ${ref}: taken as below, building now`,
        instruction:
          "Nothing waits on you: premise is building this already. If a line is wrong, strike it and say why; premise takes your correction in as a follow-up change. Lines marked assumed were not checked with you." +
          (offered.length
            ? " premise's own suggestions are below; none is built unless you add it."
            : ""),
        items: items.map(toAskItem),
        extra: {
          meta: {
            purpose: "change-notice",
            notice: true,
            items,
            change: change.id,
            ...(offered.length && { suggestions: notes.suggestions }),
          },
        },
      });
      askId = ask.id;
    }
    this.setChangeNotes(change, { decided: "told", ...(askId !== undefined && { ask: askId }) });
    if (change.origin === "bug") return;
    this.premiseSays(
      software.id,
      [
        `${ref} taken as: ${understood.length ? understood.join("; ") : this.changeTitle(change)}.`,
        assumed.length ? `Assumed, not checked with you: ${assumed.join("; ")}.` : "",
        `Building now: ${this.tasksWords(plan, change)}.`,
        offered.length
          ? `premise could also add ${offered.length === 1 ? "one thing" : `${offered.length} things`}; nothing of it is built unless you add it.`
          : "",
        items.length ? "Nothing waits on you; strike a line under Your change if it is wrong." : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  /** Put a piece's change decisions into the record, once per piece; what is already there is not put in again. */
  private landChangeDecisions(
    softwareId: string,
    change: WorkItem,
    item: WorkItem,
    plan: ChangePlan | null,
    decisions: ChangePlan["decisions"],
  ): void {
    const notes = this.changeNotes(change);
    if (!plan || notes.landed?.[item.id]) return;
    const ref = change.ref ?? "the change";
    const live = new Set(this.recordLines(softwareId).map((i) => i.id));
    const ops: Operation[] = decisions.map((d) =>
      d.replaces && live.has(d.replaces)
        ? {
            op: "replace" as const,
            id: d.replaces,
            text: decisionText(d, ref),
            from: "assumed",
            reason: d.reason || `The change ${ref} needs it.`,
            ...(d.foundation && { foundation: true }),
          }
        : {
            op: "add" as const,
            kind: "D" as const,
            text: decisionText(d, ref),
            from: "assumed",
            ...(d.foundation && { foundation: true }),
          },
    );
    const assigned = (
      ops.length ? this.land(softwareId, ops, `The plan for the change ${change.ref ?? ""}.`) : []
    ).filter((x): x is string => Boolean(x));
    this.setChangeNotes(change, {
      decisions: [...(notes.decisions ?? []), ...assigned],
      landed: { ...notes.landed, [item.id]: assigned },
    });
  }

  /** The software goes back to Plan: every item this piece landed is struck, so its new plan lands afresh. */
  private retractChangeDecisions(softwareId: string, change: WorkItem, item: WorkItem): void {
    const notes = this.changeNotes(change);
    const landed = notes.landed?.[item.id];
    if (!landed) return;
    const ref = change.ref ?? "the change";
    const live = new Set(this.recordLines(softwareId).map((i) => i.id));
    const ops: Operation[] = landed
      .filter((id) => live.has(id))
      .map((id) => ({
        op: "strike" as const,
        id,
        reason: `The change ${ref} was planned again.`,
      }));
    if (ops.length) this.land(softwareId, ops, `The change ${ref} was planned again.`);
    const { [item.id]: _gone, ...rest } = notes.landed!;
    this.setChangeNotes(change, {
      decisions: (notes.decisions ?? []).filter((id) => !landed.includes(id)),
      landed: rest,
    });
  }

  /** The change, for the planner's brief: its words, what it adds or touches, and the plan so far. */
  private changeText(softwareId: string, change: WorkItem, item: WorkItem): string {
    const notes = this.changeNotes(change);
    const lines = this.recordLines(softwareId);
    const line = (id: string) => lines.find((l) => l.id === id);
    const own = [...notes.items, ...notes.assumed]
      .map(line)
      .filter((l): l is RecordItem => Boolean(l))
      .map((l) => formatItemLine(l));
    const touches = (intakeItemOfWork(this.db, change.id)?.touches ?? []).map(
      (t) => `- ${t.id}: ${t.reason}`,
    );
    const plan = this.readPlan(softwareId);
    return [
      `${change.ref ?? "An intake item"}, a ${this.notes(change).intakeKind ?? "wish"}: ${this.changeTitle(change)}`,
      ...(item.id !== change.id
        ? [`This is one step of it: ${item.title ?? ""}. ${item.words ?? ""}`]
        : []),
      `The person's words: ${change.words ?? ""}`,
      own.length
        ? `Items it adds or changes in the record:\n${own.join("\n")}`
        : "It adds no new item to the record.",
      touches.length ? `Items the triager found it touches:\n${touches.join("\n")}` : "",
      plan?.tasks.length
        ? `The software's plan, already built; do not plan it again:\n${plan.tasks.map((t, i) => `${i + 1}. ${t.title}${t.items.length ? ` (serves ${t.items.join(", ")})` : ""}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  /** The record milestone the active piece belongs to, if any. */
  private milestoneOf(softwareId: string): MilestoneRef | null {
    const chain = ancestry(this.db, this.active(softwareId));
    const milestone = chain.find((i) => i.kind === "milestone" && i.ref);
    if (!milestone) return null;
    const found = this.milestones(softwareId).find((m) => m.id === milestone.ref);
    return { id: milestone.ref!, text: found?.text ?? milestone.title ?? milestone.ref! };
  }

  /** The piece's name in plain words, for the session. */
  private label(item: WorkItem): string {
    if (item.parentId === null) return "the software";
    if (item.kind === "milestone") {
      const title = (item.title ?? "").trim().replace(/\.+$/, "");
      return title ? `the milestone "${title}"` : "a milestone";
    }
    if (item.kind === "intake") return `the work for ${item.ref ?? "an intake item"}`;
    return `the part "${item.title ?? "unnamed"}"`;
  }

  /** On to the next stage of the piece after `from`, or the piece is finished. */
  private advance(id: string, from: StageId, why: string): void {
    const item = this.active(id);
    const next = this.state(id).returnTo === "say-back" ? "say-back" : nextStage(item, from);
    if (next === "say-back") this.setState(id, { returnTo: undefined });
    if (next) this.enterStage(getSoftware(this.db, id)!, next, why);
    else this.finishItem(id, item, "done");
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
    const item = this.active(software.id);
    const said = this.lifecycleLine(software, openAsks, jobs, item);
    if (item.parentId === null || software.state !== "active") return said;
    const parts = childItems(this.db, item.parentId);
    const where =
      item.kind === "milestone" || item.kind === "intake"
        ? `${item.ref ?? (item.kind === "intake" ? "Intake item" : "Milestone")}`
        : `Part ${parts.findIndex((p) => p.id === item.id) + 1} of ${parts.length}, "${item.title}"`;
    return `${where}: ${said}`;
  }

  private lifecycleLine(software: Software, openAsks: number, jobs: Job[], item: WorkItem): string {
    const blocked = jobs.some(
      (j) => j.status === "queued" && j.kind !== "run" && this.options.agentsReady?.() === false,
    );
    if (software.state === "active" && item.state === "sizing" && !blocked) {
      return "Sizing the work: an agent is deciding how big it is, which steps it needs, and whether it splits into parts. This is quick.";
    }
    const existing = this.takenOn(software.id);
    if (existing?.status === "copying") {
      return "Copying it into premise's own folder. Your folder is only read.";
    }
    if (existing?.status === "copy-failed") {
      return "Could not be copied, so nothing was taken on. The conversation says why and what to do.";
    }
    if (software.state === "ended" && existing) {
      return "Stopped: you decided it is no longer needed. Send it back to any stage to pick it up again.";
    }
    if (software.state === "ended") {
      return "Ended: you decided not to build it, so nothing was built. Send it back to any stage to pick it up again.";
    }
    if (software.state === "waiting-milestone") {
      return this.options.later.notRunning?.(software.id)
        ? "Stopped after a milestone, but it is not running: read the report, then say go on."
        : "Stopped after a milestone. Try it, then say go on.";
    }
    if (software.state === "paused-budget") {
      return "Paused: its budget is used up. Open Usage to raise the budget, let it finish the change it is on, or leave it paused.";
    }
    if (software.state === "paused-usage") return "Paused until the usage limit resets.";
    if (openAsks > 0) {
      return `Waiting on you: ${openAsks === 1 ? "1 thing" : `${openAsks} things`} to answer.`;
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
    // A change's notice waits on nobody (decision 0274): it is not counted as waiting on you.
    const openAsks = listAsks(this.db, { softwareId: software.id, status: "open" }).filter(
      (a) => a.extra.meta?.notice !== true,
    ).length;
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
      effort: software.effort,
      openAsks,
      created: software.created,
      ...(this.isTakingOn(software.id) && { takingOn: true }),
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
    const stages = this.stageViews(id);
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
      label: a.label,
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
      work: this.workViews(id),
      wholeCheckStandIn: this.wholeCheck.standIn,
      build: this.options.later.view?.(id) ?? null,
      ...(this.existingView(id) && { existing: this.existingView(id)! }),
      claims: this.claimViews(id),
      ...(this.changeView(software) && { change: this.changeView(software)! }),
      changeQuestions: this.changeQuestionsOf(software),
    };
  }

  /** The change being worked on, for the page's card (decision 0274). */
  private changeView(software: Software): ChangeView | null {
    const item = this.active(software.id);
    const change = this.changeOf(item);
    if (!change || software.currentStage === "intake") return null;
    const notes = this.changeNotes(change);
    const lines = this.recordLines(software.id);
    const text = (id: string) => lines.find((l) => l.id === id)?.text;
    const own = (ids: string[]) => ids.map(text).filter((t): t is string => Boolean(t));
    const decisions = own(notes.decisions ?? []);
    const ask = notes.ask === undefined ? undefined : getAsk(this.db, notes.ask);
    const stage = software.currentStage;
    const doing =
      ask?.status === "open" && ask.extra.meta?.purpose === "change-confirm"
        ? "Waiting for your one answer before building it."
        : stage === "sizing"
          ? "Sizing it: which steps it needs."
          : `${stageName(stage)}: ${STAGES.find((x) => x.id === stage)?.plain ?? ""}`.replace(
              /: $/,
              "",
            );
    return {
      ref: change.ref ?? "",
      title: this.changeTitle(change),
      words: change.words ?? "",
      understood: own(notes.items),
      assumed: [...own(notes.assumed), ...decisions],
      doing,
      askId: ask?.status === "open" ? ask.id : null,
      suggestions: notes.suggestions,
    };
  }

  // ---- Taste claims (decisions 0022, 0102, 0196) ---------------------------------------------

  private claimViews(softwareId: string): ClaimView[] {
    const making = new Set(
      this.queue
        .list()
        .filter(
          (j) => j.softwareId === softwareId && j.kind === "prototype" && !FINISHED.has(j.status),
        )
        .map((j) => Number(j.payload.claim)),
    );
    return this.options.taste
      .list(softwareId)
      .map((c) => this.options.taste.view(c, making.has(c.id)));
  }

  /**
   * The role labels in use besides the operator, in plain words: from what was asked (not counting
   * withdrawn asks) and from open claims. Empty means only the operator was ever asked anything.
   */
  rolesInUse(): string[] {
    const asked = (
      this.db.prepare("SELECT DISTINCT role FROM asks WHERE status != 'withdrawn'").all() as {
        role: string;
      }[]
    ).map((r) => r.role);
    return [...new Set([...asked, ...this.options.taste.rolesClaiming()])]
      .filter((r) => r !== OPERATOR)
      .map(roleWords)
      .sort();
  }

  /** Claim an area of a software for a role's taste, from the page. */
  async claimArea(
    softwareId: string,
    input: { role?: unknown; area?: unknown },
  ): Promise<ClaimView> {
    const software = this.require(softwareId);
    const claim = transaction(this.db, () => this.options.taste.claim(software.id, input));
    const who = claim.role === OPERATOR ? "you" : `the ${roleWords(claim.role)}`;
    const building = (LATER as readonly string[]).includes(software.currentStage);
    this.premiseSays(
      software.id,
      `${capital(claim.area)} is claimed${claim.role === OPERATOR ? "" : ` by the ${roleWords(claim.role)}`}. Before building it, premise shows ${who} a proposal to keep or correct; everything else premise still decides itself.${building ? " It applies from the next build: what is being built now goes on as it is." : ""} To let premise decide it after all, release the claim on the Line tab.`,
    );
    return this.options.taste.view(claim);
  }

  /** Release a claim: premise decides the area itself again; work waiting on its proposal goes on. */
  async releaseClaim(claimId: number): Promise<ClaimView> {
    this.afterCommit = [];
    const released = transaction(this.db, () => {
      const result = this.options.taste.release(claimId);
      const software = getSoftware(this.db, result.claim.softwareId)!;
      this.premiseSays(
        software.id,
        `The claim on ${result.claim.area} is released: premise decides it itself now${result.withdrawn ? ", and the proposal that was waiting is withdrawn; the work that waited on it goes on" : ""}.`,
      );
      const outcome = this.options.later.claimReleased?.(software.id, claimId) ?? null;
      if (outcome && (LATER as readonly string[]).includes(software.currentStage)) {
        this.applyLater(software, software.currentStage as LaterStageId, outcome);
      }
      return result.claim;
    });
    const committed = this.afterCommit;
    this.afterCommit = [];
    for (const work of committed) work();
    this.queue.tick();
    return this.options.taste.view(released);
  }

  /** proposal_submit: the planner's proposal for a claimed area goes to the claiming role. */
  proposalSubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    if (job.kind !== "prototype") {
      return toolFail("NOT_ALLOWED", "proposal_submit is only for a proposal for a claimed area.");
    }
    return this.options.taste.proposalSubmit(binding, args, job);
  }

  /**
   * Where each of the eleven stages stands for the piece being worked on: done, current, ahead, or
   * skipped when sizing found the piece does not need it (with the reason).
   */
  private stageViews(id: string): StageView[] {
    const active = this.active(id);
    const chain = ancestry(this.db, active);
    const order = (s: string) => STAGE_IDS.indexOf(s as StageId);
    const skippedWhy = (item: WorkItem) =>
      item.sizing?.stages.reason ?? "Sizing found this piece of work does not need it.";
    /** Stages the item's parts covered; done when a part went through it, else skipped. */
    const coveredByParts = (item: WorkItem, stage: StageId): "done" | "skipped" | null => {
      const notes = this.notes(item);
      if (!notes.children || !notes.resumeAfter) return null;
      const from = notes.handedOffAt ? order(notes.handedOffAt) : -1;
      if (order(stage) <= from || order(stage) > order(notes.resumeAfter)) return null;
      const parts = childItems(this.db, item.id).filter((p) => p.state !== "withdrawn");
      return parts.some((p) => p.stages.includes(stage)) ? "done" : "skipped";
    };
    const takingOn = this.isRecovery(chain.at(-1) ?? active) && active.kind !== "intake";
    const allowed = allowedStages(active);
    const ended = this.require(id).state === "ended";
    return STAGES.map((s) => {
      const view =
        takingOn && s.id === "why"
          ? {
              id: s.id,
              name: "Recover",
              plain: "Recover the record from the code: why, who, what and its decisions",
            }
          : { id: s.id, name: s.name, plain: s.plain };
      // Not built, so Build, Check and Run never happened: they are skipped, not done or passed.
      if (ended && ["build", "check", "run"].includes(s.id)) {
        return {
          ...view,
          position: "skipped" as const,
          why: "You decided not to build it, so this never happened.",
        };
      }
      if (
        takingOn &&
        !allowed.includes(s.id) &&
        !(active.origin === "recover" && chain.some((c) => c.stages.includes(s.id)))
      ) {
        return {
          ...view,
          position: "skipped" as const,
          why: (["plan", "build", "check", "run", "report"] as string[]).includes(s.id)
            ? "Nothing is built while taking it on. Changes you ask for afterwards go through this step."
            : "Taking it on: this is recovered from the code at Recover instead.",
        };
      }
      const covered = active.state === "sizing" ? null : coveredByParts(active, s.id);
      if (covered === "done") return { ...view, position: "done" as const };
      if (active.stages.includes(s.id) && covered === null) {
        if (active.state === "sizing") return { ...view, position: "ahead" as const };
        const here = order(active.currentStage);
        const position = order(s.id) < here ? "done" : order(s.id) === here ? "current" : "ahead";
        return { ...view, position: position as StageView["position"] };
      }
      if (covered === null) {
        for (const owner of chain.slice(1)) {
          if (!owner.stages.includes(s.id)) continue;
          const notes = this.notes(owner);
          if (notes.handedOffAt && order(s.id) <= order(notes.handedOffAt)) {
            return { ...view, position: "done" as const };
          }
          if (notes.resumeAfter && order(s.id) > order(notes.resumeAfter)) {
            return { ...view, position: "ahead" as const };
          }
        }
      }
      return { ...view, position: "skipped" as const, why: skippedWhy(active) };
    });
  }

  /** Every work item of the software, in order, as the page shows them. */
  private workViews(id: string): WorkItemView[] {
    const active = this.active(id);
    const items = listWorkItems(this.db, id);
    const depth = new Map<number, number>();
    return items.map((item) => {
      const level = item.parentId === null ? 0 : (depth.get(item.parentId) ?? 0) + 1;
      depth.set(item.id, level);
      const notes = this.notes(item);
      const children = items.filter((c) => c.parentId === item.id);
      const splitLive = notes.children === "split" && children.some((c) => c.state !== "withdrawn");
      return {
        id: item.id,
        parentId: item.parentId,
        depth: level,
        kind: item.kind,
        origin: item.origin,
        title:
          item.parentId === null
            ? (getSoftware(this.db, id)?.name ?? "The software")
            : item.kind === "milestone"
              ? `${item.ref ?? "Milestone"}: ${item.title ?? ""}`
              : (item.title ?? "A part"),
        words: item.words,
        state: workState(item, item.id === active.id),
        current: item.id === active.id,
        stage: isStageId(item.currentStage) ? item.currentStage : null,
        sizeClass: asSize(item.sizeClass),
        stages: item.stages,
        skipped: allowedStages(item).filter((s) => !item.stages.includes(s)),
        allowedStages: [...allowedStages(item)],
        requiredStages: [...requiredStages(item)],
        sizing: item.sizing,
        sized: item.sized,
        minutesBeforeBuild: minutesBeforeBuild(item),
        canChange: !["done", "withdrawn", "dropped"].includes(item.state),
        canUndoSplit: splitLive && !this.partsStartedBuilding(item),
      };
    });
  }

  /** Whether any part of a split piece, or a part of a part, has reached Build. */
  private partsStartedBuilding(item: WorkItem): boolean {
    return childItems(this.db, item.id).some(
      (c) => c.state !== "withdrawn" && (c.buildStarted !== null || this.partsStartedBuilding(c)),
    );
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
    if (input.effort !== undefined && !isEffort(input.effort)) {
      throw new ServiceError("INVALID", "Choose the effort as low, medium or high.");
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
      const created = createSoftware(
        this.db,
        { name, idea, ...(input.effort && { effort: input.effort }) },
        this.config.softwares,
      );
      addChatMessage(this.db, {
        softwareId: created.id,
        author: "person",
        text: idea,
        routedTo: "start",
      });
      const root = createWorkItem(this.db, {
        softwareId: created.id,
        kind: "software",
        sizeClass: created.sizeClass,
      });
      this.options.keeper.createRepository(created.id);
      this.beginItem(created.id, root, "started");
      return created;
    });
    this.queue.tick();
    return this.summary(getSoftware(this.db, software.id)!);
  }

  // ---- Existing software (decision 0189) -------------------------------------------------------

  /**
   * Take on a software that already exists: premise copies it into its own data folder (the
   * operator's folder is only read), then recovers its record from the code at Why, looks at what
   * exists now, says the whole recovered record back, and rests at Intake.
   */
  async bringIn(input: BringInInput): Promise<SoftwareSummary> {
    let source;
    try {
      source = readSource(input.source, this.config.data.folder);
    } catch (error) {
      if (error instanceof SourceError) throw new ServiceError("INVALID", error.message);
      throw error;
    }
    const words = (input.idea ?? "").trim();
    if (words.length > MAX_IDEA) {
      throw new ServiceError(
        "INVALID",
        `That is ${words.length} characters; keep what it is for under ${MAX_IDEA}. You can add detail in chat later.`,
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
    const base = given || nameFromSource(source.given);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    const idea = words || `Existing software, taken on from ${source.given}.`;

    const software = transaction(this.db, () => {
      const created = createSoftware(this.db, { name, idea }, this.config.softwares);
      addExisting(this.db, {
        softwareId: created.id,
        source: source.given,
        sourceKind: source.kind,
      });
      addChatMessage(this.db, {
        softwareId: created.id,
        author: "person",
        text: words ? `Bring in ${source.given}: ${words}` : `Bring in ${source.given}.`,
        routedTo: "start",
      });
      createWorkItem(this.db, {
        softwareId: created.id,
        kind: "software",
        origin: "existing",
        sizeClass: created.sizeClass,
        stages: defaultStages({ kind: "software", origin: "existing", parentId: null }),
      });
      this.premiseSays(
        created.id,
        `Copying ${source.given} into premise's own folder. Your ${source.kind === "folder" ? "folder" : "repository"} is only read; premise works on its own copy and changes nothing there. Chat opens once the copy is ready.`,
      );
      return created;
    });
    this.copyExisting(software.id);
    return this.summary(getSoftware(this.db, software.id)!);
  }

  /**
   * Copy an existing software into premise's data folder, then begin taking it on. Run again at
   * start for a copy premise was cut off in the middle of.
   */
  private copyExisting(softwareId: string): void {
    const existing = getExisting(this.db, softwareId);
    if (!existing) return;
    const work = (async () => {
      await new Promise((r) => setImmediate(r));
      const source = { given: existing.source, kind: existing.sourceKind, location: "" };
      try {
        source.location = readSource(existing.source, this.config.data.folder).location;
        const copied = await copySource(source, this.options.keeper.repositoryPath(softwareId), {
          timeoutMinutes: this.config.existing.clone_timeout_minutes,
          recordFolder: this.config.record.folder,
        });
        if (!getSoftware(this.db, softwareId)) return;
        transaction(this.db, () => {
          setExisting(this.db, softwareId, {
            status: "recovering",
            sourceBranch: copied.branch,
            baseCommit: copied.commit,
            commits: copied.commits,
          });
          this.premiseSays(
            softwareId,
            `Copied: ${copied.commits === 1 ? "1 commit" : `${copied.commits} commits`} on ${copied.branch}. Next, premise works out how big it is, then a drafter reads the code, its documents and its history and writes down what it finds.`,
          );
          this.beginItem(softwareId, rootItem(this.db, softwareId), "copied");
        });
        this.queue.tick();
      } catch (error) {
        if (!getSoftware(this.db, softwareId)) return;
        const problem = (error as Error).message;
        transaction(this.db, () => {
          setExisting(this.db, softwareId, { status: "copy-failed", problem });
          this.setLifecycle(softwareId, "ended", "could not copy it");
          this.premiseSays(
            softwareId,
            `${problem.endsWith(".") ? problem : `${problem}.`} Nothing was changed anywhere. Fix that, then bring it in again with "Bring in software you already have".`,
          );
        });
      }
    })().finally(() => this.deferred.delete(work));
    this.deferred.add(work);
  }

  /** At start: copies premise was cut off in the middle of are made again from the start. */
  /**
   * At start-up, after premise is updated (decision 0273): a milestones question that belongs to a
   * change from intake is withdrawn, and the change is planned again the new way, as a change.
   * Nothing built is lost: the software's milestones and what landed stay as they are.
   */
  replanChanges(): number {
    let count = 0;
    for (const ask of listAsks(this.db, { status: "open" })) {
      if (ask.extra.meta?.purpose !== "milestones") continue;
      const software = getSoftware(this.db, ask.softwareId);
      if (!software) continue;
      const change = this.changeOf(this.active(software.id));
      if (!change) continue;
      transaction(this.db, () => {
        closeAsk(
          this.db,
          ask.id,
          "withdrawn",
          null,
          "Withdrawn: a change is planned on its own, not with the software's milestones.",
        );
        this.premiseSays(
          software.id,
          `premise was updated: your change ${change.ref ?? ""} is now planned on its own, not with the software's milestones, so the milestones question is withdrawn and the change is planned again. Nothing built is lost.`,
        );
        this.enterStage(getSoftware(this.db, software.id)!, "plan", "planned again as a change");
      });
      count += 1;
    }
    if (count > 0) this.queue.tick();
    return count;
  }

  resumeTakeOns(): number {
    const cut = listExisting(this.db, "copying");
    for (const existing of cut) {
      this.premiseSays(
        existing.softwareId,
        "premise stopped while copying this; copying it again from the start.",
      );
      this.copyExisting(existing.softwareId);
    }
    return cut.length;
  }

  /** The software is being taken on: copied, or its record recovered and not yet gone through. */
  private isTakingOn(softwareId: string): boolean {
    const status = this.takenOn(softwareId)?.status;
    return status === "copying" || status === "recovering";
  }

  /** The root of a software taken on from existing code, or a part of it being recovered. */
  private isRecovery(item: WorkItem): boolean {
    return item.origin === "existing" || item.origin === "recover";
  }

  private takenOn(softwareId: string): ExistingSoftware | undefined {
    return getExisting(this.db, softwareId);
  }

  /** What the drafter reads about a software being taken on, besides the code itself. */
  private recoveryMaterial(softwareId: string): {
    history: string;
    readme: string;
    files: string[];
    commits: number;
  } {
    const repo = this.options.keeper.repositoryPath(softwareId);
    const git = this.options.keeper.git;
    const count = this.config.existing.history_commits;
    const commits = count > 0 ? git.log(repo, ["-n", String(count), "HEAD"]) : [];
    const history = commits
      .map((c) => `${c.sha.slice(0, 7)} ${c.date.slice(0, 10)} ${c.subject}`)
      .join("\n");
    const files = git.listFolderAt(repo, "HEAD", "");
    const readmeName = files.find((f) => /^readme(\.[a-z]+)?$/i.test(f));
    const readme = readmeName
      ? ((git.readFileAt(repo, "HEAD", readmeName) ?? "")
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith("#") && !l.startsWith("![") && !l.startsWith("[!")) ?? "")
      : "";
    return {
      history,
      readme: readme.slice(0, 300),
      files,
      commits: this.takenOn(softwareId)?.commits ?? commits.length,
    };
  }

  /** Queue the drafter's recovery of the record for the piece being worked on. */
  private queueRecovery(software: Software): void {
    const item = this.active(software.id);
    const budget = this.budgetFor(software, "why")!;
    const material = this.recoveryMaterial(software.id);
    const piece =
      item.parentId === null
        ? "the whole software"
        : `one part of it: ${item.title ?? ""}. ${item.words ?? ""}`.trim();
    const existing = this.takenOn(software.id);
    const brief = this.options.briefs.make(
      "record recovery brief",
      {
        software_name: software.name,
        piece,
        operator_words:
          existing && software.idea.startsWith("Existing software, taken on from")
            ? "none"
            : software.idea,
        history: material.history
          ? material.history
              .split("\n")
              .map((l) => `  ${l}`)
              .join("\n")
          : "  none were read",
        issues:
          "not read. premise does not read issues yet, so open bugs and wishes are not part of this recovery",
        record: this.recordText(software.id),
        budget: `${budget.turns} agent turns and ${budget.minutes} minutes`,
      },
      software.id,
    );
    this.queue.enqueue({
      softwareId: software.id,
      kind: "recover",
      stage: "why",
      payload: {
        run: this.state(software.id).run,
        item: item.id,
        purpose: "recover",
        brief,
        repository: this.options.keeper.repositoryPath(software.id),
        limits: { turns: budget.turns, minutes: budget.minutes },
        context: {
          stage: "why",
          purpose: "recover",
          name: software.name,
          idea: software.idea,
          ...(item.parentId !== null && { piece: item.title }),
          readme: material.readme,
          files: material.files,
          commits: material.commits,
        },
      },
    });
  }

  /** recovery_submit: the recovered record, kept with the piece until the job ends. */
  recoverySubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    if (job.kind !== "recover") {
      return toolFail(
        "MALFORMED",
        "recovery_submit is only for recovering an existing software's record.",
      );
    }
    const item = getWorkItem(this.db, Number(job.payload.item));
    if (!item)
      return toolFail("TASK_CLOSED", "This piece of work is not in premise any more. Stop.");
    const read = readRecovery(args);
    if ("problems" in read) {
      return toolFail("MALFORMED", "The recovered record cannot be used as it is.", read.problems);
    }
    const problems = this.dryRun(job.softwareId, recoveryOperations(read));
    if (problems.length) {
      return toolFail("MALFORMED", "Some items would not fit the record.", problems);
    }
    this.setNotes(item, { recovery: read });
    return toolOk({
      status: "received",
      items: read.items.length,
      note: "premise puts these into the record, marked recovered, when you finish; they stay unconfirmed until the operator has gone through them. Submitting again replaces them.",
    });
  }

  /** The recovery job ended: its record goes in, marked recovered, or the operator decides. */
  private recoverJobEnded(software: Software, job: Job): void {
    const item = getWorkItem(this.db, Number(job.payload.item));
    if (!item) return;
    const recovery = this.notes(item).recovery;
    if (job.status !== "done" || !recovery) {
      this.stageProblem(
        software,
        job,
        job.status === "done" ? "finished without a recovered record" : undefined,
      );
      return;
    }
    const landed = this.writer.land(
      software.id,
      recoveryOperations(recovery),
      `Recovered from the code by the drafter${item.parentId === null ? "" : ` (${item.title ?? "one part"})`}; unconfirmed until the operator has gone through it.`,
    );
    if (!landed.ok) {
      this.stageProblem(
        software,
        job,
        `could not put what it recovered into the record: ${landed.diagnostics.map((d) => d.message).join(" ")}`,
      );
      return;
    }
    this.setNotes(item, { recovery: undefined });
    const existing = this.takenOn(software.id);
    const merged = mergeRun(
      { run: existing?.run ?? {}, couldNotCheck: existing?.couldNotCheck ?? [] },
      recovery,
    );
    setExisting(this.db, software.id, { run: merged.run, couldNotCheck: merged.couldNotCheck });
    const ids = landed.assigned.filter((x): x is string => Boolean(x));
    const links = traceLinks(recovery, landed.assigned);
    const files: Record<string, string> = {
      "run.md": runFile(merged.run, this.needs(merged), new Date().toISOString().slice(0, 10)),
    };
    if (links.size > 0) {
      files["recovered-trace.md"] = traceFile(
        this.options.keeper.readTextFile(software.id, "recovered-trace.md"),
        links,
      );
    }
    try {
      this.options.keeper.writeTextFiles(software.id, files, {
        subject: "Record: how to run it, and best-guess links from the old code",
        serves: ids,
      });
    } catch (error) {
      this.premiseSays(
        software.id,
        `How to run it could not be written into the record: ${(error as Error).message}`,
      );
    }
    const kinds = (k: string) => recovery.items.filter((i) => i.kind === k).length;
    const needs = this.needs(merged);
    this.premiseSays(
      software.id,
      `Recovered ${ids.length === 1 ? "1 item" : `${ids.length} items`} from the code${item.parentId === null ? "" : ` of ${this.label(item)}`}: ${kinds("Y")} on why, ${kinds("U") + kinds("R")} on who, ${kinds("W")} on what it does, ${kinds("D")} decisions. Each is marked recovered and stays unconfirmed until you have gone through it.${needs.length ? ` Could not check: ${needs.join(" ")}` : ""}`,
    );
    this.advance(software.id, "why", "record recovered");
  }

  /** What premise would need to build, start or check the software, in plain words. */
  private needs(found: { run: ExistingSoftware["run"]; couldNotCheck: string[] }): string[] {
    return [...found.couldNotCheck, ...runProblems(found.run, this.config.record.folder)];
  }

  /**
   * The say-back of the whole recovered record (decision 0189): premise lists every item nobody
   * has confirmed yet, grouped by file, for the operator to strike what is wrong in one pass.
   * No agent is needed: the list is the record itself.
   */
  private askRecoveredSayBack(software: Software): void {
    const items = unconfirmed(this.recordLines(software.id));
    if (items.length === 0) {
      this.premiseSays(software.id, "Nothing recovered is left to go through.");
      this.afterRecoveredSayBack(software.id);
      return;
    }
    const titles = new Map(RECORD_VIEW_FILES.map((f) => [f.file, f.title]));
    createAsk(this.db, {
      softwareId: software.id,
      role: OPERATOR,
      kind: "say-back",
      stage: "say-back",
      title: "What premise recovered from the code: strike anything wrong",
      instruction:
        "premise read the code, its documents and its history, and wrote down what it understood. A recovered record usually misses things and gets some wrong. Strike what is wrong and say why; whatever you keep is taken as right. What is missing or half right comes in afterwards: say it in chat or on the Intake tab, and it goes through the line.",
      items: items.map((i) => ({
        key: i.id,
        text: i.marks.priority ? `${i.marks.priority}: ${i.text}` : i.text,
        mark: "recovered" as const,
        refs: [i.id],
        group: titles.get(i.file) ?? i.file,
      })),
      extra: { meta: { purpose: "recovered-say-back", ids: items.map((i) => i.id) } },
    });
    this.premiseSays(
      software.id,
      `Before going on: ${items.length === 1 ? "1 item" : `${items.length} items`} recovered from the code, for you to strike what is wrong. It is one list, in pages if it is long; under Waiting on you.`,
    );
  }

  /** The operator went through the recovered record: strike what was struck, confirm the rest. */
  private recoveredSayBackEffects(software: Software, ask: Ask, answer: AskAnswer): () => void {
    const id = software.id;
    const ids = ((ask.extra.meta?.ids ?? []) as string[]).filter(Boolean);
    const decided = new Map((answer.kind === "items" ? answer.items : []).map((a) => [a.key, a]));
    const live = new Set(this.recordLines(id).map((i) => i.id));
    const operations: Operation[] = [];
    let struck = 0;
    let kept = 0;
    for (const itemId of ids) {
      if (!live.has(itemId)) continue;
      const said = decided.get(itemId);
      if (said?.decision === "strike") {
        struck += 1;
        operations.push({
          op: "strike",
          id: itemId,
          reason: `Struck when the recovered record was said back${said.reason ? `: ${said.reason}` : "."}`,
        });
      } else {
        kept += 1;
        operations.push({ op: "mark", id: itemId, confirmed: true });
      }
    }
    this.land(id, operations, "The operator went through the record recovered from the code.");
    return () => {
      this.premiseSays(
        id,
        `Gone through: ${kept === 1 ? "1 item" : `${kept} items`} kept and confirmed, ${struck === 1 ? "1" : struck} struck. A recovered record usually misses things: anything missing or half right, say in chat or on the Intake tab, and it goes through the line.`,
      );
      this.afterRecoveredSayBack(id);
    };
  }

  /** After the recovered say-back: ask to add the record to the operator's repository, go on. */
  private afterRecoveredSayBack(softwareId: string): void {
    setExisting(this.db, softwareId, { status: "taken-on" });
    this.offerRecordCommit(softwareId);
    this.askHowToStart(softwareId);
    this.advance(softwareId, "say-back", "recovered record checked");
  }

  /**
   * When the code did not say how to start it, ask under Waiting on you rather than leave it in a
   * long message. The answer is taken in as intake, like anything said in the conversation.
   */
  private askHowToStart(softwareId: string): void {
    const existing = this.takenOn(softwareId);
    if (!existing || existing.run.premiseRun) return;
    const software = getSoftware(this.db, softwareId)!;
    createAsk(this.db, {
      softwareId,
      role: OPERATOR,
      kind: "question",
      stage: "intake",
      title: `How do you start ${software.name}?`,
      instruction:
        "premise did not find in the code how to start it, so it cannot start it or try a change yet. Write the command you type to start it, and the folder you type it in if it matters; for a web page, also the address you open. Your answer is taken in like anything said in the conversation, and goes through the line.",
      extra: { meta: { purpose: "start-command" } },
    });
  }

  /** The record goes into the operator's own repository only through the gate (decision 0189). */
  private offerRecordCommit(softwareId: string): void {
    const software = getSoftware(this.db, softwareId)!;
    const existing = this.takenOn(softwareId);
    if (!existing) return;
    const branch = this.config.existing.record_branch;
    const folder = this.config.record.folder;
    const local = existing.sourceKind === "folder";
    const request = this.options.gate.request({
      softwareId,
      kind: "write-repository",
      act: "add-record",
      action: `Create a branch named ${branch} in your repository at ${existing.source}, holding premise's record of ${software.name}: a new ${folder}/ folder, in commits on top of your history. Your other branches${local ? " and your working folder" : ""} are left alone; merge the branch when you want.`,
      why: "So the record lives with the code, where it outlives premise. Until then it is only in premise's own copy.",
      requestedBy: "line engine",
      perform: "add-record",
      stage: "say-back",
      waiting: "adding the record to your repository",
      card: {
        title: "Add premise's record to your repository?",
        standingLabel: "adding and updating premise's record in your repository",
        reality: this.recordReality(
          existing,
          local
            ? `Even when the agents are scripted, approving writes a branch named ${branch} with a ${folder}/ folder to your repository on this machine. Nothing leaves this machine.`
            : `Even when the agents are scripted, approving pushes a branch named ${branch} with a ${folder}/ folder to your repository at ${existing.source}, on this machine, with your own git login.`,
          `Approving pushes a branch named ${branch} with a ${folder}/ folder to your repository at ${existing.source}, with your own git login. Your other branches there are left alone; nothing is ever forced.`,
        ),
        whyNow:
          "You have gone through what premise recovered, so the record is ready to keep with the code.",
      },
    });
    if (request.status === "asked") {
      setExisting(this.db, softwareId, {
        recordStatus: "asked",
        recordRequest: request.id,
        recordNote: null,
      });
    }
  }

  /** After a change of a taken-on software reached running: push it to the record branch too. */
  private pushLatest(softwareId: string, ref: string | null): void {
    const existing = this.takenOn(softwareId);
    if (!existing || existing.recordStatus !== "added") return;
    const software = getSoftware(this.db, softwareId)!;
    const branch = this.config.existing.record_branch;
    const local = existing.sourceKind === "folder";
    this.options.gate.request({
      softwareId,
      kind: "write-repository",
      act: "push-record",
      action: `Update the branch ${branch} in your repository at ${existing.source} with premise's latest change of ${software.name}${ref ? ` (${ref})` : ""}. Your other branches${local ? " and your working folder" : ""} are left alone.`,
      why: "So your repository keeps up with what premise changed and recorded.",
      requestedBy: "line engine",
      perform: "add-record",
      stage: "intake",
      waiting: "updating the branch in your repository",
      card: {
        title: "Update premise's branch in your repository?",
        standingLabel: "updating premise's branch in your repository",
        reality: this.recordReality(
          existing,
          local
            ? `Even when the agents are scripted, approving adds commits to the branch ${branch} in your repository on this machine. Nothing leaves this machine.`
            : `Even when the agents are scripted, approving pushes commits to the branch ${branch} at ${existing.source}, on this machine, with your own git login.`,
          `Approving pushes commits to the branch ${branch} in your repository at ${existing.source}, with your own git login. Nothing is ever forced.`,
        ),
        whyNow:
          "A change premise made reached running, so the branch in your repository is behind.",
      },
    });
  }

  /** Whether premise acts outside this machine: only with real agents (decision 0260). */
  private get realAgents(): boolean {
    return this.options.realAgents?.() ?? this.config.agents.mode === "claude";
  }

  /**
   * What approving a write to a brought-in repository really does. On this machine it is real in
   * every mode; elsewhere it is real only with real agents, and a demo pushes nothing (0260).
   */
  private recordReality(
    existing: ExistingSoftware,
    here: string,
    elsewhere: string,
  ): { real: boolean; text: string } {
    if (!isElsewhere(existing)) return { real: true, text: here };
    if (this.realAgents) return { real: true, text: elsewhere };
    return {
      real: false,
      text: `Nothing is pushed to ${existing.source} whichever you choose: premise is running with scripted agents (a demo), and a demo does nothing outside this machine. Your answer is recorded, and the record stays in premise's own copy.`,
    };
  }

  /** The gate approved: push premise's record branch to the operator's repository. */
  private async addRecordToRepository(
    request: Pick<GateRequest, "softwareId"> & Partial<Pick<GateRequest, "card">>,
  ): Promise<PerformResult> {
    const software = getSoftware(this.db, request.softwareId);
    const existing = this.takenOn(request.softwareId);
    if (!software || !existing)
      return { ok: false, outcome: "The software is not in premise any more." };
    if (isElsewhere(existing) && (!this.realAgents || request.card?.reality.real === false)) {
      const why = this.realAgents
        ? "you were asked while premise ran with scripted agents, when approving was to push nothing. Ask again to push it now"
        : "premise is running with scripted agents (a demo), and a demo does nothing outside this machine";
      if (existing.recordStatus !== "added") {
        setExisting(this.db, software.id, {
          recordStatus: "failed",
          recordNote: `Nothing was pushed: ${why}.`,
        });
      }
      return {
        ok: false,
        unavailable: true,
        outcome: `Nothing was pushed to ${existing.source}: ${why}. The record stays in premise's own copy, and nothing is lost.`,
      };
    }
    const branch = this.config.existing.record_branch;
    try {
      await pushRecordBranch(this.options.keeper.repositoryPath(software.id), branch, {
        timeoutMinutes: this.config.existing.clone_timeout_minutes,
      });
      const note = `On the branch ${branch} in ${existing.source}.`;
      setExisting(this.db, software.id, { recordStatus: "added", recordNote: note });
      return {
        ok: true,
        outcome: `${software.name}'s record is in your repository: ${note} Merge it when you want.`,
      };
    } catch (error) {
      const why = (error as Error).message;
      if (existing.recordStatus !== "added") {
        setExisting(this.db, software.id, { recordStatus: "failed", recordNote: why });
      }
      return { ok: false, outcome: `Nothing was pushed: ${why}` };
    }
  }

  /** The operator asks premise to offer the record commit again, after refusing or a failure. */
  async offerRecord(id: string): Promise<void> {
    this.require(id);
    const existing = this.takenOn(id);
    if (!existing) {
      throw new ServiceError(
        "INVALID",
        "This software was started in premise, so its record is already in its own repository.",
      );
    }
    if (existing.status !== "taken-on") {
      throw new ServiceError(
        "INVALID",
        "premise offers to add the record once you have gone through what it recovered. Do that first.",
      );
    }
    if (existing.recordStatus === "asked") {
      throw new ServiceError(
        "INVALID",
        "premise is already asking about this under Waiting on you.",
      );
    }
    if (existing.recordStatus === "added") {
      throw new ServiceError("INVALID", "The record is already in your repository.");
    }
    transaction(this.db, () => this.offerRecordCommit(id));
    this.queue.tick();
  }

  /** The page's view of a software taken on from existing code. */
  private existingView(softwareId: string): ExistingView | undefined {
    const existing = this.takenOn(softwareId);
    if (!existing) return undefined;
    const all = this.recordLines(softwareId, { includeStruck: true }).filter(
      (i) => i.marks.from === "recovered",
    );
    const needs =
      existing.status === "copying" || existing.status === "copy-failed"
        ? []
        : all.length
          ? this.needs(existing)
          : existing.couldNotCheck;
    return {
      source: existing.source,
      sourceKind: existing.sourceKind,
      status: existing.status,
      problem: existing.problem,
      commits: existing.commits,
      recovered: all.filter((i) => !i.struck).length,
      confirmed: all.filter((i) => !i.struck && i.marks.confirmed).length,
      struck: all.filter((i) => i.struck).length,
      run: {
        build: existing.run.build ?? null,
        start: existing.run.start ?? null,
        check: existing.run.check ?? null,
        canStart: runProblems(existing.run, this.config.record.folder).every(
          (p) => !p.startsWith("How to start") && !p.startsWith("The start"),
        ),
      },
      couldNotCheck: needs,
      record: {
        status: existing.recordStatus,
        branch: this.config.existing.record_branch,
        note: existing.recordNote,
        canOffer:
          existing.status === "taken-on" &&
          (existing.recordStatus === "refused" ||
            existing.recordStatus === "failed" ||
            existing.recordStatus === "not-yet"),
      },
    };
  }

  /** Stop a software's jobs and withdraw its open asks (approvals stay: they belong to the gate). */
  private clearWork(id: string, why: string): void {
    for (const job of this.queue.list()) {
      // Triage and readings are intake's, not the line's: they go on.
      if (job.kind === "triage" || job.kind === "reading") continue;
      if (job.softwareId === id && !FINISHED.has(job.status)) {
        this.markHandled(job.id);
        this.queue.stop(job.id);
      }
    }
    for (const ask of listAsks(this.db, { softwareId: id, status: "open" })) {
      if (ask.extra.meta?.gateRequest !== undefined) continue;
      const purpose = ask.extra.meta?.purpose;
      if (purpose === "intake" || purpose === "intake-reading") continue;
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
    const notReady = copyNotReady(this.takenOn(id));
    if (notReady) throw new ServiceError("INVALID", notReady);
    const target = this.sendBackTarget(id, stage);
    if (!target) {
      throw new ServiceError(
        "INVALID",
        `${software.name} has not reached ${stageName(stage)} yet; it can only be sent back to ${stageName(software.currentStage)} or an earlier stage.`,
      );
    }
    transaction(this.db, () => {
      this.clearWork(id, `Withdrawn: sent back to ${stageName(stage)}.`);
      if (software.state !== "active") this.setLifecycle(id, "active", "sent back");
      this.setState(id, { returnTo: undefined, boost: undefined, review: undefined });
      const dropped = this.withdrawParts(target);
      this.setActive(id, target);
      if (stageNumber(stage) <= stageNumber("build")) this.options.later.reset?.(id);
      this.premiseSays(
        id,
        `Sent back to ${stageName(stage)}. The stages after it will be done again.${dropped > 0 ? ` The ${dropped === 1 ? "part" : `${dropped} parts`} made after it ${dropped === 1 ? "was" : "were"} withdrawn and will be made again.` : ""}`,
      );
      this.enterStage(getSoftware(this.db, id)!, stage, "sent back");
    });
    this.queue.tick();
  }

  /**
   * The piece a send-back applies to: the one being worked on when it has reached the stage itself,
   * or else the nearest piece above it that went through that stage before its parts took over.
   */
  private sendBackTarget(id: string, stage: StageId): WorkItem | undefined {
    const order = (s: string) => STAGE_IDS.indexOf(s as StageId);
    for (const item of ancestry(this.db, this.active(id))) {
      if (!item.stages.includes(stage)) continue;
      const notes = this.notes(item);
      const reached =
        item.state === "sizing"
          ? -1
          : notes.children
            ? notes.handedOffAt
              ? order(notes.handedOffAt)
              : -1
            : order(item.currentStage);
      if (notes.children && item.state === "active") {
        // Its parts are done and it goes on itself: it has reached its own current stage.
        if (order(stage) <= order(item.currentStage)) return item;
        continue;
      }
      if (order(stage) <= reached) return item;
    }
    return undefined;
  }

  /** Withdraw every part below a piece that is not finished, with their jobs. Returns how many. */
  private withdrawParts(item: WorkItem): number {
    let count = 0;
    for (const child of childItems(this.db, item.id)) {
      count += this.withdrawParts(child);
      if (child.state === "withdrawn") continue;
      setWorkItem(this.db, child.id, { state: "withdrawn", finished: now() });
      recordEvent(this.db, {
        softwareId: item.softwareId,
        module: "line",
        kind: "work-item-withdrawn",
        reference: String(child.id),
      });
      this.options.intake.workItemMoved(getWorkItem(this.db, child.id)!, "withdrawn");
      count += 1;
    }
    this.setNotes(item, {
      children: undefined,
      handedOffAt: undefined,
      resumeAfter: undefined,
      wholeRound: undefined,
    });
    return count;
  }

  private setActive(id: string, item: WorkItem): void {
    const root = rootItem(this.db, id);
    this.setState(id, { item: item.id === root.id ? undefined : item.id });
    if (item.state !== "active" && item.state !== "sizing") {
      setWorkItem(this.db, item.id, { state: "active" });
    }
  }

  async setSize(id: string, size: SizeClass): Promise<void> {
    this.require(id);
    await this.setItemSize(rootItem(this.db, id).id, size);
  }

  /** The operator changes a piece's size; its stages' budgets follow. */
  async setItemSize(itemId: number, size: SizeClass): Promise<void> {
    const item = this.requireItem(itemId);
    if (["done", "withdrawn", "dropped"].includes(item.state)) {
      throw new ServiceError(
        "INVALID",
        "That piece of work is finished, so its size cannot change. Send the software back to change it.",
      );
    }
    if (!(SIZE_CLASSES as readonly string[]).includes(size)) {
      throw new ServiceError("INVALID", `The size must be small, medium or large.`);
    }
    if (item.sizeClass === size) return;
    transaction(this.db, () => {
      this.recordSizing(
        item,
        { sizeClass: size },
        {
          size: { by: "operator", reason: `You changed it from ${item.sizeClass} to ${size}.` },
        },
      );
      const software = getSoftware(this.db, item.softwareId)!;
      const isActive = this.active(item.softwareId).id === item.id;
      const budget = isActive ? this.budgetFor(software, software.currentStage) : null;
      this.premiseSays(
        item.softwareId,
        `${item.parentId === null ? "Size" : `The size of ${this.label(item)}`} is now ${size}.${budget ? ` This stage may now take up to ${budget.turns} agent turns and ${budget.minutes} minutes.` : " Each stage before building gets a budget to match."}`,
      );
    });
  }

  async softwareOfItem(itemId: number): Promise<string> {
    return this.requireItem(itemId).softwareId;
  }

  private requireItem(itemId: number): WorkItem {
    const item = getWorkItem(this.db, itemId);
    if (!item || !getSoftware(this.db, item.softwareId)) {
      throw new ServiceError(
        "NOT_FOUND",
        "That piece of work is not in premise any more. Reload the page.",
      );
    }
    return item;
  }

  /** Change an item's size or stages and what is recorded about them; a software mirrors its size. */
  private recordSizing(
    item: WorkItem,
    change: { sizeClass?: string; stages?: StageId[] },
    sizing: Partial<Sizing>,
  ): void {
    const before = item.sizing ?? defaultSizing("Not sized yet.");
    setWorkItem(this.db, item.id, { ...change, sizing: { ...before, ...sizing } });
    if (change.sizeClass && item.parentId === null) {
      setSoftwareSizeClass(this.db, item.softwareId, change.sizeClass);
    }
    recordEvent(this.db, {
      softwareId: item.softwareId,
      module: "line",
      kind: "work-item-resized",
      reference: String(item.id),
      detail: { ...change, by: Object.values(sizing)[0]?.by ?? "operator" },
    });
  }

  /** The operator picks which stages a piece goes through. What must never be skipped stays. */
  async setItemStages(itemId: number, wanted: StageId[]): Promise<void> {
    const item = this.requireItem(itemId);
    if (["done", "withdrawn", "dropped"].includes(item.state)) {
      throw new ServiceError(
        "INVALID",
        "That piece of work is finished, so its steps cannot change. Send the software back to change it.",
      );
    }
    const unknown = wanted.filter((s) => !isStageId(s));
    if (unknown.length) {
      throw new ServiceError(
        "INVALID",
        `${unknown.join(", ")} ${unknown.length === 1 ? "is not a step" : "are not steps"}. The steps are: ${STAGES.map((s) => s.name).join(", ")}.`,
      );
    }
    const settled = settleStages(item, wanted);
    const kept = requiredStages(item).filter((s) => !wanted.includes(s));
    if (settled.stages.join() === item.stages.join()) {
      if (kept.length) {
        throw new ServiceError(
          "INVALID",
          `Nothing changed: ${kept.map(stageName).join(", ")} ${kept.length === 1 ? "is" : "are"} always needed for this kind of work.`,
        );
      }
      return;
    }
    transaction(this.db, () => {
      this.recordSizing(
        item,
        { stages: settled.stages },
        {
          stages: {
            by: "operator",
            reason: `You chose these steps.${settled.notes.length ? ` ${settled.notes.join(" ")}` : ""}`,
          },
        },
      );
      const fresh = getWorkItem(this.db, item.id)!;
      const added = settled.stages.filter((s) => !item.stages.includes(s));
      const removed = item.stages.filter((s) => !settled.stages.includes(s));
      const words = [
        added.length ? `now goes through ${added.map(stageName).join(", ")}` : "",
        removed.length ? `skips ${removed.map(stageName).join(", ")}` : "",
      ].filter(Boolean);
      let tail = "";
      const isActive = this.active(item.softwareId).id === item.id;
      const order = (s: string) => STAGE_IDS.indexOf(s as StageId);
      if (isActive && item.state === "active" && !this.notes(item).children) {
        const here = item.currentStage as StageId;
        if (removed.includes(here)) {
          tail = ` It was at ${stageName(here)}, so it moves on now.`;
          this.clearWork(item.softwareId, `Withdrawn: ${stageName(here)} is no longer needed.`);
          const next = settled.stages.find((s) => order(s) > order(here));
          if (next) this.enterStage(getSoftware(this.db, item.softwareId)!, next, "steps changed");
          else this.finishItem(item.softwareId, fresh, "done");
        } else if (added.some((s) => order(s) < order(here))) {
          tail =
            " Steps it has already passed are not done now; send it back to one of them to do it.";
        }
      }
      if (kept.length) {
        tail += ` ${kept.map(stageName).join(", ")} ${kept.length === 1 ? "stays" : "stay"}: always needed for this kind of work.`;
      }
      this.premiseSays(
        item.softwareId,
        `${capital(this.label(item))} ${words.join(" and ")}.${tail}`,
      );
    });
    this.queue.tick();
  }

  /** The operator undoes a split: the parts are withdrawn and the piece goes through the line whole. */
  async undoSplit(itemId: number): Promise<void> {
    const item = this.requireItem(itemId);
    const notes = this.notes(item);
    const parts = childItems(this.db, item.id).filter((c) => c.state !== "withdrawn");
    if (notes.children !== "split" || parts.length === 0) {
      throw new ServiceError(
        "INVALID",
        "That piece of work is not split, so there is nothing to undo.",
      );
    }
    if (this.partsStartedBuilding(item)) {
      throw new ServiceError(
        "INVALID",
        "A part has already been built, so the split cannot be undone. Send the software back to an earlier step instead.",
      );
    }
    transaction(this.db, () => {
      this.clearWork(item.softwareId, "Withdrawn: the split was undone.");
      this.withdrawParts(item);
      this.recordSizing(
        item,
        {},
        {
          split: { decision: "whole", by: "operator", reason: "You undid the split." },
        },
      );
      const fresh = getWorkItem(this.db, item.id)!;
      this.setActive(item.softwareId, fresh);
      setWorkItem(this.db, item.id, { state: "active" });
      this.premiseSays(
        item.softwareId,
        `Split undone: ${this.label(item)} goes through the line whole, and its ${parts.length} parts are withdrawn.`,
      );
      this.enterStage(
        getSoftware(this.db, item.softwareId)!,
        fresh.stages[0] ?? "build",
        "split undone",
      );
    });
    this.queue.tick();
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

  /**
   * How much effort the software gets (decision 0191). It sets the cut an open scope check starts
   * on (when it is asked next) and the budgets of the stages before building from now on.
   */
  async setEffort(id: string, effort: SoftwareEffort): Promise<void> {
    this.require(id);
    if (!isEffort(effort)) {
      throw new ServiceError("INVALID", "Choose the effort as low, medium or high.");
    }
    setSoftwareEffort(this.db, id, effort);
    this.premiseSays(
      id,
      `Effort set to ${effort}: ${EFFORT_WORDS[effort]}. The stages before building get a ${effort === "medium" ? "usual" : effort === "low" ? "smaller" : "larger"} budget from the next one on.`,
    );
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
        `Withdrawn: premise will ask again before ${approval.label}. What was already done stays done.`,
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
    const item = this.active(software.id);
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
    if (stage === "build") this.markBuildStarted(item);
    this.options.intake.workItemMoved(getWorkItem(this.db, item.id)!, stage);
    return run;
  }

  /**
   * The first time a piece reaches Build: the time it spent before building is recorded for it and
   * for every piece above it that has not reached Build yet, so the first stages can be measured.
   */
  private markBuildStarted(item: WorkItem): void {
    const at = now();
    for (const piece of ancestry(this.db, item)) {
      if (piece.buildStarted) continue;
      setWorkItem(this.db, piece.id, { buildStarted: at });
      recordEvent(this.db, {
        softwareId: piece.softwareId,
        module: "line",
        kind: "build-started",
        reference: String(piece.id),
        detail: {
          minutesBeforeBuild: minutesBeforeBuild({ created: piece.created, buildStarted: at }),
        },
      });
    }
  }

  // ---- Sizing and parts -----------------------------------------------------------------------

  /** Begin a piece of work: size it first if it has not been sized, then its first stage. */
  private beginItem(softwareId: string, item: WorkItem, why: string): void {
    this.setActive(softwareId, item);
    const fresh = getWorkItem(this.db, item.id)!;
    if (!fresh.sized) {
      this.startSizing(softwareId, fresh, why);
      return;
    }
    this.enterStage(getSoftware(this.db, softwareId)!, fresh.stages[0] ?? "build", why);
  }

  /** Queue the sizer's job for a piece; the line waits for it (it is quick). */
  private startSizing(softwareId: string, item: WorkItem, why: string): void {
    const software = getSoftware(this.db, softwareId)!;
    const state = this.state(softwareId);
    if (state.run) {
      this.db
        .prepare(
          "UPDATE stage_runs SET exited = ?, exit_reason = ? WHERE id = ? AND exited IS NULL",
        )
        .run(now(), why, state.run);
    }
    const row = this.db
      .prepare(
        `INSERT INTO stage_runs (software_id, work_item_id, stage, milestone, entered)
         VALUES (?, ?, 'sizing', ?, ?)`,
      )
      .run(softwareId, item.id, item.kind === "milestone" ? item.ref : null, now());
    const run = Number(row.lastInsertRowid);
    this.setState(softwareId, { run, boost: undefined });
    setWorkItem(this.db, item.id, { state: "sizing", proposal: null });
    this.options.intake.workItemMoved(getWorkItem(this.db, item.id)!, "sizing");
    const allowed = allowedStages(item);
    const required = requiredStages(item);
    const splitting = maySplit(item, this.config);
    const brief = this.options.briefs.make("sizing brief", {
      software_name: software.name,
      piece_kind: pieceWords(item),
      piece: item.parentId === null ? software.idea : `${item.title ?? ""}: ${item.words ?? ""}`,
      operator_words: software.idea,
      record: this.recordText(softwareId),
      allowed_stages: allowed
        .map((s) => `- ${s}: ${STAGES.find((x) => x.id === s)!.plain}`)
        .join("\n"),
      required_stages: required.join(", "),
      splitting: splitting
        ? `allowed, into at most ${this.config.line.split_max_parts} parts`
        : "not allowed for this piece: keep it whole",
      effort: `${software.effort}: ${EFFORT_WORDS[software.effort]}`,
    });
    this.queue.enqueue({
      softwareId,
      kind: "size",
      stage: "sizing",
      payload: {
        run,
        item: item.id,
        purpose: "size",
        brief,
        context: {
          stage: "sizing",
          purpose: "size",
          name: software.name,
          idea: software.idea,
          piece:
            item.origin === "existing"
              ? "existing"
              : item.parentId === null
                ? "software"
                : item.kind,
          title: item.title ?? software.name,
          words: item.words ?? software.idea,
          allowed: [...allowed],
          required: [...required],
          splitting,
          ...(item.kind === "intake" && { intakeKind: this.notes(item).intakeKind ?? "wish" }),
        },
      },
    });
    if (item.parentId === null) {
      this.premiseSays(
        softwareId,
        "First, a quick look at the size of the work: how big it is, which steps it needs, and whether it splits into separate parts.",
      );
    }
  }

  /** sizing_submit: the sizer's answer for its piece, kept until its job ends. */
  sizingSubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    const item = getWorkItem(this.db, Number(job.payload.item));
    if (!item || item.state !== "sizing") {
      return toolFail("TASK_CLOSED", "This piece of work is no longer being sized. Stop.");
    }
    const read = readSizing(item, args, this.config);
    if ("problems" in read) {
      return toolFail("MALFORMED", "The sizing cannot be used as it is.", read.problems);
    }
    setWorkItem(this.db, item.id, { proposal: read.proposal });
    return toolOk({
      status: "received",
      stages: read.proposal.stages,
      parts: read.proposal.split.length,
      notes: read.proposal.notes,
      note: "premise uses this when you finish. Submitting again replaces it.",
    });
  }

  /** The sizer's job ended: apply its answer, or a safe default when it gave none. */
  private sizeJobEnded(software: Software, job: Job): void {
    const item = getWorkItem(this.db, Number(job.payload.item));
    if (!item || item.state !== "sizing") return;
    if (job.status === "done" && item.proposal) {
      this.applySizing(software.id, item, item.proposal, "sizer");
      return;
    }
    if (job.status === "done" && !askedAgain(job)) {
      // Asked once more with the exact shape before the safe default (decision 0275).
      this.queue.enqueue(againJob(job, "sizing_submit"));
      return;
    }
    const why =
      job.status === "done"
        ? "the sizer gave no answer, even when asked a second time"
        : `the sizer ${job.status === "stopped" ? "was stopped" : `did not finish (${job.result ?? "no reason was given"})`}`;
    const stages = defaultStages(item);
    this.applySizing(
      software.id,
      item,
      {
        size: item.parentId === null ? asSize(software.sizeClass) : asSize(item.sizeClass),
        sizeReason: `Not sized: ${why}, so premise kept the size it had.`,
        stages,
        stagesReason: `Not sized: ${why}, so premise uses every step this kind of work can have. Take out the ones it does not need.`,
        split: [],
        splitReason: `Not sized: ${why}, so it stays whole.`,
        notes: [],
      },
      "default",
    );
  }

  private applySizing(
    softwareId: string,
    item: WorkItem,
    proposal: SizingProposal,
    by: SizedBy,
  ): void {
    const split = proposal.split.length >= 2;
    const sizing: Sizing = {
      size: { by, reason: proposal.sizeReason },
      stages: {
        by,
        reason: [proposal.stagesReason, ...proposal.notes].join(" "),
      },
      split: { decision: split ? "split" : "whole", by, reason: proposal.splitReason },
    };
    setWorkItem(this.db, item.id, {
      sizeClass: proposal.size,
      stages: proposal.stages,
      sizing,
      sized: now(),
      proposal: null,
      state: "active",
      currentStage: proposal.stages[0] ?? "build",
    });
    if (item.parentId === null) setSoftwareSizeClass(this.db, softwareId, proposal.size);
    recordEvent(this.db, {
      softwareId,
      module: "line",
      kind: "work-item-sized",
      reference: String(item.id),
      detail: { by, size: proposal.size, stages: proposal.stages, parts: proposal.split.length },
    });
    const fresh = getWorkItem(this.db, item.id)!;
    const skipped = allowedStages(fresh).filter((s) => !fresh.stages.includes(s));
    const who = by === "sizer" ? "" : " (not sized by an agent)";
    this.premiseSays(
      softwareId,
      `${capital(this.label(fresh))}${who}: ${proposal.size}. ${skipped.length ? `Not needed: ${skipped.map(stageName).join(", ")}, because ${lowerFirst(proposal.stagesReason)}` : "It goes through every step."}${split ? "" : ` Kept whole: ${lowerFirst(proposal.splitReason)}`} You can change this on the Line tab.`,
    );
    if (!split) {
      this.enterStage(getSoftware(this.db, softwareId)!, fresh.stages[0] ?? "build", "sized");
      return;
    }
    const recovering = this.isRecovery(fresh);
    const parts = this.makeParts(
      fresh,
      proposal.split.map((p) => ({ title: p.title, words: p.words })),
      recovering ? "recover" : "split",
    );
    this.setNotes(
      fresh,
      recovering
        ? { children: "recover", handedOffAt: null, resumeAfter: "why" }
        : { children: "split", handedOffAt: null, resumeAfter: "check", wholeRound: 0 },
    );
    setWorkItem(this.db, fresh.id, { state: "waiting" });
    this.premiseSays(
      softwareId,
      recovering
        ? `Its record is recovered in ${parts.length} parts, because ${lowerFirst(proposal.splitReason)} ${parts.map((p, i) => `${i + 1}. ${p.title}`).join("; ")}. A drafter reads each part in turn; then everything recovered is said back to you in one list.`
        : `Split into ${parts.length} separate parts, because ${lowerFirst(proposal.splitReason)} ${parts.map((p, i) => `${i + 1}. ${p.title}`).join("; ")}. Each part goes through the steps it needs, one after another; then the whole is checked, run and reported. You can undo the split on the Line tab until a part is built.`,
    );
    this.beginItem(softwareId, parts[0]!, "split");
  }

  /** Make a piece's parts, in order. Each is sized when the line comes to it. */
  private makeParts(
    parent: WorkItem,
    parts: { title: string; words: string; ref?: string }[],
    origin: WorkItemOrigin,
  ): WorkItem[] {
    const before = childItems(this.db, parent.id).length;
    return parts.map((part, i) => {
      const kind = origin === "plan" ? "milestone" : "module";
      return createWorkItem(this.db, {
        softwareId: parent.softwareId,
        parentId: parent.id,
        kind,
        origin,
        title: part.title,
        words: part.words,
        ref: part.ref ?? null,
        position: before + i,
        sizeClass: parent.sizeClass,
        stages: defaultStages({ kind, origin, parentId: parent.id }),
        state: "ahead",
      });
    });
  }

  /** A piece is finished: the next part after it begins, or the piece above it goes on. */
  private finishItem(softwareId: string, item: WorkItem, state: "done" | "dropped"): void {
    if (item.parentId === null) {
      // The software itself: its line ends at Intake.
      this.enterStage(getSoftware(this.db, softwareId)!, "intake", "line finished");
      return;
    }
    setWorkItem(this.db, item.id, { state, finished: now() });
    recordEvent(this.db, {
      softwareId,
      module: "line",
      kind: state === "done" ? "work-item-done" : "work-item-dropped",
      reference: String(item.id),
    });
    this.options.intake.workItemMoved(getWorkItem(this.db, item.id)!, state);
    const parent = getWorkItem(this.db, item.parentId)!;
    if (item.kind === "intake") {
      // Its notice stays open while it builds, and after only while a suggestion is still offered.
      const notes = this.changeNotes(item);
      const open = notes.ask === undefined ? undefined : getAsk(this.db, notes.ask);
      const offered = notes.suggestions.some((x) => !x.added);
      if (open?.status === "open" && open.extra.meta?.purpose === "change-notice" && !offered) {
        closeAsk(this.db, open.id, "withdrawn", null, `${item.ref ?? "The change"} is done.`);
      }
      // Intake work is the software's own, one item after another; then the line rests at Intake.
      const queued = this.nextIntakeWork(softwareId);
      if (queued) {
        this.beginItem(softwareId, queued, `${item.ref ?? "an intake item"} finished`);
        return;
      }
      this.setActive(softwareId, parent);
      this.restAtIntake(
        getSoftware(this.db, softwareId)!,
        `${item.ref ?? "intake work"} finished`,
        true,
      );
      return;
    }
    // Intake work waits until the software's own round reaches Intake.
    const next = childItems(this.db, parent.id).find(
      (c) => c.state === "ahead" && c.kind !== "intake",
    );
    if (next) {
      this.beginItem(softwareId, next, `${this.label(item)} finished`);
      return;
    }
    this.setActive(softwareId, parent);
    if (this.notes(parent).children === "split") this.startWholeCheck(softwareId, parent);
    else this.resumeParent(softwareId, parent);
  }

  /** Every part of a split piece is done: check the whole (a hand-off to the Check stage). */
  private startWholeCheck(softwareId: string, item: WorkItem): void {
    const notes = this.notes(item);
    const round = (notes.wholeRound ?? 0) + 1;
    this.setNotes(item, { wholeRound: round });
    this.setActive(softwareId, item);
    const software = getSoftware(this.db, softwareId)!;
    this.openRun(software, "check", "parts done", this.milestoneOf(softwareId)?.id ?? null);
    const run = this.state(softwareId).run!;
    const parts = childItems(this.db, item.id).filter((p) => p.state === "done");
    const jobs = this.wholeCheck.jobs(softwareId, {
      itemId: item.id,
      title: item.parentId === null ? software.name : (item.title ?? ""),
      words: item.words ?? software.idea,
      milestone: this.milestoneOf(softwareId)?.id ?? null,
      parts: parts.map((p) => ({ itemId: p.id, title: p.title ?? "" })),
      round,
    });
    for (const job of jobs) {
      this.queue.enqueue({ ...job, payload: { ...job.payload, run, whole: true, item: item.id } });
    }
    this.premiseSays(
      softwareId,
      `Every part of ${this.label(item)} is built and checked; now checking that the parts work together${this.wholeCheck.standIn ? " (stand-in: nothing is really checked yet)" : ""}.`,
    );
    if (jobs.length === 0) this.resumeParent(softwareId, item);
  }

  private wholeJobEnded(software: Software, job: Job): void {
    const item = getWorkItem(this.db, Number(job.payload.item));
    if (!item) return;
    if (job.status !== "done") {
      this.premiseSays(
        software.id,
        `The check of the whole ${job.status === "stopped" ? "was stopped" : "did not finish"}: ${job.result ?? "no reason was given"}. Send ${software.name} back to Check to try again.`,
      );
      return;
    }
    const outcome = this.wholeCheck.finished(job);
    if (outcome.kind === "wait") return;
    const open = this.queue
      .list()
      .some(
        (j) =>
          j.softwareId === software.id &&
          j.payload.run === job.payload.run &&
          !FINISHED.has(j.status),
      );
    if (outcome.kind === "passed") {
      if (!open) {
        this.premiseSays(
          software.id,
          this.wholeCheck.standIn
            ? `Every part of ${this.label(item)} was checked on its own. Checking the parts together is not built yet, so how they work together is not verified.`
            : `The whole of ${this.label(item)} passed its check.`,
        );
        this.resumeParent(software.id, item);
      }
      return;
    }
    const round = this.notes(item).wholeRound ?? 1;
    if (round >= WHOLE_CHECK_ROUNDS) {
      this.premiseSays(
        software.id,
        `The check of the whole still fails after ${round} rounds: ${outcome.evidence} premise goes on, and the report says so. Send it back to Check, or say in chat what to fix.`,
      );
      this.resumeParent(software.id, item);
      return;
    }
    this.clearWork(software.id, "Withdrawn: the whole check found something to fix.");
    const [fix] = this.makeParts(
      item,
      [
        {
          title: `Fix what the check of the whole found (round ${round})`,
          words: outcome.evidence,
        },
      ],
      "fix",
    );
    this.premiseSays(
      software.id,
      `The check of the whole found a problem: ${outcome.evidence} A fix goes through the line as one more part.`,
    );
    this.beginItem(software.id, fix!, "whole check not passed");
  }

  /** A piece's parts are done (and, for a split, the whole checked): it goes on itself. */
  private resumeParent(softwareId: string, item: WorkItem): void {
    const notes = this.notes(item);
    this.setActive(softwareId, item);
    const fresh = getWorkItem(this.db, item.id)!;
    const next = notes.resumeAfter ? nextStage(fresh, notes.resumeAfter) : undefined;
    if (next) this.enterStage(getSoftware(this.db, softwareId)!, next, "parts done");
    else this.finishItem(softwareId, fresh, "done");
  }

  /** Put the piece being worked on at a stage and start that stage's work. */
  private enterStage(software: Software, stage: StageId, why: string): void {
    const item = this.active(software.id);
    if (!item.stages.includes(stage) && allowedStages(item).includes(stage)) {
      // Sent to a stage sizing left out, such as Why for a struck purpose item: it now needs it.
      const stages = STAGE_IDS.filter((s) => s === stage || item.stages.includes(s));
      this.recordSizing(
        item,
        { stages },
        {
          stages: {
            by: item.sizing?.stages.by ?? "default",
            reason:
              `${item.sizing?.stages.reason ?? ""} ${stageName(stage)} was added when the work was sent back to it (${why}).`.trim(),
          },
        },
      );
    }
    if (stage === "check" && this.notes(item).children === "split") {
      this.startWholeCheck(software.id, item);
      return;
    }
    if ((EARLY as readonly string[]).includes(stage)) {
      this.setState(software.id, { boost: undefined });
      if (stage === "say-back" && why !== "items struck")
        this.setState(software.id, { sayBackRounds: 0 });
      if (stage === "plan") {
        this.setState(software.id, { review: { round: 0, objections: [] } });
        const change = this.changeOf(item);
        if (change) {
          this.retractChangeDecisions(software.id, change, item);
          removeChangePlan(this.config.data.folder, software.id, item.id);
          this.setChangeNotes(change, { decided: undefined });
        }
      }
      this.openRun(software, stage, why);
      if (this.isRecovery(item)) {
        // Taking on an existing software (decision 0189).
        const fresh = getSoftware(this.db, software.id)!;
        if (stage === "why") {
          this.queueRecovery(fresh);
          this.premiseSays(
            software.id,
            item.parentId === null
              ? "Recovering the record: a drafter is reading the code, its documents and its history, and writing down why it exists, who it is for, what it does and the decisions it shows."
              : `Recovering the record of ${this.label(item)}: a drafter is reading that part of the code.`,
          );
          return;
        }
        if (stage === "say-back") {
          this.askRecoveredSayBack(fresh);
          return;
        }
        if (stage === "exists") {
          this.queueStageJob(fresh, "exists", "since", {
            scope: "since",
            subject: `whether anything has appeared since ${software.name} was built that makes part of it unnecessary`,
          });
          this.premiseSays(
            software.id,
            "A short look at what exists now: has anything appeared that makes part of it unnecessary? A researcher is on it.",
          );
          return;
        }
      }
      const change = this.changeOf(item);
      if (stage === "plan" && change) {
        // A change is planned as a change: never the software's whole plan again (0273).
        this.queueStageJob(
          getSoftware(this.db, software.id)!,
          "plan",
          "change",
          { change: this.changeText(software.id, change, item) },
          { change: change.ref ?? null, items: this.changeWork(software.id)?.touched ?? [] },
        );
        this.premiseSays(
          software.id,
          `Planning your change ${change.ref ?? ""}: only what it needs. The software's milestones stay as they are and are not built again.`,
        );
        return;
      }
      this.queueStageJob(getSoftware(this.db, software.id)!, stage as EarlyStage, "draft");
      this.premiseSays(software.id, ENTER_WORDS[stage as EarlyStage]);
      return;
    }
    if ((LATER as readonly string[]).includes(stage)) {
      if (stage === "build" && why !== "check not passed" && this.holdForChange(software, item)) {
        return;
      }
      this.enterLater(software, stage as LaterStageId, this.milestoneOf(software.id), why);
      return;
    }
    this.restAtIntake(software, why, false);
  }

  /**
   * Intake: the end of the line, where the software rests. Work taken in meanwhile starts now, one
   * item after another. `back` is true when an intake item's work just finished.
   */
  private restAtIntake(software: Software, why: string, back: boolean): void {
    const wasAtIntake = back;
    this.openRun(software, "intake", why);
    this.setState(software.id, { milestone: undefined });
    const queued = this.nextIntakeWork(software.id);
    if (!wasAtIntake || !queued) {
      this.premiseSays(
        software.id,
        wasAtIntake
          ? "Back at Intake: nothing else is waiting. Say in chat, or report on the Intake tab, what to change next."
          : this.takenOn(software.id)
            ? `${software.name} is taken on. From now on, say in chat or on the Intake tab what to change; each change goes through the line and its commits name what they serve. If people still change it by hand outside premise, its record will drift from the code: premise cannot follow such changes yet.`
            : "That is the whole line. Anything you say in chat from now on is taken as new work.",
      );
    }
    if (queued) this.beginItem(software.id, queued, "taken in earlier");
  }

  /** The next intake item's work waiting for the line, if any. */
  private nextIntakeWork(softwareId: string): WorkItem | undefined {
    const root = rootItem(this.db, softwareId);
    return childItems(this.db, root.id).find((c) => c.kind === "intake" && c.state === "ahead");
  }

  /**
   * IntakeLine: an intake item's work joins the line as a piece of the software. It starts at once
   * when the software rests at Intake; otherwise after the work before it (decision 0185).
   */
  takeWork(
    softwareId: string,
    work: {
      ref: string;
      title: string;
      words: string;
      purpose: boolean;
      kind: string;
      changesWhat?: boolean;
    },
  ): WorkItem {
    const root = rootItem(this.db, softwareId);
    // A bug on something the record requires is built and checked straight away; only a real
    // change to what the software must do reopens What (decision 0192).
    const origin: WorkItemOrigin = work.purpose
      ? "purpose"
      : work.kind === "bug"
        ? "bug"
        : work.changesWhat
          ? "change"
          : "intake";
    const piece = { kind: "intake" as const, origin, parentId: root.id };
    const item = createWorkItem(this.db, {
      softwareId,
      parentId: root.id,
      kind: "intake",
      origin,
      title: work.title,
      words: work.words,
      ref: work.ref,
      position: childItems(this.db, root.id).length,
      sizeClass: "small",
      stages: defaultStages(piece),
      state: "ahead",
    });
    this.setNotes(item, { intakeKind: work.kind });
    const software = getSoftware(this.db, softwareId)!;
    const resting =
      software.state === "active" &&
      this.active(softwareId).id === root.id &&
      root.currentStage === "intake" &&
      this.nextIntakeWork(softwareId)?.id === item.id;
    if (resting) this.beginItem(softwareId, item, `${work.ref} taken in`);
    return getWorkItem(this.db, item.id)!;
  }

  /** IntakeLine: the whole software goes back to Why with the operator. */
  async backToWhy(softwareId: string): Promise<void> {
    await this.sendBack(softwareId, "why");
  }

  private enterLater(
    software: Software,
    stage: LaterStageId,
    milestone: MilestoneRef | null,
    why: string,
  ): void {
    this.openRun(software, stage, why, milestone?.id ?? null);
    this.setState(software.id, { milestone: milestone?.id ?? null });
    const run = this.state(software.id).run!;
    const change = milestone ? null : this.changeWork(software.id);
    const jobs = this.options.later.jobs({
      softwareId: software.id,
      stage,
      milestone,
      run,
      why,
      ...(change && { change }),
    });
    for (const job of jobs ?? []) {
      this.queue.enqueue({
        ...job,
        payload: {
          ...job.payload,
          run,
          milestone: milestone?.id ?? null,
          item: this.active(software.id).id,
        },
      });
    }
    const about = milestone
      ? ` ${milestone.id}: ${milestone.text.replace(/[.\s]+$/, "")}`
      : change
        ? ` your change ${change.ref}: ${change.tasks.map((t) => t.title.replace(/[.\s]+$/, "")).join("; ")}`
        : "";
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
    if (jobs !== null && jobs.length === 0 && stage !== "report") {
      this.afterLater(software.id, stage);
    }
  }

  /** A later stage finished: on to the piece's next stage, or the piece is finished. */
  private afterLater(softwareId: string, stage: LaterStageId): void {
    this.advance(softwareId, stage, `${stage} done`);
  }

  /** Have the reporter write a report from recorded facts (after this transaction commits). */
  private report(
    softwareId: string,
    trigger: "milestone" | "do-not-build" | "change-running",
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
    const piece = this.active(software.id);
    if (piece.kind === "intake") {
      // An intake item's change reached running: a short report (decision 0098).
      this.report(software.id, "change-running", piece.ref ?? undefined);
      // What changed, what was checked for it and again, and what was not (decision 0273).
      for (const line of this.options.later.reportLines(software.id, null)) {
        this.premiseSays(software.id, line);
      }
      this.pushLatest(software.id, piece.ref);
      this.premiseSays(
        software.id,
        `The report on ${piece.ref ?? "this change"} is ready: open the Report tab.${this.options.later.standIn ? " (Stand-in: building, checking and running are not built into premise yet, so nothing was really built or started.)" : ""}`,
      );
      this.afterLater(software.id, "report");
      return;
    }
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
    const item = this.active(software.id);
    if (item.kind !== "milestone") {
      this.afterLater(software.id, "report");
      return;
    }
    const all = this.milestones(software.id);
    const index = milestone ? all.findIndex((m) => m.id === milestone.id) : -1;
    const siblings = childItems(this.db, item.parentId!);
    const after = siblings.find((s) => s.position > item.position && s.state === "ahead");
    const nextMilestone = after ? { id: after.ref ?? "", text: after.title ?? "" } : undefined;
    const waits = index >= 0 && all[index]!.wait;
    if (waits) {
      const notRunning = this.options.later.notRunning?.(software.id) ?? null;
      this.setLifecycle(software.id, "waiting-milestone", `${milestone!.id} reached`);
      createAsk(this.db, {
        softwareId: software.id,
        role: OPERATOR,
        kind: "question",
        stage: "report",
        title: `Milestone reached: ${milestone!.text.replace(/\.+$/, "")}. Go on?`,
        instruction: `You asked premise to stop after this milestone. ${notRunning ? `${notRunning} Read the report.` : "Try the software and read the report."} ${nextMilestone ? `"Go on" builds the next milestone, "${nextMilestone.text.replace(/\.+$/, "")}".` : `This is the last milestone, so "Go on" builds nothing more: premise finishes, and then takes in any problem or wish you send in the conversation.`} If it is solving the wrong problem, "Go back to Why" redoes the work from Why with what you say then.`,
        extra: {
          choices: [...MILESTONE_CHOICES],
          meta: {
            purpose: "milestone-reached",
            milestone: milestone!.id,
            milestoneTitle: milestone!.text.replace(/\.+$/, ""),
            ...(nextMilestone && { next: nextMilestone.text.replace(/\.+$/, "") }),
          },
        },
      });
      return;
    }
    this.afterLater(software.id, "report");
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
          : purpose === "change"
            ? "change plan brief"
            : purpose === "revision"
              ? "foundation revision brief"
              : purpose === "since"
                ? "smaller look brief"
                : STAGE_JOB[stage].brief;
    const item = this.active(software.id);
    return this.options.briefs.make(
      name,
      {
        software_name: software.name,
        stage: stageName(stage),
        operator_words: software.idea,
        piece:
          item.parentId === null
            ? "the whole software"
            : `${item.kind === "milestone" ? `the milestone ${item.ref ?? ""}` : item.kind === "intake" ? `the intake item ${item.ref ?? ""}, a change to the software` : "one part of it"}: ${item.title ?? ""}. ${item.words ?? ""}`.trim(),
        record: this.recordText(software.id),
        struck_items: this.struckText(software.id, stage),
        size_class: stage === "why" ? "none" : asSize(item.sizeClass),
        budget: `${budget.turns} agent turns and ${budget.minutes} minutes`,
        exists_outcome: this.recordText(software.id, ["E"]),
        say_back_reason:
          state.returnTo === "say-back" || (state.sayBackRounds ?? 0) > 0
            ? "items were struck at the last say-back and their stages were redone"
            : "a new software",
        change: "none",
        claimed_areas: this.options.taste.briefText(software.id),
        working_copy: "none",
        proposed_change: "none",
        decision: "none",
        exists_look: "none",
        scope: scopeWords(state.scope),
        effort: `${software.effort}: ${EFFORT_WORDS[software.effort]}`,
        ...extra,
      },
      software.id,
    );
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
        item: this.active(software.id).id,
        purpose,
        brief: this.briefFor(software, stage, purpose, extra),
        limits: { turns: budget.turns, minutes: budget.minutes },
        context: {
          stage,
          purpose,
          name: software.name,
          idea: software.idea,
          ...(this.active(software.id).parentId !== null && {
            piece: this.active(software.id).title,
          }),
          ...context,
        },
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
    // Triage and readings are intake's jobs (src/intake).
    if (job.kind === "triage" || job.kind === "reading") return;
    if (!FINISHED.has(job.status) || this.isHandled(job.id)) return;
    if (!this.isCurrent(job)) {
      this.markHandled(job.id);
      return;
    }
    transaction(this.db, () => {
      this.markHandled(job.id);
      this.addUsedMinutes(job);
      const software = getSoftware(this.db, job.softwareId)!;
      if (job.kind === "size") {
        this.sizeJobEnded(software, job);
        return;
      }
      if (job.kind === "recover") {
        this.recoverJobEnded(software, job);
        return;
      }
      if (job.payload.whole === true) {
        this.wholeJobEnded(software, job);
        return;
      }
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
    if (stage === "check" && job.status !== "done" && job.status !== "stopped") {
      // A check that stopped by itself is something premise raises as intake (spec 5.1).
      this.options.intake.raise(
        software.id,
        `The check of ${this.label(this.active(software.id))} stopped without a verdict: ${job.result ?? "no reason was given"}.`,
      );
    }
    const outcome = this.options.later.finished(job);
    if (outcome.kind === "next") {
      // The stage is done when none of its jobs are left.
      const open = this.queue
        .list()
        .some(
          (j) =>
            j.softwareId === software.id &&
            j.payload.run === job.payload.run &&
            !FINISHED.has(j.status),
        );
      if (open) return;
    }
    this.applyLater(software, stage, outcome);
  }

  /** Move the line on as a later stage says. */
  private applyLater(software: Software, stage: LaterStageId, outcome: LaterOutcome): void {
    if (outcome.kind === "wait") return;
    if (outcome.kind === "back-to-build") {
      this.enterLater(software, "build", this.currentMilestone(software.id), "check not passed");
      return;
    }
    this.afterLater(software.id, stage);
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
    const change = stage === "what" ? this.changeOf(this.active(software.id)) : null;
    if (change && this.changeNotes(change).draft) {
      this.takeInChangeWhat(software, change);
      return;
    }
    if (this.openAskOfJob(job.id)) return;
    // Finished without submitting a draft: asked once more with the exact shape, then the operator.
    if (this.askAgain(software, job, "draft_submit")) return;
    this.stageProblem(software, job, "finished without a draft, even when asked a second time");
  }

  /**
   * A job that ended done without its answer is queued once more, with the exact shape spelled out
   * (decision 0275). False when this was already the second asking.
   */
  private askAgain(software: Software, job: Job, shape: keyof typeof ANSWER_SHAPES): boolean {
    if (askedAgain(job)) return false;
    // A job that asked a person, or the gate, is waiting on them, not missing its answer.
    const waits = listAsks(this.db, { softwareId: software.id, status: "open" }).some(
      (a) => a.waitingJob === job.id || a.extra.meta?.job === job.id,
    );
    if (waits) return false;
    this.queue.enqueue(againJob(job, shape));
    this.premiseSays(
      software.id,
      `The ${jobWords(job)} finished without its answer; premise asks it once more, saying exactly what the answer must look like.`,
    );
    return true;
  }

  /** The drafter's What for a change goes into the record; suggestions are only offered (0274). */
  private takeInChangeWhat(software: Software, change: WorkItem): void {
    const notes = this.changeNotes(change);
    const draft = notes.draft ?? [];
    const taken = draft.filter((d) => !d.suggestion && d.kind !== "size");
    const { ids } = taken.length
      ? this.landList(
          software.id,
          taken,
          { kind: "items", items: [] },
          `Taken from the words of ${change.ref ?? "an intake item"}.`,
        )
      : { ids: new Map<string, string>() };
    const items: string[] = [];
    const assumed: string[] = [];
    for (const d of taken) {
      const id = ids.get(d.key);
      if (!id) continue;
      (d.from === "assumed" ? assumed : items).push(id);
    }
    this.setChangeNotes(change, {
      draft: undefined,
      items: [...notes.items, ...items],
      assumed: [...notes.assumed, ...assumed],
      suggestions: [
        ...notes.suggestions,
        ...draft
          .filter((d) => d.suggestion)
          .map((d, i) => ({ key: `s${notes.suggestions.length + i + 1}`, text: d.text })),
      ],
    });
    this.advance(software.id, "what", "what taken in");
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
    const stage = job.kind === "recover" ? "Recovering the record" : stageName(job.stage ?? "");
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
          `${i + 1}. ${t.title}${t.items.length ? ` (serves ${t.items.join(", ")})` : ""}${t.milestone ? ` [milestone ${t.milestone}]` : ""}${t.check ? `. Check: ${t.check}` : ""}`,
      ),
      "",
      ...(plan.kind ? [`Kind of software: ${plan.kind}`, ""] : []),
      ...(plan.how_to_run ? ["## How to build, start and check it", "", plan.how_to_run, ""] : []),
    ];
    writeFileSync(join(folder, "plan.md"), lines.join("\n"));
  }

  private planJobDone(software: Software, job: Job, purpose: string): void {
    const piece = this.active(software.id);
    const change = this.changeOf(piece);
    const changePlan = change ? this.changePlanOf(software.id, piece) : null;
    const plan = change ? null : this.readPlan(software.id);
    if (!plan && !changePlan) {
      if (purpose !== "review" && this.askAgain(software, job, "plan_submit")) return;
      this.stageProblem(software, job, "finished without a plan, even when asked a second time");
      return;
    }
    const state = this.state(software.id);
    const review = state.review ?? { round: 0, objections: [] };
    if (purpose === "review" && !review.submitted) {
      // The reviewer ended without a review: asked once more, then premise goes on unreviewed.
      if (this.askAgain(software, job, "review_submit")) return;
      this.premiseSays(
        software.id,
        "The reviewer gave no review, even when asked a second time, so the costly choices go on without a second look. Send the software back to Plan to try again.",
      );
    }
    const decisions = change
      ? changePlan!.decisions.map((d) => ({ text: this.decisionLine(d), foundation: d.foundation }))
      : plan!.decisions;
    const foundations = decisions.filter((d) => d.foundation);
    if (
      (purpose === "draft" || purpose === "change") &&
      foundations.length > 0 &&
      review.round === 0
    ) {
      this.setState(software.id, { review: { round: 1, objections: [] } });
      this.premiseSays(
        software.id,
        change
          ? `The plan for your change ${change.ref ?? ""} changes ${foundations.length === 1 ? "a decision" : `${foundations.length} decisions`} that would be costly to undo. A second agent is reviewing ${foundations.length === 1 ? "it" : "them"}.`
          : `The planner made ${decisions.length} technical choices. A second agent is reviewing the ${foundations.length === 1 ? "one" : foundations.length} that would be costly to change later.`,
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
    if (change) {
      // No milestones question for a change: it goes on to Build, asked or told once there (0273).
      this.advance(software.id, "plan", "change planned");
      return;
    }
    this.askMilestones(software, plan!);
  }

  private askMilestones(software: Software, plan: StoredPlan): void {
    const defaults = software.milestoneWaits;
    const firstWaits =
      this.config.line.wait_after_asked &&
      waitAfterFirst(plan.tasks, plan.milestones.length, this.state(software.id).scope);
    const items = plan.milestones.map((m, i) => ({
      ...m,
      wait: m.wait ?? (defaults || (i === 0 && firstWaits)),
    }));
    createAsk(this.db, {
      softwareId: software.id,
      role: OPERATOR,
      kind: "draft",
      stage: "plan",
      title: "Milestones: is this the right order?",
      instruction:
        (firstWaits
          ? "The first milestone is what you asked for; the later ones are premise's own additions, so premise stops after the first for you to try it before more is built (untick to go straight on). "
          : "") +
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
      role: roleWords(ask.role),
      // The scope check is kept as a draft ask (the asks table's kinds are fixed) and shown as its own kind.
      kind: ask.extra.meta?.purpose === "scope" ? "scope" : ask.kind,
      stage: ask.stage && isStageId(ask.stage) ? ask.stage : null,
      title: ask.title,
      instruction: ask.instruction,
      items: ask.items.map((item) =>
        item.follows
          ? {
              ...item,
              follows: {
                label: item.follows.label,
                text:
                  this.options.briefs.lessonText(item.follows.label) ??
                  "a lesson that has since been removed",
              },
            }
          : item,
      ),
      ...(ask.extra.bestAttempt !== undefined && { bestAttempt: ask.extra.bestAttempt }),
      ...(ask.extra.meta?.notice === true && { notice: true }),
      ...(Array.isArray(ask.extra.meta?.suggestions) && {
        suggestions: (ask.extra.meta.suggestions as ChangeNotes["suggestions"]).map((x) => ({
          key: x.key,
          text: x.text,
          ...(x.added && { added: x.added }),
        })),
      }),
      ...(ask.extra.choices !== undefined && { choices: ask.extra.choices }),
      ...(ask.extra.approval !== undefined && { approval: ask.extra.approval }),
      ...(ask.extra.meta?.purpose === "taste-proposal" && {
        claim: {
          id: Number(ask.extra.meta.claim),
          area: String(ask.extra.meta.area ?? ""),
        },
      }),
      ...(ask.extra.meta?.secret !== undefined && {
        secret: ask.extra.meta.secret as { key: string; file: string },
      }),
      ...(typeof ask.extra.meta?.milestone === "string" && {
        milestone: {
          id: ask.extra.meta.milestone,
          title:
            typeof ask.extra.meta.milestoneTitle === "string"
              ? ask.extra.meta.milestoneTitle
              : ask.extra.meta.milestone,
        },
      }),
      ...(ask.extra.meta?.purpose === "scope" &&
        ask.extra.meta.scope !== undefined && {
          scope: ask.extra.meta.scope as NonNullable<AskView["scope"]>,
        }),
      ...(ask.status === "open" && ask.kind === "draft" && ask.stage ? this.struckBefore(ask) : {}),
      status: ask.status,
      ...(ask.answerSummary !== null && { answerSummary: ask.answerSummary }),
      asked: ask.asked,
      ...(ask.answered !== null && { answered: ask.answered }),
    };
  }

  /**
   * The say-back is where a person checks premise understood: no sentence twice, and a "must" is
   * still a "must" here when the What list said so.
   */
  private settleSayBack(id: string, items: DraftItem[]): DraftItem[] {
    const record = this.recordLines(id);
    const plain = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const seen = new Set<string>();
    const out: DraftItem[] = [];
    for (const item of items) {
      const key = plain(item.text);
      if (seen.has(key)) continue;
      seen.add(key);
      if (item.kind === "W") {
        const known =
          item.refs?.map((r) => record.find((i) => i.id === r)).find((i) => i?.kind === "W") ??
          record.find((i) => i.kind === "W" && plain(i.text) === key);
        const priority = known?.marks.priority;
        if (priority) {
          out.push({ ...item, priority });
          continue;
        }
      }
      out.push(item);
    }
    return out;
  }

  /** What the person struck before this list was redone, so they can see they were heard. */
  private struckBefore(ask: Ask): { struckBefore?: { text: string; reason: string }[] } {
    if (!ask.stage || !(ask.stage in STAGE_KINDS)) return {};
    const kinds = STAGE_KINDS[ask.stage as keyof typeof STAGE_KINDS].allowed;
    const struck = this.recordLines(ask.softwareId, { includeStruck: true })
      .filter((i) => i.struck && kinds.includes(i.kind))
      .map((i) => ({
        text: i.text,
        reason: i.struck!.reason.replace(/^Struck at the say back:\s*/i, ""),
      }));
    return struck.length > 0 ? { struckBefore: struck } : {};
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
    const secret = ask.extra.meta?.secret as { key: string; file: string } | undefined;
    if (
      ask.kind === "needed" &&
      answer.kind === "needed" &&
      answer.decision === "done" &&
      secret &&
      !secretWritten(secret.file, secret.key)
    ) {
      // premise checks what it can: the key is in the file (decision 0196). It never reads the value out.
      throw new ServiceError(
        "INVALID",
        `premise looked, and ${secret.key} is not in ${secret.file} yet. Write it there as one line, ${secret.key}=the value, then mark this done again. Nothing else was changed.`,
      );
    }

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
    const effects =
      this.options.intake.answered(ask, answer) ?? this.recordEffects(software, ask, answer);
    this.afterCommit = [];
    try {
      transaction(this.db, () => {
        if (!closeAsk(this.db, id, "answered", answer, summary)) {
          throw new ServiceError(
            "ASK_CLOSED",
            "This was answered a moment ago. Nothing was changed.",
          );
        }
        effects();
      });
    } catch (error) {
      this.afterCommit = [];
      throw error;
    }
    const committed = this.afterCommit;
    this.afterCommit = [];
    for (const work of committed) work();
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
  ): { keptSize?: SizeClass; struckIds: string[]; ids: Map<string, string> } {
    const answers = new Map((answer.kind === "items" ? answer.items : []).map((a) => [a.key, a]));
    const corrected = applyAnswers(items, answer.kind === "items" ? answer.items : []);
    const kept = new Map(corrected.keep.map((k) => [k.item.key, k]));
    const struck = new Map(corrected.struck.map((k) => [k.item.key, k.reason]));
    let keptSize: SizeClass | undefined;
    const ops: Operation[] = [];
    const opKeys: string[] = [];
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
      opKeys.push(item.key);
    }
    const assigned = this.land(softwareId, ops, reason);
    const ids = new Map<string, string>();
    opKeys.forEach((key, i) => {
      if (assigned[i]) ids.set(key, assigned[i]!);
    });
    const struckIds = struckAt.map((s) => assigned[s.index]).filter((x): x is string => Boolean(x));
    if (struckAt.length > 0) {
      this.land(
        softwareId,
        struckAt.map((s, i) => ({ op: "strike" as const, id: struckIds[i]!, reason: s.reason })),
        "The operator struck these from the draft.",
      );
    }
    return { ...(keptSize && { keptSize }), struckIds, ids };
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
          const item = this.active(id);
          if (keptSize && keptSize !== item.sizeClass) {
            this.recordSizing(
              item,
              { sizeClass: keptSize },
              {
                size: {
                  by: "operator",
                  reason: `You kept "Size: ${keptSize}" on the ${stageName(stage)} list.`,
                },
              },
            );
            this.premiseSays(
              id,
              `Size set to ${keptSize}: each stage before building gets a ${keptSize} budget.`,
            );
          }
          if (stage === "what" && item.parentId === null) {
            this.askScope(getSoftware(this.db, id)!);
            return;
          }
          this.advance(id, stage, `${stage} confirmed`);
        };
      }
      case "exists": {
        const text = answer.kind === "text" ? answer.text.trim() : "";
        const takingOn = this.isRecovery(this.active(id));
        const notBuild = takingOn ? /^stop/i.test(text) : /^do not build/i.test(text);
        // Findings the person struck are left out of the record; their reasons are kept in the
        // outcome line, with the reason for choosing against the recommendation (decision 0270).
        const struckKeys = new Map(
          (answer.kind === "text" ? (answer.struck ?? []) : []).map((s) => [s.key, s.reason]),
        );
        const findings = items
          .filter((item) => !struckKeys.has(item.key))
          .map((item) => addOperation({ item, text: item.text, edited: false })!)
          .filter(Boolean);
        const clean = (value: string) =>
          value
            .replace(/[()\r\n]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        const extras: string[] = [];
        if (answer.kind === "text" && answer.reason?.trim()) {
          extras.push(`Reason: ${clean(answer.reason).slice(0, 300)}`);
        }
        if (struckKeys.size > 0) {
          const named = [...struckKeys.entries()].map(([key, reason]) => {
            const found = items.find((i) => i.key === key);
            const label = clean(found?.short ?? found?.text ?? key).slice(0, 60);
            return reason?.trim() ? `${label} - ${clean(reason).slice(0, 120)}` : label;
          });
          extras.push(`Struck ${struckKeys.size} of ${items.length} findings: ${named.join("; ")}`);
        }
        const extraText = extras.length > 0 ? `. ${extras.join(". ")}` : "";
        const alternative =
          typeof ask.extra.meta?.alternative === "string" ? ask.extra.meta.alternative : "";
        this.land(
          id,
          [
            ...findings,
            {
              op: "add",
              kind: "E",
              text: `Outcome: ${text.replace(/[()]/g, "")}${notBuild && alternative ? `. Instead: ${alternative.replace(/[()]/g, "")}` : ""}${extraText}`,
              from: OPERATOR,
            },
          ],
          "The operator decided what to do about what already exists.",
        );
        return () => {
          const item = this.active(id);
          if (notBuild && item.parentId !== null) {
            this.premiseSays(
              id,
              `${capital(this.label(item))} will not be built, as you decided. The work goes on with what comes next.`,
            );
            this.withdrawParts(item);
            this.finishItem(id, item, "dropped");
            return;
          }
          if (notBuild && takingOn) {
            this.setLifecycle(id, "ended", "operator decided it is no longer needed");
            setExisting(this.db, id, { status: "stopped" });
            this.premiseSays(
              id,
              `premise stops working on ${software.name}, as you decided. Nothing in your repository was changed. If you change your mind, send it back to any stage on the Line tab.`,
            );
            return;
          }
          if (takingOn && /^use what exists/i.test(text)) {
            this.premiseSays(
              id,
              "Noted. Say in chat which part to replace with what; it comes in as a change and goes through the line once you have gone through the recovered record.",
            );
          }
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
          this.advance(id, "exists", "outcome decided");
        };
      }
      case "scope":
        return this.scopeEffects(software, ask, answer);
      case "say-back":
        return this.sayBackEffects(software, items, answer);
      case "recovered-say-back":
        return this.recoveredSayBackEffects(software, ask, answer);
      case "milestones":
        return this.milestoneEffects(software, items, answer);
      case "change-confirm":
        return this.changeConfirmEffects(software, ask, items, answer);
      case "change-notice":
        return this.changeNoticeEffects(software, ask, items, answer);
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
      case "repository-retry": {
        const text = (answer.kind === "text" ? answer.text : "").trim();
        if (text.toLowerCase() === KEEP_HERE.toLowerCase()) {
          return () =>
            this.premiseSays(
              id,
              `${software.name} stays on this machine; nothing was created on GitHub. Everything else goes on.`,
            );
        }
        const use = /^use the name\s+(.+)$/i.exec(text);
        const name =
          text.toLowerCase() === TRY_AGAIN.toLowerCase()
            ? (this.state(id).repositoryName ?? repositoryName(software.name))
            : validRepositoryName(use ? use[1]! : text);
        if (!name) {
          throw new ServiceError(
            "INVALID",
            `GitHub does not take "${text.slice(0, 60)}" as a repository name: use letters, digits, "-", "_" or ".", with no spaces. Write another name, or pick one of the choices. Nothing was changed.`,
          );
        }
        return () =>
          this.repositoryStep(software, {
            name,
            whyNow: `You asked for the repository to be made as ${name}.`,
          });
      }
      case "start-command": {
        const said = answerWords(ask, answer);
        return () => {
          const taken = this.options.intake.takeIn(id, `How to start it: ${said}`);
          this.premiseSays(id, taken.reply, `intake:I-${taken.number}`);
        };
      }
      case "milestone-reached": {
        const text = answer.kind === "text" ? answer.text : "";
        return () => {
          if (/^go back/i.test(text)) {
            this.setLifecycle(id, "active", "operator went back to Why");
            this.clearWork(id, "Withdrawn: sent back to Why.");
            const root = rootItem(this.db, id);
            this.withdrawParts(root);
            this.setActive(id, root);
            this.setState(id, { returnTo: undefined, boost: undefined, review: undefined });
            this.options.later.reset?.(id);
            this.premiseSays(
              id,
              "Back to Why: the stages after it will be done again with what you say now.",
            );
            this.enterStage(getSoftware(this.db, id)!, "why", "operator went back to Why");
            return;
          }
          this.setLifecycle(id, "active", "operator said go on");
          const next = ask.extra.meta?.next;
          this.premiseSays(
            id,
            typeof next === "string"
              ? `You said go on. Next: premise builds the next milestone, "${next}".`
              : "You said go on. That was the last milestone, so nothing more is built: premise finishes the line, then takes in any problem or wish you send here.",
          );
          const item = this.active(id);
          if (item.kind === "milestone" && item.ref === ask.extra.meta?.milestone) {
            this.finishItem(id, item, "done");
          }
        };
      }
      case "taste-proposal": {
        const { decision, after } = this.options.taste.decide(ask, answer);
        return () => {
          after();
          const area = decision.claim.area;
          this.premiseSays(
            id,
            decision.corrected
              ? `Noted for ${area}: ${decision.words.replace(/[.\s]+$/, "")}. It is in the record as taste, and premise builds it that way.`
              : `Kept for ${area}. It is in the record as taste, and premise builds it that way.`,
          );
          const later = this.options.later.answered?.(ask, answer) ?? null;
          const current = getSoftware(this.db, id)!;
          if (later && (LATER as readonly string[]).includes(current.currentStage)) {
            this.applyLater(current, current.currentStage as LaterStageId, later);
          }
        };
      }
      case "agent":
      default: {
        const said = answerWords(ask, answer);
        if (
          this.takenOn(id) &&
          ask.waitingJob !== null &&
          this.queue.get(ask.waitingJob)?.kind === "recover"
        ) {
          // A conflict or gap found while recovering: the answer is a correction, taken in as intake.
          return () => {
            const taken = this.options.intake.takeIn(
              id,
              `Answer to "${ask.title}" (asked while recovering the record): ${said}`,
            );
            this.premiseSays(id, taken.reply, `intake:I-${taken.number}`);
          };
        }
        return () => {
          const later = this.options.later.answered?.(ask, answer) ?? null;
          if (purpose === "agent" || later === null) {
            const answers = [...(this.state(id).answers ?? []), `${ask.title} → ${said}`].slice(
              -10,
            );
            this.setState(id, { answers });
            this.premiseSays(id, "Noted. The agent's next step gets your answer.");
          }
          if (later) {
            const current = getSoftware(this.db, id)!;
            if ((LATER as readonly string[]).includes(current.currentStage)) {
              this.applyLater(current, current.currentStage as LaterStageId, later);
            }
          }
        };
      }
    }
  }

  /** Minutes one agent session takes, as premise measured it; the configured guess until then. */
  private minutesPerSession(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n, AVG((julianday(ended) - julianday(started)) * 1440) AS minutes
         FROM agent_sessions WHERE ended IS NOT NULL`,
      )
      .get() as { n: number; minutes: number | null };
    return row.n >= 5 && row.minutes && row.minutes > 0
      ? Math.max(0.5, Math.round(row.minutes * 10) / 10)
      : this.config.line.estimate_minutes_per_session;
  }

  /**
   * The scope check (decision 0191): after What, one ask with three cuts and a rough cost each. It
   * is skipped, with everything in the first version, when premise has nothing to add.
   */
  private askScope(software: Software): void {
    const id = software.id;
    const tiers = scopeTiers(this.recordLines(id));
    const additions = tiers.filter((t) => t.tier !== "asked");
    if (!this.config.line.scope_check || additions.length === 0) {
      this.settleScope(id, {
        first: tiers.map((t) => t.item.id),
        later: [],
        out: [],
      });
      this.advance(id, "what", "what confirmed");
      return;
    }
    const measured = this.minutesPerSession();
    const cuts = scopeCuts(tiers, {
      minutesPerSession: measured,
      itemsPerBuild: this.config.line.estimate_items_per_build,
    });
    const preselected = cutForEffort(software.effort);
    createAsk(this.db, {
      softwareId: id,
      role: OPERATOR,
      kind: "draft",
      stage: "what",
      title: "How much to build?",
      instruction: `premise sorted what it must do into what you asked for, what premise recommends adding, and what it could also add. Pick how much to build; ${software.effort === this.config.softwares.default_effort ? `the choice already picked follows premise's usual effort (${software.effort})` : `the choice already picked follows the effort you set for this software (${software.effort})`}. You can move any item. The first version is what you asked for; what premise adds comes in a later milestone, after you have tried the first. What you leave out stays in the record and is not built; to have it built later, ask for it in the conversation.`,
      items: tiers.map((t) => ({
        key: t.item.id,
        // A suggestion is shown once, by its mark ("premise suggests"), not again in its words.
        text: `${t.item.marks.priority ?? "should"}: ${t.item.marks.from === "assumed" ? t.item.text.replace(/^suggestion\s*:\s*/i, "") : t.item.text}${t.note ? ` (${t.note})` : ""}`,
        mark: t.item.marks.from === "assumed" ? "suggestion" : "from-role",
        ...(t.item.marks.from !== "assumed" && { from: t.item.marks.from }),
        tier: t.tier,
      })),
      extra: {
        meta: {
          purpose: "scope",
          tiers: tiers.map((t) => ({ id: t.item.id, tier: t.tier })),
          scope: {
            cuts,
            preselected,
            estimateNote: `A rough estimate, not a promise: agent sessions from here to running software, at about ${measured} minutes each${measured === this.config.line.estimate_minutes_per_session ? " (premise's starting guess until it has measured its own)" : " (as premise measured its own sessions)"}.`,
          },
        },
      },
    });
    this.premiseSays(
      id,
      `What it must do is confirmed. One question before planning: how much to build. premise suggests ${additions.length === 1 ? "one addition" : `${additions.length} additions`} to what you asked for; pick a choice under Waiting on you.`,
    );
  }

  /** Keep what the operator chose, and mark in the record what is left out (and what is not). */
  private settleScope(id: string, choice: ScopeChoice): void {
    const live = new Map(this.recordLines(id).map((i) => [i.id, i]));
    const ops: Operation[] = [];
    for (const itemId of choice.out) {
      if (live.get(itemId) && !live.get(itemId)!.marks.leftOut) {
        ops.push({ op: "mark", id: itemId, leftOut: true });
      }
    }
    for (const itemId of [...choice.first, ...choice.later]) {
      if (live.get(itemId)?.marks.leftOut) ops.push({ op: "mark", id: itemId, leftOut: false });
    }
    if (ops.length > 0) this.land(id, ops, "The operator chose how much to build.");
    this.setState(id, { scope: choice });
  }

  private scopeEffects(software: Software, ask: Ask, answer: AskAnswer): () => void {
    const id = software.id;
    const tiers = scopeTiers(this.recordLines(id));
    const asked = new Set(ask.items.map((i) => i.key));
    const places = new Map(
      (answer.kind === "scope" ? answer.items : []).map((i) => [i.key, i.place] as const),
    );
    const shown = tiers.filter((t) => asked.has(t.item.id));
    // An item that came into the record after the ask was made goes where its tier would.
    const cut = cutForEffort(software.effort);
    for (const t of tiers) if (!places.has(t.item.id)) places.set(t.item.id, placeFor(t.tier, cut));
    const choice = choiceFrom(tiers, places);
    this.settleScope(id, choice);
    return () => {
      const n = (k: keyof ScopeChoice) => choice[k].length;
      this.premiseSays(
        id,
        `Scope chosen: ${n("first")} in the first version${n("later") ? `, ${n("later")} in a later milestone` : ""}${n("out") ? `, ${n("out")} left out (kept in the record, not built)` : ""}.${shown.length < tiers.length ? " An item added meanwhile went where its tier puts it." : ""}`,
      );
      this.advance(id, "what", "scope chosen");
    };
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
        const next = nextStage(this.active(id), "say-back");
        this.premiseSays(
          id,
          `Nothing struck: premise has understood what matters.${next === "plan" ? " On to the plan." : ""}`,
        );
        this.advance(id, "say-back", "say-back passed");
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

  /** Strike the record items behind struck lines; returns what was struck, for the session. */
  private strikeChangeLines(
    softwareId: string,
    items: readonly DraftItem[],
    answer: AskAnswer,
    ref: string,
  ): { text: string; reason: string }[] {
    const corrected = applyAnswers(items, answer.kind === "items" ? answer.items : []);
    const ops: Operation[] = [];
    const struck: { text: string; reason: string }[] = [];
    for (const { item, reason } of corrected.struck) {
      if (!item.key.startsWith("r-")) continue;
      for (const id of item.refs ?? []) ops.push({ op: "strike", id, reason });
      struck.push({ text: item.text, reason });
    }
    for (const entry of corrected.keep) {
      if (!entry.edited || !entry.item.key.startsWith("r-")) continue;
      const id = entry.item.refs?.[0];
      const op = addOperation(entry);
      if (id && op) {
        ops.push({
          op: "replace",
          id,
          text: op.text,
          from: OPERATOR,
          reason: `The operator corrected it for ${ref}.`,
          ...(op.priority && { priority: op.priority }),
        });
      }
    }
    if (ops.length) this.land(softwareId, ops, `The operator corrected the change ${ref}.`);
    return struck;
  }

  /** The one question about a change was answered: keep, strike or edit, then build (0274). */
  private changeConfirmEffects(
    software: Software,
    ask: Ask,
    items: readonly DraftItem[],
    answer: AskAnswer,
  ): () => void {
    const id = software.id;
    const change = getWorkItem(this.db, Number(ask.extra.meta?.change));
    const piece = getWorkItem(this.db, Number(ask.extra.meta?.piece)) ?? change;
    if (!change || !piece) return () => {};
    const ref = change.ref ?? "the change";
    this.strikeChangeLines(id, items, answer, ref);
    const corrected = applyAnswers(items, answer.kind === "items" ? answer.items : []);
    const plan = this.changePlanOf(id, piece);
    const asked = (plan?.decisions ?? []).filter((d) =>
      items.some((i) => /^d\d+$/.test(i.key) && i.text === this.decisionLine(d)),
    );
    const keptNow = asked.flatMap((d) => {
      const entry = corrected.keep.find(
        (k) => /^d\d+$/.test(k.item.key) && k.item.text === this.decisionLine(d),
      );
      if (!entry) return [];
      return [entry.edited ? this.editedDecision(d, entry.text) : d];
    });
    this.landChangeDecisions(id, change, piece, plan, keptNow);
    const dropped = asked.length - keptNow.length;
    return () => {
      this.setChangeNotes(change, { decided: "asked" });
      this.premiseSays(
        id,
        `Thank you. Building your change ${ref} now${dropped > 0 ? `, without the ${dropped === 1 ? "decision" : "decisions"} you struck: the builder decides ${dropped === 1 ? "that" : "those"} within what you kept` : ""}.`,
      );
      const current = this.active(id);
      if (current.id === piece.id) {
        this.enterStage(getSoftware(this.db, id)!, "build", "change confirmed");
      }
    };
  }

  /**
   * A line of a change's notice was struck after premise went on building: the record follows, and
   * the correction comes in as a follow-up change; learning reads the strike as now (0274).
   */
  private changeNoticeEffects(
    software: Software,
    ask: Ask,
    items: readonly DraftItem[],
    answer: AskAnswer,
  ): () => void {
    const id = software.id;
    const change = getWorkItem(this.db, Number(ask.extra.meta?.change));
    const ref = change?.ref ?? "the change";
    const struck = this.strikeChangeLines(id, items, answer, ref);
    return () => {
      if (struck.length === 0) {
        this.premiseSays(id, `Noted: ${ref} stays as premise took it.`);
        return;
      }
      const text = `Correction to ${ref}: ${struck.map((x) => `"${x.text}" is wrong${x.reason && x.reason !== "Struck by the operator." ? `: ${x.reason}` : ""}`).join("; ")}.`;
      const taken = this.options.intake.takeIn(id, text);
      this.premiseSays(
        id,
        `Struck from the record. ${taken.reply} It follows ${ref} as its own change.`,
        `intake:I-${taken.number}`,
      );
    };
  }

  /** Add one of premise's suggestions for a change: it comes in as a change of its own (0274). */
  async addSuggestion(askId: number, key: string): Promise<AskView> {
    const ask = getAsk(this.db, askId);
    const list = (ask?.extra.meta?.suggestions ?? []) as ChangeNotes["suggestions"];
    const suggestion = list.find((x) => x.key === key);
    if (!ask || !suggestion) {
      throw new ServiceError(
        "NOT_FOUND",
        "That suggestion is not offered any more. Reload the page.",
      );
    }
    if (suggestion.added) {
      throw new ServiceError(
        "INVALID",
        `That suggestion was added already, as ${suggestion.added}.`,
      );
    }
    const change = getWorkItem(this.db, Number(ask.extra.meta?.change));
    const ref = change?.ref ?? "a change";
    transaction(this.db, () => {
      const taken = this.options.intake.takeIn(
        ask.softwareId,
        `Add premise's suggestion for ${ref}: ${suggestion.text}`,
      );
      const added = `I-${taken.number}`;
      const next = list.map((x) => (x.key === key ? { ...x, added } : x));
      this.db
        .prepare("UPDATE asks SET extra = ? WHERE id = ?")
        .run(
          JSON.stringify({ ...ask.extra, meta: { ...ask.extra.meta, suggestions: next } }),
          ask.id,
        );
      if (change) {
        this.setChangeNotes(change, {
          suggestions: this.changeNotes(change).suggestions.map((x) =>
            x.text === suggestion.text ? { ...x, added } : x,
          ),
        });
      }
      this.premiseSays(ask.softwareId, `Added at your word. ${taken.reply}`, `intake:${added}`);
    });
    this.queue.tick();
    return this.askView(getAsk(this.db, askId)!, this.softwareNames());
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
    const proposals = this.writer.landAllProposed(id, this.state(id).proposed ?? []);
    const dropped = droppedLine(proposals.dropped, "an agent");
    if (dropped) {
      recordEvent(this.db, {
        softwareId: id,
        module: "line",
        kind: "record-changes-dropped",
        detail: { dropped: proposals.dropped },
      });
      this.premiseSays(id, dropped);
    }
    // One path for each decision (decision 0276): a plan decision whose words an item already in
    // the record carries (an agent proposed it this round, or it was there before) is not added again.
    const carried = new Set(
      this.recordLines(id)
        .filter((i) => i.kind === "D")
        .map((i) => sameWords(i.text)),
    );
    const decisions = plan.decisions
      .map((item) => addOperation({ item, text: item.text, edited: false }))
      .filter((op): op is NonNullable<typeof op> => op !== null)
      .filter((op) => {
        const words = sameWords(op.text);
        if (carried.has(words)) return false;
        carried.add(words);
        return true;
      });
    const milestones = corrected.keep
      .map((entry) => addOperation({ ...entry, item: { ...entry.item, kind: "M" } }))
      .filter((op): op is NonNullable<typeof op> => op !== null);
    const assigned = this.land(
      id,
      [...decisions, ...milestones],
      "The operator confirmed the plan's milestones.",
    );
    const milestoneIds = assigned.slice(decisions.length).filter((x): x is string => Boolean(x));
    return () => {
      this.setState(id, { proposed: undefined });
      const all = this.milestones(id);
      const waits = all.some((m) => m.wait);
      this.db
        .prepare("UPDATE softwares SET milestone_waits = ? WHERE id = ?")
        .run(waits ? 1 : 0, id);
      this.repositoryStep(getSoftware(this.db, id)!);
      // The confirmed milestones become the piece's parts, each going through the line in turn.
      const piece = this.active(id);
      const made = milestoneIds
        .map((mid) => all.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      if (made.length === 0) {
        this.advance(id, "plan", "plan confirmed");
        return;
      }
      this.withdrawParts(piece);
      const parts = this.makeParts(
        piece,
        made.map((m) => ({ title: m.text, words: m.text, ref: m.id })),
        "plan",
      );
      this.setNotes(piece, { children: "plan", handedOffAt: "plan", resumeAfter: "report" });
      setWorkItem(this.db, piece.id, { state: "waiting" });
      this.beginItem(id, parts[0]!, "plan confirmed");
    };
  }

  /** Wait for work deferred until after a transaction committed. For tests and shutdown. */
  async idle(): Promise<void> {
    while (this.deferred.size > 0) await Promise.all([...this.deferred]);
  }

  // ---- The repository outside this machine, through the gate ------------------------------------

  private cli: GitHubCli | null = null;

  /** The GitHub CLI the server runs, logged in as the operator (decision 0077). */
  private get github(): GitHubCli {
    this.cli ??=
      this.options.github ??
      new GitHubCli({
        command: this.config.github.command,
        timeoutMs: this.config.github.timeout_minutes * 60_000,
      });
    return this.cli;
  }

  /** Run once the answer that asked for it is committed, kept track of for tests and shutdown. */
  private afterAnswer(work: () => Promise<void>): void {
    this.afterCommit.push(() => {
      const done = new Promise<void>((resolve) => setImmediate(resolve))
        .then(work)
        .finally(() => this.deferred.delete(done));
      this.deferred.add(done);
    });
  }

  /**
   * The software's repository besides this machine, at the end of Plan. On GitHub it is a floor
   * action: the gate asks first, once per software (decision 0260). `chosen` is a name the operator
   * picked after the first one was taken or did not work.
   */
  private repositoryStep(software: Software, chosen?: { name: string; whyNow: string }): void {
    const remote = this.config.line.remote;
    if (remote === "none") return;
    if (remote === "local") {
      this.afterAnswer(async () => {
        if (!getSoftware(this.db, software.id)) return;
        const result = await this.createRemoteRepository({ softwareId: software.id });
        this.premiseSays(software.id, result.outcome);
      });
      return;
    }
    const name = chosen?.name ?? repositoryName(software.name);
    this.setState(software.id, { repositoryName: name });
    if (!this.realAgents) {
      this.askToCreateRepository(software, name, null, chosen?.whyNow);
      return;
    }
    // The card says whether GitHub can be reached, which takes a moment to find out.
    this.afterAnswer(async () => {
      const login = await this.github.login();
      const current = getSoftware(this.db, software.id);
      if (!current) return;
      this.askToCreateRepository(current, name, login, chosen?.whyNow);
      this.queue.tick();
    });
  }

  private askToCreateRepository(
    software: Software,
    name: string,
    login: GitHubLogin | null,
    whyNow?: string,
  ): void {
    const visibility = this.config.runner.default_visibility;
    const kind: FloorKind = visibility === "public" ? "make-public" : "publish";
    const where = login?.ready ? `${login.login}/${name}` : name;
    const seen =
      visibility === "public"
        ? "Everyone can see a public repository."
        : "Only you, and people you invite, can see it.";
    const reality = !login
      ? {
          real: false,
          text: `Nothing is created on GitHub whichever you choose: premise is running with scripted agents (a demo), and a demo does nothing outside this machine. Your answer is recorded, and ${software.name} stays on this machine.`,
        }
      : login.ready
        ? {
            real: true,
            text: `Approving creates the ${visibility} repository ${where} on your GitHub account, with the GitHub CLI you are logged in with, and pushes ${software.name}'s code and record to it. After that, premise pushes again each time a change lands. ${seen} Nothing is ever forced, and nothing already on your account is touched.`,
          }
        : {
            real: true,
            text: `Approving creates the ${visibility} repository ${name} on your GitHub account, but premise cannot reach GitHub right now. ${login.problem} ${login.fix} Then approve. If you approve before that, nothing is created and premise asks you what to do.`,
          };
    this.options.gate.request({
      softwareId: software.id,
      kind,
      act: "create-repository",
      action: `Create a ${visibility} repository named ${name} on your GitHub account${login?.ready ? ` (${where})` : ""}, and push ${software.name}'s code and record to it.`,
      why: "So the software and its record are kept off this machine too. Until then they live only in premise's data folder.",
      requestedBy: "line engine",
      perform: "create-repository",
      stage: "plan",
      waiting: "copying the software to GitHub; building goes on meanwhile",
      card: {
        title: `Create ${visibility === "public" ? "a public" : "a private"} repository on GitHub for ${software.name}?`,
        standingLabel: `creating ${visibility} repositories on GitHub`,
        reality,
        whyNow:
          whyNow ??
          "The plan is settled, so the software has code worth keeping somewhere besides this machine.",
      },
    });
  }

  private async createRemoteRepository(
    request: Pick<GateRequest, "softwareId"> & Partial<Pick<GateRequest, "card">>,
  ): Promise<PerformResult> {
    const software = getSoftware(this.db, request.softwareId);
    if (!software) return { ok: false, outcome: "The software is not in premise any more." };
    const keeper = this.options.keeper;
    const repo = keeper.repositoryPath(software.id);
    if (this.config.line.remote === "local") {
      const host = new LocalRepositoryHost(keeper.git, join(this.config.data.folder, "remotes"));
      try {
        const created = await host.createRepository({
          softwareId: software.id,
          name: repositoryName(software.name),
          visibility: this.config.runner.default_visibility,
        });
        keeper.setRemote(software.id, created.url);
        const failures = keeper.pushChecked(repo, "origin", this.config.record.default_branch);
        if (failures.length > 0) {
          return {
            ok: false,
            outcome: `The copy was made, but nothing was pushed: ${failures.length} commit(s) failed the trace check.`,
          };
        }
        return { ok: true, outcome: `${software.name} now has a second copy: ${created.url}.` };
      } catch (error) {
        return { ok: false, outcome: `The copy could not be made: ${(error as Error).message}` };
      }
    }

    const name = this.state(software.id).repositoryName ?? repositoryName(software.name);
    if (!this.realAgents || request.card?.reality.real === false) {
      const why = this.realAgents
        ? "you were asked while premise ran with scripted agents, when approving was to create nothing. Ask again to create it now"
        : "premise is running with scripted agents (a demo), and a demo does nothing outside this machine";
      return {
        ok: false,
        unavailable: true,
        outcome: `Nothing was created on GitHub: ${why}. ${software.name} stays on this machine, and nothing is lost.`,
      };
    }
    const existingRemote = keeper.git.remoteUrl(repo, "origin");
    if (existingRemote !== undefined) {
      return {
        ok: false,
        outcome: `${software.name} already has a copy besides this machine, at ${existingRemote}, so premise created nothing more.`,
      };
    }
    const visibility = this.config.runner.default_visibility;
    let created;
    try {
      created = await new GitHubRepositoryHost(this.github).createRepository({
        softwareId: software.id,
        name,
        visibility,
        description: `${software.name}, made with premise.`,
      });
    } catch (error) {
      if (!(error instanceof RepositoryHostError)) throw error;
      if (error.code === "NAME_TAKEN") {
        const suggestion = error.taken?.suggestion ?? null;
        this.offerRepositoryRetry(software, {
          title: `${name} is taken on your GitHub account: use another name?`,
          problem: `${error.taken?.fullName ?? name} already exists on your GitHub account. premise does not use it, change it or delete it.`,
          choices: [...(suggestion ? [`Use the name ${suggestion}`] : []), KEEP_HERE],
        });
        return {
          ok: false,
          outcome: `${error.message} premise created nothing and changed nothing there. Under Waiting on you, pick another name${suggestion ? ` (premise suggests ${suggestion})` : ""}, or keep ${software.name} on this machine.`,
        };
      }
      this.offerRepositoryRetry(software, {
        title: `${software.name} was not copied to GitHub: try again?`,
        problem:
          error.code === "NOT_READY"
            ? `Nothing was created: ${error.message}`
            : `Nothing was created on GitHub: ${error.message}.`,
        choices: [TRY_AGAIN, KEEP_HERE],
      });
      return {
        ok: false,
        outcome:
          error.code === "NOT_READY"
            ? `Nothing was created: ${error.message} Then pick "Try again" under Waiting on you.`
            : `Nothing was created on GitHub: ${error.message}. Under Waiting on you, try again or keep ${software.name} on this machine.`,
      };
    }

    const link = created.link ?? created.url;
    keeper.setRemote(software.id, created.url);
    if (/^https:\/\/github\.com\//i.test(created.url)) {
      // premise's git ignores the machine's own git settings, so pushes to GitHub use the GitHub
      // CLI's login explicitly, for GitHub addresses only.
      const key = "credential.https://github.com.helper";
      keeper.git.run(repo, ["config", "--local", "--replace-all", key, ""]);
      keeper.git.run(repo, [
        "config",
        "--local",
        "--add",
        key,
        `!${this.config.github.command} auth git-credential`,
      ]);
    }
    const branch = this.config.record.default_branch;
    const commits = keeper.git.log(repo, ["HEAD"]).reverse();
    const failures = keeper.checkCommits(repo, commits);
    const made = `Created the ${visibility} repository ${link} on your GitHub account`;
    if (failures.length > 0) {
      return {
        ok: false,
        outcome: `${made}, but nothing was pushed: ${failures.length} commit(s) failed the trace check. premise tries again after the next change lands.`,
      };
    }
    if (commits.length > 0) {
      try {
        await keeper.git.pushAsync(
          repo,
          "origin",
          branch,
          this.config.github.timeout_minutes * 60_000,
        );
      } catch (error) {
        return {
          ok: false,
          outcome: `${made}, but the push was refused: ${(error as Error).message}. Nothing was forced, and nothing on GitHub was overwritten. premise pushes again after the next change lands; if the repository on GitHub has commits of its own (for example a README added there), remove them there first.`,
        };
      }
    }
    return {
      ok: true,
      outcome: `${made} and pushed ${software.name}'s code and record to it. premise pushes again each time a change lands.`,
    };
  }

  /** Ask the operator what to do after creating the GitHub repository did not work. */
  private offerRepositoryRetry(
    software: Software,
    ask: { title: string; problem: string; choices: string[] },
  ): void {
    transaction(this.db, () => {
      for (const open of listAsks(this.db, { softwareId: software.id, status: "open" })) {
        if (open.extra.meta?.purpose === "repository-retry") {
          closeAsk(this.db, open.id, "withdrawn", null, "A newer question replaced it.");
        }
      }
      createAsk(this.db, {
        softwareId: software.id,
        role: OPERATOR,
        kind: "question",
        stage: software.currentStage,
        title: ask.title,
        instruction: `${ask.problem} Pick one, or write the name you want the repository to have. premise then asks you before creating it, unless you approved creating repositories on GitHub for ${software.name} from now on.`,
        extra: { choices: ask.choices, meta: { purpose: "repository-retry" } },
      });
    });
  }

  /** At start-up: premise stopped between approving the GitHub repository and finishing it. */
  private repositoryCutOff(request: GateRequest): void {
    const software = getSoftware(this.db, request.softwareId);
    if (!software) return;
    const name = this.state(software.id).repositoryName ?? repositoryName(software.name);
    this.premiseSays(
      software.id,
      `premise stopped after you approved creating the repository ${name} on GitHub, before it finished, so it may be partly done. premise does not try again by itself; under Waiting on you, say what to do.`,
    );
    this.offerRepositoryRetry(software, {
      title: `Copying ${software.name} to GitHub was cut off: try again?`,
      problem: `Look on your GitHub account for a repository named ${name}. If it is not there, try again. If it is, premise will not use it: write another name, or keep ${software.name} on this machine.`,
      choices: [TRY_AGAIN, KEEP_HERE],
    });
  }

  /** The gate decided, or finished carrying out, a request: say so in the session. */
  private gateDecided(request: GateRequest): void {
    const software = getSoftware(this.db, request.softwareId);
    if (!software) return;
    if (request.perform === "add-record" && request.status === "refused") {
      const existing = this.takenOn(software.id);
      if (existing && existing.recordStatus !== "added") {
        setExisting(this.db, software.id, { recordStatus: "refused", recordNote: null });
      }
    }
    switch (request.status) {
      case "refused":
        this.premiseSays(
          software.id,
          request.perform === "create-repository"
            ? `Declined: nothing was created, and ${software.name} stays on this machine. Everything else goes on.`
            : request.perform === "add-record"
              ? `Declined: nothing was added to your repository. The record stays only in premise's own copy, and everything else goes on. To add it later, use "Offer it again" on the Line tab.`
              : `Declined: ${request.action} The ${request.requestedBy} was told, and finds another way.`,
        );
        break;
      case "done":
        this.premiseSays(software.id, `Approved and done: ${request.outcome ?? request.action}`);
        break;
      case "unavailable":
        this.premiseSays(
          software.id,
          request.perform === "create-repository" || request.perform === "add-record"
            ? `Approved, but nothing was done: ${request.outcome ?? "premise could not carry it out."}`
            : `Approved, but this step is not available yet: ${request.outcome ?? "premise cannot carry it out itself yet, so nothing was done."}`,
        );
        break;
      case "failed":
        this.premiseSays(
          software.id,
          request.perform === "create-repository"
            ? `Approved, but it did not all work: ${request.outcome ?? "the action did not work."}`
            : `Approved, but it failed: ${request.outcome ?? "the action did not work."} Nothing more is tried without asking you again.`,
        );
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
      // The scope check is kept as a draft ask, but it is no list to correct in chat.
      (a) => a.kind === "draft" && a.stage === stage && a.extra.meta?.purpose !== "scope",
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
    const notReady = copyNotReady(this.takenOn(softwareId));
    if (notReady) {
      return transaction(this.db, () => {
        const said = addChatMessage(this.db, { softwareId, author: "person", text });
        const reply = this.premiseSays(softwareId, `Nothing was taken in: ${notReady}`);
        return { said, reply };
      });
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
      const said = addChatMessage(this.db, { softwareId, author: "person", text });
      const taken = this.options.intake.takeIn(softwareId, text);
      this.db
        .prepare("UPDATE chat_messages SET routed_to = ? WHERE id = ?")
        .run(`intake:I-${taken.number}`, said.id);
      const reply = this.premiseSays(softwareId, taken.reply, `intake:I-${taken.number}`);
      return { said: { ...said, routedTo: `intake:I-${taken.number}` }, reply };
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

  /**
   * Everything the operator has said about a software in their own words, one source each: the
   * first description, the words of the piece of work, their chat messages, and what they answered
   * or edited on a page. What a drafted item may quote to count as theirs.
   */
  private operatorSources(software: Software): string[] {
    const piece = this.active(software.id);
    const chat = listChatMessages(this.db, software.id)
      .filter((m) => m.author === "person")
      .map((m) => m.text);
    const answered = listAsks(this.db, { softwareId: software.id, status: "answered" }).flatMap(
      (ask) => {
        const a = ask.answer;
        if (!a) return [];
        if (a.kind === "items")
          return a.items.flatMap((i) =>
            i.decision === "edit"
              ? [i.text]
              : i.decision === "strike" && i.reason
                ? [i.reason]
                : [],
          );
        if (a.kind === "text") return [a.text, ...(a.reason ? [a.reason] : [])];
        return [];
      },
    );
    return [software.idea, piece.words ?? "", ...chat, ...answered].filter((t) => t.trim());
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
    if (stage === "plan" && this.changeOf(this.active(id))) {
      const piece = this.active(id);
      const change = this.changeOf(piece)!;
      const read = readChangeSubmission(args, {
        ref: change.ref ?? "the change",
        record: this.recordLines(id),
        maxTasks: this.config.line.change_max_tasks,
      });
      if ("problems" in read) {
        return toolFail(
          "MALFORMED",
          "The plan for this change needs a correction before premise uses it. Fix these and submit it again.",
          read.problems,
        );
      }
      writeChangePlan(this.config.data.folder, id, piece.id, read.plan);
      return toolOk({
        status: "received",
        note: "premise keeps the plan for this change beside the software's own plan, which stays as it is. Submitting again replaces it.",
      });
    }
    if (stage === "plan") {
      const decisions = readDraftItems(args.items, { defaultKind: "D", allowed: ["D", "M"] });
      const fromItems = decisions.filter((d) => d.kind === "M");
      const listed = Array.isArray(args.milestones)
        ? readDraftItems(args.milestones, { defaultKind: "M", allowed: ["M"] })
        : [];
      const milestones = [...fromItems, ...listed].map((m, i) => ({
        ...m,
        // Planners number them ("1. Runs"); the record gives each its own ID (M-1).
        text: m.text.replace(/^\s*\d+[.):]\s+/, ""),
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
              ...(typeof v.milestone === "number" &&
                Number.isInteger(v.milestone) &&
                v.milestone >= 1 && { milestone: v.milestone }),
            };
          })
        : [];
      const outcomeItems = this.recordLines(id).some((i) => i.kind === "W" || i.kind === "T");
      // The scope check's choice binds the software's own plan; a later change from intake is the
      // operator's new word and may bring back what was left out.
      const whole = this.active(id).parentId === null;
      const planned = planProblems(
        tasks,
        milestones.length,
        whole ? this.state(id).scope : undefined,
        { hasOutcomeItems: outcomeItems },
      );
      if (tasks.length === 0) planned.unshift('Give the working plan as "tasks": at least one.');
      if (planned.length) {
        return toolFail(
          "MALFORMED",
          "The plan needs a change before premise shows it. Fix these and submit it again.",
          planned,
        );
      }
      const kind = typeof args.kind === "string" ? args.kind.trim().slice(0, 200) : "";
      const howToRun =
        typeof args.how_to_run === "string" ? args.how_to_run.trim().slice(0, 4000) : "";
      this.writePlan(id, {
        decisions: ds,
        milestones,
        tasks,
        ...(kind && { kind }),
        ...(howToRun && { how_to_run: howToRun }),
      });
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
      const takingOn = this.isRecovery(this.active(id));
      const alternative =
        typeof args.alternative === "string"
          ? args.alternative.replace(/\s+/g, " ").trim().slice(0, 300)
          : "";
      const advice = takingOn
        ? /no longer|unnecessary|not needed|stop|do not/i.test(outcome)
          ? EXISTING_OUTCOMES[2]
          : /part|replace|use|build on/i.test(outcome)
            ? EXISTING_OUTCOMES[1]
            : EXISTING_OUTCOMES[0]
        : recommended;
      // "Do not build" is the cheapest outcome of all, so it is said first and plainly (0192).
      const notBuild = !takingOn && recommended === EXISTS_OUTCOMES[3];
      const ask = createAsk(this.db, {
        softwareId: id,
        role: OPERATOR,
        kind: "question",
        stage: "exists",
        title: takingOn
          ? "Is all of it still needed?"
          : notBuild
            ? "premise recommends not building it: something already does this"
            : "Build it, build on something, or not build it?",
        instruction: takingOn
          ? `This is what exists now that could do part of its job${items.length ? "" : " (nothing was found)"}. premise recommends: ${advice}.${why} Pick one, or write your own answer.`
          : notBuild
            ? `${alternative ? `Instead: ${alternative}. ` : ""}Something that already exists does the job, which is the cheapest outcome: nothing to build, check or keep running.${why} Pick "Do not build it" to stop here with a short report, or another choice to build it anyway. What was found is listed below.`
            : `This is what already exists${items.length ? "" : " (nothing was found)"}. premise recommends: ${recommended}.${why} Pick one, or write your own answer.`,
        items: items.map(toFindingItem),
        extra: {
          bestAttempt: advice,
          choices: takingOn
            ? [...EXISTING_OUTCOMES]
            : notBuild
              ? [EXISTS_OUTCOMES[3], ...EXISTS_OUTCOMES.slice(0, 3)]
              : [...EXISTS_OUTCOMES],
          meta: {
            purpose: "exists",
            items,
            job: job.id,
            ...(alternative && { alternative }),
          },
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
      const items = this.settleSayBack(
        id,
        readDraftItems(args.items, {
          defaultKind: "Y",
          allowed: ["Y", "U", "R", "E", "W", "D", "M"],
          allowSize: true,
          max: this.config.line.say_back_max_items,
        }),
      );
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
    const { items, downgraded } = checkOperatorQuotes(
      readDraftItems(args.items, {
        defaultKind: kinds.kind,
        allowed: kinds.allowed,
        allowSize: stage === "why",
        quotes: true,
        ...(stage === "why" && { max: this.config.line.why_items_max + 1 }),
      }),
      this.operatorSources(software),
      OPERATOR,
    );
    const problems = this.dryRun(
      id,
      items
        .map((item) => addOperation({ item, text: item.text, edited: false }))
        .filter((o): o is NonNullable<typeof o> => o !== null),
    );
    if (problems.length)
      return toolFail("MALFORMED", "Some items would not fit the record.", problems);
    const piece = this.active(id);
    const changeItem = stage === "what" ? this.changeOf(piece) : null;
    if (changeItem) {
      // A change's What is not asked on its own: it goes into the record when the drafter ends,
      // and the person is told or asked once before building (decision 0274).
      const open =
        typeof args.open_choice === "string" ? args.open_choice.trim().slice(0, 400) : "";
      this.setChangeNotes(changeItem, { draft: items, openChoice: open || undefined });
      return toolOk({
        status: "received",
        note: "premise takes this in when you finish: what came from the person's words and what you assumed go into the record at once; suggestions are only offered. Submitting again replaces it.",
      });
    }
    const change = stage === "what" && piece.kind === "intake";
    const ask = createAsk(this.db, {
      softwareId: id,
      role: OPERATOR,
      kind: "draft",
      stage,
      title: change
        ? `This changes what it must do; confirm to change it (${piece.ref ?? "new work"})`
        : DRAFT_TITLES[stage as "why"],
      instruction: change
        ? "These lines are what changes in what the software must do. Strike or edit any that are wrong, then confirm to change it. Nothing else is asked before it is planned and built."
        : DRAFT_INSTRUCTIONS[stage as "why"],
      items: items.map(toAskItem),
      extra: { meta: { purpose: "draft", items, job: job.id } },
    });
    replace(ask);
    if (replaced)
      this.premiseSays(id, `The ${stageName(stage)} list was redrafted with your correction.`);
    return toolOk({
      draft_id: ask.id,
      status: "shown",
      note: `The operator strikes, keeps or edits each item.${
        downgraded
          ? ` ${downgraded} item${downgraded === 1 ? "" : "s"} marked from: operator had no quote of at least three words (or a whole source shorter than that) that appears word for word in what the operator said, answered or edited, so ${downgraded === 1 ? "it was" : "they were"} marked assumed. To mark an item from the operator, give "quote": their exact words, copied from their description, a chat message, an answer or an edited item.`
          : ""
      }`,
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
      return toolFail(
        "MALFORMED",
        `Give "operations" (a list) and one "reason" (one line for the whole change)${Array.isArray(args.operations) ? "; the reason is missing" : '; "operations" is missing or not a list'}. For example: { "operations": [{ "op": "add", "kind": "D", "text": "Keep tasks in one JSON file. Reason: one user, no server. Rejected: SQLite, more than needed.", "from": "assumed" }], "reason": "How tasks are stored." }`,
      );
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
        "The record keeper refused the change, so nothing of it was recorded. Fix what each line below says, then call record_propose again with the whole change.",
        result.diagnostics.map((d) => d.message),
      );
    }
    if ((LATER as readonly string[]).includes(job.stage ?? "") && this.options.later.proposed) {
      this.options.later.proposed(job.softwareId, result.changeId);
      return toolOk({
        change_id: result.changeId,
        status: result.status,
        note: "Checked. It goes into the record when this change lands, after the check passes.",
      });
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
    const role = roleLabel(String(args.role ?? "")) || OPERATOR;
    const who = role === OPERATOR ? "you" : `the ${roleWords(role)}`;
    const items = (args.items as unknown[]).map((t) => String(t).trim()).filter(Boolean);
    const kind = args.kind as "question" | "proposal" | "needed";
    if (kind === "needed") return this.askForAct(binding, job, role, items, args);
    const ask = createAsk(this.db, {
      softwareId: job.softwareId,
      role,
      kind,
      stage: job.stage,
      title: items.length === 1 ? items[0]!.slice(0, 120) : `A question from the ${binding.role}`,
      instruction:
        job.kind === "recover"
          ? `The ${binding.role} found this while recovering the record from the code: parts disagree, or it cannot be told from the code. Answer in your own words; your answer is taken in as a correction and goes through the line, and the rest goes on meanwhile.`
          : `The ${binding.role} asks this while working on ${stageName(job.stage ?? "")}, and it is ${role === OPERATOR ? "yours" : `the ${roleWords(role)}'s`} to answer. Answer in your own words; the rest of the work goes on.`,
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
      note: `Asked of ${who}. Carry on with your best attempt and say in task_finish what waits on the answer; it reaches the next brief.`,
    });
  }

  /**
   * Something only a person can do (decision 0196): premise names the role, says exactly what is
   * needed step by step, and waits for the person to say it is done. When the act ends in a secret,
   * the person writes it into the software's secrets file (decision 0120) and premise checks it is
   * there; it never takes the value and never does the act.
   */
  private askForAct(
    binding: ToolBinding,
    job: Job,
    role: string,
    steps: string[],
    args: Record<string, unknown>,
  ): ToolEnvelope {
    const what =
      typeof args.what === "string" && args.what.trim()
        ? args.what.trim().replace(/[.\s]+$/, "")
        : (steps[0] ?? "Something only a person can do").replace(/[.\s]+$/, "");
    const key =
      typeof args.secret === "string" && args.secret.trim()
        ? args.secret
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]+/g, "_")
        : null;
    const file = key ? secretsFile(this.config.data.folder, job.softwareId) : null;
    const allSteps = [
      ...steps,
      ...(key && file
        ? [
            `Write it into the file ${file} on this computer, as one line: ${key}=the value. Make the file if it is not there. Never paste it into this page or the chat: premise does not take secrets.`,
          ]
        : []),
    ];
    const ask = createAsk(this.db, {
      softwareId: job.softwareId,
      role,
      kind: "needed",
      stage: job.stage,
      title: what.slice(0, 140),
      instruction: `Only a person can do this; premise never does it for you. The ${binding.role} needs it to go on with ${stageName(job.stage ?? "")}. Do the steps below, then mark it done.${key ? " premise then checks the key is in the file." : ""} Only this work waits; the rest goes on.`,
      items: allSteps.map((text, i) => ({ key: `s${i + 1}`, text, mark: "assumed" as const })),
      waitingJob: job.id,
      extra: {
        meta: {
          purpose: "agent",
          job: job.id,
          act: true,
          ...(key && file && { secret: { key, file } }),
        },
      },
    });
    return toolOk({
      ask_id: ask.id,
      status: "asked",
      note: `The ${roleWords(role)} is asked to do it. Do not do it yourself or wait: finish what you can without it, and end with task_finish "waiting-for-person". The answer reaches your next attempt${key ? `; the secret is in the software's secrets file, which the running software gets as ${key} and you never see` : ""}.`,
    });
  }

  /** gate_request: a floor action goes to the gate. */
  gateRequest(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.jobOf(binding);
    if (!("id" in job)) return job;
    if (!isFloorKind(args.kind)) {
      return toolFail(
        "MALFORMED",
        `"${String(args.kind)}" is not a floor kind. Use one of: ${FLOOR_KINDS.join(", ")}.`,
      );
    }
    try {
      const input = {
        softwareId: job.softwareId,
        kind: args.kind,
        action: String(args.action ?? ""),
        why: String(args.why ?? ""),
        items: Array.isArray(args.items)
          ? args.items.filter((x): x is string => typeof x === "string")
          : [],
        ...(typeof args.role === "string" &&
          roleLabel(args.role) && { role: roleLabel(args.role) }),
        requestedBy: `${binding.role}, job ${job.id}`,
        jobId: job.id,
        waiting: `the ${binding.role}'s work on ${stageName(job.stage ?? "")}`,
        stage: job.stage,
      };
      // An agent never performs a floor action and premise has no performer for what an agent
      // asks for, so nobody is asked to approve something that nothing will do (decision 0270).
      if (!this.options.gate.canPerform(null)) {
        const request = this.options.gate.recordUnavailable(input);
        return toolOk({
          request_id: request.id,
          status: "unavailable",
          note: "premise cannot carry out this kind of action itself, so no one was asked and nothing was done. Do not wait. Finish what you can without it and say in task_finish what needs a person to do by hand.",
        });
      }
      const request = this.options.gate.request(input);
      return toolOk({
        request_id: request.id,
        status: request.status === "asked" ? "asked" : "approved",
        note:
          request.status === "asked"
            ? `The ${roleWords(request.role)} is asked in the session. Do not wait: finish what you can without it and say in task_finish what waits on it.`
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
    this.setState(job.softwareId, { review: { ...review, objections, submitted: true } });
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
      const taken = this.options.intake.takeIn(job.softwareId, context?.message ?? "");
      addChatMessage(this.db, {
        softwareId: job.softwareId,
        author: "premise",
        text: `That message was not about the open list, so it was taken off it. ${taken.reply}`,
        routedTo: `intake:I-${taken.number}`,
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
  {
    file: "taste.md",
    title: "Taste",
    plain: "How claimed parts should be, as the role that claimed each one decided",
  },
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
    item.marks.leftOut ? "left out: not built" : undefined,
    item.marks.date,
  ].filter((m): m is string => Boolean(m));
}

/** A job in plain words, for status lines. */
export function jobWords(job: Pick<Job, "kind" | "payload">): string {
  const purpose = job.payload.purpose;
  if (purpose === "correction") return "drafter, working in your correction";
  if (purpose === "review") return "reviewer, checking the plan's costly choices";
  if (purpose === "revision") return "planner, revising the plan";
  if (job.payload.whole === true) return "checker, checking the parts work together";
  switch (job.kind) {
    case "size":
      return "sizer";
    case "recover":
      return "drafter, recovering the record from the code";
    case "draft":
      return "drafter";
    case "research":
      return "researcher";
    case "plan":
      return "planner";
    case "prototype":
      return "planner, writing a proposal for a claimed part";
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

function asSize(value: string): SizeClass {
  return (SIZE_CLASSES as readonly string[]).includes(value) ? (value as SizeClass) : "small";
}

function capital(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function lowerFirst(text: string): string {
  const t = text.trim();
  if (!t) return "no reason was given.";
  const lowered = /^[A-Z][a-z]/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t;
  return /[.!?]$/.test(lowered) ? lowered : `${lowered}.`;
}

function defaultSizing(reason: string): Sizing {
  return {
    size: { by: "default", reason },
    stages: { by: "default", reason },
    split: { decision: "whole", by: "default", reason },
  };
}

/** A work item's state in plain words for the page. */
function workState(item: WorkItem, current: boolean): WorkItemView["state"] {
  if (item.state === "sizing") return "sizing";
  if (item.state === "withdrawn") return "withdrawn";
  if (item.state === "dropped") return "dropped";
  if (item.state === "done") return "done";
  if (item.state === "ahead") return "ahead";
  if (item.state === "waiting") return "waiting-on-parts";
  return current ? "working" : "working";
}

/** A brought-in software whose repository is somewhere else than this machine (a network address). */
export function isElsewhere(existing: Pick<ExistingSoftware, "sourceKind" | "source">): boolean {
  if (existing.sourceKind === "folder") return false;
  return !/^(file:\/\/|\/|~|\.{1,2}\/)/.test(existing.source.trim());
}
