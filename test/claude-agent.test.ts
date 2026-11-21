import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentOutcome, AgentRequest } from "../src/agents/agent-runner.js";
import {
  ClaudeAgentRunner,
  PrerequisiteMissingError,
  RESUME_PROMPT,
  missingSandboxTools,
} from "../src/agents/claude-agent.js";
import { AgentToolServer } from "../src/agents/tool-server.js";
import { workingCopyPath } from "../src/agents/working-copy.js";
import { runDoctor } from "../src/doctor/doctor.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { MockUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";
import { tempFolder, testConfig } from "./helpers.js";

const FAKE_CLAUDE = join(import.meta.dirname, "fixtures", "fake-claude.mjs");
const DOCS = join(import.meta.dirname, "..", "docs");

function setup(env: NodeJS.ProcessEnv = {}, port?: number) {
  const folder = tempFolder();
  const config = testConfig(folder, {
    PREMISE_AGENTS__CLAUDE__COMMAND: FAKE_CLAUDE,
    PREMISE_AGENTS__CLAUDE__STOP_GRACE_SECONDS: "1",
    ...(port ? { PREMISE_SERVER__PORT: String(port) } : {}),
    ...env,
  });
  const { db, schemaVersion } = openDatabase(folder);
  const tools = new AgentToolServer({ db, config });
  const runner = new ClaudeAgentRunner({
    config,
    tools,
    toolsUrl: `http://127.0.0.1:${config.server.port}/mcp`,
    docsFolder: DOCS,
    env: { ...process.env, ANTHROPIC_API_KEY: "must-not-reach-the-agent", GH_TOKEN: "nor-this" },
    home: tempFolder(),
  });
  return { folder, config, db, schemaVersion, tools, runner };
}

const request = (over: Partial<AgentRequest> = {}): AgentRequest => ({
  jobId: 1,
  softwareId: "s1",
  taskKind: "plan",
  attempt: 1,
  model: "haiku",
  effort: "low",
  maxTurns: 10,
  maxMinutes: 1,
  brief: "scenario:done",
  ...over,
});

interface FakeCall {
  args: string[];
  env: Record<string, string>;
  cwd: string;
  settings: { sandbox: Record<string, unknown>; permissions: { allow: string[]; deny: string[] } };
  mcp: { mcpServers: { premise: { url: string; headers: Record<string, string> } } };
}

/** How the fake claude was called, newest last. */
function calls(folder: string, softwareId = "s1"): FakeCall[] {
  const dir = join(folder, "work", softwareId);
  return readdirSync(dir)
    .filter((f) => f.startsWith("fake-claude-"))
    .sort((a, b) => Number(a.split("-").at(-2)) - Number(b.split("-").at(-2)))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as FakeCall);
}

async function run(
  runner: ClaudeAgentRunner,
  over: Partial<AgentRequest> = {},
): Promise<{ outcome: AgentOutcome; progress: string[]; sessionId: string }> {
  const progress: string[] = [];
  const session = runner.start(request(over), (p) => progress.push(p.text));
  const outcome = await session.outcome;
  return { outcome, progress, sessionId: session.sessionId };
}

