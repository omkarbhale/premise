import { describe, expect, it } from "vitest";
import { ScriptedAgentRunner } from "../src/agents/scripted-agent.js";
import { runDoctor } from "../src/doctor/doctor.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { TOKEN_HEADER, createApp } from "../src/server/app.js";
import { issueSessionToken } from "../src/server/session-token.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { MockUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";
import { tempFolder, testConfig } from "./helpers.js";

async function setup() {
  const folder = tempFolder();
  const config = testConfig(folder);
  const { db, schemaVersion } = openDatabase(folder);
  const queue = new WorkQueue({ db, config, runner: new ScriptedAgentRunner() });
  const setupReport = await runDoctor({
    dataFolder: folder,
    env: {},
    run: () => Promise.resolve({ ok: true, output: "1.0" }),
  });
  createSoftware(db, { name: "sample" }, config.softwares);
  const app = await createApp({
    config,
    db,
    schemaVersion,
    queue,
    ledger: new MockUsageLedger("mock-fixed", 1),
    setup: setupReport,
    webRoot: tempFolder(),
  });
  const token = issueSessionToken(db, config.server.token_bytes);
  const host = `localhost:${config.server.port}`;
  return { app, token, host, db };
}

describe("page server", () => {
  it("answers the health check without a token", async () => {
    const { app, host } = await setup();
    const response = await app.inject({ url: "/api/health", headers: { host } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, name: "premise" });
  });

  it("refuses the API without the session token", async () => {
    const { app, host } = await setup();
    const response = await app.inject({ url: "/api/overview", headers: { host } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toContain("Open the link premise printed");
  });

  it("refuses the API without a token when the path is percent-encoded", async () => {
    const { app, host } = await setup();
    const response = await app.inject({ url: "/%61pi/overview", headers: { host } });
    expect(response.statusCode).not.toBe(200);
    expect(response.body).not.toContain("dataFolder");
  });

  it("refuses a token once a newer link is issued", async () => {
    const { app, host, token, db } = await setup();
    issueSessionToken(db, 32);
    const response = await app.inject({
      url: "/api/overview",
      headers: { host, [TOKEN_HEADER]: token },
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses other host names and other sites", async () => {
    const { app, host, token } = await setup();
    expect(
      (await app.inject({ url: "/api/health", headers: { host: "evil.example" } })).statusCode,
    ).toBe(403);
    const fromOtherSite = await app.inject({
      url: "/api/overview",
      headers: { host, origin: "https://evil.example", [TOKEN_HEADER]: token },
    });
    expect(fromOtherSite.statusCode).toBe(403);
  });

  it("gives the overview, with usage marked as mocked", async () => {
    const { app, host, token } = await setup();
    const response = await app.inject({
      url: "/api/overview",
      headers: { host, [TOKEN_HEADER]: token },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.agents.mode).toBe("scripted");
    expect(body.queue.maxAgentSessions).toBe(2);
    expect(body.usage).toMatchObject({ mocked: true, weekly: { mocked: true } });
    expect(body.softwares[0]).toMatchObject({
      name: "sample",
      priority: 3,
      usage: { mocked: true },
    });
  });

  it("says how to build the page when it is missing", async () => {
    const { app, host } = await setup();
    const response = await app.inject({ url: "/", headers: { host } });
    expect(response.body).toContain("npm run build");
  });
});
