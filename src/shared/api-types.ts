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
}

export interface StageView {
  id: StageId;
  name: string;
  plain: string;
  /** done: passed; current: where the software is; ahead: not reached yet. */
  position: "done" | "current" | "ahead";
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
}

export type AskKind = "question" | "draft" | "say-back" | "proposal" | "approval" | "needed";

export interface AskItem {
  /** Stable within the ask: the answer names items by this. */
  key: string;
  text: string;
  /** assumed: premise's guess; from: who said it (a role label); suggestion: premise's idea. */
  mark: "assumed" | "suggestion" | "from-role";
  from?: string;
  /** For a milestone: whether premise stops after it until the operator says go on. */
  wait?: boolean;
  /** Record items the item stands for (a say-back item), or sources (What exists). */
  refs?: string[];
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
  /**
   * The line engine runs Why to Plan. Build, Check, Run, Report and Intake are a labelled stand-in
   * until their own modules exist.
   */
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
