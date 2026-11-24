import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentOutcome, AgentRunner, WindowReading } from "../src/agents/agent-runner.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { listChatMessages } from "../src/storage/chat.js";
import { openDatabase } from "../src/storage/database.js";
import { ledgerStore } from "../src/storage/ledger-sessions.js";
import { createSoftware, getSoftware, setSoftwareState } from "../src/storage/softwares.js";
import { readSessionTasks } from "../src/usage/session-tasks.js";
import { Usage } from "../src/usage/usage.js";
import { createUsageLedger } from "../src/usage-ledger/create.js";
import { type LedgerRun, LedgerCommandError } from "../src/usage-ledger/ledger-command.js";
import { RealUsageLedger, taskLabel } from "../src/usage-ledger/real-usage-ledger.js";
import { type FakeLedgerState, ledgerAnswer } from "./fixtures/fake-usage-ledger.mjs";
import { tempFolder, testConfig } from "./helpers.js";

/**
 * The real usage-ledger (decision 0330), against a usage-ledger that answers as the real command
 * does (test/fixtures/fake-usage-ledger.mjs, after usage-ledger's docs/orchestrator.md). No test
 * runs the real command or reads Claude Code's logs.
 */

const FAKE_LEDGER = join(import.meta.dirname, "fixtures", "fake-usage-ledger.mjs");

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const RESETS = inDays(3);

/** One session as usage-ledger's `sessions --json` lists it. */
const answer = (usd: number | null, weeklyPercent: number | null = null) => ({
  start: inDays(-0.01),
  end: inDays(0.01),
  inputTokens: 76,
  outputTokens: 29_908,
  cacheCreationTokens: 94_001,
  cacheReadTokens: 2_519_001,
  totalTokens: 2_642_986,
  models: ["claude-opus-5-5"],
  cost:
    usd === null
      ? { status: "unknown", estimated: true, usd: null, source: "ccusage" }
      : { status: "estimated", estimated: true, usd, source: "ccusage" },
  weekly: {
    status: weeklyPercent === null ? "unknown" : "overlapping",
    estimated: true,
    weeklyPercent,
    reason: weeklyPercent === null ? "no snapshot after the session ended" : null,
  },
});

/** An in-memory usage-ledger: the fake's answers, without a process; it can be made to break. */
function fakeLedger(sessions: FakeLedgerState["sessions"] = {}) {
  const state: FakeLedgerState = { sessions };
  let broken: LedgerCommandError | null = null;
  const run: LedgerRun = (args, input) => {
    if (broken) return Promise.reject(broken);
    return Promise.resolve({ ...ledgerAnswer(state, args, input), stderr: "" });
  };
  return {
    run,
    state,
    calls: () => state.calls ?? [],
    names: () => (state.calls ?? []).map((c) => c.args.slice(0, 2).join(" ")),
    break: (error: LedgerCommandError | null) => {
      broken = error;
    },
  };
}

/** A runner whose sessions end with what they are given, each with its own id. */
function runnerOf(outcomes: (AgentOutcome & { id?: string })[], runtime = "claude"): AgentRunner {
  let n = 0;
  return {
    runtime,
    start: () => {
      const next = outcomes.shift() ?? { kind: "done", summary: "ok" };
      n += 1;
      return {
        sessionId: next.id ?? `session-${n}`,
        runtime,
        outcome: Promise.resolve(next),
        stop: () => {},
      };
    },
  };
}

const reading = (usedPercent: number, minutesAgo = 5): WindowReading => ({
  window: "seven_day",
  usedPercent,
  resetsAt: RESETS,
  status: "allowed",
  readAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
});

