import { describe, expect, it } from "vitest";
import { TOKEN_HEADER } from "../src/server/app.js";
import { issueSessionToken } from "../src/server/session-token.js";
import { testApp } from "./helpers.js";

describe("page server: the session check", () => {
  it("answers the health check without a token", async () => {
    const { app, host } = await testApp();
    const response = await app.inject({ url: "/api/health", headers: { host } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, name: "premise" });
  });

  it("refuses the API without the session token, and says what to do", async () => {
    const { app, host } = await testApp();
    const response = await app.inject({ url: "/api/overview", headers: { host } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toContain("npm run new-link");
  });

  it("refuses the API without a token when the path is percent-encoded", async () => {
    const { app, host } = await testApp();
    const response = await app.inject({ url: "/%61pi/overview", headers: { host } });
    expect(response.statusCode).not.toBe(200);
    expect(response.body).not.toContain("dataFolder");
  });

  it("refuses a token once a newer link is issued", async () => {
    const { app, host, token, db } = await testApp();
    issueSessionToken(db, 32);
    const response = await app.inject({
      url: "/api/overview",
      headers: { host, [TOKEN_HEADER]: token },
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses other host names and other sites", async () => {
    const { app, host, token } = await testApp();
    expect(
      (await app.inject({ url: "/api/health", headers: { host: "evil.example" } })).statusCode,
    ).toBe(403);
    const fromOtherSite = await app.inject({
      url: "/api/overview",
      headers: { host, origin: "https://evil.example", [TOKEN_HEADER]: token },
    });
    expect(fromOtherSite.statusCode).toBe(403);
  });

  it("takes the token in the URL only for the event stream", async () => {
    const { app, host, token } = await testApp();
    const response = await app.inject({ url: `/api/overview?token=${token}`, headers: { host } });
    expect(response.statusCode).toBe(401);
  });

  it("sends headers that keep other sites from framing or reading the page", async () => {
    const { app, host } = await testApp();
    const response = await app.inject({ url: "/", headers: { host } });
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("says how to build the page when it is missing", async () => {
    const { app, host } = await testApp();
    const response = await app.inject({ url: "/", headers: { host } });
    expect(response.body).toContain("npm run build");
  });
});

describe("page server: overview and settings", () => {
  it("gives the overview, with where usage figures come from", async () => {
    const { call } = await testApp();
    await call("POST", "/api/softwares", { idea: "A tool that renames photos by date" });
    const { status, body } = await call("GET", "/api/overview");
    expect(status).toBe(200);
    expect(body.agents.mode).toBe("scripted");
    expect(body.line).toEqual({
      mode: "engine",
      standInStages: [],
    });
    expect(body.activity.max).toBe(2);
    expect(body.usage).toEqual({ mode: "demo-fixed", source: "demo", problem: null });
    expect(body).not.toHaveProperty("softwareUsage");
    expect(body.softwares[0]).toMatchObject({ name: "Tool that renames photos", stage: "why" });
    expect(body.openAsks).toBe(1);
  });

  it("shows every setting with its value, default and where to change it", async () => {
    const { call } = await testApp({ PREMISE_QUEUE__MAX_AGENT_SESSIONS: "3" });
    const { body } = await call("GET", "/api/settings");
    expect(body.configFile).toMatch(/config\.json$/);
    const max = body.settings.find((s: { key: string }) => s.key === "queue.max_agent_sessions");
    expect(max).toMatchObject({
      value: 3,
      default: 2,
      changed: true,
      envName: "PREMISE_QUEUE__MAX_AGENT_SESSIONS",
    });
    const model = body.settings.find((s: { key: string }) => s.key === "agents.tasks.build.model");
    expect(model).toMatchObject({ value: "opus", changed: false });
  });
});

describe("record routes", () => {
  it("reads a software's record through the API, and says plainly when an item is unknown", async () => {
    const { call, record: keeper } = await testApp();
    await call("POST", "/api/softwares", { idea: "A tool that renames photos by date" });
    const software = (await call("GET", "/api/overview")).body.softwares[0];
    const copy = keeper.createWorkingCopy(software.id, "a", "job-a");
    const change = keeper.propose(
      software.id,
      [{ op: "add", kind: "Y", text: "People lose track.", from: "operator" }],
      "start",
      { workingCopy: copy },
    );
    keeper.applyReview(change.changeId, { verdict: "consistent" });
    keeper.write(change.changeId, { workingCopy: copy });
    keeper.mergeJob(software.id, copy, "job-a");
    const base = `/api/softwares/${software.id}`;
    const list = await call("GET", `${base}/record-items`);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual(["Y-1"]);
    const one = await call("GET", `${base}/record/Y-1`);
    expect(one.body.text).toBe("People lose track.");
    const history = await call("GET", `${base}/record/Y-1/history`);
    expect(history.body.commits.length).toBeGreaterThan(0);
    const missing = await call("GET", `${base}/record/W-9`);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toContain("not in this software's record");
    const plan = await call("GET", `${base}/effort-plan`);
    expect(plan.body).toMatchObject({ priority: 3, milestones: [] });
    const badKind = await call("GET", `${base}/record-items?kind=Z`);
    expect(badKind.status).toBe(400);
  });
});
