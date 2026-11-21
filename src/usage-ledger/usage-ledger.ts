/**
 * usage-ledger's seam. premise builds no cost tracking of its own (decision 0064); it asks
 * usage-ledger. Until usage-ledger exists, a mock answers, and every figure it gives carries
 * mocked: true so the page can label it (decision 0133).
 */

export interface WeeklyUsage {
  mocked: boolean;
  /** Share of the subscription's seven-day window used, from 0 to 1. */
  utilization: number;
  windowStart: string;
  resetsAt: string;
}

export interface SoftwareUsage {
  mocked: boolean;
  softwareId: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  /** What the usage would cost at list prices, in US dollars. */
  costUsd: number;
  /** Share of the week's usage this software took, from 0 to 1. */
  weeklyShare: number;
}

/** What premise records for every agent session, so usage-ledger can attribute it. */
export interface SessionTaskRecord {
  sessionId: string;
  softwareId: string;
  jobId: number;
  taskKind: string;
  stage: string | null;
  items: string[];
}

export interface UsageLedger {
  readonly mode: string;
  readonly mocked: boolean;
  weeklyUsage(): Promise<WeeklyUsage>;
  softwareUsage(softwareId: string): Promise<SoftwareUsage>;
  recordSession(record: SessionTaskRecord): Promise<void>;
}
