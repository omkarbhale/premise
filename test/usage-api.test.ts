import { describe, expect, it } from "vitest";
import { ledgerStore } from "../src/storage/ledger-sessions.js";
import { RealUsageLedger } from "../src/usage-ledger/real-usage-ledger.js";
import { type FakeLedgerState, ledgerAnswer } from "./fixtures/fake-usage-ledger.mjs";
import { testApp } from "./helpers.js";

describe("usage and budgets through the page's API", () => {
  it("shows usage per software with every demo figure marked, and premise's own counts", async () => {
    const { call, settle } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await settle();
    const usage = await call("GET", "/api/usage");
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ source: "demo", mode: "demo-fixed", problem: null });
    expect(usage.body.demoWeekly.utilization).toBe(0.42);
    const mine = usage.body.softwares.find((s: { softwareId: string }) => s.softwareId === sw.id);
    expect(mine.total.measured.sessions).toBeGreaterThan(0);
    expect(mine.total.cost.source).toBe("demo");
    expect(mine.budget).toMatchObject({ kind: "none", overrun: null, checked: true });
    const one = await call("GET", `/api/softwares/${sw.id}/usage`);
    expect(one.body.byStage.length).toBeGreaterThan(0);
    expect(
      one.body.byStage.every((r: { cost: { source: string } }) => r.cost.source === "demo"),
    ).toBe(true);
    expect((await call("GET", "/api/softwares/nope/usage")).status).toBe(404);
  });

  it("reads real figures from usage-ledger through the page's API and the report", async () => {
    const state: FakeLedgerState = { sessions: {} };
    const asked = (name: string) => (state.calls ?? []).filter((c) => c.args[0] === name);
    let ledger: RealUsageLedger | null = null;
    const { call, settle, db } = await testApp(
      { PREMISE_USAGE_LEDGER__MODE: "real", PREMISE_USAGE_LEDGER__READ_AFTER_SECONDS: "0" },
      {
        makeLedger: (database) =>
          (ledger = new RealUsageLedger({
            run: (args, input) =>
              Promise.resolve({ ...ledgerAnswer(state, args, input), stderr: "" }),
            store: ledgerStore(database),
            command: "usage-ledger",
            readAfterMs: 0,
            recheckMs: 60_000,
            catchUpDays: 30,
          })),
      },
    );
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await settle();
    await ledger!.sync();
    // Scripted sessions are never labelled or read: they use nothing, and the page says so.
    expect(asked("label")).toEqual([]);
    expect(asked("sessions")).toEqual([]);
    const before = (await call("GET", `/api/softwares/${sw.id}/usage`)).body;
    expect(before.total.cost).toMatchObject({ source: "ledger", costUsd: null });
    expect(before.total.cost.why).toContain("scripted agent, uses nothing");
    // As if one session had been a real one.
    db.prepare(
      "UPDATE agent_sessions SET runtime = 'claude', runtime_session_id = 'real-1' WHERE id = (SELECT MIN(id) FROM agent_sessions)",
    ).run();
    state.sessions!["real-1"] = {
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: { usd: 0.75 },
      weekly: { weeklyPercent: null, reason: "no snapshot after the session ended" },
    };
    const overview = await call("GET", "/api/overview");
    expect(overview.body.usage).toEqual({ mode: "real", source: "ledger", problem: null });
    await ledger!.sync();
    expect(asked("label").map((c) => c.args[1])).toEqual(["real-1"]);
    expect(asked("sessions")).toHaveLength(1);
    const after = (await call("GET", `/api/softwares/${sw.id}/usage`)).body;
    expect(after.total.cost).toMatchObject({ source: "ledger", costUsd: 0.75, priced: 1 });
    // No budget is set, so there is nothing to say about checking one.
    expect(after.budget).toMatchObject({ source: "ledger", checked: false, checkWhy: null });
    // A budget set from the page goes to usage-ledger, which checks it.
    const set = await call("POST", `/api/softwares/${sw.id}/budget`, { kind: "amount", usd: 5 });
    expect(set.status).toBe(200);
    await settle();
    expect(state.budgets).toEqual({ [sw.id]: { unit: "dollars", limit: 5 } });
    const budget = (await call("GET", `/api/softwares/${sw.id}/usage`)).body.budget;
    expect(budget).toMatchObject({ checked: true, incomplete: false, spentUsd: 0.75 });
    const report = (await call("GET", `/api/softwares/${sw.id}/report`)).body;
    expect(report.cost.demo).toBe(false);
    expect(report.cost.text).toContain("about $0.75 at list prices");
    expect(report.cost.text).not.toMatch(/mock|made-up/i);
  });

  it("sets a budget from the page, and refuses nonsense in plain words", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const set = await call("POST", `/api/softwares/${sw.id}/budget`, {
      kind: "share",
      percent: 25,
    });
    expect(set.body).toMatchObject({ kind: "share", percent: 25, words: "25% of a week's usage" });
    const bad = await call("POST", `/api/softwares/${sw.id}/budget`, { kind: "amount", usd: -1 });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toContain("at least 1 cent");
  });

  it("pauses a software that overruns, tells the operator in its report, and takes the three answers", async () => {
    const { call, settle } = await testApp({ PREMISE_USAGE_LEDGER__MOCK_COST_SCALE: "50" });
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await call("POST", `/api/softwares/${sw.id}/budget`, { kind: "amount", usd: 0.5 });
    await settle();

    const detail = await call("GET", `/api/softwares/${sw.id}`);
    expect(detail.body.state).toBe("paused-budget");
    expect(detail.body.status).toContain("Open Usage");

    const report = await call("GET", `/api/softwares/${sw.id}/report`);
    const needed = report.body.sections.find((s: { title: string }) => s.title === "Needed");
    expect(JSON.stringify(needed)).toContain("used up its budget");
    expect(report.body.cost.demo).toBe(true);
    expect(report.body.cost.text).toContain("Budget: $0.50 a week");
    expect(report.body.cost.lines.length).toBeGreaterThan(0);
    for (const line of report.body.cost.lines) {
      expect(line.demo).toBe(true);
      expect(line.measured).toMatch(/agent session/);
    }

    const left = await call("POST", `/api/softwares/${sw.id}/budget/answer`, {
      answer: "leave-paused",
    });
    expect(left.body.overrun.answer).toBe("left-paused");
    const small = await call("POST", `/api/softwares/${sw.id}/budget/answer`, {
      answer: "raise",
      budget: { kind: "amount", usd: 0.6 },
    });
    expect(small.status).toBe(422);
    const raised = await call("POST", `/api/softwares/${sw.id}/budget/answer`, {
      answer: "raise",
      budget: { kind: "amount", usd: 5000 },
    });
    expect(raised.body.overrun).toBeNull();
    expect((await call("GET", `/api/softwares/${sw.id}`)).body.state).toBe("active");
    const nothing = await call("POST", `/api/softwares/${sw.id}/budget/answer`, {
      answer: "leave-paused",
    });
    expect(nothing.status).toBe(422);
  });
});
