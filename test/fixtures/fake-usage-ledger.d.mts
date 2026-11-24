/** What the fake usage-ledger keeps (test/fixtures/fake-usage-ledger.mjs). */
export interface FakeLedgerState {
  sessions?: Record<string, Record<string, unknown>>;
  fail?: string | null;
  calls?: { args: string[]; input: string | null; logs?: string | null; json?: boolean }[];
  labels?: Record<string, { sessionId: string; task?: string; project?: string }>;
  readings?: { takenAt: string; weeklyPercent: number; resetsAt: string }[];
  budgets?: Record<string, { unit: string; limit: number }>;
}

/** What usage-ledger would answer to one command (without --json): { code, json }. */
export function ledgerAnswer(
  state: FakeLedgerState,
  args: string[],
  input?: string,
): { code: number; json: Record<string, unknown> | null };
