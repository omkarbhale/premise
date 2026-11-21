import { describe, expect, it } from "vitest";
import { ScriptedAgentRunner, parseScript } from "../src/agents/scripted-agent.js";
import type { PremiseConfig } from "../src/config/settings.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { type Database, openDatabase } from "../src/storage/database.js";
import { createSoftware, setSoftwareState } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

function setup(script: unknown = { rules: [] }, env: NodeJS.ProcessEnv = {}, clock?: () => Date) {
  const folder = tempFolder();
  const config = testConfig(folder, env);
  const { db } = openDatabase(folder);
  const runner = new ScriptedAgentRunner(parseScript(script));
  const queue = new WorkQueue({ db, config, runner, ...(clock ? { clock } : {}) });
  const software = createSoftware(db, { name: "sample" }, config.softwares);
  return { folder, config, db, runner, queue, software };
}

const hangBuilds = { rules: [{ when: { task: "build" }, end: { outcome: "hang" } }] };

describe("work queue", () => {
  it("stops a running server job and ignores its late result", async () => {
    const folder = tempFolder();
    const config = testConfig(folder);
    const { db } = openDatabase(folder);
    let release!: () => void;
    const queue = new WorkQueue({
      db,
      config,
      runner: new ScriptedAgentRunner(parseScript({ rules: [] })),
      serverJobs: () =>
        new Promise((resolve) => {
          release = () => resolve({ kind: "done", summary: "late" });
        }),
    });
    const software = createSoftware(db, { name: "sample" }, config.softwares);
    const id = queue.enqueue({ softwareId: software.id, kind: "run" });
    queue.tick();
    expect(queue.get(id)!.status).toBe("running");
    queue.stop(id);
    expect(queue.get(id)!.status).toBe("stopped");
    release();
    await queue.idle();
    expect(queue.get(id)!.status).toBe("stopped");
  });

  it("runs at most queue.max_agent_sessions agent sessions at once", () => {
    const { queue, software } = setup(hangBuilds);
    const ids = [1, 2, 3].map(() => queue.enqueue({ softwareId: software.id, kind: "build" }));
    expect(queue.tick()).toEqual(ids.slice(0, 2));
    expect(queue.runningAgentSessions()).toBe(2);
    expect(queue.get(ids[2]!)!.status).toBe("queued");
  });

  it("honours a different limit from the settings", () => {
    const { queue, software } = setup(hangBuilds, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "3" });
    [1, 2, 3, 4].forEach(() => queue.enqueue({ softwareId: software.id, kind: "build" }));
    expect(queue.tick()).toHaveLength(3);
  });

  it("starts the most important software's job first", () => {
    const { db, config, queue } = setup(hangBuilds, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    const low = createSoftware(db, { name: "low", priority: 5 }, config.softwares);
    const high = createSoftware(db, { name: "high", priority: 1 }, config.softwares);
    queue.enqueue({ softwareId: low.id, kind: "build" });
    const important = queue.enqueue({ softwareId: high.id, kind: "build" });
    expect(queue.tick()).toEqual([important]);
  });

  it("within a software, starts what a person is waiting to see before builds", () => {
    const { queue, software } = setup(hangBuilds, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    queue.enqueue({ softwareId: software.id, kind: "build" });
    const draft = queue.enqueue({ softwareId: software.id, kind: "draft" });
    expect(queue.tick()).toEqual([draft]);
  });

  it("passes each task type's model, effort and limits to the agent", async () => {
    const { queue, runner, software } = setup(
      { rules: [] },
      { PREMISE_AGENTS__TASKS__CHECK__EFFORT: "high" },
    );
    queue.enqueue({
      softwareId: software.id,
      kind: "check",
      payload: { brief: "Check the commit" },
    });
    queue.tick();
    await queue.idle();
    expect(runner.requests[0]).toMatchObject({
      taskKind: "check",
      model: "opus",
      effort: "high",
      maxTurns: 200,
      brief: "Check the commit",
    });
  });

  it("finishes a job done and records its session against it", async () => {
    const { db, queue, software } = setup();
    const id = queue.enqueue({ softwareId: software.id, kind: "plan" });
    queue.tick();
    await queue.idle();
    expect(queue.get(id)!.status).toBe("done");
    expect(
      db.prepare("SELECT runtime_session_id, job_id, end_reason FROM agent_sessions").all(),
    ).toEqual([{ runtime_session_id: `scripted-${id}-1`, job_id: id, end_reason: "done" }]);
  });

  it("stops a job when the same failure happens three times", async () => {
    const { queue, software } = setup({
      rules: [
        {
          when: { task: "build" },
          end: { outcome: "failed", failure: "tests-fail", summary: "Tests fail" },
        },
      ],
    });
    const id = queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.idle();
    const job = queue.get(id)!;
    expect(job.status).toBe("stuck");
    expect(job.attempts).toBe(3);
    expect(job.result).toBe("The same failure happened 3 times: Tests fail");
  });

  it("keeps trying while the failures differ", async () => {
    const { queue, software } = setup({
      rules: [
        { when: { task: "build", attempt: 1 }, end: { outcome: "failed", failure: "a" } },
        { when: { task: "build", attempt: 2 }, end: { outcome: "failed", failure: "b" } },
      ],
    });
    const id = queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.idle();
    expect(queue.get(id)).toMatchObject({ status: "done", attempts: 3 });
  });

  it("pauses all agent work on a usage-limit event and resumes after the reset", async () => {
    let time = new Date("2026-11-21T10:00:00Z");
    const resetAt = "2026-11-21T11:00:00.000Z";
    const { queue, software } = setup(
      {
        rules: [
          {
            when: { task: "build", attempt: 1 },
            delay_ms: 5,
            end: { outcome: "usage-limit", reset_at: resetAt },
          },
          { when: { task: "check", attempt: 1 }, end: { outcome: "hang" } },
        ],
      },
      {},
      () => time,
    );
    const build = queue.enqueue({ softwareId: software.id, kind: "build" });
    const check = queue.enqueue({ softwareId: software.id, kind: "check" });
    expect(queue.tick()).toHaveLength(2);
    await queue.idle();

    expect(queue.state()).toEqual({
      paused: true,
      reason: "The subscription's usage limit was reached.",
      resumeAt: resetAt,
    });
    // Both jobs are back in the queue, to start again after the reset.
    expect(queue.get(build)).toMatchObject({ status: "queued", attempts: 1 });
    expect(queue.get(check)).toMatchObject({ status: "queued", attempts: 1 });
    expect(queue.tick()).toEqual([]);

    time = new Date("2026-11-21T11:00:01Z");
    expect(queue.tick()).toHaveLength(2);
    await queue.idle();
    expect(queue.state().paused).toBe(false);
    expect(queue.get(build)!.status).toBe("done");
    expect(queue.get(check)!.status).toBe("done");
  });

  it("resumes by itself when the usage-limit pause ends, with no one calling tick", async () => {
    const resetAt = new Date(Date.now() + 1000).toISOString();
    const { queue, software } = setup({
      rules: [
        { when: { task: "build", attempt: 1 }, end: { outcome: "usage-limit", reset_at: resetAt } },
      ],
    });
    const id = queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.idle();
    expect(queue.get(id)!.status).toBe("queued");
    expect(queue.state().paused).toBe(true);

    const deadline = Date.now() + 8000;
    while (queue.get(id)!.status !== "done" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    await queue.idle();
    expect(queue.get(id)!.status).toBe("done");
    expect(queue.state().paused).toBe(false);
  });

  it("on close stops running sessions, requeues them and starts nothing more", async () => {
    const { queue, software } = setup(hangBuilds, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    const first = queue.enqueue({ softwareId: software.id, kind: "build" });
    const second = queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    await queue.close();
    expect(queue.get(first)!.status).toBe("queued");
    expect(queue.get(second)!.status).toBe("queued");
    expect(queue.runningAgentSessions()).toBe(0);
    expect(queue.tick()).toEqual([]);
  });

  it("waits a fixed time when a usage-limit event gives no reset time", async () => {
    const time = new Date("2026-11-21T10:00:00Z");
    const { queue, software } = setup(
      { rules: [{ end: { outcome: "usage-limit" } }] },
      { PREMISE_QUEUE__USAGE_PAUSE_FALLBACK_MINUTES: "30" },
      () => time,
    );
    queue.enqueue({ softwareId: software.id, kind: "draft" });
    queue.tick();
    await queue.idle();
    expect(queue.state().resumeAt).toBe("2026-11-21T10:30:00.000Z");
  });

  it("uses the fixed wait when the reset time is unreadable or already past", () => {
    const time = new Date("2026-11-21T10:00:00Z");
    const { queue } = setup(
      { rules: [] },
      { PREMISE_QUEUE__USAGE_PAUSE_FALLBACK_MINUTES: "30" },
      () => time,
    );
    queue.pauseAll("limit", "tomorrow");
    expect(queue.state().resumeAt).toBe("2026-11-21T10:30:00.000Z");
    queue.resumeAll();
    queue.pauseAll("limit", "2026-11-21T09:00:00Z");
    expect(queue.state().resumeAt).toBe("2026-11-21T10:30:00.000Z");
    void queue.close();
  });

  it("does not start work for a software stopped at a milestone wait", () => {
    const { db, queue, software } = setup(hangBuilds);
    setSoftwareState(
      db,
      software.id,
      "waiting-milestone",
      "Milestone 1 reached; the operator set a wait.",
    );
    queue.enqueue({ softwareId: software.id, kind: "build" });
    expect(queue.tick()).toEqual([]);
  });

  it("lets a person stop a running job", async () => {
    const { queue, software } = setup(hangBuilds);
    const id = queue.enqueue({ softwareId: software.id, kind: "build" });
    queue.tick();
    queue.stop(id);
    await queue.idle();
    expect(queue.get(id)!.status).toBe("stopped");
  });

  it("frees a job's slot while it waits for an answer", () => {
    const { queue, software } = setup(hangBuilds, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    const first = queue.enqueue({ softwareId: software.id, kind: "draft" });
    queue.wait(first, "ask-1");
    const second = queue.enqueue({ softwareId: software.id, kind: "build" });
    expect(queue.tick()).toEqual([second]);
    expect(queue.get(first)).toMatchObject({ status: "waiting", waitingOn: "ask-1" });
  });

  it("survives a restart: a job cut off mid-run starts again, told it was cut off", async () => {
    const folder = tempFolder();
    const config: PremiseConfig = testConfig(folder);

    // First run of premise: the build is running when premise stops.
    const first = openDatabase(folder);
    const before = new WorkQueue({
      db: first.db,
      config,
      runner: new ScriptedAgentRunner(parseScript(hangBuilds)),
    });
    const software = createSoftware(first.db, { name: "sample" }, config.softwares);
    const id = before.enqueue({
      softwareId: software.id,
      kind: "build",
      payload: { brief: "Build it" },
    });
    const queuedOnly = before.enqueue({ softwareId: software.id, kind: "report" });
    before.wait(queuedOnly, "ask-7");
    expect(before.tick()).toEqual([id]);
    first.db.close();

    // premise starts again with the same data folder.
    const second: Database = openDatabase(folder).db;
    const runner = new ScriptedAgentRunner();
    const after = new WorkQueue({ db: second, config, runner });
    const recovered = after.recover();
    expect(recovered.map((j) => j.id)).toEqual([id]);
    expect(after.get(id)).toMatchObject({ status: "queued", attempts: 1 });
    expect(after.get(queuedOnly)).toMatchObject({ status: "waiting", waitingOn: "ask-7" });

    after.tick();
    await after.idle();
    expect(after.get(id)).toMatchObject({ status: "done", attempts: 2 });
    expect(runner.requests[0]!.attempt).toBe(2);
    expect(runner.requests[0]!.brief).toContain("A previous attempt was cut off");
    expect(runner.requests[0]!.brief).toContain("Build it");
    expect(
      second.prepare("SELECT runtime_session_id, end_reason FROM agent_sessions ORDER BY id").all(),
    ).toEqual([
      { runtime_session_id: `scripted-${id}-1`, end_reason: "premise-stopped" },
      { runtime_session_id: `scripted-${id}-2`, end_reason: "done" },
    ]);
    second.close();
  });
  it("does not carry on a session the runtime never confirmed, even after a restart", async () => {
    const folder = tempFolder();
    const config: PremiseConfig = testConfig(folder);
    const hanging = new ScriptedAgentRunner(parseScript(hangBuilds));
    const unconfirmed = {
      runtime: hanging.runtime,
      start: (...args: Parameters<ScriptedAgentRunner["start"]>) => ({
        ...hanging.start(...args),
        confirmed: new Promise<string>(() => {}),
      }),
    };
    const first = openDatabase(folder);
    const before = new WorkQueue({ db: first.db, config, runner: unconfirmed });
    const software = createSoftware(first.db, { name: "sample" }, config.softwares);
    const id = before.enqueue({ softwareId: software.id, kind: "build" });
    before.tick();
    first.db.close();

    const second = openDatabase(folder).db;
    const runner = new ScriptedAgentRunner();
    const after = new WorkQueue({ db: second, config, runner });
    after.recover();
    after.tick();
    await after.idle();
    expect(after.get(id)).toMatchObject({ status: "done" });
    expect(runner.requests[0]!.resumeSessionId).toBeUndefined();
    second.close();
  });
  it("keeps a confirmed session id across a restart, and carries the session on", async () => {
    const folder = tempFolder();
    const config: PremiseConfig = testConfig(folder);
    const hanging = new ScriptedAgentRunner(parseScript(hangBuilds));
    const confirming = {
      runtime: hanging.runtime,
      start: (...args: Parameters<ScriptedAgentRunner["start"]>) => ({
        ...hanging.start(...args),
        confirmed: Promise.resolve("claude-confirmed-1"),
      }),
    };
    const first = openDatabase(folder);
    const before = new WorkQueue({ db: first.db, config, runner: confirming });
    const software = createSoftware(first.db, { name: "sample" }, config.softwares);
    const id = before.enqueue({ softwareId: software.id, kind: "build" });
    before.tick();
    await Promise.resolve();
    first.db.close();

    const second = openDatabase(folder).db;
    const runner = new ScriptedAgentRunner();
    const after = new WorkQueue({ db: second, config, runner });
    after.recover();
    after.tick();
    await after.idle();
    expect(runner.requests[0]!.resumeSessionId).toBe("claude-confirmed-1");
    expect(after.get(id)).toMatchObject({ status: "done" });
    second.close();
  });
});
