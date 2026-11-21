import { describe, expect, it } from "vitest";
import { MockUsageLedger, createUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";
import type { SessionTaskRecord } from "../src/usage-ledger/usage-ledger.js";

const clock = () => new Date("2026-11-21T10:00:00Z"); // a Saturday

const session = (n: number, over: Partial<SessionTaskRecord> = {}): SessionTaskRecord => ({
  sessionId: `s${n}`,
  softwareId: "x",
  workItem: 1,
  stage: "build",
  taskKind: "build",
  items: ["W-1"],
  model: "sonnet",
  effort: "medium",
  started: "2026-11-21T09:00:00.000Z",
  ended: "2026-11-21T09:05:00.000Z",
  jobId: n,
  ...over,
});

function ledgerWith(
  mode: "mock-fixed" | "mock-random",
  seed: number,
  sessions: SessionTaskRecord[],
  options = {},
) {
  const ledger = new MockUsageLedger(mode, seed, { clock, ...options });
  ledger.attach((id) => sessions.filter((s) => !id || s.softwareId === id));
  return ledger;
}

describe("usage-ledger mock", () => {
  it("gives the same figures every time in mock-fixed mode, each marked mocked", async () => {
    const sessions = [session(1), session(2, { stage: "check", taskKind: "check" })];
    const a = await ledgerWith("mock-fixed", 1, sessions).usageBreakdown("x");
    const b = await ledgerWith("mock-fixed", 2, sessions).usageBreakdown("x");
    expect(a).toEqual(b);
    expect(a.mocked).toBe(true);
    expect(a.total.mocked).toBe(true);
    expect([...a.byStage, ...a.byChange, ...a.byItem].every((g) => g.mocked)).toBe(true);
    expect(await ledgerWith("mock-fixed", 1, []).weeklyUsage()).toEqual({
      mocked: true,
      utilization: 0.42,
      windowStart: "2026-11-16T00:00:00.000Z",
      resetsAt: "2026-11-23T00:00:00.000Z",
    });
  });

  it("gives seeded random figures: the same seed gives the same figures", async () => {
    const sessions = [session(1), session(2)];
    const one = await ledgerWith("mock-random", 42, sessions).softwareUsage("x");
    const again = await ledgerWith("mock-random", 42, sessions).softwareUsage("x");
    const other = await ledgerWith("mock-random", 43, sessions).softwareUsage("x");
    expect(one).toEqual(again);
    expect(one).not.toEqual(other);
    expect(one.mocked).toBe(true);
  });

  it("groups by stage, change and item, each adding up to the total", async () => {
    const sessions = [
      session(1),
      session(2, { stage: "check", taskKind: "check", items: ["W-1", "W-2"], workItem: 2 }),
      session(3, { stage: null, taskKind: "triage", items: [], workItem: null }),
    ];
    const usage = await ledgerWith("mock-fixed", 1, sessions).usageBreakdown("x");
    const sum = (groups: { costUsd: number }[]) =>
      Math.round(groups.reduce((n, g) => n + g.costUsd, 0) * 10_000) / 10_000;
    expect(usage.byStage.map((g) => g.key).sort()).toEqual(["build", "check", "none"]);
    expect(usage.byChange.map((g) => g.key).sort()).toEqual(["1", "2", "none"]);
    expect(usage.byItem.map((g) => g.key).sort()).toEqual(["W-1", "W-2", "none"]);
    expect(sum(usage.byStage)).toBeCloseTo(usage.total.costUsd, 3);
    expect(sum(usage.byChange)).toBeCloseTo(usage.total.costUsd, 3);
    expect(sum(usage.byItem)).toBeCloseTo(usage.total.costUsd, 3);
    expect(usage.total.sessions).toBe(3);
  });

  it("costs more at a higher effort and on a stronger model", async () => {
    const cost = async (over: Partial<SessionTaskRecord>) =>
      (await ledgerWith("mock-fixed", 1, [session(1, over)]).softwareUsage("x")).costUsd;
    expect(await cost({ effort: "high" })).toBeGreaterThan(await cost({ effort: "low" }));
    expect(await cost({ model: "opus" })).toBeGreaterThan(await cost({ model: "haiku" }));
  });

  it("reports a budget overrun once the week's use reaches it, as an amount or a share", async () => {
    const sessions = [session(1), session(2)];
    const ledger = ledgerWith("mock-fixed", 1, sessions);
    const spent = (await ledger.softwareUsage("x")).costUsd;
    await ledger.setBudget("x", { kind: "amount", usd: spent + 1 });
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
    await ledger.setBudget("x", { kind: "amount", usd: spent });
    expect((await ledger.budgetStatus("x")).overrun).toBe(true);
    await ledger.setBudget("x", { kind: "share", percent: 1 });
    expect((await ledger.budgetStatus("x")).overrun).toBe(false); // about 0.7% of a $100 week
    await ledger.setBudget("x", null);
    expect((await ledger.budgetStatus("x")).budget).toBeNull();
  });

  it("only counts this week's sessions against a budget", async () => {
    const old = session(1, { started: "2026-11-10T09:00:00.000Z" });
    const ledger = ledgerWith("mock-fixed", 1, [old]);
    await ledger.setBudget("x", { kind: "amount", usd: 0.01 });
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
    expect((await ledger.softwareUsage("x")).sessions).toBe(1);
  });

  it("can script an overrun for tests and demos, after a number of sessions", async () => {
    const sessions: SessionTaskRecord[] = [session(1)];
    const ledger = ledgerWith("mock-fixed", 1, sessions);
    ledger.scriptOverrun("x", 2);
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
    sessions.push(session(2));
    expect((await ledger.budgetStatus("x")).overrun).toBe(true);
    ledger.clearScriptedOverrun("x");
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
  });

  it("scales the mock's costs from the settings, so an overrun is quick to reach", async () => {
    const plain = await ledgerWith("mock-fixed", 1, [session(1)]).softwareUsage("x");
    const scaled = await ledgerWith("mock-fixed", 1, [session(1)], {
      costScale: 10,
    }).softwareUsage("x");
    expect(scaled.costUsd).toBeCloseTo(plain.costUsd * 10, 2);
  });

  it("refuses the real usage-ledger, which is not built yet", () => {
    expect(() =>
      createUsageLedger({
        mode: "real",
        seed: null,
        mock_weekly_allowance_usd: 100,
        mock_cost_scale: 1,
      }),
    ).toThrow("not built yet");
    expect(
      createUsageLedger({
        mode: "mock-random",
        seed: null,
        mock_weekly_allowance_usd: 100,
        mock_cost_scale: 1,
      }).mocked,
    ).toBe(true);
  });
});