function setup(
  outcomes: (AgentOutcome & { id?: string })[],
  answers: FakeLedgerState["sessions"] = {},
  runtime?: string,
) {
  const folder = tempFolder();
  const config = testConfig(folder);
  const { db } = openDatabase(folder);
  const fake = fakeLedger(answers);
  const ledger = new RealUsageLedger({
    run: fake.run,
    store: ledgerStore(db),
    command: "usage-ledger",
    readAfterMs: 0,
    recheckMs: 60_000,
    catchUpDays: 30,
  });
  const usage = new Usage({ db, config, ledger });
  const queue = new WorkQueue({ db, config, runner: runnerOf(outcomes, runtime) });
  const software = createSoftware(db, { name: "sample" }, config.softwares);
  const runAll = async () => {
    for (let i = 0; i < 10; i++) {
      queue.tick();
      await queue.idle();
    }
  };
  return { db, config, ledger, usage, queue, software, fake, runAll };
}

describe("the real usage-ledger", () => {
  it("labels each session, gives it the week's readings, and reads every ended session in one listing", async () => {
    const first = reading(20, 30);
    const { ledger, usage, queue, software, fake, runAll } = setup(
      [
        { id: "aaa-1", kind: "done", summary: "ok", windows: [first, reading(21, 10)] },
        { id: "bbb-2", kind: "done", summary: "ok" },
      ],
      { "aaa-1": answer(1.854272, 0.4), "bbb-2": answer(0.25) },
    );
    queue.enqueue({
      softwareId: software.id,
      kind: "build",
      stage: "build",
      items: ["W-1", "W-2"],
      payload: { item: 7 },
    });
    await runAll();
    queue.enqueue({ softwareId: software.id, kind: "check", stage: "check", payload: { item: 7 } });
    await runAll();
    await ledger.sync();

    // Each reading by hand, at the time it was read, then one when the session ended.
    const readings = fake.calls().filter((c) => c.args[0] === "reading");
    expect(readings.map((c) => c.args[2])).toEqual(["20", "21", "21"]);
    expect(readings[0]!.args).toEqual([
      "reading",
      "--percent",
      "20",
      "--resets-at",
      RESETS,
      "--at",
      first.readAt,
    ]);
    expect(fake.calls().find((c) => c.args[0] === "label" && c.args[1] === "aaa-1")!.args).toEqual([
      "label",
      "aaa-1",
      "--task",
      `${software.id}|build|7|W-1,W-2`,
      `--project=${software.id}`,
    ]);
    // Both sessions read in one listing, then this week's totals.
    expect(fake.names().filter((n) => n.startsWith("sessions"))).toHaveLength(1);
    expect(fake.names().at(-1)).toBe("report --week");
    expect(fake.names()).not.toContain("budgets");

    const view = await usage.view(software.id);
    expect(view.problem).toBeNull();
    expect(view.total.cost).toMatchObject({
      source: "ledger",
      sessions: 2,
      priced: 2,
      costUsd: 2.1043,
      inputTokens: 152,
      why: null,
    });
    // This week's share comes from usage-ledger's week report: at least, with one not known.
    expect(view.total.cost.weeklyShare).toBeCloseTo(0.004, 6);
    expect(view.total.cost.weeklyWhy).toContain("1 session not known yet, so it is at least this");
    for (const row of [...view.byPhase, ...view.byStage, ...view.byChange, ...view.byItem]) {
      expect(row.cost.weeklyShare).toBeNull();
      expect(row.cost.weeklyWhy).toContain("too coarse");
    }
    // A session on two items shares its cost between them.
    expect(view.byItem.find((r) => r.key === "W-1")!.cost.costUsd).toBeCloseTo(0.9271, 4);
    expect(view.budget).toMatchObject({ spentUsd: 2.104272, checked: false, checkWhy: null });

    // Asking again with nothing new runs nothing.
    const before = fake.calls().length;
    await ledger.sync();
    expect(fake.calls().length).toBe(before);
  });

  it("sets each software's budget in usage-ledger and pauses only when usage-ledger says it is used up", async () => {
    const { db, usage, queue, software, fake, runAll } = setup(
      [{ id: "s-1", kind: "done", summary: "ok" }],
      { "s-1": answer(2) },
    );
    queue.enqueue({ softwareId: software.id, kind: "build", stage: "build" });
    await runAll();
    await usage.setBudget(software.id, { kind: "amount", usd: 5 });
    await usage.idle();
    expect(fake.state.budgets).toEqual({ [software.id]: { unit: "dollars", limit: 5 } });
    expect(getSoftware(db, software.id)!.state).toBe("active");
    expect((await usage.budgetView(software.id)).checked).toBe(true);

    // Used up at the limit: usage-ledger says so, premise pauses and says what was spent.
    await usage.setBudget(software.id, { kind: "amount", usd: 2 });
    await usage.idle();
    expect(getSoftware(db, software.id)!.state).toBe("paused-budget");
    const paused = await usage.budgetView(software.id);
    expect(paused.overrun).toMatchObject({ madeUp: false, spentUsd: 2 });
    expect(paused.overrun!.message).toContain(
      "used up its budget of $2.00 a week, at list prices: $2.00 so far",
    );

    // A share of the week goes to usage-ledger as percent, replacing the dollars. The session's
    // share is not known, so the budget is incomplete: never used up by itself, so the software
    // resumes, and premise says what could not be counted.
    await usage.setBudget(software.id, { kind: "share", percent: 50 });
    await usage.idle();
    expect(fake.state.budgets).toEqual({ [software.id]: { unit: "percent", limit: 50 } });
    expect(getSoftware(db, software.id)!.state).toBe("active");
    const incomplete = await usage.budgetView(software.id);
    expect(incomplete).toMatchObject({ checked: true, incomplete: true });
    expect(incomplete.checkWhy).toContain("could not count one session this week");
    expect(incomplete.checkWhy).toContain("work carries on");

    // No budget: removed from usage-ledger.
    await usage.setBudget(software.id, { kind: "none" });
    await usage.idle();
    expect(fake.state.budgets).toEqual({});
  });

  it("says why a session has no figure: scripted, not in the logs, or not priced", async () => {
    const scripted = setup([{ kind: "done", summary: "ok" }], {}, "scripted");
    scripted.queue.enqueue({ softwareId: scripted.software.id, kind: "build", stage: "build" });
    await scripted.runAll();
    await scripted.ledger.sync();
    expect(scripted.fake.names()).toEqual(["report --week"]);
    expect((await scripted.usage.view(scripted.software.id)).total.cost).toMatchObject({
      costUsd: null,
      priced: 0,
      why: "no cost for 1 session: scripted agent, uses nothing",
    });

    const { ledger, usage, queue, software, runAll } = setup(
      [
        { id: "gone-1", kind: "done", summary: "ok" },
        { id: "free-2", kind: "done", summary: "ok" },
        { id: "paid-3", kind: "done", summary: "ok" },
      ],
      { "free-2": answer(null), "paid-3": answer(0.5) },
    );
    for (let i = 0; i < 3; i++) queue.enqueue({ softwareId: software.id, kind: "build" });
    await runAll();
    await ledger.sync();
    const total = (await usage.view(software.id)).total.cost;
    expect(total).toMatchObject({ sessions: 3, priced: 1, costUsd: 0.5 });
    expect(total.why).toContain("1 session: not in Claude Code's logs");
    expect(total.why).toContain("1 session: usage-ledger has no price for it");
  });

  it("counts a session carried on after a pause once, under its first leg", async () => {
    const { db, ledger, usage, queue, software, fake, runAll } = setup(
      [
        { id: "resumed-1", kind: "usage-limit", resetAt: null },
        { id: "resumed-1", kind: "done", summary: "ok" },
      ],
      { "resumed-1": answer(1) },
    );
    queue.enqueue({ softwareId: software.id, kind: "build", stage: "build" });
    await runAll();
    queue.resumeAll();
    await runAll();
    await ledger.sync();
    expect(readSessionTasks(db, software.id)).toHaveLength(2);
    expect(fake.names().filter((n) => n.startsWith("label"))).toHaveLength(1);
    expect((await usage.view(software.id)).total.cost).toMatchObject({
      sessions: 1,
      priced: 1,
      costUsd: 1,
    });
  });

  it("carries on when usage-ledger cannot be run, never pauses on it, and says what to do", async () => {
    const { db, ledger, usage, queue, software, fake, runAll } = setup(
      [{ id: "s-1", kind: "done", summary: "ok" }],
      { "s-1": answer(0.3) },
    );
    fake.break(new LedgerCommandError('"usage-ledger" was not found', "missing"));
    queue.enqueue({ softwareId: software.id, kind: "build", stage: "build" });
    await runAll();
    await usage.setBudget(software.id, { kind: "amount", usd: 0.01 });
    await usage.idle();
    const view = await usage.view(software.id);
    expect(view.problem).toContain('"usage-ledger" was not found');
    expect(view.problem).toContain("usage_ledger.command");
    expect(view.problem).toContain("Agent work carries on");
    expect(view.total.cost).toMatchObject({
      costUsd: null,
      why: "no cost for 1 session: usage-ledger could not be read",
    });
    expect(view.budget).toMatchObject({ checked: false });
    expect(view.budget.checkWhy).toContain("could not be read");
    expect(getSoftware(db, software.id)!.state).toBe("active");
    // Once it can be run again, the next round reads what was missed and checks the budget.
    fake.break(null);
    await ledger.sync();
    expect(ledger.problem()).toBeNull();
    expect((await usage.view(software.id)).total.cost.costUsd).toBe(0.3);
    await usage.check(software.id);
    expect(getSoftware(db, software.id)!.state).toBe("paused-budget");
  });

  it("says to update an older usage-ledger that lacks a command premise needs", async () => {
    const { ledger, queue, software, fake, runAll } = setup(
      [{ id: "s-1", kind: "done", summary: "ok", windows: [reading(5)] }],
      {},
    );
    queue.enqueue({ softwareId: software.id, kind: "build" });
    await runAll();
    const old: LedgerRun = (args, input) =>
      args[0] === "reading"
        ? Promise.resolve({
            code: 2,
            json: { error: { code: "usage", message: "Unknown command reading." } },
            stderr: "",
          })
        : fake.run(args, input);
    (ledger as unknown as { options: { run: LedgerRun } }).options.run = old;
    await ledger.sync();
    expect(ledger.problem()).toContain('does not know "reading"');
    expect(ledger.problem()).toContain("update usage-ledger");
  });

  it("resumes a software paused on made-up figures once usage-ledger says it is within, unless left paused", async () => {
    const { db, usage, software } = setup([]);
    const pauseOnMock = (answer: string | null) => {
      db.prepare(
        "INSERT INTO budget_overruns (software_id, time, budget, spent, answer) VALUES (?, ?, ?, ?, ?)",
      ).run(
        software.id,
        new Date().toISOString(),
        JSON.stringify({ kind: "amount", usd: 1 }),
        JSON.stringify({ spentUsd: 2, mocked: true, byStage: [], byChange: [] }),
        answer,
      );
      setSoftwareState(db, software.id, "paused-budget", "its budget is used up");
    };
    db.prepare("UPDATE softwares SET budget_usd = 1 WHERE id = ?").run(software.id);
    await usage.start();
    pauseOnMock("left-paused");
    await usage.check(software.id);
    expect(getSoftware(db, software.id)!.state).toBe("paused-budget");
    pauseOnMock(null);
    // The notice for the old pause still says its figure was made up.
    expect((await usage.budgetView(software.id)).overrun).toMatchObject({ madeUp: true });
    await usage.check(software.id);
    expect(getSoftware(db, software.id)!.state).toBe("active");
    expect(listChatMessages(db, software.id).at(-1)!.text).toContain("made-up figures");
    usage.close();
  });

  it("catches up on past sessions within the window, and leaves older ones", async () => {
    const { db, ledger, software, fake } = setup([], { "new-1": answer(0.1), "old-2": answer(9) });
    // Sessions recorded before this start, as a past premise kept them.
    const session = (id: string, daysAgo: number) => {
      const job = db
        .prepare(
          "INSERT INTO jobs (software_id, kind, status, created) VALUES (?, 'build', 'done', ?)",
        )
        .run(software.id, inDays(-daysAgo));
      db.prepare(
        `INSERT INTO agent_sessions (runtime_session_id, job_id, agent_role, runtime, model, effort, started, ended)
         VALUES (?, ?, 'build', 'claude', 'opus', 'medium', ?, ?)`,
      ).run(id, Number(job.lastInsertRowid), inDays(-daysAgo), inDays(-daysAgo));
    };
    session("old-2", 40);
    session("new-1", 2);
    await ledger.sync();
    expect(fake.names()).toEqual(["label new-1", "sessions --since", "report --week"]);
    const since = fake.calls()[1]!.args[2]!;
    expect(Date.parse(since)).toBeLessThan(Date.parse(inDays(-2)));
    expect(Date.parse(since)).toBeGreaterThan(Date.parse(inDays(-3)));
  });

  it("keeps task labels within what usage-ledger accepts", () => {
    const label = taskLabel({
      sessionId: "x",
      runtime: "claude",
      softwareId: "sw",
      workItem: null,
      stage: null,
      taskKind: "triage",
      items: Array.from({ length: 80 }, (_, i) => `W-${i}`),
      model: "opus",
      effort: "low",
      started: "",
      ended: null,
      jobId: 1,
    });
    expect(label.length).toBeLessThanOrEqual(200);
    expect(label.startsWith("sw|-|-|W-0,W-1")).toBe(true);
    expect(label).not.toMatch(/\n/);
  });

  it("runs the command itself, with no shell, its database and Claude Code's log folder set", async () => {
    const folder = tempFolder();
    const state = join(folder, "ledger.json");
    writeFileSync(state, JSON.stringify({ sessions: { "real-1": answer(0.42) } }));
    const config = testConfig(folder);
    config.agents.mode = "claude";
    config.agents.claude_config_folder = join(folder, "claude");
    config.usage_ledger.command = FAKE_LEDGER;
    config.usage_ledger.database = state;
    config.usage_ledger.read_after_seconds = 0;
    const { db } = openDatabase(folder);
    const ledger = createUsageLedger(config, { store: ledgerStore(db) }) as RealUsageLedger;
    const usage = new Usage({ db, config, ledger });
    const queue = new WorkQueue({
      db,
      config,
      runner: runnerOf([{ id: "real-1", kind: "done", summary: "ok", windows: [reading(12)] }]),
    });
    const software = createSoftware(db, { name: "sample" }, config.softwares);
    queue.enqueue({ softwareId: software.id, kind: "build", stage: "build" });
    queue.tick();
    await queue.idle();
    await usage.setBudget(software.id, { kind: "amount", usd: 10 });
    await usage.idle();
    const kept = JSON.parse(readFileSync(state, "utf8")) as FakeLedgerState;
    expect(kept.calls!.every((c) => c.json === true)).toBe(true);
    expect(kept.calls!.every((c) => c.logs === join(folder, "claude"))).toBe(true);
    expect(kept.labels!["real-1"]!.task).toBe(`${software.id}|build|-|-`);
    expect(kept.readings!.map((r) => r.weeklyPercent)).toEqual([12, 12]);
    expect(kept.budgets).toEqual({ [software.id]: { unit: "dollars", limit: 10 } });
    const view = await usage.view(software.id);
    expect(view.total.cost.costUsd).toBe(0.42);
    expect(view.budget).toMatchObject({ checked: true, incomplete: false, spentUsd: 0.42 });

    // A command that is not there: said plainly, with what to do.
    config.usage_ledger.command = join(folder, "no-such-usage-ledger");
    const missing = createUsageLedger(config, { store: ledgerStore(db) }) as RealUsageLedger;
    missing.attach(() => readSessionTasks(db));
    db.prepare("DELETE FROM ledger_sessions").run();
    await missing.sync();
    expect(missing.problem()).toContain("was not found");
    expect(missing.problem()).toContain("usage_ledger.command");
  });
});
