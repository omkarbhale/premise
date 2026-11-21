import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confine } from "../src/runner/confinement.js";
import { Runner, RunnerError } from "../src/runner/runner.js";
import { parseRunInstructions } from "../src/runner/run-instructions.js";
import { type Database, openDatabase } from "../src/storage/database.js";
import {
  CRASHING_SERVER,
  HELLO_SCRIPT,
  OPEN_SERVER,
  WEB_SERVER,
  makeSoftware,
  runBlock,
} from "./fixtures/fixture-software.js";
import { tempFolder, testConfig, uniquePortRange } from "./helpers.js";

let db: Database;
let runner: Runner;
let dataFolder: string;
let config: ReturnType<typeof testConfig>;

function setup(env: NodeJS.ProcessEnv = {}, range = testRange) {
  dataFolder = tempFolder();
  config = testConfig(dataFolder, {
    PREMISE_RUNNER__CONFINEMENT: "none",
    PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
    PREMISE_RUNNER__PORT_RANGE: JSON.stringify(range),
    PREMISE_RUNNER__RESTART_DELAY_SECONDS: "0",
    PREMISE_RUNNER__STOP_GRACE_SECONDS: "2",
    PREMISE_RUNNER__START_TIMEOUT_SECONDS: "10",
    PREMISE_RUNNER__SAMPLE_TIMEOUT_SECONDS: "10",
    ...env,
  });
  db = openDatabase(dataFolder).db;
  runner = new Runner({
    db,
    config,
    repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
  });
}

let testRange = "";
beforeEach(async () => {
  testRange = (await uniquePortRange()).range;
  setup();
});
afterEach(async () => {
  await runner.close();
  db.close();
});

async function fetchText(url: string): Promise<string> {
  return (await fetch(url)).text();
}

const WEB = {
  "server.js": WEB_SERVER,
  "premise/run.md": runBlock(["kind: web", "start: node server.js", "open: /"]),
};

describe("reading run instructions", () => {
  it("reads a web block, with the open path defaulting to /", () => {
    const parsed = parseRunInstructions(
      runBlock(["kind: web", "start: node a.js --port {port}"]),
      "premise/run.md",
    );
    expect(parsed).toEqual({
      ok: true,
      instructions: { kind: "web", open: "/", start: "node a.js --port {port}" },
    });
  });

  it("explains what to add when there is no block, and what is wrong in a bad one", () => {
    const none = parseRunInstructions("Just words.", "premise/run.md");
    expect(none).toMatchObject({ ok: false });
    expect(JSON.stringify(none)).toContain("premise-run");
    const missingFile = parseRunInstructions(undefined, "premise/run.md");
    expect(JSON.stringify(missingFile)).toContain("has no premise/run.md");
    const noStart = parseRunInstructions(runBlock(["kind: web"]), "premise/run.md");
    expect(noStart).toEqual({
      ok: false,
      problem: 'In premise/run.md, a web software needs "start:".',
    });
    const badKind = parseRunInstructions(runBlock(["kind: robot"]), "premise/run.md");
    expect(badKind).toMatchObject({
      problem: expect.stringContaining("must be web, command or program"),
    });
    const badKey = parseRunInstructions(runBlock(["kind: web", "launch: x"]), "premise/run.md");
    expect(JSON.stringify(badKey)).toContain("is not understood");
  });
});

describe("a command-line software", () => {
  it("runs once on a sample and shows the command and its output", async () => {
    const s = makeSoftware(db, config, "Greeter", {
      "hello.js": HELLO_SCRIPT,
      "premise/run.md": runBlock([
        "kind: command",
        "command: node hello.js <your name>",
        "sample: node hello.js Ada",
      ]),
    });
    const view = await runner.start(s.id);
    expect(view).toMatchObject({
      state: "finished",
      kind: "command",
      command: "node hello.js <your name>",
      output: ["Hello, Ada!"],
      outputIsSample: true,
      link: null,
      canStop: false,
    });
    expect(view.plain).toContain("type the command shown");
  });

  it("says plainly when the sample fails, with the output", async () => {
    const s = makeSoftware(db, config, "Broken", {
      "premise/run.md": runBlock(["kind: command", "command: node nothing.js"]),
    });
    const error = await runner.start(s.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RunnerError);
    expect((error as Error).message).toContain("ended with an error");
    expect((error as Error).message).toContain("nothing.js");
    expect(runner.view(s.id)).toMatchObject({ state: "failed" });
  });
});

