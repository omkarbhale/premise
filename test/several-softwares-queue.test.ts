import { describe, expect, it } from "vitest";
import type {
  AgentOutcome,
  AgentRequest,
  AgentRunner,
  AgentSession,
} from "../src/agents/agent-runner.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { Portfolio } from "../src/portfolio/portfolio.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware, getSoftware } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

/**
 * Sharing the agent sessions between several softwares (docs/specs/work-queue.md 5.1, decision
 * 0197), with a scripted agent this test ends by hand: three softwares of different priorities, a
 * limit of two sessions, and a clock the test moves on.
 */

/** A scripted agent whose sessions end when the test says so. */
class HandAgent implements AgentRunner {
  readonly runtime = "scripted";
  readonly sessions = new Map<number, (outcome: AgentOutcome) => void>();
  readonly started: AgentRequest[] = [];

  start(request: AgentRequest): AgentSession {
    this.started.push(request);
    let end!: (outcome: AgentOutcome) => void;
    const outcome = new Promise<AgentOutcome>((resolve) => {
      end = resolve;
    });
    this.sessions.set(request.jobId, end);
    return {
      sessionId: `hand-${request.jobId}-${request.attempt}`,
      runtime: this.runtime,
      outcome,
      stop: () => end({ kind: "stopped" }),
    };
  }

  /** End a running job's session as done. */
  finish(jobId: number): void {
    this.sessions.get(jobId)?.({ kind: "done", summary: "Done." });
    this.sessions.delete(jobId);
  }
}

function setup(env: NodeJS.ProcessEnv = {}, folder = tempFolder()) {
  const config = testConfig(folder, { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "2", ...env });
  const { db } = openDatabase(folder);
  const agent = new HandAgent();
  let offsetMs = 0;
  const clock = () => new Date(Date.now() + offsetMs);
  const queue = new WorkQueue({ db, config, runner: agent, clock });
  const portfolio = new Portfolio({ db, queue });
  return {
    folder,
    config,
    db,
    agent,
    queue,
    portfolio,
    later: (minutes: number) => {
      offsetMs += minutes * 60_000;
    },
  };
}

