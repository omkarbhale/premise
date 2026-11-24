import { describe, expect, it } from "vitest";
import type { AgentOutcome, AgentRunner } from "../src/agents/agent-runner.js";
import { runDemo } from "../src/demo/demos.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { ageWords, ownFiguresWords } from "../src/shared/own-figures.js";
import { openDatabase } from "../src/storage/database.js";
import { readOwnSessions, readWeeklyWindow } from "../src/storage/session-figures.js";
import { createSoftware } from "../src/storage/softwares.js";
import { Usage, ownFiguresOf } from "../src/usage/usage.js";
import { DemoUsageLedger } from "../src/usage-ledger/demo-usage-ledger.js";
import { testApp, tempFolder, testConfig, uniquePortRange } from "./helpers.js";

/**
 * premise's own cost and attention figures (decision 0270): the figures each real session's result
 * carries, the usage window as the stream last reported it, and every job naming the change it
 * served. Real figures are shown beside the mocked ledger's and never marked as mocked; where a
 * session gave none (scripted agents), that is said, never counted as zero.
 */

/** A runner whose sessions end as it is told, with the figures a real session would carry. */
function runnerEnding(outcome: AgentOutcome, runtime = "claude"): AgentRunner {
  return {
    runtime,
    start: () => ({
      sessionId: "session-1",
      runtime,
      outcome: Promise.resolve(outcome),
      stop: () => {},
    }),
  };
}

function setup(outcome: AgentOutcome, runtime?: string) {
  const folder = tempFolder();
  const config = testConfig(folder);
  const { db } = openDatabase(folder);
  const queue = new WorkQueue({ db, config, runner: runnerEnding(outcome, runtime) });
  const software = createSoftware(db, { name: "sample" }, config.softwares);
  return { db, queue, software, config };
}

const FIGURES = {
  turns: 4,
  costUsd: 0.5,
  inputTokens: 10,
  outputTokens: 200,
  cacheReadTokens: 3000,
  cacheWriteTokens: 500,
};