describe("a web software", () => {
  it("starts from a clean copy at the latest commit, answers on a local port, and stops", async () => {
    const s = makeSoftware(db, config, "Pages", WEB);
    const view = await runner.start(s.id);
    expect(view.state).toBe("running");
    expect(view.link).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const port = Number(new URL(view.link!).port);
    expect(port).toBeGreaterThanOrEqual(Number(testRange.split("-")[0]));
    expect(port).toBeLessThanOrEqual(Number(testRange.split("-")[1]));
    expect(await fetchText(view.link!)).toBe("hello from the fixture web app");
    expect(view.commit).toBe(s.git.headCommit(s.repo)!.slice(0, 7));
    expect(runner.view(s.id).output.join("\n")).toContain("listening on 127.0.0.1:");

    const stopped = await runner.stop(s.id);
    expect(stopped.state).toBe("stopped");
    expect(stopped.link).toBeNull();
    await expect(fetch(view.link!)).rejects.toThrow();
    const events = db.prepare("SELECT kind FROM events WHERE module = 'runner' ORDER BY id").all();
    expect(events.map((e) => e.kind)).toEqual(["started", "stopped"]);
  });

  it("runs the commit it is given, not the latest", async () => {
    const s = makeSoftware(db, config, "Pages", WEB);
    const first = s.git.headCommit(s.repo)!;
    s.commit({
      "server.js": WEB_SERVER.replace("hello from the fixture web app", "second version"),
    });
    const view = await runner.start(s.id, first);
    expect(await fetchText(view.link!)).toBe("hello from the fixture web app");
    const second = await runner.start(s.id);
    expect(await fetchText(second.link!)).toBe("second version");
  });

  it("keeps secrets out of git and places the owner's secrets file in the copy", async () => {
    const s = makeSoftware(db, config, "Pages", WEB);
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(dataFolder, "secrets"), { recursive: true });
    writeFileSync(join(dataFolder, "secrets", `${s.id}.env`), "KEY=value\n");
    await runner.start(s.id);
    const copy = join(dataFolder, "work", s.id, "run");
    expect(readFileSync(join(copy, ".env"), "utf8")).toBe("KEY=value\n");
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: copy, encoding: "utf8" })).toBe(
      "",
    );
  });

  it("gives each software its own port from the configured range", async () => {
    const { first } = await uniquePortRange(4);
    setup({}, `${first}-${first + 3}`);
    const a = makeSoftware(db, config, "A", WEB);
    const b = makeSoftware(db, config, "B", WEB);
    const [va, vb] = [await runner.start(a.id), await runner.start(b.id)];
    expect(va.link).not.toBe(vb.link);
    for (const v of [va, vb]) {
      const port = Number(new URL(v.link!).port);
      expect(port).toBeGreaterThanOrEqual(first);
      expect(port).toBeLessThanOrEqual(first + 3);
    }
  });

  it("moves to the next port when the first port of the range is taken", async () => {
    const { createServer } = await import("node:net");
    const { first } = await uniquePortRange(4);
    setup({}, `${first}-${first + 3}`);
    const blocker = createServer();
    await new Promise<void>((ok) => blocker.listen(first, "127.0.0.1", ok));
    try {
      const s = makeSoftware(db, config, "Second", WEB);
      const view = await runner.start(s.id);
      expect(Number(new URL(view.link!).port)).toBe(first + 1);
    } finally {
      await new Promise((ok) => blocker.close(ok));
    }
  });

  it("tries the next port when another program takes it just before the start, without counting a crash", async () => {
    const { first } = await uniquePortRange(4);
    setup({}, `${first}-${first + 3}`);
    // The software itself claims the first port, as another program would between check and start.
    const s = makeSoftware(db, config, "Raced", {
      "server.js": `
const net = require("node:net");
const http = require("node:http");
const first = ${first};
const port = Number(process.env.PORT);
if (port === first) {
  // Pretend it is taken by someone else: fail the way a busy port does.
  console.error("Error: listen EADDRINUSE: address already in use 127.0.0.1:" + port);
  process.exit(1);
}
http.createServer((q, r) => r.end("ok")).listen(port, process.env.HOST);
`,
      "premise/run.md": runBlock(["kind: web", "start: node server.js"]),
    });
    const view = await runner.start(s.id);
    expect(Number(new URL(view.link!).port)).toBe(first + 1);
    expect(view.restarts).toBe(0);
    const kinds = (
      db.prepare("SELECT kind FROM events WHERE module = 'runner' ORDER BY id").all() as {
        kind: string;
      }[]
    ).map((e) => e.kind);
    expect(kinds).not.toContain("crashed");
  });

  it("says which setting to change when every port of the range is taken", async () => {
    const { createServer } = await import("node:net");
    const { first } = await uniquePortRange(2);
    setup({}, `${first}-${first + 1}`);
    const blockers = [createServer(), createServer()];
    await Promise.all(
      blockers.map((b, i) => new Promise<void>((ok) => b.listen(first + i, "127.0.0.1", ok))),
    );
    try {
      const s = makeSoftware(db, config, "Crowded", WEB);
      await expect(runner.start(s.id)).rejects.toThrow(/runner\.port_range/);
    } finally {
      await Promise.all(blockers.map((b) => new Promise((ok) => b.close(ok))));
    }
  });

  it("keeps several softwares running at once, and says plainly when as many as allowed run", async () => {
    setup({ PREMISE_RUNNER__MAX_RUNNING_SOFTWARES: "2" });
    const [a, b, c] = ["A", "B", "C"].map((name) => makeSoftware(db, config, name, WEB));
    const views = [await runner.start(a!.id), await runner.start(b!.id)];
    expect(new Set(views.map((v) => v.link)).size).toBe(2);
    expect(await Promise.all(views.map((v) => fetchText(v.link!)))).toEqual([
      "hello from the fixture web app",
      "hello from the fixture web app",
    ]);
    expect(runner.runningSoftwares().sort()).toEqual([a!.id, b!.id].sort());
    await expect(runner.start(c!.id)).rejects.toThrow(
      /2 softwares are already running \(A, B\).*Stop one of them first.*runner\.max_running_softwares/,
    );
    // The refusal is shown on the software's page, and the others keep running.
    expect((await runner.view(c!.id)).state).toBe("failed");
    expect(await fetchText(views[0]!.link!)).toBe("hello from the fixture web app");
    // Restarting one that runs already is not one more.
    expect((await runner.start(a!.id)).state).toBe("running");
    await runner.stop(b!.id);
    expect((await runner.start(c!.id)).state).toBe("running");
  });

  it("says plainly when this machine has too little free memory to start one more", async () => {
    await runner.close();
    runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
      freeMemory: () => 100 * 1024 * 1024,
    });
    const s = makeSoftware(db, config, "Big", WEB);
    await expect(runner.start(s.id)).rejects.toThrow(
      /only 100 MB of memory free.*runner\.min_free_memory_mb/,
    );
    const noRoom = db.prepare("SELECT detail FROM events WHERE kind = 'no-room'").all() as {
      detail: string;
    }[];
    expect(JSON.parse(noRoom[0]!.detail)).toMatchObject({ reason: "memory", freeMb: 100 });
  });

  it("restarts a crashed software, then gives up after the limit and says so", async () => {
    setup({ PREMISE_RUNNER__RESTART_LIMIT: "2" });
    const s = makeSoftware(db, config, "Fragile", {
      "server.js": CRASHING_SERVER,
      "premise/run.md": runBlock(["kind: web", "start: node server.js"]),
    });
    await runner.start(s.id);
    const deadline = Date.now() + 15_000;
    while (runner.view(s.id).state !== "crashed" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const view = runner.view(s.id);
    expect(view.state).toBe("crashed");
    expect(view.restarts).toBe(2);
    expect(view.plain).toContain("stopped starting it again");
    expect(view.output.join("\n")).toContain("about to crash");
    expect(view.link).toBeNull();
    const kinds = db
      .prepare("SELECT kind FROM events WHERE module = 'runner' ORDER BY id")
      .all()
      .map((e) => e.kind);
    expect(kinds).toEqual([
      "started",
      "crashed",
      "restarted",
      "crashed",
      "restarted",
      "crashed",
      "gave-up",
    ]);
  });

  it("refuses software that listens beyond this machine", async () => {
    const outside = Object.values(networkInterfaces())
      .flatMap((l) => l ?? [])
      .some((a) => !a.internal && a.family === "IPv4");
    if (!outside) return; // nothing to reach it by on this machine
    const s = makeSoftware(db, config, "Open", {
      "server.js": OPEN_SERVER,
      "premise/run.md": runBlock(["kind: web", "start: node server.js"]),
    });
    await expect(runner.start(s.id)).rejects.toThrow(/other computers could reach it/);
    expect(runner.view(s.id).state).toBe("failed");
  });

  it("fails with the output when the software stops right away", async () => {
    const s = makeSoftware(db, config, "Dead", {
      "premise/run.md": runBlock(["kind: web", "start: node missing.js"]),
    });
    await expect(runner.start(s.id)).rejects.toThrow(/stopped by itself right after starting/);
  });

  it("keeps a deliberate stop while starting as stopped, not failed", async () => {
    const s = makeSoftware(db, config, "Slow", {
      "server.js":
        "setTimeout(() => require('http').createServer((q, r) => r.end('ok')).listen(Number(process.env.PORT), '127.0.0.1'), 5000);",
      "premise/run.md": runBlock(["kind: web", "start: node server.js"]),
    });
    const starting = runner.start(s.id);
    for (let i = 0; i < 100 && runner.view(s.id).state !== "starting"; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 300));
    await runner.stop(s.id);
    await starting.catch(() => undefined);
    expect(runner.view(s.id).state).toBe("stopped");
    const kinds = (
      db.prepare("SELECT kind FROM events WHERE module = 'runner' ORDER BY id").all() as {
        kind: string;
      }[]
    ).map((e) => e.kind);
    expect(kinds).not.toContain("failed");
  });

  it("fails with a way to fix it when there is no run.md", async () => {
    const s = makeSoftware(db, config, "Bare", { "readme.txt": "hi" });
    await expect(runner.start(s.id)).rejects.toThrow(/has no premise\/run\.md/);
  });

  it("says nothing is built when the software has no repository", async () => {
    const { createSoftware } = await import("../src/storage/softwares.js");
    const id = createSoftware(db, { name: "Idea" }, config.softwares).id;
    expect(runner.view(id)).toMatchObject({ state: "none", canStart: false });
    await expect(runner.start(id)).rejects.toThrow(/Nothing has been built/);
  });
});

