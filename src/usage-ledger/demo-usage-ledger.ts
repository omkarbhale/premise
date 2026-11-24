import { type SessionFigure, foldBreakdown, sumFigures } from "./fold.js";
import type {
  Budget,
  BudgetStatus,
  SessionSource,
  SessionTaskRecord,
  SoftwareUsage,
  UsageBreakdown,
  UsageLedger,
  WeeklyUsage,
} from "./usage-ledger.js";

/** A small seeded random number generator (mulberry32): the same seed gives the same figures. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

const DAY = 24 * 60 * 60 * 1000;

/** Made-up list prices in dollars per million tokens, by model tier (input, output). */
const PRICES = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25] } as const;
/** How much more a session uses at a higher effort. */
const EFFORT_FACTOR: Record<string, number> = {
  low: 0.6,
  medium: 1,
  high: 1.6,
  xhigh: 2.2,
  max: 3,
};

export type DemoMode = "demo-fixed" | "demo-random";

export interface DemoOptions {
  /** What a whole week's usage is worth in dollars, in the demo. */
  weeklyAllowanceUsd?: number;
  /** Makes every session cost this many times more (or less): a way to reach an overrun fast. */
  costScale?: number;
  clock?: () => Date;
}

/**
 * Made-up figures for scripted agents, which call no AI and so use nothing (decision 0330; it was
 * the stand-in for usage-ledger before that existed, decision 0133). It works from the session
 * records premise gives it and invents the figures; every one is marked as a demo figure:
 * - "demo-fixed": a session's figures depend only on its model, effort and type of task.
 * - "demo-random": figures also vary by session, drawn from a seed; the same seed gives the same
 *   figures.
 */
export class DemoUsageLedger implements UsageLedger {
  readonly source = "demo" as const;
  private sessionSource: SessionSource = () => [];
  private readonly budgets = new Map<string, Budget>();
  private readonly scripted = new Map<string, number>();
  private readonly allowance: number;
  private readonly scale: number;
  private readonly clock: () => Date;

  constructor(
    readonly mode: DemoMode,
    readonly seed: number,
    options: DemoOptions | (() => Date) = {},
  ) {
    const opts = typeof options === "function" ? { clock: options } : options;
    this.allowance = opts.weeklyAllowanceUsd ?? 100;
    this.scale = opts.costScale ?? 1;
    this.clock = opts.clock ?? (() => new Date());
  }

  attach(source: SessionSource): void {
    this.sessionSource = source;
  }

  nudge(): void {}
  start(): void {}
  close(): void {}
  idle(): Promise<void> {
    return Promise.resolve();
  }
  problem(): string | null {
    return null;
  }

  /**
   * For tests and kept demos: from this many recorded sessions on, report this software's budget as
   * overrun, whatever the figures are (and whether or not a budget is set).
   */
  scriptOverrun(softwareId: string, afterSessions: number): void {
    this.scripted.set(softwareId, afterSessions);
  }

  clearScriptedOverrun(softwareId: string): void {
    this.scripted.delete(softwareId);
  }

  private window(): { windowStart: string; resetsAt: string } {
    // Weeks start on Monday 00:00 UTC in the demo.
    const today = this.clock();
    const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const sinceMonday = (today.getUTCDay() + 6) % 7;
    const start = midnight - sinceMonday * DAY;
    return {
      windowStart: new Date(start).toISOString(),
      resetsAt: new Date(start + 7 * DAY).toISOString(),
    };
  }

  weeklyUsage(): Promise<WeeklyUsage> {
    const utilization =
      this.mode === "demo-fixed" ? 0.42 : Math.round(seededRandom(this.seed)() * 1000) / 1000;
    return Promise.resolve({ source: "demo", utilization, ...this.window() });
  }

  /** What one session used, as the demo invents it. */
  private figure(session: SessionTaskRecord): SessionFigure {
    const tier = /haiku/i.test(session.model)
      ? "haiku"
      : /opus/i.test(session.model)
        ? "opus"
        : "sonnet";
    const [inPrice, outPrice] = PRICES[tier];
    const factor = EFFORT_FACTOR[session.effort] ?? 1;
    const wobble =
      this.mode === "demo-fixed"
        ? 1
        : 0.5 + seededRandom(this.seed ^ hash(session.sessionId || String(session.jobId)))();
    const inputTokens = Math.round((60_000 * factor * wobble * this.scale) / 100) * 100;
    const outputTokens = Math.round((12_000 * factor * wobble * this.scale) / 100) * 100;
    const costUsd = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
    return {
      inputTokens,
      outputTokens,
      cacheTokens: 0,
      costUsd: Math.round(costUsd * 10_000) / 10_000,
      weeklyShare: costUsd / this.allowance,
      why: null,
    };
  }

  private total(sessions: SessionTaskRecord[]): Omit<SoftwareUsage, "softwareId"> {
    return sumFigures(
      "demo",
      sessions.map((s) => ({ figure: this.figure(s), weight: 1, counts: true })),
    );
  }

  softwareUsage(softwareId: string): Promise<SoftwareUsage> {
    return Promise.resolve({ softwareId, ...this.total(this.sessionSource(softwareId)) });
  }

  usageBreakdown(softwareId: string): Promise<UsageBreakdown> {
    const sessions = this.sessionSource(softwareId);
    return Promise.resolve(
      foldBreakdown(
        "demo",
        softwareId,
        sessions.map((session) => ({ session, figure: this.figure(session) })),
        { rowWeeklyWhy: null, total: this.total(sessions) },
      ),
    );
  }

  setBudget(softwareId: string, budget: Budget | null): Promise<void> {
    if (budget) this.budgets.set(softwareId, budget);
    else this.budgets.delete(softwareId);
    return Promise.resolve();
  }

  budgetStatus(softwareId: string): Promise<BudgetStatus> {
    const budget = this.budgets.get(softwareId) ?? null;
    const { windowStart } = this.window();
    const week = this.sessionSource(softwareId).filter((s) => s.started >= windowStart);
    const spent = this.total(week);
    const spentUsd = spent.costUsd ?? 0;
    const spentShare = spent.weeklyShare ?? 0;
    const scriptedAfter = this.scripted.get(softwareId);
    const reached =
      budget === null
        ? false
        : budget.kind === "share"
          ? spentShare * 100 >= budget.percent
          : spentUsd >= budget.usd;
    return Promise.resolve({
      source: "demo",
      softwareId,
      budget,
      checked: true,
      incomplete: false,
      why: null,
      spentUsd,
      spentShare,
      overrun:
        reached ||
        (scriptedAfter !== undefined && this.sessionSource(softwareId).length >= scriptedAfter),
    });
  }
}
