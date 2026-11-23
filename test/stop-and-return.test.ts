import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Job } from "../src/queue/work-queue.js";
import {
  StopController,
  type Stoppable,
  findRunning,
  requestStop,
  runningFile,
} from "../src/server/lifecycle.js";
import { start } from "../src/server/start.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

/**
 * Stopping premise and coming back (decision 0290): the clean Ctrl+C and the second one, `premise
 * stop`, the paused state across a restart, the same link, and what a start says it picked up.
 * Scripted agents only; every data folder is a temporary one.
 */

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => ok(port));
    });
  });
}

const doctorOk = () => Promise.resolve({ ok: true, output: "1.0" });

async function begin(folder: string, extra: NodeJS.ProcessEnv = {}) {
  const port = await freePort();
  const lines: string[] = [];
  const running = await start({
    dataFolder: folder,
    env: {
      PREMISE_SERVER__PORT: String(port),
      PREMISE_AGENTS__MODE: "scripted",
      PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0",
      ...extra,
    },
    print: (line) => lines.push(line),
    run: doctorOk,
  });
  const token = /#token=(.+)$/.exec(running.link)![1]!;
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`http://localhost:${port}${path}`, {
      method,
      headers: {
        "x-premise-token": token,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: JSON.parse(await response.text()) };
  };
  return { running, lines, port, api };
}

describe("a stop that was paused", () => {
  it("starts paused, says so, and one click resumes", async () => {
    const folder = tempFolder();
    const first = await begin(folder);
    const paused = await first.api("POST", "/api/pause", { mode: "finish" });
    expect(paused.body.paused).toBe(true);
    await first.running.close();

    const second = await begin(folder);
    try {
      expect(second.lines.join("\n")).toContain("everything is paused, as you left it");
      const overview = await second.api("GET", "/api/overview");
      expect(overview.body.pause).toMatchObject({ paused: true, cause: "person" });
      expect(overview.body.startup.line).toContain("as you left it");
      expect(overview.body.startup.paused).toBe(true);

      const resumed = await second.api("POST", "/api/resume");
      expect(resumed.body.paused).toBe(false);
    } finally {
      await second.running.close();
    }
    // Stopping unpaused, the next start is not paused.
    const third = await begin(folder);
    try {
      expect((await third.api("GET", "/api/overview")).body.pause.paused).toBe(false);
    } finally {
      await third.running.close();
    }
  }, 30_000);

  it("always starts paused with queue.start_paused, and says why", async () => {
    const started = await begin(tempFolder(), { PREMISE_QUEUE__START_PAUSED: "true" });
    try {
      const overview = await started.api("GET", "/api/overview");
      expect(overview.body.pause).toMatchObject({ paused: true, cause: "setting" });
      expect(overview.body.startup.line).toContain("queue.start_paused");
    } finally {
      await started.running.close();
    }
  }, 30_000);
});

describe("what a start says it picked up", () => {
  it("says nothing on a first start", async () => {
    const started = await begin(tempFolder());
    try {
      expect(started.running.startup).toBeNull();
      expect((await started.api("GET", "/api/overview")).body.startup).toBeNull();
    } finally {
      await started.running.close();
    }
  }, 30_000);

  it("names what was cut off, what waits on the person, and software that stopped with premise", async () => {
    const folder = tempFolder();
    const config = testConfig(folder);
    const { db } = openDatabase(folder);
    const software = createSoftware(db, { name: "Reading list" }, config.softwares);
    // A job that was running when premise last stopped, an ask waiting on the person, and a run
    // that was up (as a crash leaves it).
    db.prepare(
      "INSERT INTO jobs (software_id, kind, status, attempts, started, created) VALUES (?, 'build', 'running', 1, ?, ?)",
    ).run(software.id, new Date().toISOString(), new Date().toISOString());
    db.prepare(
      `INSERT INTO asks (software_id, role, kind, title, instruction, blocking, asked)
       VALUES (?, 'operator', 'question', 'A question', 'Answer it.', 1, ?)`,
    ).run(software.id, new Date().toISOString());
    db.prepare(
      `INSERT INTO runs (software_id, commit_sha, kind, status, started) VALUES (?, 'abc1234', 'web', 'running', ?)`,
    ).run(software.id, new Date().toISOString());
    db.close();

    const started = await begin(folder, { PREMISE_QUEUE__START_PAUSED: "false" });
    try {
      const line = started.running.startup!.line;
      expect(line).toContain("1 job that was running when premise stopped was cut off");
      expect(line).toContain("1 thing is waiting on you");
      expect(line).toContain("Reading list was running and stopped with premise");
      expect(started.running.startup!.stoppedSoftwares).toEqual([
        { softwareId: software.id, name: "Reading list" },
      ]);
      expect(started.lines.join("\n")).toContain("Picked up where premise stopped");
    } finally {
      await started.running.close();
    }
  }, 30_000);
});