describe("a desktop program", () => {
  it("is shown as built, with how to start it, and is not started", async () => {
    const s = makeSoftware(db, config, "Desk", {
      "premise/run.md": runBlock([
        "kind: program",
        "program: dist/desk, started by double-clicking it",
      ]),
    });
    const view = await runner.start(s.id);
    expect(view).toMatchObject({
      state: "built",
      command: "dist/desk, started by double-clicking it",
    });
  });
});

describe("the run queue handler", () => {
  it("ends done when the software is up, and failed with the reason when not", async () => {
    const ok = makeSoftware(db, config, "Pages", WEB);
    const done = await runner.handleRunJob({ softwareId: ok.id, payload: {} } as never);
    expect(done).toMatchObject({ kind: "done" });
    const bad = makeSoftware(db, config, "Bare", { x: "y" });
    const failed = await runner.handleRunJob({ softwareId: bad.id, payload: {} } as never);
    expect(failed).toMatchObject({ kind: "failed" });
  });
});

describe("starting again after premise stopped", () => {
  it("marks runs that were up as stopped", async () => {
    const s = makeSoftware(db, config, "Pages", WEB);
    await runner.start(s.id);
    // A second runner stands for premise starting again: nothing is really up under it.
    const second = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
    });
    expect(second.recoverStale()).toBe(1);
    expect(second.view(s.id)).toMatchObject({ state: "stopped", link: null });
  });
});

