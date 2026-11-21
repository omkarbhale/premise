import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { loadConfig } from "../src/config/load.js";
import type { PremiseConfig } from "../src/config/settings.js";
import { RecordKeeper } from "../src/record/record-keeper.js";

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

import { type AgentScript, ScriptedAgentRunner } from "../src/agents/scripted-agent.js";
import { AgentToolServer } from "../src/agents/tool-server.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import { runDoctor } from "../src/doctor/doctor.js";
import { TOKEN_HEADER, createApp } from "../src/server/app.js";
import { issueSessionToken } from "../src/server/session-token.js";
import { createSession } from "../src/server/wiring.js";
import { openDatabase } from "../src/storage/database.js";
import { MockUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";

/** A page server on a fresh data folder, with the line engine and scripted agents that finish at once. */
export async function testApp(
  env: NodeJS.ProcessEnv = {},
  options: { script?: AgentScript; folder?: string } = {},
) {
  const folder = options.folder ?? tempFolder();
  const config = testConfig(folder, { PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0", ...env });
  const { db, schemaVersion } = openDatabase(folder);
  const ledger = new MockUsageLedger("mock-fixed", 1);
  const tools = new AgentToolServer({ db, config });
  const runner = new ScriptedAgentRunner(options.script ?? standInScript(0));
  const record = new RecordKeeper({ db, config, today: () => "2026-11-22" });
  const session = createSession({
    db,
    config,
    ledger,
    runner,
    tools,
    record,
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
    webRoot: tempFolder(),
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
      session.queue.tick();
      await session.queue.idle();
      await session.gate.idle();
      await new Promise((r) => setTimeout(r, 5));
      if (session.queue.list("queued").length === 0 && session.queue.list("running").length === 0) {
        return;
      }
    }
  };
  return { app, db, config, token, host, headers, call, settle, session, folder, record, runner };
}
