/**
 * The shapes the page server's API returns (docs/specs/page-server.md 3.2). Shared by the server
 * and the page, so it imports nothing but other shared files.
 */
import type { SizeClass, StageId } from "./stages.js";

export type SoftwareState =
  "active" | "paused-budget" | "paused-usage" | "waiting-milestone" | "ended";

export interface SoftwareSummary {
  id: string;
  name: string;
  stage: StageId;
  state: SoftwareState;
  /** One plain line on what is happening or what it waits for. */
  status: string;
  sizeClass: SizeClass;
  priority: number;
  milestoneWaits: boolean;
  openAsks: number;
  created: string;
  /** True while premise is taking on this software from existing code (decision 0189). */
  takingOn?: boolean;
}

export interface StageView {
  id: StageId;
  name: string;
  plain: string;
  /**
   * done: passed; current: where the work is; ahead: not reached yet; skipped: sizing found the
   * piece of work being done now does not need it.
   */
  position: "done" | "current" | "ahead" | "skipped";
  /** For a skipped stage: why it is not needed. */
  why?: string;
}

/** Who decided part of a piece of work's sizing: the sizer agent, the operator, or premise's default. */
export type SizedByView = "sizer" | "operator" | "default";

/** A piece of work going through the line: the software, a milestone, or a part of a split piece. */
export interface WorkItemView {
  id: number;
  parentId: number | null;
  /** 0 for the software, 1 for its milestones or parts, and so on. */
  depth: number;
  kind: "software" | "milestone" | "module" | "intake";
  /**
   * start: the software; split: a part the sizer made; plan: a milestone; fix: asked for by the
   * check of the whole; intake: an intake item's work; purpose: a change of purpose the operator
   * confirmed, which goes through Why.
   */
  origin: "start" | "split" | "plan" | "fix" | "intake" | "purpose" | "existing" | "recover";
  title: string;
  words: string | null;
  state: "sizing" | "working" | "waiting-on-parts" | "ahead" | "done" | "dropped" | "withdrawn";
  /** The piece being worked on now. */
  current: boolean;
  stage: StageId | null;
  sizeClass: SizeClass;
  /** The stages it goes through, in order. */
  stages: StageId[];
  /** Stages it could have had but does not need. */
  skipped: StageId[];
  allowedStages: StageId[];
  /** Stages this kind of work always has. */
  requiredStages: StageId[];
  sizing: {
    size: { by: SizedByView; reason: string };
    stages: { by: SizedByView; reason: string };
    split: { decision: "split" | "whole"; by: SizedByView; reason: string };
  } | null;
  sized: string | null;
  /** Minutes from when the piece was made to its first build; null until it reaches Build. */
  minutesBeforeBuild: number | null;
  /** Its size and stages can still be changed. */
  canChange: boolean;
  /** It is split, and no part has been built yet. */
  canUndoSplit: boolean;
}

export interface UsageFigures {
  mocked: boolean;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  weeklyShare: number;
}

export interface SoftwareDetail extends SoftwareSummary {
  idea: string;
  stages: StageView[];
  usage: UsageFigures;
  milestones: MilestoneView[];
  approvals: ApprovalView[];
  /** This stage's effort budget and what is used, when the stage has one. */
  budget: { turns: number; minutes: number; usedMinutes: number } | null;
  /** The software and its pieces of work, in order: milestones, and parts of split pieces. */
  work: WorkItemView[];
  /** True while the check of a split piece as a whole is a stand-in that checks nothing. */
  wholeCheckStandIn: boolean;
  /** What is being built and checked, and what landed; null before Build. */
  build: BuildView | null;
  /** For software premise took on from an existing repository (decision 0189). */
  existing?: ExistingView;
}

/** One task of a milestone's working plan, as the page shows it under Build. */
export interface BuildTaskView {
  number: number;
  title: string;
  /** Record items the task serves. */
  items: string[];
  status: "waiting-to-start" | "building" | "built" | "waiting-on-person" | "stopped";
  /** The commit it made, when built. */
  commit: string | null;
  /** Why it stopped, or what it waits on, in plain words. */
  note: string | null;
  /** A task made from the checker's evidence, to fix what the check found. */
  fix: boolean;
}

export type VerdictValue = "met" | "not-met" | "could-not-check";

/** One check of one exact commit. */
export interface CheckView {
  round: number;
  commit: string;
  status: "writing-scenarios" | "checking" | "passed" | "not-passed" | "stopped" | "did-not-finish";
  verdicts: { item: string; text: string; verdict: VerdictValue; evidence: string }[];
  findings: { text: string; blocking: boolean }[];
  when: string;
}

/** Build, Check and Run for the milestone being worked on (docs/specs/page.md). */
export interface BuildView {
  milestone: { id: string; text: string } | null;
  /** The check round, from 1; a failed check starts the next round. */
  round: number;
  roundsAllowed: number;
  scenarios: number;
  tasks: BuildTaskView[];
  checks: CheckView[];
  /** The last commit that passed its check and was merged, with when. */
  landed: { commit: string; when: string; milestone: string | null } | null;
  /** What waits on a person in Build and Check, in plain words. */
  waiting: string[];
}