function gitRepository(): string {
  const repo = tempFolder();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.invalid");
  writeFileSync(join(repo, "README.md"), "# sample\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "first");
  return repo;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

describe("real agent runner, against a fake claude", () => {
  it("starts a session confined, and ends done with the session id from the init event", async () => {
    const { folder, runner } = setup();
    const { outcome, progress, sessionId } = await run(runner);
    expect(outcome).toEqual({ kind: "done", summary: "Done: wrote add.js and its test." });
    expect(progress).toEqual([
      "Starting the planner",
      "Looking at the working copy first.",
      "List the files",
      "Not allowed: Permission to use Bash with command curl https://example.com has been denied.",
      "Done: wrote add.js and its test.",
    ]);
    const [call] = calls(folder);
    const after = (flag: string) => call!.args[call!.args.indexOf(flag) + 1];
    expect(after("--session-id")).toBe(sessionId);
    expect(after("--model")).toBe("haiku");
    expect(after("--effort")).toBe("low");
    expect(after("--permission-mode")).toBe("dontAsk");
    expect(after("--tools")).toBe("Read,Glob,Grep");
    expect(after("--append-system-prompt")).toContain("# Skill: the-floor");
    expect(call!.cwd).toBe(workingCopyPath(folder, "s1", 1));
    expect(call!.settings.sandbox).toMatchObject({ enabled: true, failIfUnavailable: true });
    expect(call!.mcp.mcpServers.premise.headers.Authorization).toMatch(/^Bearer .{20,}/);
    // The environment is built from nothing: no API key, no other token.
    expect(call!.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(call!.env.GH_TOKEN).toBeUndefined();
    expect(call!.env.TERM).toBe("dumb");
    // The transcript is kept; the token file is not; a planner's working copy is removed.
    expect(readFileSync(join(folder, "transcripts", "job-1-1.jsonl"), "utf8")).toContain(
      '"type":"result"',
    );
    expect(existsSync(join(folder, "sessions", "job-1-1", "mcp.json"))).toBe(false);
    expect(existsSync(workingCopyPath(folder, "s1", 1))).toBe(false);
  });

  it("reports a failed session with what went wrong", async () => {
    const { runner } = setup();
    expect((await run(runner, { brief: "scenario:fail" })).outcome).toEqual({
      kind: "failed",
      summary: "The tests fail.",
      failureSignature: "claude-error_during_execution",
    });
  });

  it("says plainly when Claude Code is not logged in", async () => {
    const { runner } = setup();
    const { outcome } = await run(runner, { brief: "scenario:not-logged-in" });
    expect(outcome).toMatchObject({ kind: "failed", failureSignature: "not-logged-in" });
    expect((outcome as { summary: string }).summary).toContain("Run `claude` once");
  });

  it("reports a crash, and a sandbox that would not start", async () => {
    const { runner } = setup();
    expect((await run(runner, { brief: "scenario:crash" })).outcome).toMatchObject({
      kind: "failed",
      failureSignature: "claude-exit-3",
      summary: expect.stringContaining("something broke inside"),
    });
    expect((await run(runner, { brief: "scenario:sandbox", jobId: 2 })).outcome).toMatchObject({
      kind: "failed",
      failureSignature: "sandbox-unavailable",
    });
  });

  it("says where Claude Code was expected when it is not installed", async () => {
    const { runner } = setup({ PREMISE_AGENTS__CLAUDE__COMMAND: "/nowhere/claude" });
    const { outcome } = await run(runner);
    expect(outcome).toMatchObject({ kind: "failed", failureSignature: "agent-start-failed" });
    expect((outcome as { summary: string }).summary).toContain("agents.claude.command");
  });

  it("maps a rejected rate-limit event to the usage limit, with its reset time", async () => {
    const { runner } = setup();
    const before = Date.now();
    const { outcome } = await run(runner, { brief: "scenario:usage-limit" });
    expect(outcome.kind).toBe("usage-limit");
    const resetAt = Date.parse((outcome as { resetAt: string }).resetAt);
    expect(resetAt).toBeGreaterThan(before + 3500_000);
  });

  it("shows a warning when the usage limit is near", async () => {
    const { runner } = setup();
    const { outcome, progress } = await run(runner, { brief: "scenario:usage-warning" });
    expect(outcome.kind).toBe("done");
    expect(progress).toContain("The subscription's usage limit is near.");
  });

  it("stops a session at its turn limit, as stuck", async () => {
    const { runner } = setup();
    const { outcome } = await run(runner, { brief: "scenario:turns", maxTurns: 5 });
    expect(outcome).toEqual({
      kind: "stuck",
      summary: "The session reached its turn limit of 5 turns and was stopped.",
    });
  });

  it("stops a session at its time limit, as stuck", async () => {
    const { runner } = setup();
    const { outcome } = await run(runner, { brief: "scenario:hang", maxMinutes: 0.005 });
    expect(outcome).toMatchObject({ kind: "stuck" });
    expect((outcome as { summary: string }).summary).toContain("time limit");
  });

  it("stops a session when asked, and ends one that ignores the request", async () => {
    const { runner } = setup();
    for (const scenario of ["hang", "stubborn"]) {
      const progress: string[] = [];
      const session = runner.start(request({ brief: `scenario:${scenario}` }), (p) =>
        progress.push(p.text),
      );
      while (!progress.some((p) => p !== "Starting the planner")) {
        await new Promise((r) => setTimeout(r, 20));
      }
      session.stop();
      expect(await session.outcome).toEqual({ kind: "stopped" });
    }
  }, 15_000);

  it("stops a session that uses an API key", async () => {
    const { runner } = setup();
    const { outcome } = await run(runner, { brief: "scenario:api-key" });
    expect(outcome).toMatchObject({ kind: "failed", failureSignature: "api-key-in-use" });
  });

  it("carries a cut-off session on with --resume, in the same working copy", async () => {
    const { folder, runner } = setup({ PREMISE_DATA__KEEP_FINISHED_WORKING_COPIES: "true" });
    const first = await run(runner, { brief: "scenario:usage-limit", taskKind: "build" });
    expect(first.outcome.kind).toBe("usage-limit");
    const kept = workingCopyPath(folder, "s1", 1);
    expect(existsSync(kept)).toBe(true);
    writeFileSync(join(kept, "half-done.txt"), "work in progress");

    const second = await run(runner, {
      taskKind: "build",
      attempt: 2,
      resumeSessionId: first.sessionId,
    });
    expect(second.outcome).toEqual({ kind: "done", summary: `Resumed ${first.sessionId}.` });
    expect(second.sessionId).toBe(first.sessionId);
    expect(readFileSync(join(kept, "half-done.txt"), "utf8")).toBe("work in progress");
    const last = calls(folder).at(-1)!;
    expect(last.args[last.args.indexOf("-p") + 1]).toBe(RESUME_PROMPT);
    expect(last.args[last.args.indexOf("--resume") + 1]).toBe(first.sessionId);
  });

  it("gives a builder a clone on its own branch, and keeps sandbox placeholders out of its commit", async () => {
    const { folder, runner } = setup();
    const repository = gitRepository();
    const { outcome } = await run(runner, {
      taskKind: "build",
      jobId: 9,
      brief: "scenario:commit",
      repository,
    });
    expect(outcome).toEqual({ kind: "done", summary: "Committed add.js." });
    const copy = workingCopyPath(folder, "s1", 9);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: copy }).toString().trim();
    expect(git("branch", "--show-current")).toBe("premise/job-9");
    expect(git("show", "--name-only", "--format=", "HEAD").split("\n")).toEqual(["add.js"]);
    const call = calls(folder).at(-1)!;
    expect(call.args[call.args.indexOf("-p") + 1]).toContain("on the branch premise/job-9");
    expect(call.settings.permissions.allow).toContain("Bash");
  });

  it("serves a session premise's tools for its role, with its own token, until it ends", async () => {
    const port = await freePort();
    const { folder, config, db, schemaVersion, tools, runner } = setup({}, port);
    const queue = new WorkQueue({ db, config, runner });
    const app = await createApp({
      config,
      db,
      schemaVersion,
      queue,
      ledger: new MockUsageLedger("mock-fixed", 1),
      setup: await runDoctor({
        dataFolder: folder,
        env: {},
        run: () => Promise.resolve({ ok: true, output: "1.0" }),
      }),
      webRoot: tempFolder(),
      tools,
    });
    await app.listen({ host: "127.0.0.1", port });
    try {
      const { outcome, progress } = await run(runner, {
        taskKind: "build",
        brief: "scenario:tools",
      });
      expect(outcome.kind).toBe("done");
      expect(JSON.parse((outcome as { summary: string }).summary)).toEqual({
        tools: ["record_read", "record_propose", "ask", "gate_request", "progress", "task_finish"],
        denied: "NOT_ALLOWED",
      });
      expect(progress).toContain("Halfway there");
      // The token was revoked when the session ended.
      const token = calls(folder).at(-1)!.mcp.mcpServers.premise.headers.Authorization;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { authorization: token, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "progress", arguments: { text: "late" } },
        }),
      });
      const body = (await response.json()) as { result: { content: { text: string }[] } };
      expect(JSON.parse(body.result.content[0]!.text).error.code).toBe("TASK_CLOSED");
    } finally {
      await app.close();
    }
  });
});

