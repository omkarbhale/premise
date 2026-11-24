import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LaterStages } from "../src/line/later-stages.js";
import { afterEach } from "vitest";
import { loadConfig } from "../src/config/load.js";
import type { PremiseConfig } from "../src/config/settings.js";
import { RecordKeeper } from "../src/record/record-keeper.js";
import type { AskAnswer, AskView } from "../src/shared/api-types.js";

const folders: string[] = [];

/** A fresh, empty folder removed after the test. */
export function tempFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "premise-test-"));
  folders.push(folder);
  return folder;
}

/**
 * A range of ports for software the runner starts, unique to this test: it begins at a free port the
 * operating system hands out, so tests running at the same time on one machine never share ports.
 * Never use the default range in a test.
 */
export async function uniquePortRange(size = 50): Promise<{ range: string; first: number }> {
  const first = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
  return { range: `${first}-${Math.min(first + size - 1, 65535)}`, first };
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** Tests never call AI: agents are scripted unless a test says otherwise. */
export function testConfig(dataFolder: string, env: NodeJS.ProcessEnv = {}): PremiseConfig {
  return loadConfig({ dataFolder, env: { PREMISE_AGENTS__MODE: "scripted", ...env } });
}

import type { AgentRunner } from "../src/agents/agent-runner.js";
import { type AgentScript, ScriptedAgentRunner } from "../src/agents/scripted-agent.js";
import { AgentToolServer } from "../src/agents/tool-server.js";
import { PageReader } from "../src/agents/page-reader.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import { runDoctor } from "../src/doctor/doctor.js";
import { TOKEN_HEADER, createApp } from "../src/server/app.js";
import { issueSessionToken } from "../src/server/session-token.js";
import type { IssueSource } from "../src/intake/issues.js";
import type { GitHubCli } from "../src/git/github.js";
import { createSession } from "../src/server/wiring.js";
import { openDatabase } from "../src/storage/database.js";
import { DemoUsageLedger } from "../src/usage-ledger/demo-usage-ledger.js";
import type { UsageLedger } from "../src/usage-ledger/usage-ledger.js";
import type { Database } from "../src/storage/database.js";

/** A page reader that never touches the network: every public page is the same short page. */
export function testPages(config: PremiseConfig, body = "<h1>A page</h1><p>Its text.</p>") {
  return new PageReader({
    partChars: config.tools.page_part_chars,
    resolve: async () => ["203.0.113.7"],
    fetch: async () => ({ status: 200, contentType: "text/html", body }),
  });
}

/** A page server on a fresh data folder, with the line engine and scripted agents that finish at once. */
export async function testApp(
  env: NodeJS.ProcessEnv = {},
  options: {
    script?: AgentScript;
    folder?: string;
    later?: LaterStages;
    issues?: IssueSource;
    /** Act as with real agents (outside this machine), though the agents stay scripted. */
    realAgents?: boolean;
    /** The GitHub CLI, normally a fake one on its PATH (test/fixtures/fake-gh). */
    github?: GitHubCli;
    /**
     * Another agent runner, such as the real one against a fake claude
     * (test/fixtures/fake-claude.mjs). Its tools are served at /mcp once the app listens.
     */
    makeRunner?: (tools: AgentToolServer, config: PremiseConfig) => AgentRunner;
    /** A usage ledger of the test's own, such as the real one on a fake usage-ledger command. */
    makeLedger?: (db: Database, config: PremiseConfig) => UsageLedger;
  } = {},
) {
  const folder = options.folder ?? tempFolder();
  // Software the line starts runs unconfined in tests (bubblewrap may be missing), on ports of
  // this test's own.
  const ports = await uniquePortRange(20);
  const config = testConfig(folder, {
    PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0",
    PREMISE_RUNNER__CONFINEMENT: "none",
    PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
    PREMISE_RUNNER__PORT_RANGE: ports.range,
    // The scripted checker verifies nothing, so by default a whole-line test would stop at Check to
    // ask; tests of that ask set it back to "ask" (test/truthful.test.ts).
    PREMISE_LINE__WHEN_NOTHING_VERIFIED: "land",
    ...env,
  });
  const { db, schemaVersion } = openDatabase(folder);
  const ledger = options.makeLedger?.(db, config) ?? new DemoUsageLedger("demo-fixed", 1);
  // Tests never touch the network: a page the researcher reads is a fixed one.
  const tools = new AgentToolServer({ db, config, pages: testPages(config) });
  // Tests that bring their own runner never read the scripted runner's calls.
  const runner = (options.makeRunner?.(tools, config) ??
    new ScriptedAgentRunner(options.script ?? standInScript(0))) as ScriptedAgentRunner;
  const record = new RecordKeeper({ db, config, today: () => "2026-11-22" });
  const session = createSession({
    db,
    config,
    ledger,
    runner,
    tools,
    record,
    later: options.later,
    issues: options.issues,
    ...(options.realAgents !== undefined && { realAgents: () => options.realAgents! }),
    ...(options.github && { github: options.github }),
  });
  const setup = await runDoctor({
    dataFolder: folder,
    env: {},
    run: () => Promise.resolve({ ok: true, output: "1.0" }),
  });
  const app = await createApp({
    config,
    db,
    schemaVersion,
    services: session.services,
    agents: session.agents,
    ledger,
    record,
    setup,
    measures: session.measures,
    learning: session.learning,
    usage: session.usage,
    feedback: session.feedback,
    pausing: session.pausing,
    webRoot: tempFolder(),
    tools,
  });
  const token = issueSessionToken(db, config.server.token_bytes);
  const host = `localhost:${config.server.port}`;
  const headers = { host, [TOKEN_HEADER]: token };
  const call = async (method: "GET" | "POST", url: string, payload?: unknown) => {
    // Once listening on a port of its own (port 0), the server answers to that port's name.
    const address = app.server.address();
    const hostNow = address && typeof address === "object" ? `localhost:${address.port}` : host;
    const response = await app.inject({
      method,
      url,
      headers: { ...headers, host: hostNow },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json() : null };
  };
  /** Let every queued scripted job run to its end, and the line move on after each. */
  const settle = async () => {
    for (let i = 0; i < 40; i++) {
      // Learning looks for corrections on a timer when premise runs; tests look at once.
      session.learning.catchUp();
      session.queue.tick();
      await session.queue.idle();
      await session.gate.idle();
      await session.line.idle();
      await new Promise((r) => setTimeout(r, 5));
      if (session.queue.list("queued").length === 0 && session.queue.list("running").length === 0) {
        // Work started after an answer (a gate request asked a moment later) may still be going.
        await session.line.idle();
        await session.gate.idle();
        return;
      }
    }
  };
  return {
    app,
    db,
    config,
    token,
    host,
    headers,
    call,
    settle,
    session,
    folder,
    record,
    runner,
    tools,
  };
}

/**
 * The scope check's answer as the page sends it when nobody moves an item: every item where the
 * chosen cut puts it (the effort level's cut unless one is given).
 */
export function scopeAnswer(
  ask: AskView,
  cut: "asked" | "recommended" | "everything" = ask.scope?.preselected ?? "recommended",
): AskAnswer {
  const place = (tier: string | undefined) =>
    tier === "recommended"
      ? cut === "asked"
        ? "out"
        : "later"
      : tier === "could"
        ? cut === "everything"
          ? "later"
          : "out"
        : "first";
  return {
    kind: "scope",
    items: ask.items.map((i) => ({ key: i.key, place: place(i.tier) as "first" })),
  };
}
