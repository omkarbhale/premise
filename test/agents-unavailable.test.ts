import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { nextStage, rootItem } from "../src/line/work-items.js";
import { start } from "../src/server/start.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

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

describe("when real agents cannot start", () => {
  it("premise starts anyway, holds agent work, says what is missing, and offers a scripted look-around", async () => {
    const port = await freePort();
    const lines: string[] = [];
    // Claude Code is missing on this pretend machine; agents.mode is left at its default, "claude".
    const running = await start({
      dataFolder: tempFolder(),
      env: { PREMISE_SERVER__PORT: String(port), PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0" },
      print: (line) => lines.push(line),
      run: (command) =>
        Promise.resolve(
          command === "claude" ? { ok: false, output: "" } : { ok: true, output: "1.0" },
        ),
    });
    try {
      expect(lines.join("\n")).toContain("NOT READY");
      const token = /#token=(.+)$/.exec(running.link)![1]!;
      const api = async (method: string, path: string, body?: unknown) => {
        const res = await fetch(`http://localhost:${port}${path}`, {
          method,
          headers: {
            "x-premise-token": token,
            ...(body !== undefined && { "content-type": "application/json" }),
          },
          ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        return { status: res.status, body: JSON.parse(await res.text()) };
      };
      const overview = await api("GET", "/api/overview");
      expect(overview.body.agents).toMatchObject({
        mode: "claude",
        ready: false,
        scriptedDemo: false,
      });
      expect(overview.body.agents.unavailable).toContain("Claude Code");

      const started = await api("POST", "/api/softwares", { idea: "A reading list" });
      expect(started.status).toBe(201);
      const waiting = await api("GET", `/api/softwares/${started.body.id}`);
      expect(waiting.body.status).toContain("cannot start until real agents are set up");

      expect((await api("POST", "/api/agents/scripted-demo", {})).status).toBe(200);
      const after = await api("GET", "/api/overview");
      expect(after.body.agents).toMatchObject({
        mode: "scripted",
        ready: true,
        scriptedDemo: true,
      });
      // The held drafter now runs, scripted.
      for (let i = 0; i < 50; i++) {
        const asks = await api("GET", `/api/asks?software=${started.body.id}&status=open`);
        if (asks.body.length > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const asks = await api("GET", `/api/asks?software=${started.body.id}&status=open`);
      expect(asks.body[0].title).toBe("Why build it: is this right?");
    } finally {
      await running.close();
    }
  }, 30_000);
});

describe("work items", () => {
  it("gives each software a root item with every stage, and an item skips stages it does not list", () => {
    const folder = tempFolder();
    const { db } = openDatabase(folder);
    const software = createSoftware(db, { name: "Notes" }, testConfig(folder).softwares);
    const root = rootItem(db, software.id);
    expect(root).toMatchObject({ kind: "software", parentId: null, currentStage: "why" });
    expect(root.stages).toHaveLength(11);
    expect(nextStage(root, "who")).toBe("exists");
    expect(nextStage({ ...root, stages: ["what", "plan", "build"] }, "what")).toBe("plan");
    expect(nextStage({ ...root, stages: ["what", "plan"] }, "plan")).toBeUndefined();
    db.close();
  });
});
