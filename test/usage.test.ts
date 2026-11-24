import { describe, expect, it } from "vitest";
import { ScriptedAgentRunner, parseScript } from "../src/agents/scripted-agent.js";
import { createWorkItem, rootItem } from "../src/line/work-items.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { type Database, openDatabase } from "../src/storage/database.js";
import { listChatMessages } from "../src/storage/chat.js";
import { createSoftware, getSoftware } from "../src/storage/softwares.js";
import { readSessionTasks } from "../src/usage/session-tasks.js";
import { Usage } from "../src/usage/usage.js";
import { DemoUsageLedger } from "../src/usage-ledger/demo-usage-ledger.js";
import { tempFolder, testConfig } from "./helpers.js";

/** Queue, budgets and the mock ledger together, with scripted agents that finish at once. */
function setup(folder = tempFolder(), env: NodeJS.ProcessEnv = {}, db?: Database) {
  const config = testConfig(folder, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1", ...env });
  const database = db ?? openDatabase(folder).db;
  const ledger = new DemoUsageLedger("demo-fixed", 1);
  const usage = new Usage({ db: database, config, ledger });
  const runner = new ScriptedAgentRunner(parseScript({ rules: [] }));
  const queue = new WorkQueue({
    db: database,
    config,
    runner,
    budgets: usage,
    onChange: (job) => usage.jobChanged(job),
  });
  usage.onSettled = () => queue.tick();
  const software = (name: string, priority = 3) =>
    createSoftware(database, { name, priority }, config.softwares);
  const build = (softwareId: string, item: number, items = ["W-1"], stage = "build") =>
    queue.enqueue({ softwareId, kind: "build", stage, items, payload: { item } });
  const settle = async () => {
    for (let i = 0; i < 30; i++) {
      queue.tick();
      await queue.idle();
      await usage.idle();
    }
  };
  return { folder, config, db: database, ledger, usage, queue, software, build, settle };
}

const statusOf = (queue: WorkQueue, id: number) => queue.get(id)!.status;

describe("what premise records for every session", () => {
  it("records software, work item, stage, type of task, model, effort, start and end", async () => {
    const { db, queue, software, build, settle } = setup();
    const sw = software("sample");
    const item = rootItem(db, sw.id).id;
    build(sw.id, item, ["W-1", "W-2"]);
    await settle();
    expect(queue.list("done")).toHaveLength(1);
    const [record] = readSessionTasks(db, sw.id);
    expect(record).toMatchObject({
      softwareId: sw.id,
      workItem: item,
      stage: "build",
      taskKind: "build",
      items: ["W-1", "W-2"],
      model: "opus",
      effort: "medium",
    });
    expect(record!.sessionId).not.toBe("");
    expect(Date.parse(record!.started)).toBeLessThanOrEqual(Date.parse(record!.ended!));
  });
});

describe("usage per software, phase, stage, change and item", () => {
  it("shows premise's own counts beside figures that are each marked as demo figures", async () => {
    const { db, usage, software, build, settle } = setup();
    const sw = software("sample");
    const first = rootItem(db, sw.id).id;
    build(sw.id, first, ["W-1"], "build");
    build(sw.id, first, ["W-1", "W-2"], "check");
    await settle();
    const view = await usage.view(sw.id);
    expect(view.total.measured.sessions).toBe(2);
    expect(view.total.cost.source).toBe("demo");
    for (const rows of [view.byPhase, view.byStage, view.byChange, view.byItem]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.cost.source === "demo")).toBe(true);
      expect(rows.every((r) => typeof r.measured.sessions === "number")).toBe(true);
    }
    expect(view.byStage.map((r) => r.label).sort()).toEqual(["Build", "Check"]);
    expect(view.byPhase.map((r) => r.label)).toEqual(["Build"]);
    expect(view.byChange).toHaveLength(1);
    expect(view.byChange[0]!.label).toBe("sample, from the idea");
    expect(view.byItem.map((r) => r.key).sort()).toEqual(["W-1", "W-2"]);
    // Sessions that worked on an item are counted in full; the cost is shared among its items.
    expect(view.byItem.find((r) => r.key === "W-1")!.measured.sessions).toBe(2);
    const stageSum = view.byStage.reduce((n, r) => n + (r.cost.costUsd ?? 0), 0);
    expect(stageSum).toBeCloseTo(view.total.cost.costUsd!, 3);
  });
});