/** Taking on an existing software: where it came from, how far it got, and its record. */
export interface ExistingView {
  /** The folder or clone address, as the operator gave it. */
  source: string;
  sourceKind: "folder" | "address";
  /** copying, then recovering (Why to say-back), then taken-on; or copy-failed, or stopped. */
  status: "copying" | "copy-failed" | "recovering" | "taken-on" | "stopped";
  /** What went wrong, in plain words, when the copy failed. */
  problem: string | null;
  commits: number;
  /** Items recovered from the code that are still live; how many were confirmed and struck. */
  recovered: number;
  confirmed: number;
  struck: number;
  /** How to build, start and check it, as recovered. */
  run: { build: string | null; start: string | null; check: string | null; canStart: boolean };
  /** What premise would need to build, start or check it ("could not check"). */
  couldNotCheck: string[];
  /** The record in the operator's own repository, through the gate. */
  record: {
    status: "not-yet" | "asked" | "added" | "refused" | "failed";
    branch: string;
    note: string | null;
    /** The operator can ask premise to offer it again. */
    canOffer: boolean;
  };
}

export type AskKind = "question" | "draft" | "say-back" | "proposal" | "approval" | "needed";

export interface AskItem {
  /** Stable within the ask: the answer names items by this. */
  key: string;
  text: string;
  /** assumed: premise's guess; from: who said it (a role label); suggestion: premise's idea. */
  /** recovered: read from an existing software's code, unconfirmed until the say-back passes. */
  mark: "assumed" | "suggestion" | "from-role" | "recovered";
  from?: string;
  /** For a milestone: whether premise stops after it until the operator says go on. */
  wait?: boolean;
  /** Record items the item stands for (a say-back item), or sources (What exists). */
  refs?: string[];
  /** The heading a long list is grouped under on the page, such as "Why". */
  group?: string;
}

export interface AskView {
  id: number;
  softwareId: string;
  softwareName: string;
  role: string;
  kind: AskKind;
  stage: StageId | null;
  title: string;
  /** Exactly what to do, in one or two plain sentences. */
  instruction: string;
  items: AskItem[];
  /** For a question: premise's best attempt, which the person can take as the answer. */
  bestAttempt?: string;
  /** For a question: answers to pick from, besides writing one's own. */
  choices?: string[];
  /** For an approval: exactly what will happen and why (the gate's fixed card). */
  approval?: {
    action: string;
    why: string;
    floor: string;
    /** When this kind of action may be approved for the software as a whole kind. */
    kindLabel?: string;
  };
  status: "open" | "answered" | "withdrawn";
  answerSummary?: string;
  asked: string;
  answered?: string;
}

/** An answer to one item of a draft or say-back. */
export type ItemAnswer =
  | { key: string; decision: "keep"; wait?: boolean }
  | { key: string; decision: "strike"; reason?: string }
  | { key: string; decision: "edit"; text: string; wait?: boolean };

export type AskAnswer =
  | { kind: "items"; items: ItemAnswer[] }
  | { kind: "text"; text: string }
  | { kind: "approval"; decision: "approve-once" | "approve-kind" | "refuse"; reason?: string }
  | { kind: "needed"; decision: "done" | "cannot"; reason?: string }
  | { kind: "proposal"; decision: "accept" | "change"; text?: string };

export interface ChatMessage {
  id: number;
  softwareId: string | null;
  author: "person" | "premise";
  text: string;
  time: string;
  /** Where a person's message went: a draft's corrections, intake, or the start of a software. */
  routedTo?: string | null;
}

export interface RecordItemView {
  id: string;
  text: string;
  marks: string[];
  status: "live" | "struck";
  replaces?: string;
  reason?: string;
}

export interface RecordFileView {
  file: string;
  title: string;
  /** What the file holds, in a few plain words. */
  plain: string;
  items: RecordItemView[];
}

export interface RecordView {
  softwareId: string;
  /** "stand-in" until the record keeper writes the real files. */
  source: "stand-in" | "record";
  files: RecordFileView[];
}

export interface ReportLine {
  text: string;
  evidence?: string;
}

/** A standing approval for a kind of floor action, for one software. */
export interface ApprovalView {
  id: number;
  softwareId: string;
  kind: string;
  /** The kind in plain words, such as "posting comments and messages". */
  label: string;
  role: string;
  given: string;
}

/** A software's milestones as the record holds them. */
export interface MilestoneView {
  id: string;
  text: string;
  wait: boolean;
  /** reached: built, checked, running and reported; current: being worked on; ahead. */
  position: "reached" | "current" | "ahead";
}

export interface ReportView {
  softwareId: string;
  source: "stand-in" | "reporter";
  written: string | null;
  /** True when every line is shown; false for the short default. */
  detail: boolean;
  /** Lines left out of the short default, shown with "Show more detail". */
  hiddenLines: number;
  sections: { title: string; plain: string; lines: ReportLine[] }[];
  /** How to open the running software, once it runs. */
  running: { how: string; where: string } | null;
  cost: { mocked: boolean; text: string };
  /** Facts the report could not read, said plainly; empty when all were read. */
  limits: string[];
}

