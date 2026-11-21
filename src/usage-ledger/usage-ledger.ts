/**
 * usage-ledger's seam, and the contract usage-ledger will have to meet (docs/specs/usage-ledger.md).
 * premise builds no cost tracking of its own (decision 0064); it records which task each agent
 * session did, and asks usage-ledger what that cost. Until usage-ledger exists, a mock answers, and
 * every figure it gives carries mocked: true so the page can label it (decision 0133).
 */

export interface WeeklyUsage {
  mocked: boolean;
  /** Share of the subscription's seven-day window used, from 0 to 1. */
  utilization: number;
  windowStart: string;
  resetsAt: string;
}

/** What a group of sessions used. Every figure is usage-ledger's, so it carries the mock's mark. */
export interface UsageFigures {
  mocked: boolean;
  inputTokens: number;
  outputTokens: number;
  /** What the usage would cost at list prices, in US dollars. */
  costUsd: number;
  /** What the cost comes to as a share of a week's usage, from 0 up (it can pass 1). */
  weeklyShare: number;
}

export interface SoftwareUsage extends UsageFigures {
  softwareId: string;
  /** How many recorded sessions the figures cover. */
  sessions: number;
}

/**
 * What premise records for every agent session, real or scripted, in the form usage-ledger reads.
 * This is the whole of what premise tells usage-ledger; usage-ledger works the rest out from what
 * the agent runtime recorded for the session id.
 */
export interface SessionTaskRecord {
  /** The agent runtime's own id for the session; premise's own "local-<n>" until it is known. */
  sessionId: string;
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
  mocked: boolean;
  softwareId: string;
  total: SoftwareUsage;
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
  sessions: number;
}

/** Where a software stands against its budget, over the current week. */
export interface BudgetStatus {
  mocked: boolean;
  softwareId: string;
  budget: Budget | null;
  /** What the software used so far this week, in dollars and as a share of the week's usage. */
  spentUsd: number;
  spentShare: number;
  /** True once what was used reaches the budget. usage-ledger decides; premise never works it out. */
  overrun: boolean;
}

export interface UsageLedger {
  readonly mode: string;
  readonly mocked: boolean;
  /** Tell usage-ledger where premise's session records can be read. */
  attach(source: SessionSource): void;
  weeklyUsage(): Promise<WeeklyUsage>;
  softwareUsage(softwareId: string): Promise<SoftwareUsage>;
  usageBreakdown(softwareId: string): Promise<UsageBreakdown>;
  /** Set a software's budget; null removes it. premise sets it again each time it starts. */
  setBudget(softwareId: string, budget: Budget | null): Promise<void>;
  budgetStatus(softwareId: string): Promise<BudgetStatus>;
}