describe("a budget overrun", () => {
  it("pauses one software's queue while another keeps running, and says what was spent on what", async () => {
    const { db, usage, queue, ledger, software, build, settle } = setup();
    const small = software("small budget", 1);
    const other = software("no budget", 2);
    await usage.setBudget(small.id, { kind: "amount", usd: 0.01 });
    const smallItem = rootItem(db, small.id).id;
    const otherItem = rootItem(db, other.id).id;
    const smallJobs = [1, 2, 3].map(() => build(small.id, smallItem));
    const otherJobs = [1, 2, 3].map(() => build(other.id, otherItem));
    await settle();

    expect(getSoftware(db, small.id)!.state).toBe("paused-budget");
    expect(getSoftware(db, other.id)!.state).toBe("active");
    // The first session of the small budget ran, then its queue stopped.
    expect(smallJobs.map((id) => statusOf(queue, id))).toEqual(["done", "queued", "queued"]);
    expect(otherJobs.map((id) => statusOf(queue, id))).toEqual(["done", "done", "done"]);

    const view = await usage.budgetView(small.id);
    expect(view.overrun).toMatchObject({ answer: null, madeUp: true, canFinish: true });
    expect(view.overrun!.message).toContain("used up its budget of $0.01 a week");
    expect(view.overrun!.message).toContain("(a made-up figure)");
    expect(view.overrun!.message).toContain("Other softwares carry on");
    expect(view.overrun!.spentByStage[0]).toMatchObject({ label: "Build", sessions: 1 });
    expect(view.overrun!.spentByChange).toHaveLength(1);
    expect((await usage.budgetView(other.id)).overrun).toBeNull();
    expect(ledger.source).toBe("demo");
  });

  it("answer 1: raising the budget starts the paused work again", async () => {
    const { db, usage, queue, software, build, settle } = setup();
    const sw = software("sample");
    await usage.setBudget(sw.id, { kind: "amount", usd: 0.01 });
    const item = rootItem(db, sw.id).id;
    const jobs = [1, 2].map(() => build(sw.id, item));
    await settle();
    expect(jobs.map((id) => statusOf(queue, id))).toEqual(["done", "queued"]);

    // Not enough: it stays paused, with the old budget, and says why.
    await expect(
      usage.answer(sw.id, { answer: "raise", budget: { kind: "amount", usd: 0.02 } }),
    ).rejects.toThrow("not more than");
    expect(getSoftware(db, sw.id)!.budgetUsd).toBe(0.01);
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");

    await usage.answer(sw.id, { answer: "raise", budget: { kind: "amount", usd: 50 } });
    expect(getSoftware(db, sw.id)!.state).toBe("active");
    await settle();
    expect(statusOf(queue, jobs[1]!)).toBe("done");
    expect((await usage.budgetView(sw.id)).overrun).toBeNull();
  });

  it("answer 2: letting it finish the current change runs that change and then stops again", async () => {
    const { db, usage, queue, software, build, settle } = setup();
    const sw = software("sample");
    const rootId = rootItem(db, sw.id).id;
    const part = createWorkItem(db, {
      softwareId: sw.id,
      parentId: rootId,
      kind: "milestone",
      origin: "plan",
      title: "Second milestone",
    }).id;
    await usage.setBudget(sw.id, { kind: "amount", usd: 0.01 });
    const first = build(sw.id, part); // overruns the budget; the second job is queued behind it
    const second = build(sw.id, part, ["M-2"], "check");
    const elsewhere = build(sw.id, rootId, ["W-1"], "build");
    queue.tick();
    await queue.idle();
    await usage.idle();
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
    expect(statusOf(queue, first)).toBe("done");

    const answered = await usage.answer(sw.id, { answer: "finish-change" });
    expect(answered.overrun).toMatchObject({
      answer: "finish-change",
      finishing: "Second milestone",
    });
    await settle();
    expect(statusOf(queue, second)).toBe("done");
    // Other work of this software stays paused.
    expect(statusOf(queue, elsewhere)).toBe("queued");
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
  });

  it("answer 2 says so when nothing is being worked on", async () => {
    const { db, usage, software, build, settle } = setup();
    const sw = software("sample");
    await usage.setBudget(sw.id, { kind: "amount", usd: 0.01 });
    build(sw.id, rootItem(db, sw.id).id);
    await settle();
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
    await expect(usage.answer(sw.id, { answer: "finish-change" })).rejects.toThrow(
      "Nothing is being worked on",
    );
  });

  it("answer 3: leaving it paused keeps it paused, and the answer is kept", async () => {
    const { db, usage, queue, software, build, settle } = setup();
    const sw = software("sample");
    await usage.setBudget(sw.id, { kind: "amount", usd: 0.01 });
    const item = rootItem(db, sw.id).id;
    const jobs = [1, 2].map(() => build(sw.id, item));
    await settle();
    const view = await usage.answer(sw.id, { answer: "leave-paused" });
    expect(view.overrun).toMatchObject({ answer: "left-paused" });
    expect(view.overrun!.message).toContain("You chose to leave it paused");
    await settle();
    expect(statusOf(queue, jobs[1]!)).toBe("queued");
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
  });

  it("resumes by itself when the week resets and it is within budget again", async () => {
    const { db, ledger, usage, queue, software, build, settle } = setup();
    const sw = software("sample");
    ledger.scriptOverrun(sw.id, 1);
    const item = rootItem(db, sw.id).id;
    build(sw.id, item);
    const waiting = build(sw.id, item);
    await settle();
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
    expect(statusOf(queue, waiting)).toBe("queued");

    ledger.clearScriptedOverrun(sw.id);
    await usage.checkAll();
    await settle();
    expect(getSoftware(db, sw.id)!.state).toBe("active");
    expect(statusOf(queue, waiting)).toBe("done");
    expect(listChatMessages(db, sw.id).map((m) => m.text)).toContain(
      "The week reset; sample is within its budget again and has resumed",
    );
  });

  it("stays paused through a reset when the operator chose to leave it paused", async () => {
    const { db, ledger, usage, queue, software, build, settle } = setup();
    const sw = software("sample");
    ledger.scriptOverrun(sw.id, 1);
    const item = rootItem(db, sw.id).id;
    build(sw.id, item);
    const waiting = build(sw.id, item);
    await settle();
    await usage.answer(sw.id, { answer: "leave-paused" });

    ledger.clearScriptedOverrun(sw.id);
    await usage.checkAll();
    await settle();
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
    expect(statusOf(queue, waiting)).toBe("queued");
  });

  it("stays paused over a restart, and the operator can still answer", async () => {
    const first = setup();
    const sw = first.software("sample");
    await first.usage.setBudget(sw.id, { kind: "share", percent: 1 });
    // A share of the (mock) week: make every session cost enough to pass it.
    first.ledger.scriptOverrun(sw.id, 1);
    const item = rootItem(first.db, sw.id).id;
    first.build(sw.id, item);
    const second = first.build(sw.id, item);
    await first.settle();
    expect(getSoftware(first.db, sw.id)!.state).toBe("paused-budget");
    expect(statusOf(first.queue, second)).toBe("queued");
    await first.queue.close();
    first.db.close();

    // premise starts again on the same data folder.
    const { db } = openDatabase(first.folder);
    const again = setup(first.folder, {}, db);
    again.ledger.scriptOverrun(sw.id, 1);
    await again.usage.start();
    again.queue.recover();
    again.queue.tick();
    await again.queue.idle();
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
    expect(statusOf(again.queue, second)).toBe("queued");
    const view = await again.usage.budgetView(sw.id);
    expect(view.overrun).toMatchObject({ answer: null });
    expect(view.percent).toBe(1);

    again.ledger.clearScriptedOverrun(sw.id);
    await again.usage.answer(sw.id, { answer: "raise", budget: { kind: "share", percent: 80 } });
    await again.settle();
    expect(statusOf(again.queue, second)).toBe("done");
  });

  it("can be scripted in the mock, for a software with no budget set", async () => {
    const { db, usage, ledger, software, build, queue, settle } = setup();
    const sw = software("sample");
    ledger.scriptOverrun(sw.id, 2);
    const item = rootItem(db, sw.id).id;
    const jobs = [1, 2, 3].map(() => build(sw.id, item));
    await settle();
    expect(jobs.map((id) => statusOf(queue, id))).toEqual(["done", "done", "queued"]);
    expect((await usage.budgetView(sw.id)).overrun!.message).toContain("used up its budget:");
  });

  it("does not stop work when usage-ledger cannot be read, and says so", async () => {
    const { db, usage, ledger, software, build, queue, settle } = setup();
    const sw = software("sample");
    ledger.budgetStatus = () => Promise.reject(new Error("usage-ledger did not answer"));
    ledger.usageBreakdown = () => Promise.reject(new Error("usage-ledger did not answer"));
    const job = build(sw.id, rootItem(db, sw.id).id);
    await settle();
    expect(statusOf(queue, job)).toBe("done");
    expect(getSoftware(db, sw.id)!.state).toBe("active");
    const view = await usage.view(sw.id);
    expect(view.problem).toContain("could not be read");
    expect(view.problem).toContain("turn and time limits");
  });
});

