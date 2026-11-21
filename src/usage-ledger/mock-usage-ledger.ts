import type { UsageLedgerMode } from "../config/settings.js";
import type { SessionTaskRecord, SoftwareUsage, UsageLedger, WeeklyUsage } from "./usage-ledger.js";

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

/**
 * Stands in for usage-ledger until it exists (decision 0133).
 * - "mock-fixed": the same figures every time.
 * - "mock-random": figures drawn from a seed; the same seed gives the same figures.
 * Every result says mocked: true.
 */
export class MockUsageLedger implements UsageLedger {
  readonly mocked = true;
  readonly sessions: SessionTaskRecord[] = [];

  constructor(
    readonly mode: Exclude<UsageLedgerMode, "real">,
    readonly seed: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

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

  softwareUsage(softwareId: string): Promise<SoftwareUsage> {
    if (this.mode === "mock-fixed") {
      return Promise.resolve({
        mocked: true,
        softwareId,
        sessions: 12,
        inputTokens: 480_000,
        outputTokens: 96_000,
        costUsd: 8.4,
        weeklyShare: 0.15,
      });
    }
    const random = seededRandom(this.seed ^ hash(softwareId));
    const sessions = 1 + Math.floor(random() * 40);
    const inputTokens = sessions * (10_000 + Math.floor(random() * 60_000));
    const outputTokens = Math.floor(inputTokens * (0.1 + random() * 0.2));
    return Promise.resolve({
      mocked: true,
      softwareId,
      sessions,
      inputTokens,
      outputTokens,
      costUsd: Math.round((inputTokens * 3 + outputTokens * 15) / 10_000) / 100,
      weeklyShare: Math.round(random() * 1000) / 1000,
    });
  }

  recordSession(record: SessionTaskRecord): Promise<void> {
    this.sessions.push(record);
    return Promise.resolve();
  }
}

/** The usage ledger for the configured mode. "real" is refused by the configuration check. */
export function createUsageLedger(config: {
  mode: UsageLedgerMode;
  seed: number | null;
}): UsageLedger {
  if (config.mode === "real") {
    throw new Error(
      'usage_ledger.mode "real" is not built yet; premise uses a mock of usage-ledger until it exists (decision 0133).',
    );
  }
  const seed = config.seed ?? Math.floor(Math.random() * 2 ** 31);
  return new MockUsageLedger(config.mode, seed);
}
