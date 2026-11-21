import type { UsageLedgerMode } from "../config/settings.js";
import type {
  Budget,
  BudgetStatus,
  SessionSource,
  SessionTaskRecord,
  SoftwareUsage,
  UsageBreakdown,
  UsageFigures,
  UsageGroup,
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

export interface MockOptions {
  /** What a whole week's usage is worth in dollars, in the mock. */
  weeklyAllowanceUsd?: number;
  /** Makes every session cost this many times more (or less): a way to reach an overrun fast. */
  costScale?: number;
  clock?: () => Date;
}

/**
 * Stands in for usage-ledger until it exists (decision 0133). It works from the session records
 * premise gives it, as the real one will, and invents the figures:
 * - "mock-fixed": a session's figures depend only on its model, effort and type of task.
 * - "mock-random": figures also vary by session, drawn from a seed; the same seed gives the same
 *   figures.
 * Every result says mocked: true.
 */
export class MockUsageLedger implements UsageLedger {
  readonly mocked = true;
  private source: SessionSource = () => [];
  private readonly budgets = new Map<string, Budget>();
  private readonly scripted = new Map<string, number>();
  private readonly allowance: number;
  private readonly scale: number;
  private readonly clock: () => Date;

  constructor(
    readonly mode: Exclude<UsageLedgerMode, "real">,
    readonly seed: number,
    options: MockOptions | (() => Date) = {},
  ) {
    const opts = typeof options === "function" ? { clock: options } : options;
    this.allowance = opts.weeklyAllowanceUsd ?? 100;
    this.scale = opts.costScale ?? 1;
    this.clock = opts.clock ?? (() => new Date());
  }

  attach(source: SessionSource): void {
    this.source = source;
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
    // Weeks start on Monday 00:00 UTC in the mock.
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
      this.mode === "mock-fixed" ? 0.42 : Math.round(seededRandom(this.seed)() * 1000) / 1000;
    return Promise.resolve({ mocked: true, utilization, ...this.window() });
  }

  /** What one session used, as the mock invents it. */
  private figures(session: SessionTaskRecord): UsageFigures {
    const tier = /haiku/i.test(session.model)
      ? "haiku"
      : /opus/i.test(session.model)
        ? "opus"
        : "sonnet";
    const [inPrice, outPrice] = PRICES[tier];
    const factor = EFFORT_FACTOR[session.effort] ?? 1;
    const wobble =
      this.mode === "mock-fixed"
        ? 1
        : 0.5 + seededRandom(this.seed ^ hash(session.sessionId || String(session.jobId)))();
    const inputTokens = Math.round((60_000 * factor * wobble * this.scale) / 100) * 100;
    const outputTokens = Math.round((12_000 * factor * wobble * this.scale) / 100) * 100;
    const costUsd = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
    return {
      mocked: true,
      inputTokens,
      outputTokens,
      costUsd: Math.round(costUsd * 10_000) / 10_000,
      weeklyShare: costUsd / this.allowance,
    };
  }

  private total(figures: UsageFigures[]): UsageFigures {
    const costUsd = figures.reduce((n, f) => n + f.costUsd, 0);
    return {
      mocked: true,
      inputTokens: figures.reduce((n, f) => n + f.inputTokens, 0),
      outputTokens: figures.reduce((n, f) => n + f.outputTokens, 0),
      costUsd: Math.round(costUsd * 10_000) / 10_000,
      weeklyShare: costUsd / this.allowance,
    };
  }

  private group(entries: { key: string; figures: UsageFigures; counts: boolean }[]): UsageGroup[] {
    const groups = new Map<string, { figures: UsageFigures[]; sessions: number }>();
    for (const entry of entries) {
      const at = groups.get(entry.key) ?? { figures: [], sessions: 0 };
      at.figures.push(entry.figures);
      if (entry.counts) at.sessions += 1;
      groups.set(entry.key, at);
    }
    return [...groups.entries()]
      .map(([key, at]) => ({ key, sessions: at.sessions, ...this.total(at.figures) }))
      .sort((a, b) => b.costUsd - a.costUsd || a.key.localeCompare(b.key));
  }

  softwareUsage(softwareId: string): Promise<SoftwareUsage> {
    const sessions = this.source(softwareId);
    return Promise.resolve({
      softwareId,
      sessions: sessions.length,
      ...this.total(sessions.map((s) => this.figures(s))),
    });
  }

  usageBreakdown(softwareId: string): Promise<UsageBreakdown> {
    const sessions = this.source(softwareId);
    const each = sessions.map((session) => ({ session, figures: this.figures(session) }));
    const byItem = each.flatMap(({ session, figures }) => {
      const keys = session.items.length > 0 ? session.items : ["none"];
      return keys.map((key) => ({
        key,
        counts: true,
        figures: {
          mocked: true,
          inputTokens: figures.inputTokens / keys.length,
          outputTokens: figures.outputTokens / keys.length,
          costUsd: figures.costUsd / keys.length,
          weeklyShare: figures.weeklyShare / keys.length,
        },
      }));
    });
    return Promise.resolve({
      mocked: true,
      softwareId,
      total: {
        softwareId,
        sessions: sessions.length,
        ...this.total(each.map((e) => e.figures)),
      },
      byStage: this.group(
        each.map((e) => ({ key: e.session.stage ?? "none", figures: e.figures, counts: true })),
      ),
      byChange: this.group(
        each.map((e) => ({
          key: e.session.workItem === null ? "none" : String(e.session.workItem),
          figures: e.figures,
          counts: true,
        })),
      ),
      byItem: this.group(byItem).map((g) => ({
        ...g,
        inputTokens: Math.round(g.inputTokens),
        outputTokens: Math.round(g.outputTokens),
      })),
    });
  }

  setBudget(softwareId: string, budget: Budget | null): Promise<void> {
    if (budget) this.budgets.set(softwareId, budget);
    else this.budgets.delete(softwareId);
    return Promise.resolve();
  }

  budgetStatus(softwareId: string): Promise<BudgetStatus> {
    const budget = this.budgets.get(softwareId) ?? null;
    const { windowStart } = this.window();
    const week = this.source(softwareId).filter((s) => s.started >= windowStart);
    const spent = this.total(week.map((s) => this.figures(s)));
    const scriptedAfter = this.scripted.get(softwareId);
    const reached =
      budget === null
        ? false
        : budget.kind === "share"
          ? spent.weeklyShare * 100 >= budget.percent
          : spent.costUsd >= budget.usd;
    return Promise.resolve({
      mocked: true,
      softwareId,
      budget,
      spentUsd: spent.costUsd,
      spentShare: spent.weeklyShare,
      overrun:
        reached || (scriptedAfter !== undefined && this.source(softwareId).length >= scriptedAfter),
    });
  }
}

/** The usage ledger for the configured mode. "real" is refused by the configuration check. */
export function createUsageLedger(config: {
  mode: UsageLedgerMode;
  seed: number | null;
  mock_weekly_allowance_usd?: number;
  mock_cost_scale?: number;
}): UsageLedger {
  if (config.mode === "real") {
    throw new Error(
      'usage_ledger.mode "real" is not built yet; premise uses a mock of usage-ledger until it exists (decision 0133).',
    );
  }
  const seed = config.seed ?? Math.floor(Math.random() * 2 ** 31);
  return new MockUsageLedger(config.mode, seed, {
    ...(config.mock_weekly_allowance_usd !== undefined && {
      weeklyAllowanceUsd: config.mock_weekly_allowance_usd,
    }),
    ...(config.mock_cost_scale !== undefined && { costScale: config.mock_cost_scale }),
  });
}
