/**
 * usage-ledger's seam (docs/specs/usage-ledger.md). premise builds no cost tracking of its own
 * (decision 0064); it records which task each agent session did, and asks usage-ledger what that
 * cost. Real sessions are read from the usage-ledger command (real-usage-ledger.ts, decision 0330);
 * scripted demos use made-up demo figures (demo-usage-ledger.ts), and say so.
 *
 * A figure that cannot be known is null, never zero, and comes with why in plain words.
 */

/** Where a figure came from: the usage-ledger command, or the made-up figures of a demo. */
export type FigureSource = "ledger" | "demo";

export interface WeeklyUsage {
  source: FigureSource;
  /** Share of the subscription's seven-day window used, from 0 to 1. */
  utilization: number;
  windowStart: string;
  resetsAt: string;
}

/** What a group of sessions used. Each figure is null when not known; why says why. */
export interface UsageFigures {
  source: FigureSource;
  /** How many recorded sessions the group has. */
  sessions: number;
  /** How many of them have a cost figure; the sums below cover only those. */
  priced: number;
  /** What the usage would cost at list prices, in US dollars; null when no session has one. */
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Tokens read from or written to the cache. */
  cacheTokens: number | null;
  /** The group's share of the week's usage, from 0 up; null when not known. */
  weeklyShare: number | null;
  /** Why some or all sessions have no cost figure, in plain words; null when all have one. */
  why: string | null;
  /** Why the share of the week is not known, or how rough it is; null when there is nothing to say. */
  weeklyWhy: string | null;
}

export interface SoftwareUsage extends UsageFigures {
  softwareId: string;
}

/**
 * What premise records for every agent session, real or scripted, in the form usage-ledger reads.
 * This is the whole of what premise tells usage-ledger; usage-ledger works the rest out from what
 * the agent runtime recorded for the session id.
 */
export interface SessionTaskRecord {
  /** The agent runtime's own id for the session; premise's own "local-<n>" until it is known. */
  sessionId: string;
  /** Where the session ran: "claude" for a real session, "scripted" for a scripted agent. */
  runtime: string;
  softwareId: string;
  /** The piece of work (a work item) the software was on; null when the task was not part of one. */
  workItem: number | null;
  /** The line stage the task served, such as "build"; null when it served none. */
  stage: string | null;
  /** The type of task: build, check, draft, and so on. */
  taskKind: string;
  /** The record items the task served, such as W-1 and M-2. */
  items: string[];
  model: string;
  effort: string;
  /** ISO times; ended is null while the session is still running. */
  started: string;
  ended: string | null;
  /** The work queue's job, for premise's own cross-reference. */
  jobId: number;
}

/** Where usage-ledger reads premise's session records. premise gives it once, when it starts. */
export type SessionSource = (softwareId?: string) => SessionTaskRecord[];

/** What a software may use, set by the operator: a share of the week's usage, or an amount. */
export type Budget = { kind: "share"; percent: number } | { kind: "amount"; usd: number };

/** Usage grouped four ways. Each list covers all of the software's recorded sessions. */
export interface UsageBreakdown {
  source: FigureSource;
  softwareId: string;
  total: SoftwareUsage;
  /** By phase id (understand, build, running); key "none" holds work on no phase's stage. */
  byPhase: UsageGroup[];
  /** By stage id; key "none" holds sessions that served no stage. */
  byStage: UsageGroup[];
  /** By work item id as text; key "none" holds sessions that were part of no piece of work. */
  byChange: UsageGroup[];
  /**
   * By record item id. A session that served several items shares its figures among them equally,
   * so the groups add up to the total; key "none" holds sessions that named no item.
   */
  byItem: UsageGroup[];
}

export interface UsageGroup extends UsageFigures {
  key: string;
}

/** Where a software stands against its budget, over the current week. */
export interface BudgetStatus {
  source: FigureSource;
  softwareId: string;
  budget: Budget | null;
  /**
   * False when nothing judged the budget: then overrun is false and why says what is missing.
   * premise never pauses work on a budget that was not checked.
   */
  checked: boolean;
  /**
   * Checked, but some use could not be counted: what was counted is a lower bound. It is never
   * an overrun by itself; why says what could not be counted.
   */
  incomplete: boolean;
  why: string | null;
  /** What the software used so far this week, in dollars and as a share; null when not known. */
  spentUsd: number | null;
  spentShare: number | null;
  /** True once what was used reaches the budget. usage-ledger decides; premise never works it out. */
  overrun: boolean;
}

export interface UsageLedger {
  /** The setting's mode as it applies: "real", "demo-fixed" or "demo-random". */
  readonly mode: string;
  readonly source: FigureSource;
  /** Tell usage-ledger where premise's session records can be read. */
  attach(source: SessionSource): void;
  /**
   * Something changed: a session started or ended, or the stream gave a reading of the week. The
   * real ledger labels, feeds and reads what is new soon after, one command at a time.
   */
  nudge(): void;
  /** Start any background work (the real ledger's catch-up of past sessions). */
  start(): void;
  close(): void;
  /** Wait until background work in flight is done. For tests and shutdown. */
  idle(): Promise<void>;
  /** Why figures cannot be read right now, in plain words with what to do; null when they can. */
  problem(): string | null;
  /** The week as the ledger sees it; null when premise's own reading is the week's figure. */
  weeklyUsage(): Promise<WeeklyUsage | null>;
  softwareUsage(softwareId: string): Promise<SoftwareUsage>;
  usageBreakdown(softwareId: string): Promise<UsageBreakdown>;
  /** Set a software's budget; null removes it. premise sets it again each time it starts. */
  setBudget(softwareId: string, budget: Budget | null): Promise<void>;
  /**
   * Where a software stands against its budget. fresh: ask usage-ledger again first (before
   * deciding to pause or resume); otherwise what was last read (for the page).
   */
  budgetStatus(softwareId: string, options?: { fresh?: boolean }): Promise<BudgetStatus>;
}

// ---- Adding figures up, with "not known" kept as such --------------------------------------

/** Figures for no sessions at all. */
export function noFigures(source: FigureSource): UsageFigures {
  return {
    source,
    sessions: 0,
    priced: 0,
    costUsd: null,
    inputTokens: null,
    outputTokens: null,
    cacheTokens: null,
    weeklyShare: null,
    why: null,
    weeklyWhy: null,
  };
}

/** Round a dollar figure to a hundredth of a cent, keeping null. */
export function roundUsd(usd: number | null): number | null {
  return usd === null ? null : Math.round(usd * 10_000) / 10_000;
}