/** Three softwares, each with four builds queued. */
function threeSoftwares(t: ReturnType<typeof setup>) {
  const make = (name: string, priority: number) => {
    const s = createSoftware(t.db, { name, priority }, t.config.softwares);
    const jobs = [1, 2, 3, 4].map(() => t.queue.enqueue({ softwareId: s.id, kind: "build" }));
    return { ...s, jobs };
  };
  return { high: make("high", 1), middle: make("middle", 3), low: make("low", 5) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function runningOf(t: ReturnType<typeof setup>): string[] {
  return t.queue.list("running").map((j) => getSoftware(t.db, j.softwareId)!.name);
}

describe("several softwares sharing the agent sessions", () => {
  it("gives the two sessions to the most important softwares first", () => {
    const t = setup();
    const { high } = threeSoftwares(t);
    t.queue.tick();
    // Priority first: the most important software takes both sessions.
    expect(runningOf(t)).toEqual(["high", "high"]);
    expect(t.queue.runningAgentSessions()).toBe(2);
    expect(high.jobs.slice(0, 2).map((id) => t.queue.get(id)!.status)).toEqual([
      "running",
      "running",
    ]);
  });

  it("lets a low-priority software make progress once it has waited its turn", async () => {
    const t = setup();
    const { high, middle, low } = threeSoftwares(t);
    t.queue.tick();
    // Before the fair wait, a freed session goes to the most important software again.
    t.agent.finish(high.jobs[0]!);
    await flush();
    await flush();
    expect(runningOf(t)).toEqual(["high", "high"]);

    // Long work by the important software: after queue.fair_wait_minutes, each freed session goes
    // to the software that has waited longest, however unimportant: first the middle one, then
    // the least important.
    t.later(t.config.queue.fair_wait_minutes + 1);
    t.agent.finish(high.jobs[1]!);
    await flush();
    await flush();
    expect(runningOf(t).sort()).toEqual(["high", "middle"]);
    t.agent.finish(high.jobs[2]!);
    await flush();
    await flush();
    expect(runningOf(t).sort()).toEqual(["low", "middle"]);
    const turns = t.db
      .prepare("SELECT software_id FROM events WHERE kind = 'fair-turn' ORDER BY id")
      .all() as { software_id: string }[];
    expect(turns.map((r) => r.software_id)).toEqual([middle.id, low.id]);
  });

  it("starts the middle software next when the waits are over too, and none waits forever", async () => {
    const t = setup();
    const all = threeSoftwares(t);
    t.queue.tick();
    const started = new Set<string>();
    // Keep finishing whatever runs, with time passing, until every job is done.
    for (let round = 0; round < 40 && t.queue.list("queued").length > 0; round++) {
      for (const job of t.queue.list("running")) started.add(job.softwareId);
      t.later(10);
      const first = t.queue.list("running")[0];
      if (first) t.agent.finish(first.id);
      await flush();
      await flush();
    }
    for (const job of t.queue.list("running")) started.add(job.softwareId);
    expect(started).toEqual(new Set([all.high.id, all.middle.id, all.low.id]));
  });

  it("gives the session to another software while one waits on a person", async () => {
    const t = setup({ PREMISE_QUEUE__MAX_AGENT_SESSIONS: "1" });
    const { high, middle } = threeSoftwares(t);
    t.queue.tick();
    expect(runningOf(t)).toEqual(["high"]);
    // The important software's work now waits on answers from a person: a job waiting on a person
    // holds no session.
    for (const id of high.jobs.slice(1)) t.queue.wait(id, "ask 1");
    t.agent.finish(high.jobs[0]!);
    await flush();
    await flush();
    expect(runningOf(t)).toEqual(["middle"]);
    expect(t.queue.get(middle.jobs[0]!)!.status).toBe("running");
  });

  it("frees a paused software's sessions for the others, and starts it again on resume", async () => {
    const t = setup();
    const { high, middle } = threeSoftwares(t);
    t.queue.tick();
    expect(runningOf(t)).toEqual(["high", "high"]);
    t.portfolio.pause(high.id);
    await flush();
    await flush();
    // Its sessions stopped and its jobs went back to the queue; the slots went to the others.
    expect(high.jobs.map((id) => t.queue.get(id)!.status)).toEqual([
      "queued",
      "queued",
      "queued",
      "queued",
    ]);
    expect(runningOf(t)).toEqual(["middle", "middle"]);
    expect(getSoftware(t.db, high.id)!.pausedAt).not.toBeNull();

    t.portfolio.resume(high.id);
    t.agent.finish(middle.jobs[0]!);
    await flush();
    await flush();
    expect(runningOf(t)).toContain("high");
  });

  it("refuses to archive a software still being worked on, and archives it once paused", async () => {
    const t = setup();
    const { low } = threeSoftwares(t);
    await expect(t.portfolio.archive(low.id)).rejects.toThrow(/still being worked on/);
    t.portfolio.pause(low.id);
    await t.portfolio.archive(low.id);
    expect(getSoftware(t.db, low.id)!.archivedAt).not.toBeNull();
    // Archived work never starts, even after a resume is asked for.
    expect(() => t.portfolio.resume(low.id)).toThrow(/archived/);
    t.queue.tick();
    expect(runningOf(t)).not.toContain("low");
    // Restoring brings it back as it was: paused.
    t.portfolio.restore(low.id);
    expect(getSoftware(t.db, low.id)!.archivedAt).toBeNull();
    expect(getSoftware(t.db, low.id)!.pausedAt).not.toBeNull();
  });

  it("carries on after a restart with all three softwares mid-way, keeping a pause", async () => {
    const t = setup();
    const { high, middle, low } = threeSoftwares(t);
    t.queue.tick();
    t.portfolio.pause(middle.id);
    t.agent.finish(high.jobs[0]!);
    await flush();
    await flush();
    // premise stops while two sessions run: nothing ends them.
    expect(t.queue.list("running")).toHaveLength(2);

    const again = setup({}, t.folder);
    const cut = again.queue.recover();
    expect(cut).toHaveLength(2);
    again.queue.tick();
    const names = runningOf(again);
    expect(names).toHaveLength(2);
    expect(names).not.toContain("middle");
    expect(getSoftware(again.db, middle.id)!.pausedAt).not.toBeNull();
    // The cut-off jobs are told so.
    expect(again.agent.started.some((r) => r.brief.includes("cut off"))).toBe(true);
    // Every software still has its unfinished work.
    for (const s of [high, middle, low]) {
      const open = again.queue
        .list()
        .filter((j) => j.softwareId === s.id && j.status !== "done").length;
      expect(open).toBeGreaterThan(0);
    }
  });
});