describe("the link", () => {
  it("is new at each start by default, and the old one stops working", async () => {
    const folder = tempFolder();
    const first = await begin(folder);
    await first.running.close();
    const second = await begin(folder);
    try {
      expect(second.running.link).not.toBe(first.running.link);
      expect(second.lines.join("\n")).toContain("new link each time it starts");
      expect(existsSync(join(folder, "kept-link"))).toBe(false);
    } finally {
      await second.running.close();
    }
  }, 30_000);

  it("is the same across restarts with server.keep_link, kept in a file only its owner reads", async () => {
    const folder = tempFolder();
    const env = { PREMISE_SERVER__KEEP_LINK: "true" };
    const first = await begin(folder, env);
    await first.running.close();
    const second = await begin(folder, env);
    try {
      expect(second.running.link).toBe(first.running.link.replace(/:\d+\//, `:${second.port}/`));
      expect(second.lines.join("\n")).toContain("same link as last time");
      expect(statSync(join(folder, "kept-link")).mode & 0o777).toBe(0o600);
      // The kept link works.
      expect((await second.api("GET", "/api/overview")).status).toBe(200);
    } finally {
      await second.running.close();
    }
  }, 30_000);

  it("turning the setting off forgets the kept link", async () => {
    const folder = tempFolder();
    const first = await begin(folder, { PREMISE_SERVER__KEEP_LINK: "true" });
    await first.running.close();
    const second = await begin(folder);
    try {
      expect(existsSync(join(folder, "kept-link"))).toBe(false);
      expect(second.running.link).not.toContain(/#token=(.+)$/.exec(first.running.link)![1]!);
    } finally {
      await second.running.close();
    }
  }, 30_000);

  it("says at the end how to get the link back", async () => {
    const started = await begin(tempFolder());
    try {
      const said = started.running.goodbye().join("\n");
      expect(said).toContain("new link");
      expect(said).toContain("npm start");
    } finally {
      await started.running.close();
    }
  }, 30_000);
});

describe("a premise that is already running", () => {
  it("is found by its file, and a second start on the same data folder is refused", async () => {
    const folder = tempFolder();
    const first = await begin(folder);
    try {
      expect(await findRunning(folder)).toMatchObject({ pid: process.pid });
      await expect(begin(folder)).rejects.toThrow(/already running on this data folder/);
    } finally {
      await first.running.close();
    }
    expect(existsSync(runningFile(folder))).toBe(false);
  }, 30_000);

  it("a file left by a premise that is gone is ignored and removed", async () => {
    const folder = tempFolder();
    writeFileSync(
      runningFile(folder),
      JSON.stringify({ pid: 2 ** 22 - 1, host: "127.0.0.1", port: 9, startedAt: "x" }),
    );
    expect(await findRunning(folder)).toBeNull();
    expect(existsSync(runningFile(folder))).toBe(false);
    const lines: string[] = [];
    const result = await requestStop({
      dataFolder: folder,
      now: false,
      print: (l) => lines.push(l),
    });
    expect(result.outcome).toBe("not-running");
    expect(lines.join(" ")).toContain("not running");
  });
});

/** A fake premise for the Ctrl+C logic: its jobs end when the test says so. */
function fakeTarget(jobs: Job[]) {
  const log: string[] = [];
  let release!: () => void;
  const idle = new Promise<void>((resolve) => (release = resolve));
  let remaining = jobs;
  const target: Stoppable = {
    beginStopping: () => log.push("stopping"),
    stillRunning: () => remaining,
    whenIdle: () => idle,
    close: async () => {
      log.push("closed");
    },
    goodbye: () => ["Start premise again with `npm start`."],
    runningSoftwareNames: () => [],
  };
  return {
    target,
    log,
    finishAll: () => {
      remaining = [];
      release();
    },
  };
}

const aJob = (id: number): Job =>
  ({ id, softwareId: "s", kind: "build", status: "running" }) as unknown as Job;

describe("Ctrl+C", () => {
  it("once: pauses, says what it waits for and that again stops now, then stops when the work is done", async () => {
    const fake = fakeTarget([aJob(1)]);
    const said: string[] = [];
    const exits: number[] = [];
    const controller = new StopController(fake.target, {
      print: (l) => said.push(l),
      exit: (c) => exits.push(c),
      softwareName: () => "Reading list",
    });
    controller.interrupt();
    await new Promise((r) => setTimeout(r, 5));
    expect(controller.phase).toBe("stopping");
    expect(said.join("\n")).toContain("once the running work finishes: a build for Reading list");
    expect(said.join("\n")).toContain("Press Ctrl+C again to stop now");
    expect(fake.log).toEqual(["stopping"]);
    expect(exits).toEqual([]);

    fake.finishAll();
    await new Promise((r) => setTimeout(r, 5));
    expect(fake.log).toEqual(["stopping", "closed"]);
    expect(exits).toEqual([0]);
    expect(said.join("\n")).toContain("npm start");
  });

  it("twice: stops now without waiting, and says the cut-off work is redone", async () => {
    const fake = fakeTarget([aJob(1), aJob(2)]);
    const said: string[] = [];
    const exits: number[] = [];
    const controller = new StopController(fake.target, {
      print: (l) => said.push(l),
      exit: (c) => exits.push(c),
      softwareName: () => "Reading list",
    });
    controller.interrupt();
    controller.interrupt();
    await new Promise((r) => setTimeout(r, 5));
    expect(fake.log).toEqual(["stopping", "closed"]);
    expect(exits).toEqual([0]);
    expect(said.join("\n")).toContain("redone next time");
    // A third press, or the work finishing late, does not close twice.
    controller.interrupt();
    fake.finishAll();
    await new Promise((r) => setTimeout(r, 5));
    expect(fake.log).toEqual(["stopping", "closed"]);
    expect(exits).toEqual([0]);
  });

  it("with nothing running, stops at once and says nothing is lost", async () => {
    const fake = fakeTarget([]);
    const said: string[] = [];
    const exits: number[] = [];
    new StopController(fake.target, {
      print: (l) => said.push(l),
      exit: (c) => exits.push(c),
      softwareName: () => "x",
    }).interrupt();
    await new Promise((r) => setTimeout(r, 5));
    expect(said.join("\n")).toContain("Nothing is running, so nothing is lost");
    expect(exits).toEqual([0]);
  });

  it("a termination request stops now", async () => {
    const fake = fakeTarget([aJob(1)]);
    const exits: number[] = [];
    new StopController(fake.target, {
      print: () => {},
      exit: (c) => exits.push(c),
      softwareName: () => "x",
    }).terminate();
    await new Promise((r) => setTimeout(r, 5));
    expect(fake.log).toEqual(["closed"]);
    expect(exits).toEqual([0]);
  });

  it("names the built software that stops with premise", async () => {
    const fake = fakeTarget([]);
    fake.target.runningSoftwareNames = () => ["Reading list"];
    const said: string[] = [];
    new StopController(fake.target, {
      print: (l) => said.push(l),
      exit: () => {},
      softwareName: () => "x",
    }).interrupt();
    await new Promise((r) => setTimeout(r, 5));
    expect(said.join("\n")).toContain("Reading list");
    expect(said.join("\n")).toContain("stops with premise");
  });
});

describe("premise itself, run for real", () => {
  const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
  const CLI = join(process.cwd(), "src", "cli.ts");

  /** Starts premise as its own process on a temporary data folder, with scripted agents only. */
  async function spawnPremise(folder: string, script?: unknown) {
    const port = await freePort();
    const scriptFile = join(folder, "..", `script-${port}.json`);
    writeFileSync(scriptFile, JSON.stringify(script ?? { rules: [] }));
    const child = spawn(
      TSX,
      [CLI, "start", "--scripted", "--port", String(port), "--data", folder],
      {
        env: {
          ...process.env,
          PREMISE_AGENTS__SCRIPTED__SCRIPT_FILE: scriptFile,
          PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout!.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr!.on("data", (d: Buffer) => (out += d.toString()));
    const exited = new Promise<number | null>((resolve) =>
      child.on("exit", (code) => resolve(code)),
    );
    const until = async (text: string, ms = 30_000) => {
      const end = Date.now() + ms;
      while (!out.includes(text)) {
        if (Date.now() > end) throw new Error(`Never saw "${text}". Output so far:\n${out}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    await until("Open this link");
    const token = /#token=(\S+)/.exec(out)![1]!;
    const api = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: {
          "x-premise-token": token,
          ...(body !== undefined && { "content-type": "application/json" }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      return JSON.parse(await response.text());
    };
    return { child, exited, until, output: () => out, api, port };
  }

  const kill = (child: ChildProcess) => {
    if (child.exitCode === null) child.kill("SIGKILL");
  };

  it("Ctrl+C once waits for a running session, Ctrl+C again stops now, and the work is redone next time", async () => {
    const folder = join(tempFolder(), "data");
    const p = await spawnPremise(folder, { rules: [{ end: { outcome: "hang" } }] });
    try {
      await p.api("POST", "/api/softwares", { idea: "A small app for my reading list" });
      // A session is now running (it hangs, like work that takes a long time).
      for (
        let i = 0;
        i < 100 && (await p.api("GET", "/api/overview")).activity.running === 0;
        i++
      ) {
        await new Promise((r) => setTimeout(r, 100));
      }
      p.child.kill("SIGINT");
      await p.until("Stopping premise once the running work finishes");
      expect(p.output()).toContain("Press Ctrl+C again to stop now");
      // The page says so too.
      expect((await p.api("GET", "/api/overview")).pause).toMatchObject({
        stopping: true,
        safeToClose: false,
      });
      // It does not stop on its own while the session runs.
      await new Promise((r) => setTimeout(r, 500));
      expect(p.child.exitCode).toBeNull();

      p.child.kill("SIGINT");
      expect(await p.exited).toBe(0);
      expect(p.output()).toContain("Stopping now");
      expect(p.output()).toContain("redone next time");
      expect(existsSync(runningFile(folder))).toBe(false);

      // Next start: the cut-off job was put back, and the start says so.
      const again = await spawnPremise(folder);
      try {
        await again.until("Picked up where premise stopped");
        expect(again.output()).toMatch(/cut off and put back to start again/);
      } finally {
        kill(again.child);
        await again.exited;
      }
    } finally {
      kill(p.child);
    }
  }, 90_000);

  it("`premise stop` from another terminal does the same as one Ctrl+C", async () => {
    const folder = join(tempFolder(), "data");
    const p = await spawnPremise(folder);
    try {
      const stopper = spawn(TSX, [CLI, "stop", "--data", folder], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let said = "";
      stopper.stdout!.on("data", (d: Buffer) => (said += d.toString()));
      const code = await new Promise<number | null>((resolve) => stopper.on("exit", resolve));
      expect(code).toBe(0);
      expect(said).toContain("Asked premise to stop");
      expect(said).toContain("premise has stopped");
      expect(await p.exited).toBe(0);
      expect(p.output()).toContain("Stopping premise");
      expect(p.output()).toContain("npm start");
    } finally {
      kill(p.child);
    }
  }, 90_000);

  it("`premise stop` with nothing running says so and succeeds", async () => {
    const folder = join(tempFolder(), "data");
    const lines: string[] = [];
    const result = await requestStop({
      dataFolder: folder,
      now: false,
      print: (l) => lines.push(l),
    });
    expect(result.outcome).toBe("not-running");
  });
});
