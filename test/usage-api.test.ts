import { describe, expect, it } from "vitest";
import { testApp } from "./helpers.js";

describe("usage and budgets through the page's API", () => {
  it("shows usage per software with every ledger figure marked mocked, and premise's own counts", async () => {
    const { call, settle } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await settle();
    const usage = await call("GET", "/api/usage");
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ mocked: true, mode: "mock-fixed" });
    expect(usage.body.weekly.mocked).toBe(true);
    const mine = usage.body.softwares.find((s: { softwareId: string }) => s.softwareId === sw.id);
    expect(mine.total.measured.sessions).toBeGreaterThan(0);
    expect(mine.total.cost.mocked).toBe(true);
    expect(mine.budget).toMatchObject({ kind: "none", overrun: null });
    const one = await call("GET", `/api/softwares/${sw.id}/usage`);
    expect(one.body.byStage.length).toBeGreaterThan(0);
    expect(one.body.byStage.every((r: { cost: { mocked: boolean } }) => r.cost.mocked)).toBe(true);
    expect((await call("GET", "/api/softwares/nope/usage")).status).toBe(404);
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
    expect(bad.body.error).toContain("number of dollars more than 0");
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
    expect(report.body.cost.mocked).toBe(true);
    expect(report.body.cost.text).toContain("Budget: $0.50 a week");
    expect(report.body.cost.lines.length).toBeGreaterThan(0);
    for (const line of report.body.cost.lines) {
      expect(line.mocked).toBe(true);
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
