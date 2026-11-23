import { describe, expect, it } from "vitest";
import { type ToolBinding, AgentToolServer, decodeEncoded } from "../src/agents/tool-server.js";
import { openDatabase } from "../src/storage/database.js";
import { tempFolder, testConfig } from "./helpers.js";

function setup(paused = false) {
  const folder = tempFolder();
  const config = testConfig(folder);
  const { db } = openDatabase(folder);
  const server = new AgentToolServer({ db, config, isPaused: () => paused });
  const progress: string[] = [];
  const bind = (role: ToolBinding["role"]): ToolBinding => ({
    role,
    softwareId: "s1",
    jobId: 4,
    onProgress: (text) => progress.push(text),
  });
  return { db, server, progress, bind };
}

/** A JSON-RPC message; a null id makes it a notification. */
const rpc = (method: string, params: Record<string, unknown> = {}, id: number | null = 1) => ({
  jsonrpc: "2.0",
  ...(id === null ? {} : { id }),
  method,
  params,
});

function callTool(server: AgentToolServer, token: string, name: string, args: unknown) {
  const answer = server.handleHttp(`Bearer ${token}`, rpc("tools/call", { name, arguments: args }));
  const body = answer.body as { result: { content: { text: string }[]; isError: boolean } };
  return JSON.parse(body.result.content[0]!.text) as {
    ok: boolean;
    result?: unknown;
    error?: { code: string; message: string };
    diagnostics: string[];
  };
}

describe("agent tools over MCP", () => {
  it("refuses a request without a known session token", () => {
    const { server } = setup();
    expect(server.handleHttp(undefined, rpc("tools/list")).status).toBe(401);
    expect(server.handleHttp("Bearer nope", rpc("tools/list")).status).toBe(401);
  });

  it("answers initialize, notifications and ping", () => {
    const { server, bind } = setup();
    const token = server.issue(bind("builder"));
    const init = server.handleHttp(
      `Bearer ${token}`,
      rpc("initialize", { protocolVersion: "2025-03-26" }),
    );
    expect(init.body).toMatchObject({
      id: 1,
      result: { protocolVersion: "2025-03-26", serverInfo: { name: "premise" } },
    });
    expect(
      server.handleHttp(`Bearer ${token}`, rpc("notifications/initialized", {}, null)).status,
    ).toBe(202);
    expect(server.handleHttp(`Bearer ${token}`, rpc("ping")).body).toMatchObject({ result: {} });
    expect(server.handleHttp(`Bearer ${token}`, rpc("resources/list")).body).toMatchObject({
      error: { code: -32601 },
    });
  });

  it("serves each role its own tools only", () => {
    const { server, bind } = setup();
    const list = (role: ToolBinding["role"]) => {
      const answer = server.handleHttp(`Bearer ${server.issue(bind(role))}`, rpc("tools/list"));
      return (answer.body as { result: { tools: { name: string }[] } }).result.tools.map(
        (t) => t.name,
      );
    };
    expect(list("builder")).toEqual([
      "record_read",
      "record_propose",
      "ask",
      "gate_request",
      "progress",
      "task_finish",
    ]);
    expect(list("checker")).toContain("verdict_submit");
    expect(list("builder")).not.toContain("verdict_submit");
    expect(list("reporter")).toContain("report_submit");
  });

  it("refuses a tool the role does not have, and records the call", () => {
    const { db, server, bind } = setup();
    const token = server.issue(bind("builder"));
    const envelope = callTool(server, token, "verdict_submit", { verdicts: [] });
    expect(envelope.ok).toBe(false);
    expect(envelope.error!.code).toBe("NOT_ALLOWED");
    const event = db
      .prepare("SELECT * FROM events WHERE module = 'agent-tools' AND kind = 'tool-call'")
      .get() as { detail: string; reference: string; software_id: string };
    expect(JSON.parse(event.detail)).toMatchObject({
      tool: "verdict_submit",
      ok: false,
      error: "NOT_ALLOWED",
    });
    expect(event.reference).toBe("4");
    expect(event.software_id).toBe("s1");
  });

  it("passes progress to the page, cut to the longest allowed line", () => {
    const { server, bind, progress } = setup();
    const token = server.issue(bind("builder"));
    expect(callTool(server, token, "progress", { text: `${"x".repeat(300)}\nmore` }).ok).toBe(true);
    expect(progress).toEqual(["x".repeat(200)]);
    expect(callTool(server, token, "progress", {}).error!.code).toBe("MALFORMED");
  });

  it("checks a question's shape and records it while the line engine is not built", () => {
    const { server, bind } = setup();
    const token = server.issue(bind("builder"));
    const tooMany = callTool(server, token, "ask", {
      role: "operator",
      kind: "question",
      items: Array.from({ length: 11 }, (_, i) => `item ${i}`),
    });
    expect(tooMany.error!.code).toBe("MALFORMED");
    expect(tooMany.diagnostics[0]).toContain("at most 10");
    const asked = callTool(server, token, "ask", {
      role: "operator",
      kind: "question",
      items: ["Which colour?"],
    });
    expect(asked).toMatchObject({ ok: true, result: { status: "recorded" } });
    expect((asked.result as { note: string }).note).toContain("not built yet");
  });

  it("answers TASK_CLOSED once the session's token is revoked, and PAUSED while work is paused", () => {
    const { server, bind } = setup();
    const token = server.issue(bind("builder"));
    server.revoke(token);
    expect(callTool(server, token, "progress", { text: "hi" }).error!.code).toBe("TASK_CLOSED");

    const paused = setup(true);
    const other = paused.server.issue(paused.bind("builder"));
    expect(callTool(paused.server, other, "progress", { text: "hi" }).error!.code).toBe("PAUSED");
  });

  it("takes a batch of messages", () => {
    const { server, bind } = setup();
    const token = server.issue(bind("triager"));
    const answer = server.handleHttp(`Bearer ${token}`, [
      rpc("ping", {}, 1),
      rpc("notifications/initialized", {}, null),
    ]);
    expect(answer.body).toHaveLength(1);
  });
});

describe("lists and objects sent as text (decision 0277)", () => {
  const schema = {
    inputSchema: {
      type: "object",
      properties: {
        touches: { type: "array" },
        run: { type: "object" },
        reason: { type: "string" },
      },
    },
  };

  it("reads a list or object the schema asks for when it came as JSON text", () => {
    expect(
      decodeEncoded(schema, {
        touches: '[{"id": "W-2", "reason": "why"}]',
        run: '{"kind": "command"}',
        reason: "[not a list]",
      }),
    ).toEqual({
      touches: [{ id: "W-2", reason: "why" }],
      run: { kind: "command" },
      reason: "[not a list]",
    });
  });

  it("leaves text that is not the kind asked for, or not JSON, to the tool's own checks", () => {
    const args = { touches: "W-2 and W-3", run: "[1]" };
    expect(decodeEncoded(schema, args)).toBe(args);
  });
});