describe("real agents in the work queue", () => {
  it("pauses all work at the usage limit, then carries the same session on", async () => {
    const { db, config, runner } = setup();
    const queue = new WorkQueue({ db, config, runner });
    const software = createSoftware(db, { name: "sample" }, config.softwares);
    const id = queue.enqueue({
      softwareId: software.id,
      kind: "build",
      payload: { brief: "scenario:usage-limit" },
    });
    queue.tick();
    await queue.idle();
    expect(queue.state()).toMatchObject({
      paused: true,
      reason: "The subscription's usage limit was reached.",
    });
    expect(queue.get(id)!.status).toBe("queued");
    const first = db
      .prepare("SELECT runtime_session_id, end_reason FROM agent_sessions WHERE job_id = ?")
      .get(id) as { runtime_session_id: string; end_reason: string };
    expect(first.end_reason).toBe("usage-limit");

    queue.resumeAll();
    queue.tick();
    await queue.idle();
    const job = queue.get(id)!;
    expect(job.status).toBe("done");
    expect(job.result).toBe(`Resumed ${first.runtime_session_id}.`);
  });
});

describe("prerequisites for real agents", () => {
  it("names bubblewrap and socat when they are missing, on Linux only", async () => {
    expect(
      await missingSandboxTools("linux", (command) => Promise.resolve(command === "bwrap")),
    ).toEqual(["socat"]);
    expect(await missingSandboxTools("linux", () => Promise.resolve(false))).toEqual([
      "bubblewrap",
      "socat",
    ]);
    expect(await missingSandboxTools("darwin", () => Promise.resolve(false))).toEqual([]);
  });

  it("refuses with a plain message that says what to do", () => {
    const error = new PrerequisiteMissingError(["socat"]);
    expect(error.message).toContain("socat is missing");
    expect(error.message).toContain("sudo apt install socat");
    expect(error.message).toContain('agents.mode to "scripted"');
  });

  it("keeps the working copy folder per software and job", () => {
    const folder = tempFolder();
    mkdirSync(join(folder, "work"));
    expect(workingCopyPath(folder, "../evil", 3)).toBe(join(folder, "work", "__evil", "job-3"));
  });
});
