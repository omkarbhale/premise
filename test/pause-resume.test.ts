import { describe, expect, it } from "vitest";
import { ScriptedAgentRunner, parseScript } from "../src/agents/scripted-agent.js";
import { SuspendWatch } from "../src/queue/suspend-watch.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import type { AskView } from "../src/shared/api-types.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testApp, testConfig } from "./helpers.js";

/**
 * Pausing and resuming the whole of premise (decision 0290), with scripted agents: no AI, no
 * network. A build that hangs stands for a session that is still working.
 */

const hangBuilds = { rules: [{ when: { task: "build" }, end: { outcome: "hang" } }] };

function setup(env: NodeJS.ProcessEnv = {}, folder = tempFolder()) {
  const config = testConfig(folder, env);
  const { db } = openDatabase(folder);
  const runner = new ScriptedAgentRunner(parseScript(hangBuilds));
  const queue = new WorkQueue({ db, config, runner });
  const software = createSoftware(db, { name: "sample" }, config.softwares);
  const other = createSoftware(db, { name: "second" }, config.softwares);
  return { folder, config, db, runner, queue, software, other };
}

describe("pause everything", () => {
  it("'let it finish' starts nothing new, in any software, and leaves running sessions alone", () => {
    const t = setup({ PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    const running = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    t.queue.tick();
    const waiting = t.queue.enqueue({ softwareId: t.other.id, kind: "build" });

    t.queue.pauseEverything("finish");
    expect(t.queue.state()).toMatchObject({ paused: true, cause: "person", mode: "finish" });
    expect(t.queue.get(running)!.status).toBe("running");
    expect(t.queue.tick()).toEqual([]);
    expect(t.queue.get(waiting)!.status).toBe("queued");

    const status = t.queue.pauseStatus();
    expect(status.stillRunning.map((j) => j.id)).toEqual([running]);
    expect(status.safeToClose).toBe(false);
  });

  it("is safe to close once what was running has finished, and nothing starts meanwhile", async () => {
    const t = setup({ PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    const running = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    t.queue.tick();
    const waiting = t.queue.enqueue({ softwareId: t.other.id, kind: "build" });
    t.queue.pauseEverything("finish");

    t.queue.stop(running); // the session ends, as a finished one would
    await t.queue.idle();
    expect(t.queue.get(waiting)!.status).toBe("queued");
    expect(t.queue.runningJobs()).toEqual([]);
    expect(t.queue.pauseStatus().safeToClose).toBe(true);
  });

  it("'stop it now' stops running sessions and puts their jobs back, saying the work is redone", async () => {
    const t = setup();
    const a = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    const b = t.queue.enqueue({ softwareId: t.other.id, kind: "build" });
    t.queue.tick();
    expect(t.queue.runningAgentSessions()).toBe(2);

    t.queue.pauseEverything("stop-now");
    await t.queue.idle();
    for (const id of [a, b]) {
      const job = t.queue.get(id)!;
      expect(job.status).toBe("queued");
      expect(job.note).toContain("unfinished work is redone");
    }
    expect(t.queue.runningAgentSessions()).toBe(0);
    expect(t.queue.tick()).toEqual([]);
    expect(t.queue.pauseStatus().safeToClose).toBe(true);
  });

  it("resume starts the queued work again, and a stopped job's session carries on", async () => {
    const t = setup();
    const a = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    t.queue.tick();
    t.queue.pauseEverything("stop-now");
    await t.queue.idle();

    t.queue.resumeEverything();
    expect(t.queue.state().paused).toBe(false);
    expect(t.queue.get(a)!.status).toBe("running");
    const request = t.runner.requests.at(-1)!;
    expect(request.jobId).toBe(a);
    expect(request.resumeSessionId).toBe(`scripted-${a}-1`);
  });

  it("changes its mind: pausing again with 'stop it now' stops what was left to finish", async () => {
    const t = setup();
    const a = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    t.queue.tick();
    t.queue.pauseEverything("finish");
    expect(t.queue.get(a)!.status).toBe("running");
    t.queue.pauseEverything("stop-now");
    await t.queue.idle();
    expect(t.queue.get(a)!.status).toBe("queued");
    expect(t.queue.state().mode).toBe("stop-now");
  });

  it("a usage limit during a person's pause does not make it end by itself", async () => {
    const t = setup();
    t.queue.pauseEverything("finish");
    t.queue.pauseAll("The subscription's usage limit was reached.", null);
    expect(t.queue.state()).toMatchObject({ cause: "person", resumeAt: null });
  });

  it("the usage-limit pause still ends by itself, and can be resumed early", () => {
    const t = setup();
    t.queue.pauseAll("The subscription's usage limit was reached.", null);
    expect(t.queue.state()).toMatchObject({ paused: true, cause: "usage-limit" });
    expect(t.queue.state().resumeAt).not.toBeNull();
    t.queue.resumeEverything();
    expect(t.queue.state().paused).toBe(false);
  });

  it("questions can be answered while paused, and nothing starts until Resume", async () => {
    const { call, settle, session } = await testApp();
    const started = await call("POST", "/api/softwares", {
      idea: "A small app for my reading list",
    });
    await settle();
    const asks = (await call("GET", `/api/asks?software=${started.body.id}&status=open`))
      .body as AskView[];
    const ask = asks.find((a) => a.kind === "draft")!;

    const paused = await call("POST", "/api/pause", { mode: "finish" });
    expect(paused.body).toMatchObject({ paused: true, cause: "person", safeToClose: true });
    expect(paused.body.headline).toContain("safe to close");

    const answered = await call("POST", `/api/asks/${ask.id}/answer`, {
      answer: { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) },
    });
    expect(answered.status).toBe(200);
    await settle();
    expect(session.queue.runningJobs()).toEqual([]);
    expect(session.queue.list("queued").length).toBeGreaterThan(0);
    const overview = await call("GET", "/api/overview");
    expect(overview.body.pause).toMatchObject({ paused: true });
    expect(overview.body.activity.paused).toBe(true);

    const resumed = await call("POST", "/api/resume");
    expect(resumed.body).toMatchObject({ paused: false });
    await settle();
    expect(session.queue.list("queued")).toEqual([]);
  });

  it("the page's pause call defaults to letting running work finish", async () => {
    const { call } = await testApp();
    const paused = await call("POST", "/api/pause", {});
    expect(paused.body).toMatchObject({ paused: true, mode: "finish" });
    const bad = await call("POST", "/api/pause", { mode: "sideways" });
    expect(bad.status).toBe(422);
  });
});

describe("the paused state survives a restart", () => {
  it("stays paused, and a queue that was not paused resumes as it always did", () => {
    const folder = tempFolder();
    const first = setup({}, folder);
    first.queue.pauseEverything("finish");
    const again = new WorkQueue({ db: first.db, config: first.config, runner: first.runner });
    expect(again.applyStartPolicy(false)).toMatchObject({ paused: true, cause: "person" });
    const job = again.enqueue({ softwareId: first.software.id, kind: "build" });
    expect(again.tick()).toEqual([]);
    expect(again.get(job)!.status).toBe("queued");

    again.resumeEverything();
    const fresh = new WorkQueue({ db: first.db, config: first.config, runner: first.runner });
    expect(fresh.applyStartPolicy(false).paused).toBe(false);
  });

  it("queue.start_paused makes premise always start paused, with its own reason", () => {
    const t = setup({ PREMISE_QUEUE__START_PAUSED: "true" });
    expect(t.config.queue.start_paused).toBe(true);
    const state = t.queue.applyStartPolicy(t.config.queue.start_paused);
    expect(state).toMatchObject({ paused: true, cause: "setting" });
    expect(state.reason).toContain("queue.start_paused");
    const job = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    expect(t.queue.tick()).toEqual([]);
    t.queue.resumeEverything();
    expect(t.queue.get(job)!.status).toBe("running");
  });

  it("a stored pause from before pausing had a cause reads as the person's", () => {
    const t = setup();
    t.db
      .prepare("INSERT INTO settings (key, value, changed) VALUES ('queue.state', ?, ?)")
      .run(JSON.stringify({ paused: true, reason: "old", resumeAt: null }), "2026-11-20T00:00:00Z");
    expect(t.queue.state()).toMatchObject({ paused: true, cause: "person" });
  });
});

describe("the computer slept", () => {
  it("restarts a session that died and leaves the living alone", async () => {
    const t = setup();
    const dead = t.queue.enqueue({ softwareId: t.software.id, kind: "build" });
    const living = t.queue.enqueue({ softwareId: t.other.id, kind: "build" });
    t.queue.tick();
    t.runner.dieSilently(dead);

    const result = t.queue.checkAfterSuspend(3 * 3600_000);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.checked).toBe(2);
    expect(result.restarted.map((j) => j.id)).toEqual([dead]);
    // The dead one went back and started again at once, as a second attempt; the other was left.
    expect(t.queue.get(living)!.attempts).toBe(1);
    expect(t.queue.get(dead)!.attempts).toBe(2);
    expect(t.queue.get(dead)!.status).toBe("running");
    expect(t.queue.get(dead)!.note).toContain("asleep");
  });

  it("says nothing happened when no session was running", () => {
    const t = setup();
    expect(t.queue.checkAfterSuspend(600_000)).toEqual({ checked: 0, restarted: [] });
  });

  it("notices a jump of the clock, not an ordinary tick", () => {
    let now = 1_000_000;
    const heard: number[] = [];
    const watch = new SuspendWatch({
      gapMs: 90_000,
      intervalMs: 5000,
      clock: () => now,
      onSuspend: (ms) => heard.push(ms),
    });
    now += 5000;
    watch.tick();
    now += 20_000; // a slow moment, not sleep
    watch.tick();
    expect(heard).toEqual([]);
    now += 8 * 3600_000;
    watch.tick();
    expect(heard).toEqual([8 * 3600_000]);
    now += 5000;
    watch.tick();
    expect(heard).toHaveLength(1);
  });
});