describe("setting a budget", () => {
  it("takes a share of weekly usage or an amount, and says it in plain words", async () => {
    const { usage, software } = setup();
    const sw = software("sample");
    expect((await usage.budgetView(sw.id)).words).toContain("No budget");
    expect((await usage.setBudget(sw.id, { kind: "share", percent: 20 })).words).toBe(
      "20% of a week's usage",
    );
    expect((await usage.setBudget(sw.id, { kind: "amount", usd: 5 })).words).toBe(
      "$5.00 a week, at list prices",
    );
    expect(getSoftwareShare(usage, sw.id)).toBeNull(); // setting an amount clears the share
    expect((await usage.setBudget(sw.id, { kind: "none" })).kind).toBe("none");
  });

  it("refuses a budget that makes no sense, saying what to enter", async () => {
    const { usage, software } = setup();
    const sw = software("sample");
    await expect(usage.setBudget(sw.id, { kind: "share", percent: 0 })).rejects.toThrow(
      "whole number from 1 to 100",
    );
    await expect(usage.setBudget(sw.id, { kind: "amount", usd: -3 })).rejects.toThrow("1 cent");
    await expect(usage.setBudget(sw.id, { kind: "amount", usd: 0.004 })).rejects.toThrow("1 cent");
  });

  it("takes the default budget from the settings", () => {
    const { db, config } = setup(tempFolder(), {
      PREMISE_SOFTWARES__DEFAULT_WEEKLY_BUDGET_USD: "7.5",
    });
    const sw = createSoftware(db, { name: "x" }, config.softwares);
    expect(sw.budgetUsd).toBe(7.5);
  });
});