function bubblewrapWorks(): boolean {
  try {
    const command = confine({
      mode: "bubblewrap",
      copy: tmpdir(),
      shellCommand: "true",
      network: false,
      readOnlyPaths: [],
    });
    execFileSync(command.file, command.args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!bubblewrapWorks())("confinement with bubblewrap", () => {
  const nodeFolder = dirname(dirname(process.execPath));

  it("runs software that cannot see premise's data or the owner's files", async () => {
    setup({
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([nodeFolder]),
    });
    const probe = `
const fs = require("node:fs");
const list = (p) => { try { return fs.readdirSync(p).join(","); } catch { return "unreadable"; } };
const seen = (p) => { try { fs.readdirSync(p); return true; } catch { return false; } };
console.log("data=" + list(${JSON.stringify(dataFolder)}) + " home=" + seen(${JSON.stringify(process.env.HOME ?? "/nonexistent")} + "/.ssh") + " own=" + fs.existsSync(process.cwd() + "/probe.js"));
`;
    const s = makeSoftware(db, config, "Probe", {
      "probe.js": probe,
      "premise/run.md": runBlock([
        "kind: command",
        "command: node probe.js",
        "sample: node probe.js",
      ]),
    });
    const view = await runner.start(s.id);
    expect(view.confined).toBe(true);
    expect(view.output).toEqual(["data=work home=false own=true"]);
  });

  it("starts a web software inside it and reaches it on this machine", async () => {
    setup({
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([nodeFolder]),
    });
    const s = makeSoftware(db, config, "Pages", WEB);
    const view = await runner.start(s.id);
    expect(await fetchText(view.link!)).toBe("hello from the fixture web app");
    await runner.stop(s.id);
    expect(existsSync(join(dataFolder, "logs", s.id))).toBe(true);
  });
});