export type RunState =
  "none" | "starting" | "running" | "finished" | "built" | "crashed" | "failed" | "stopped";

/** What the page shows about a software's running copy (docs/specs/runner.md 3). */
export interface RunView {
  softwareId: string;
  state: RunState;
  /** One plain sentence on where things stand and what to do next. */
  plain: string;
  kind: "web" | "command" | "program" | null;
  commit: string | null;
  /** For web software: the link to open it. It only works on this machine. */
  link: string | null;
  /** For command-line software: the command to try; for a desktop app: how to start it. */
  command: string | null;
  /** The latest lines of output, oldest first. For command-line software this is the sample run. */
  output: string[];
  outputIsSample: boolean;
  restarts: number;
  /** False when premise ran it without confinement because the owner switched that off. */
  confined: boolean;
  started: string | null;
  ended: string | null;
  canStart: boolean;
  canStop: boolean;
}

export interface JobView {
  id: number;
  softwareId: string;
  softwareName: string;
  kind: string;
  stage: string | null;
  status: string;
  /** The latest progress line, or the result once finished. */
  line: string | null;
  waitingOn: string | null;
  attempts: number;
  started: string | null;
  finished: string | null;
}

export interface ActivityView {
  maxAgentSessions: number;
  runningAgentSessions: number;
  paused: boolean;
  pausedReason: string | null;
  resumeAt: string | null;
  running: JobView[];
  waiting: JobView[];
  queued: JobView[];
  recent: JobView[];
}

export interface SettingView {
  key: string;
  value: unknown;
  default: unknown;
  changed: boolean;
  meaning: string;
  allowed: string;
  envName: string;
}

export interface SettingsView {
  configFile: string;
  dataFolder: string;
  settings: SettingView[];
}

export interface SetupCheck {
  name: string;
  status: "ok" | "warn" | "missing";
  detail: string;
  fix?: string;
}

export interface Overview {
  version: string;
  dataFolder: string;
  agents: {
    mode: "scripted" | "claude";
    /** Whether agent jobs can start now. */
    ready: boolean;
    /** Why real agents cannot start on this machine, when they cannot. */
    unavailable: string | null;
    /** The operator chose a look around with scripted agents (not real) until premise restarts. */
    scriptedDemo: boolean;
  };
  /** The line engine runs every stage; the stages listed in standInStages are a labelled stand-in. */
  line: { mode: "engine"; standInStages: StageId[] };
  page: { notifications: "offer" | "off" };
  usage: {
    mode: string;
    mocked: boolean;
    weekly: { mocked: boolean; utilization: number; windowStart: string; resetsAt: string };
  };
  softwares: SoftwareSummary[];
  /** Each software's usage, from usage-ledger (mocked until it exists). */
  softwareUsage: (UsageFigures & { softwareId: string })[];
  openAsks: number;
  activity: { running: number; queued: number; waiting: number; max: number; paused: boolean };
  setup: SetupCheck[];
}

/** One line of the event stream. The page refreshes what the event names. */
export interface StreamEvent {
  id: number;
  time: string;
  softwareId: string | null;
  module: string;
  kind: string;
}

/** One intake item, as its sender and the operator see it (docs/specs/intake.md). */
export interface IntakeItemView {
  id: number;
  /** I-n */
  ref: string;
  source: "session" | "page" | "premise" | "github" | "feedback";
  /** Where it came from, in plain words. */
  sourceWords: string;
  sender: string;
  text: string;
  kind: string | null;
  kindWords: string | null;
  status:
    | "taken"
    | "triaging"
    | "asked"
    | "held"
    | "read"
    | "waiting"
    | "working"
    | "running"
    | "answered"
    | "merged"
    | "closed"
    | "dropped";
  /** Where it stands, in plain words. */
  where: string;
  route: "in-normally" | "asked-at-once" | "held" | "merged-or-closed" | null;
  reason: string | null;
  routedBy: "triager" | "default" | "operator" | null;
  /** Record items it touches, each with why. */
  touches: { id: string; reason: string }[];
  /** For a merged item: the item it joined. */
  joins: string | null;
  /** For a question: its answer. */
  answer: string | null;
  /** The piece of work it became on the line. */
  workItemId: number | null;
  received: string;
  /** Minutes from arriving to its change running; null until then. */
  minutesToRunning: number | null;
  /** Merged, closed or held: the operator can take it in instead. */
  canUndo: boolean;
}

export interface ReadingView {
  id: number;
  trigger: "count" | "time" | "operator";
  triggerWords: string;
  items: string[];
  status: "reading" | "done" | "failed";
  shortList: { wanted: string[]; recurring: string[]; purpose: string; backToWhy: boolean } | null;
  created: string;
}

/** A software's intake: every item, held items and readings. */
export interface IntakeView {
  softwareId: string;
  /** Newest first. */
  items: IntakeItemView[];
  held: number;
  /** When held items are read together. */
  readingWhen: { heldCount: number; days: number };
  /** A reading is under way. */
  reading: boolean;
  readings: ReadingView[];
  /** How many items are in each status. */
  counts: Record<string, number>;
}
