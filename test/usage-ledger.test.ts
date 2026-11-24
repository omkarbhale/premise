import { describe, expect, it } from "vitest";
import { DemoUsageLedger } from "../src/usage-ledger/demo-usage-ledger.js";
import { createUsageLedger, ledgerMode } from "../src/usage-ledger/create.js";
import type { LedgerStore } from "../src/usage-ledger/real-usage-ledger.js";
import type { SessionTaskRecord, UsageGroup } from "../src/usage-ledger/usage-ledger.js";
import { loadConfig } from "../src/config/load.js";
import { tempFolder } from "./helpers.js";

const clock = () => new Date("2026-11-21T10:00:00Z"); // a Saturday

const session = (n: number, over: Partial<SessionTaskRecord> = {}): SessionTaskRecord => ({
  sessionId: `s${n}`,
  runtime: "scripted",
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
  mode: "demo-fixed" | "demo-random",
  seed: number,
  sessions: SessionTaskRecord[],
  options = {},
) {
  const ledger = new DemoUsageLedger(mode, seed, { clock, ...options });
  ledger.attach((id?: string) => sessions.filter((s) => !id || s.softwareId === id));
  return ledger;
}

const cost = (g: { costUsd: number | null }): number => g.costUsd ?? Number.NaN;

describe("demo figures, for scripted agents", () => {
  it("gives the same figures every time in demo-fixed mode, each marked as demo", async () => {
    const sessions = [session(1), session(2, { stage: "check", taskKind: "check" })];
    const a = await ledgerWith("demo-fixed", 1, sessions).usageBreakdown("x");
    const b = await ledgerWith("demo-fixed", 2, sessions).usageBreakdown("x");
    expect(a).toEqual(b);
    expect(a.source).toBe("demo");
    expect(a.total.source).toBe("demo");
    const groups: UsageGroup[] = [...a.byPhase, ...a.byStage, ...a.byChange, ...a.byItem];
    expect(groups.every((g) => g.source === "demo")).toBe(true);
    expect(await ledgerWith("demo-fixed", 1, []).weeklyUsage()).toEqual({
      source: "demo",
      utilization: 0.42,
      windowStart: "2026-11-16T00:00:00.000Z",
      resetsAt: "2026-11-23T00:00:00.000Z",
    });
  });

  it("gives seeded random figures: the same seed gives the same figures", async () => {
    const sessions = [session(1), session(2)];
    const one = await ledgerWith("demo-random", 42, sessions).softwareUsage("x");
    const again = await ledgerWith("demo-random", 42, sessions).softwareUsage("x");
    const other = await ledgerWith("demo-random", 43, sessions).softwareUsage("x");
    expect(one).toEqual(again);
    expect(one).not.toEqual(other);
    expect(one.source).toBe("demo");
  });

  it("groups by phase, stage, change and item, each adding up to the total", async () => {
    const sessions = [
      session(1),
      session(2, { stage: "check", taskKind: "check", items: ["W-1", "W-2"], workItem: 2 }),
      session(3, { stage: null, taskKind: "triage", items: [], workItem: null }),
      session(4, { stage: "why", taskKind: "draft", items: [] }),
    ];
    const usage = await ledgerWith("demo-fixed", 1, sessions).usageBreakdown("x");
    const sum = (groups: { costUsd: number | null }[]) =>
      Math.round(groups.reduce((n, g) => n + cost(g), 0) * 10_000) / 10_000;
    expect(usage.byPhase.map((g) => g.key).sort()).toEqual(["build", "none", "understand"]);
    expect(usage.byStage.map((g) => g.key).sort()).toEqual(["build", "check", "none", "why"]);
    expect(usage.byChange.map((g) => g.key).sort()).toEqual(["1", "2", "none"]);
    expect(usage.byItem.map((g) => g.key).sort()).toEqual(["W-1", "W-2", "none"]);
    for (const groups of [usage.byPhase, usage.byStage, usage.byChange, usage.byItem]) {
      expect(sum(groups)).toBeCloseTo(cost(usage.total), 3);
    }
    expect(usage.total.sessions).toBe(4);
    expect(usage.total.priced).toBe(4);
    expect(usage.total.why).toBeNull();
  });

  it("costs more at a higher effort and on a stronger model", async () => {
    const of = async (over: Partial<SessionTaskRecord>) =>
      cost(await ledgerWith("demo-fixed", 1, [session(1, over)]).softwareUsage("x"));
    expect(await of({ effort: "high" })).toBeGreaterThan(await of({ effort: "low" }));
    expect(await of({ model: "opus" })).toBeGreaterThan(await of({ model: "haiku" }));
  });

  it("reports a budget overrun once the week's use reaches it, as an amount or a share", async () => {
    const sessions = [session(1), session(2)];
    const ledger = ledgerWith("demo-fixed", 1, sessions);
    const spent = cost(await ledger.softwareUsage("x"));
    await ledger.setBudget("x", { kind: "amount", usd: spent + 1 });
    expect(await ledger.budgetStatus("x")).toMatchObject({ checked: true, overrun: false });
    await ledger.setBudget("x", { kind: "amount", usd: spent });
    expect((await ledger.budgetStatus("x")).overrun).toBe(true);
    await ledger.setBudget("x", { kind: "share", percent: 1 });
    expect((await ledger.budgetStatus("x")).overrun).toBe(false); // about 0.7% of a $100 week
    await ledger.setBudget("x", null);
    expect((await ledger.budgetStatus("x")).budget).toBeNull();
  });

  it("only counts this week's sessions against a budget", async () => {
    const old = session(1, { started: "2026-11-10T09:00:00.000Z" });
    const ledger = ledgerWith("demo-fixed", 1, [old]);
    await ledger.setBudget("x", { kind: "amount", usd: 0.01 });
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
    expect((await ledger.softwareUsage("x")).sessions).toBe(1);
  });

  it("can script an overrun for tests and demos, after a number of sessions", async () => {
    const sessions: SessionTaskRecord[] = [session(1)];
    const ledger = ledgerWith("demo-fixed", 1, sessions);
    ledger.scriptOverrun("x", 2);
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
    sessions.push(session(2));
    expect((await ledger.budgetStatus("x")).overrun).toBe(true);
    ledger.clearScriptedOverrun("x");
    expect((await ledger.budgetStatus("x")).overrun).toBe(false);
  });

  it("scales the demo's costs from the settings, so an overrun is quick to reach", async () => {
    const plain = await ledgerWith("demo-fixed", 1, [session(1)]).softwareUsage("x");
    const scaled = await ledgerWith("demo-fixed", 1, [session(1)], {
      costScale: 10,
    }).softwareUsage("x");
    expect(cost(scaled)).toBeCloseTo(cost(plain) * 10, 2);
  });
});

describe("which figures premise uses", () => {
  const config = (env: Record<string, string>) => loadConfig({ dataFolder: tempFolder(), env });
  const store = {} as LedgerStore;

  it("reads usage-ledger for real agents and uses demo figures only for scripted ones", () => {
    expect(ledgerMode(config({}))).toBe("real");
    expect(ledgerMode(config({ PREMISE_AGENTS__MODE: "scripted" }))).toBe("demo-fixed");
    // A demo mode, old name or new, never makes up figures for real agents.
    expect(ledgerMode(config({ PREMISE_USAGE_LEDGER__MODE: "mock-fixed" }))).toBe("real");
    expect(
      ledgerMode(
        config({ PREMISE_AGENTS__MODE: "scripted", PREMISE_USAGE_LEDGER__MODE: "mock-random" }),
      ),
    ).toBe("demo-random");
    // "real" reads usage-ledger even for scripted agents (which then have no figures).
    expect(
      ledgerMode(config({ PREMISE_AGENTS__MODE: "scripted", PREMISE_USAGE_LEDGER__MODE: "real" })),
    ).toBe("real");
    expect(createUsageLedger(config({}), { store }).source).toBe("ledger");
    expect(createUsageLedger(config({ PREMISE_AGENTS__MODE: "scripted" }), { store }).source).toBe(
      "demo",
    );
  });
});
