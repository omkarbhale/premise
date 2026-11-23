#!/usr/bin/env node
// A stand-in for the `claude` program in tests: it calls no model. It emits stream-json events
// shaped like the ones recorded from real headless Claude Code sessions, chosen by a word in the
// prompt ("scenario:<name>"). It writes how it was called next to its working copy, so tests can
// check the arguments, the environment and the generated settings.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const prompt = flag("-p") ?? "";
const resume = flag("--resume");
const sessionId = resume ?? flag("--session-id") ?? "00000000-0000-4000-8000-000000000000";
// A test can choose the scenario for every session with --fake-scenario, through a wrapper script
// set as the claude command, where premise writes the prompt itself.
const scenario = resume
  ? "resume"
  : (flag("--fake-scenario") ?? /scenario:([a-z-]+)/.exec(prompt)?.[1] ?? "done");
const cwd = process.cwd();

writeFileSync(
  join(dirname(cwd), `fake-claude-${basename(cwd)}-${Date.now()}-${process.pid}.json`),
  JSON.stringify({
    args,
    env: process.env,
    cwd,
    settings: JSON.parse(readFileSync(flag("--settings"), "utf8")),
    mcp: JSON.parse(readFileSync(flag("--mcp-config"), "utf8")),
  }),
);

const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hang = () => new Promise(() => setInterval(() => {}, 1000));
let message = 0;
const assistant = (content) =>
  emit({
    type: "assistant",
    message: { id: `msg_${++message}`, type: "message", role: "assistant", content },
    session_id: sessionId,
  });
const result = (over) =>
  emit({
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: message,
    result: "",
    session_id: sessionId,
    total_cost_usd: 0.25,
    usage: {
      input_tokens: 10,
      output_tokens: 200,
      cache_read_input_tokens: 3000,
      cache_creation_input_tokens: 500,
    },
    permission_denials: [],
    ...over,
  });

emit({
  type: "system",
  subtype: "init",
  cwd,
  session_id: sessionId,
  model: flag("--model") === "haiku" ? "claude-haiku" : `claude-${flag("--model")}`,
  permissionMode: "dontAsk",
  apiKeySource: scenario === "api-key" ? "ANTHROPIC_API_KEY" : "none",
  tools: (flag("--tools") ?? "").split(","),
});