function getSoftwareShare(usage: Usage, id: string): number | null {
  const db = (usage as unknown as { options: { db: Database } }).options.db;
  return getSoftware(db, id)!.weeklySharePercent;
}

describe("concurrent checks", () => {
  it("record a single overrun when several checks race for the same software", async () => {
    const { db, usage, software, build, settle } = setup();
    const sw = software("racy");
    await usage.setBudget(sw.id, { kind: "amount", usd: 0.01 });
    build(sw.id, rootItem(db, sw.id).id);
    await settle();
    // Put it back as it was just before the pause, then let three checks race.
    db.prepare("DELETE FROM budget_overruns WHERE software_id = ?").run(sw.id);
    db.prepare("DELETE FROM events WHERE software_id = ? AND kind = 'budget-overrun'").run(sw.id);
    db.prepare("UPDATE softwares SET state = 'active' WHERE id = ?").run(sw.id);
    await Promise.all([usage.check(sw.id), usage.check(sw.id), usage.check(sw.id)]);
    const count = (sql: string) => (db.prepare(sql).get(sw.id) as { n: number }).n;
    expect(getSoftware(db, sw.id)!.state).toBe("paused-budget");
    expect(count("SELECT COUNT(*) AS n FROM budget_overruns WHERE software_id = ?")).toBe(1);
    expect(
      count("SELECT COUNT(*) AS n FROM events WHERE software_id = ? AND kind = 'budget-overrun'"),
    ).toBe(1);
  });
});
