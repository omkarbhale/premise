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
import { prepareWorkingCopy, workingCopyPath } from "../src/agents/working-copy.js";
import { runDoctor } from "../src/doctor/doctor.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { createSession } from "../src/server/wiring.js";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { MockUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";
import { tempFolder, testApp, testConfig } from "./helpers.js";

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
    expect(outcome).toMatchObject({ kind: "done", summary: "Done: wrote add.js and its test." });
    // What the session's own result and stream said it used, kept as premise's own count.
    expect(outcome.figures).toEqual({
      turns: 3,
      costUsd: 0.25,
      inputTokens: 10,
      outputTokens: 200,
      cacheReadTokens: 3000,
      cacheWriteTokens: 500,
    });
    expect(outcome.windows).toEqual([
      {
        window: "seven_day",
        usedPercent: 7,
        resetsAt: new Date(1795399200 * 1000).toISOString(),
        status: "allowed",
      },
    ]);
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
    expect((await run(runner, { brief: "scenario:fail" })).outcome).toMatchObject({
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
    expect((outcome as { summary: string }).summary).toContain("tell premise where it is");
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
    expect(outcome).toMatchObject({
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

  it("confirms a session only once Claude Code has reported it", async () => {
    const { runner } = setup();
    const early = runner.start(request({ brief: "scenario:hang" }), () => {});
    early.stop();
    expect(await early.outcome).toEqual({ kind: "stopped" });
    expect(await Promise.race([early.confirmed, Promise.resolve("never")])).toBe("never");

    const finished = runner.start(request(), () => {});
    await finished.outcome;
    expect(await finished.confirmed).toBe(finished.sessionId);
    const carried = runner.start(request({ resumeSessionId: "earlier" }), () => {});
    await carried.outcome;
    expect(await carried.confirmed).toBe("earlier");
  });

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
    expect(second.outcome).toMatchObject({ kind: "done", summary: `Resumed ${first.sessionId}.` });
    expect(second.sessionId).toBe(first.sessionId);
    expect(readFileSync(join(kept, "half-done.txt"), "utf8")).toBe("work in progress");
    const last = calls(folder).at(-1)!;
    expect(last.args[last.args.indexOf("-p") + 1]).toBe(RESUME_PROMPT);
    expect(last.args[last.args.indexOf("--resume") + 1]).toBe(first.sessionId);
  });

  it("carries on a builder's clone only once premise finished setting it up", async () => {
    const folder = tempFolder();
    const repository = gitRepository();
    const request = { dataFolder: folder, softwareId: "s1", jobId: 4, kind: "branch" as const };
    const copy = workingCopyPath(folder, "s1", 4);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: copy }).toString().trim();
    // premise stopped right after cloning: no branch, no identity to commit with.
    mkdirSync(join(copy, ".."), { recursive: true });
    execFileSync("git", ["clone", "--quiet", repository, copy]);
    await prepareWorkingCopy({ ...request, repository, reuse: true });
    expect(git("branch", "--show-current")).toBe("premise/job-4");
    expect(git("config", "user.name")).toBe("premise agent");

    // A copy that was set up is carried on as it is, work in progress and all.
    writeFileSync(join(copy, "half-done.txt"), "work in progress");
    await prepareWorkingCopy({ ...request, repository, reuse: true });
    expect(readFileSync(join(copy, "half-done.txt"), "utf8")).toBe("work in progress");
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
    expect(outcome).toMatchObject({ kind: "done", summary: "Committed add.js." });
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
    const ledger = new MockUsageLedger("mock-fixed", 1);
    const session = createSession({ db, config, ledger, runner });
    const app = await createApp({
      config,
      db,
      schemaVersion,
      services: session.services,
      ledger,
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

describe("hosts a person allowed for one software (decision 0300)", () => {
  it("are in the next session's sandbox for that software only, besides the registries", async () => {
    const { folder, config, tools } = setup();
    const allowed: Record<string, string[]> = { game: ["downloads.example.org"] };
    const runner = new ClaudeAgentRunner({
      config,
      tools,
      toolsUrl: `http://127.0.0.1:${config.server.port}/mcp`,
      docsFolder: DOCS,
      env: { ...process.env },
      home: tempFolder(),
      extraHosts: (softwareId) => allowed[softwareId] ?? [],
    });
    await run(runner, { softwareId: "game", taskKind: "build", jobId: 7 });
    await run(runner, { softwareId: "notes", taskKind: "build", jobId: 8 });
    const domains = (id: string) =>
      (calls(folder, id)[0]!.settings.sandbox.network as { allowedDomains: string[] })
        .allowedDomains;
    expect(domains("game")).toEqual([
      ...config.agents.network.allowed_domains,
      "downloads.example.org",
    ]);
    expect(domains("notes")).toEqual(config.agents.network.allowed_domains);
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

describe("real-agent-shaped tool calls, end to end", () => {
  it("lets a sizer, a drafter and a triager hand in answers shaped as real agents sent them", async () => {
    // The claude command is a wrapper that runs the fake claude in its "real-shapes" scenario for
    // every session, whatever premise's brief says.
    const bin = tempFolder();
    const wrapper = join(bin, "claude");
    writeFileSync(
      wrapper,
      `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLAUDE}" --fake-scenario real-shapes "$@"\n`,
      { mode: 0o755 },
    );
    const port = await freePort();
    const app = await testApp(
      {
        PREMISE_AGENTS__CLAUDE__COMMAND: wrapper,
        PREMISE_AGENTS__CLAUDE__STOP_GRACE_SECONDS: "1",
        PREMISE_SERVER__PORT: String(port),
      },
      {
        makeRunner: (tools, config) =>
          new ClaudeAgentRunner({
            config,
            tools,
            toolsUrl: `http://127.0.0.1:${port}/mcp`,
            docsFolder: DOCS,
            env: { ...process.env },
            home: tempFolder(),
          }),
      },
    );
    await app.app.listen({ host: "127.0.0.1", port });
    try {
      const { body } = await app.call("POST", "/api/softwares", { idea: "A reading list" });
      await app.settle();
      const report = await app.call("POST", `/api/softwares/${body.id}/intake`, {
        text: "Add a dark theme",
      });
      expect(report.status).toBe(201);
      await app.settle();

      const calls = (
        app.db.prepare("SELECT detail FROM events WHERE kind = 'tool-call' ORDER BY id").all() as {
          detail: string;
        }[]
      ).map((r) => JSON.parse(r.detail) as Record<string, unknown>);
      const of = (tool: string) => calls.filter((c) => c.tool === tool);
      // Lists sent as quoted text, and yes or no, are taken.
      expect(of("sizing_submit").map((c) => c.ok)).toEqual([true]);
      expect(of("triage_submit").map((c) => c.ok)).toEqual([true]);
      // A drafted item's words under "line" are refused, naming the field and where to put it;
      // the fixed draft is taken.
      const drafts = of("draft_submit");
      expect(drafts[0]).toMatchObject({ ok: false, error: "MALFORMED" });
      expect((drafts[0]!.diagnostics as string[])[0]).toContain(
        '"items[0].text" is missing: The item\'s words, one line, without an ID or list mark. It has "line", which premise does not read here: put that in "text".',
      );
      expect(drafts.at(-1)).toMatchObject({ ok: true });
      // A record operation without "from" is refused, naming it, with an example.
      const proposal = of("record_propose")[0]!;
      expect(proposal).toMatchObject({ ok: false, error: "MALFORMED" });
      expect((proposal.diagnostics as string[])[0]).toBe(
        '"operations[0].from" is missing: Who it comes from: "assumed" for your own idea, or the role whose own words it is, such as "operator". For example: "from": "assumed"',
      );

      const intake = await app.call("GET", `/api/softwares/${body.id}/intake`);
      expect(intake.body.items[0]).toMatchObject({ ref: "I-1", routedBy: "triager" });
      expect(intake.body.untriaged).toBeNull();
      const asks = await app.call("GET", `/api/asks?softwareId=${body.id}`);
      expect(JSON.stringify(asks.body)).toContain(
        "People keep track of the books they want to read.",
      );
    } finally {
      await app.app.close();
    }
  }, 60_000);
});