switch (scenario) {
  case "done":
    assistant([{ type: "text", text: "Looking at the working copy first." }]);
    assistant([
      {
        type: "tool_use",
        id: "toolu_1",
        name: "Bash",
        input: { command: "ls -la", description: "List the files" },
      },
    ]);
    emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        resetsAt: 1795399200,
        rateLimitType: "seven_day",
        unifiedWindows: {
          seven_day: { utilization: 0.07, resetsAt: 1795399200, status: "allowed" },
        },
      },
      session_id: sessionId,
    });
    emit({
      type: "system",
      subtype: "permission_denied",
      tool_name: "Bash",
      message: "Permission to use Bash with command curl https://example.com has been denied.",
      session_id: sessionId,
    });
    emit({ type: "user", message: { role: "user", content: [] }, session_id: sessionId });
    assistant([{ type: "text", text: "Done: wrote add.js and its test." }]);
    result({ result: "Done: wrote add.js and its test." });
    break;
  case "fail":
    assistant([{ type: "text", text: "Trying." }]);
    result({ subtype: "error_during_execution", is_error: true, result: "The tests fail." });
    break;
  case "not-logged-in":
    result({ is_error: true, result: "Not logged in · Please run /login" });
    break;
  case "crash":
    process.stderr.write("something broke inside\n");
    process.exit(3);
    break;
  case "sandbox":
    process.stderr.write("Error: sandbox required but unavailable: socat not found\n");
    process.exit(1);
    break;
  case "usage-limit":
    assistant([{ type: "text", text: "Starting." }]);
    emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "rejected",
        resetsAt: Math.floor(Date.now() / 1000) + 3600,
        rateLimitType: "five_hour",
      },
      session_id: sessionId,
    });
    await hang();
    break;
  case "usage-warning":
    emit({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed_warning",
        resetsAt: 1795399200,
        rateLimitType: "seven_day",
      },
      session_id: sessionId,
    });
    result({ result: "Finished near the limit." });
    break;
  case "turns":
    for (let i = 0; i < 20; i++) assistant([{ type: "text", text: `Turn ${i + 1}` }]);
    await hang();
    break;
  case "hang":
    assistant([{ type: "text", text: "Thinking for a long time." }]);
    await hang();
    break;
  case "stubborn":
    process.on("SIGTERM", () => {});
    assistant([{ type: "text", text: "Not stopping." }]);
    await hang();
    break;
  case "api-key":
    await hang();
    break;
  case "commit":
    // What the sandbox leaves behind, then a commit of everything, as a careless agent would.
    writeFileSync(join(cwd, ".bashrc"), "");
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "x"), "");
    writeFileSync(join(cwd, "add.js"), "export const add = (a, b) => a + b;\n");
    execFileSync("git", ["add", "-A"], { cwd });
    execFileSync("git", ["commit", "-q", "-m", "Add add()"], { cwd });
    result({ result: "Committed add.js." });
    break;
  case "tools": {
    const mcp = JSON.parse(readFileSync(flag("--mcp-config"), "utf8")).mcpServers.premise;
    const call = async (method, params, id = 1) => {
      const response = await fetch(mcp.url, {
        method: "POST",
        headers: { ...mcp.headers, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      return response.json();
    };
    await call("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    const list = await call("tools/list", {}, 2);
    await call("tools/call", { name: "progress", arguments: { text: "Halfway there" } }, 3);
    const denied = await call(
      "tools/call",
      { name: "verdict_submit", arguments: { verdicts: [] } },
      4,
    );
    result({
      result: JSON.stringify({
        tools: list.result.tools.map((t) => t.name),
        denied: JSON.parse(denied.result.content[0].text).error.code,
      }),
    });
    break;
  }
  case "real-shapes": {
    // premise's tools called the way real Claude Code agents called them in the first real runs
    // (decision 0285): lists sent as quoted JSON text, yes and no for true and false, a drafted
    // item's words under "line", a record operation without "from". Each refused call is fixed
    // the way the refusal says, as a real agent would.
    const mcp = JSON.parse(readFileSync(flag("--mcp-config"), "utf8")).mcpServers.premise;
    let id = 0;
    const call = async (method, params) => {
      const response = await fetch(mcp.url, {
        method: "POST",
        headers: { ...mcp.headers, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      return response.json();
    };
    const tool = async (name, args) => {
      const answer = await call("tools/call", { name, arguments: args });
      return JSON.parse(answer.result.content[0].text);
    };
    await call("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    const names = (await call("tools/list", {})).result.tools.map((t) => t.name);
    const said = [];
    if (names.includes("sizing_submit")) {
      said.push(
        await tool("sizing_submit", {
          size: "Small",
          size_reason: "A few screens for one user.",
          stages: '["why", "what", "say-back", "plan", "build", "check", "run", "report"]',
          stages_reason: "One user, and the idea names what it replaces.",
          split: "[]",
          split_reason: "One small piece.",
        }),
      );
    } else if (names.includes("triage_submit")) {
      said.push(
        await tool("triage_submit", {
          kind: "wish",
          touches: "[]",
          size: "small",
          touches_floor: "no",
          changes_what: "yes",
          route: "in-normally",
          reason: "A wish for a small change; nothing on the floor.",
        }),
      );
    } else if (names.includes("draft_submit")) {
      const lines = [
        "- [Y-1] People keep track of the books they want to read. (from: assumed; 2026-11-23)",
        "- [Y-2] The problem: a list on paper gets lost. (from: assumed; 2026-11-23)",
      ];
      said.push(
        await tool("draft_submit", { stage: "why", items: lines.map((line) => ({ line })) }),
      );
      said.push(
        await tool("record_propose", {
          operations: [{ op: "add", kind: "Y", text: "People keep track of books to read." }],
          reason: "The Why, as drafted.",
        }),
      );
      const items = lines.map((line) => ({
        text: line.replace(/^- \[Y-\d+\] /, "").replace(/ \(from:.*\)$/, ""),
        from: "assumed",
      }));
      let answer = await tool("draft_submit", { stage: "why", items });
      const stage = /\("([a-z-]+)"\)/.exec(answer.error?.message ?? "")?.[1];
      if (stage) answer = await tool("draft_submit", { stage, items });
      said.push(answer);
      await tool("task_finish", { status: "done", note: "Drafted." });
    }
    result({ result: JSON.stringify(said) });
    break;
  }
  case "resume":
    assistant([{ type: "text", text: "Carrying on." }]);
    result({ result: `Resumed ${resume}.` });
    break;
  default:
    result({
      is_error: true,
      subtype: "error_during_execution",
      result: `Unknown scenario ${scenario}`,
    });
}
await sleep(10);
process.exit(0);
