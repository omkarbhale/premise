import { mkdtempSync, rmSync } from "node:fs";
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

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function testConfig(dataFolder: string, env: NodeJS.ProcessEnv = {}): PremiseConfig {
  return loadConfig({ dataFolder, env });
}

import { ScriptedAgentRunner } from "../src/agents/scripted-agent.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import { runDoctor } from "../src/doctor/doctor.js";
import { TOKEN_HEADER, createApp } from "../src/server/app.js";
import { issueSessionToken } from "../src/server/session-token.js";
import { createSession } from "../src/server/wiring.js";
import { openDatabase } from "../src/storage/database.js";
import { MockUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";

/** A page server on a fresh data folder, with the stand-in line and scripted agents that finish at once. */
export async function testApp(env: NodeJS.ProcessEnv = {}) {
  const folder = tempFolder();
  const config = testConfig(folder, { PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0", ...env });
  const { db, schemaVersion } = openDatabase(folder);
  const ledger = new MockUsageLedger("mock-fixed", 1);
  const session = createSession({
    db,
    config,
    ledger,
    runner: new ScriptedAgentRunner(standInScript(0)),
  });
  const setup = await runDoctor({
    dataFolder: folder,
    env: {},
    run: () => Promise.resolve({ ok: true, output: "1.0" }),
  });
  const record = new RecordKeeper({ db, config, today: () => "2026-11-22" });
  const app = await createApp({
    config,
    db,
    schemaVersion,
    services: session.services,
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
    for (let i = 0; i < 20; i++) {
      session.queue.tick();
      await session.queue.idle();
      await new Promise((r) => setTimeout(r, 5));
      if (session.queue.list("queued").length === 0 && session.queue.list("running").length === 0) {
        return;
      }
    }
  };
  return { app, db, config, token, host, headers, call, settle, session, folder, record };
}