describe("premise's own count of what sessions used", () => {
  it("records each real session's figures, and the weekly window as last read", async () => {
    const { db, queue, software } = setup({
      kind: "done",
      summary: "ok",
      figures: FIGURES,
      windows: [
        {
          window: "seven_day",
          usedPercent: 2,
          resetsAt: "2026-11-30T00:00:00.000Z",
          status: "allowed",
          readAt: new Date().toISOString(),
        },
      ],
    });
    queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.idle();
    const [own] = readOwnSessions(db, software.id);
    expect(own).toEqual({ runtime: "claude", figures: FIGURES });
    const window = readWeeklyWindow(db);
    expect(window).toMatchObject({ usedPercent: 2, status: "allowed" });
    expect(Date.now() - Date.parse(window!.readAt)).toBeLessThan(60_000);
    expect(db.prepare("SELECT turns FROM agent_sessions").get()).toEqual({ turns: 4 });
  });

  it("keeps no figures for a session that gave none, and never counts it as zero", async () => {
    const { db, queue, software } = setup({ kind: "done", summary: "ok" }, "scripted");
    queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.idle();
    const sessions = readOwnSessions(db, software.id);
    expect(sessions).toEqual([{ runtime: "scripted", figures: null }]);
    expect(readWeeklyWindow(db)).toBeNull();
    const counted = ownFiguresOf(sessions);
    expect(counted).toMatchObject({
      counted: 0,
      missing: 1,
      missingWhy: "scripted agents report no figures",
    });
    expect(ownFiguresWords(counted)).toBe(
      "No figures for 1 session: scripted agents report no figures.",
    );
  });

  it("adds up counted sessions and says plainly how many gave none", () => {
    const figures = ownFiguresOf([
      { runtime: "claude", figures: FIGURES },
      { runtime: "claude", figures: { ...FIGURES, turns: 2, costUsd: 0.25 } },
      { runtime: "claude", figures: null },
    ]);
    expect(figures).toMatchObject({
      counted: 2,
      missing: 1,
      costUsd: 0.75,
      turns: 6,
      inputTokens: 20,
      outputTokens: 400,
      cacheTokens: 7000,
      missingWhy: "these sessions ended without a result, so they reported none",
    });
    expect(ownFiguresWords(figures)).toBe(
      "$0.75 at list prices, 7.4k tokens, 6 turns (from 2 sessions); no figures for 1 session: these sessions ended without a result, so they reported none.",
    );
    expect(ownFiguresWords(ownFiguresOf([]))).toBe("No sessions yet.");
  });

  it("never shows a figure a result left out as zero", () => {
    const bare = {
      turns: null,
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    };
    const none = ownFiguresOf([{ runtime: "claude", figures: bare }]);
    expect(ownFiguresWords(none)).toBe(
      "cost not reported, tokens not reported, turns not reported (from 1 session).",
    );
    const some = ownFiguresOf([
      { runtime: "claude", figures: FIGURES },
      { runtime: "claude", figures: { ...bare, turns: 1 } },
    ]);
    expect(ownFiguresWords(some)).toBe(
      "$0.50 at list prices, 3.7k tokens, 5 turns; cost not reported by 1 session, tokens not reported by 1 session (from 2 sessions).",
    );
  });

  it("says how old a reading is in plain words", () => {
    const at = new Date("2026-11-23T12:00:00Z");
    expect(ageWords("2026-11-23T11:59:30Z", at)).toBe("just now");
    expect(ageWords("2026-11-23T11:30:00Z", at)).toBe("30 minutes ago");
    expect(ageWords("2026-11-23T07:00:00Z", at)).toBe("5 hours ago");
    expect(ageWords("2026-11-20T12:00:00Z", at)).toBe("3 days ago");
  });

  it("shows them first, apart from the demo ledger's figures, per software, stage and change", async () => {
    const { db, queue, software, config } = setup({
      kind: "done",
      summary: "ok",
      figures: FIGURES,
      windows: [
        {
          window: "seven_day",
          usedPercent: 3,
          resetsAt: null,
          status: "allowed",
          readAt: new Date().toISOString(),
        },
      ],
    });
    const job = queue.enqueue({ softwareId: software.id, kind: "build", stage: "build" });
    queue.tick();
    await queue.idle();
    const usage = new Usage({ db, config, ledger: new DemoUsageLedger("demo-fixed", 1) });
    const overview = await usage.overview();
    expect(job).toBeGreaterThan(0);
    // The reading as the stream last reported it, with when it was read.
    expect(overview.ownWindow).toMatchObject({ usedPercent: 3, status: "allowed" });
    expect(typeof overview.ownWindow!.readAt).toBe("string");
    const view = overview.softwares[0]!;
    expect(view.total.measured.figures).toMatchObject({ counted: 1, missing: 0, costUsd: 0.5 });
    expect(view.byStage[0]!.measured.figures).toMatchObject({ counted: 1, costUsd: 0.5 });
    expect(view.byPhase[0]!.measured.figures).toMatchObject({ counted: 1 });
    // The demo's figures say so; premise's own real figure carries no such mark.
    expect(view.total.cost.source).toBe("demo");
    expect(view.total.measured).not.toHaveProperty("source");
  });

  it("reports no window reading before any real session has reported one", async () => {
    const { db, config } = setup({ kind: "done", summary: "ok" }, "scripted");
    const usage = new Usage({ db, config, ledger: new DemoUsageLedger("demo-fixed", 1) });
    expect((await usage.overview()).ownWindow).toBeNull();
  });

  it("carries the figures to the page's API and into the report, real figure first", async () => {
    const { call, settle, db } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await settle();
    // Scripted agents report none: the page says so rather than showing zero.
    const first = (await call("GET", `/api/softwares/${sw.id}/usage`)).body;
    expect(first.total.measured.figures).toMatchObject({ counted: 0 });
    expect(first.total.measured.figures.missing).toBe(first.total.measured.sessions);
    expect(first.total.measured.figures.missingWhy).toContain("scripted agents");
    // Give the first session figures, as a real one would.
    db.prepare(
      "UPDATE agent_sessions SET figures = ? WHERE id = (SELECT MIN(id) FROM agent_sessions)",
    ).run(JSON.stringify(FIGURES));
    const after = (await call("GET", `/api/softwares/${sw.id}/usage`)).body;
    expect(after.total.measured.figures).toMatchObject({ counted: 1, costUsd: 0.5 });
    const report = (await call("GET", `/api/softwares/${sw.id}/report`)).body;
    expect(report.cost.own).toMatch(/^premise's own count: \$0\.50 at list prices/);
    expect(report.cost.lines[0].measured).toContain("premise's own count:");
    expect(report.cost.demo).toBe(true);
  });

  it("keeps the tokens of a leg cut off without a result, so a session carried on loses none", async () => {
    // First leg: paused for the usage limit, so no result; its messages' tokens were kept.
    const legs: AgentOutcome[] = [
      {
        kind: "usage-limit",
        resetAt: null,
        figures: {
          fromStream: true,
          turns: 3,
          costUsd: null,
          inputTokens: 56,
          outputTokens: 15_136,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      { kind: "done", summary: "ok", figures: { ...FIGURES, inputTokens: 6, outputTokens: 210 } },
    ];
    const folder = tempFolder();
    const config = testConfig(folder);
    const { db } = openDatabase(folder);
    const runner: AgentRunner = {
      runtime: "claude",
      start: () => ({
        sessionId: "carried-on",
        runtime: "claude",
        outcome: Promise.resolve(legs.shift()!),
        stop: () => {},
      }),
    };
    const queue = new WorkQueue({ db, config, runner });
    const software = createSoftware(db, { name: "sample" }, config.softwares);
    queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.idle();
    queue.resumeAll();
    queue.tick();
    await queue.idle();
    const sessions = readOwnSessions(db, software.id);
    expect(sessions).toHaveLength(2);
    const both = ownFiguresOf(sessions);
    expect(both).toMatchObject({ counted: 2, inputTokens: 62, outputTokens: 15_346 });
    // The cut-off leg has no cost; it is said, not added as zero.
    expect(both.unreported.cost).toBe(1);
    expect(both.costUsd).toBe(0.5);
  });
});

describe("every job names the change it served", () => {
  it("gives scenario, build, check and run jobs their work item and milestone", async () => {
    const { range } = await uniquePortRange(20);
    const result = await runDemo("cli", {
      dataFolder: tempFolder(),
      confinement: "none",
      portRange: range,
    });
    expect(result.build).not.toBeNull();
    // Every session of the finished run is attributed to a change; none is "not part of a change"
    // for want of a work item, as in the first real run.
    expect(result.usage.byChange.length).toBeGreaterThan(0);
    expect(result.usage.byChange.map((r) => r.key)).not.toContain("none");
  }, 90_000);
});
