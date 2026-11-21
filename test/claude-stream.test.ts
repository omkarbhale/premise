import { describe, expect, it } from "vitest";
import { LineSplitter, parseStreamLine } from "../src/agents/claude-stream.js";

const line = (event: unknown) => JSON.stringify(event);

describe("reading Claude Code's streamed events", () => {
  it("takes the session id from the init event", () => {
    expect(
      parseStreamLine(
        line({
          type: "system",
          subtype: "init",
          session_id: "s-1",
          model: "claude-haiku",
          apiKeySource: "none",
        }),
      ),
    ).toEqual([{ kind: "init", sessionId: "s-1", model: "claude-haiku", apiKeySource: "none" }]);
  });

  it("maps a rejected rate-limit event to the usage limit, with its reset time", () => {
    const [event] = parseStreamLine(
      line({
        type: "rate_limit_event",
        rate_limit_info: { status: "rejected", resetsAt: 1795399200, rateLimitType: "five_hour" },
      }),
    );
    expect(event).toEqual({
      kind: "usage-limit",
      resetAt: new Date(1795399200 * 1000).toISOString(),
      window: "five_hour",
    });
  });

  it("notes a warning, and ignores an allowed rate-limit event", () => {
    expect(
      parseStreamLine(
        line({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning" } }),
      ),
    ).toEqual([{ kind: "usage-warning", resetAt: null, window: null }]);
    expect(
      parseStreamLine(line({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } })),
    ).toEqual([]);
  });

  it("counts turns and turns text and tool use into progress lines", () => {
    const events = parseStreamLine(
      line({
        type: "assistant",
        message: {
          id: "msg_1",
          content: [
            { type: "thinking", thinking: "" },
            { type: "text", text: "First I look around.\nThen more." },
            { type: "tool_use", name: "Bash", input: { command: "npm test" } },
            { type: "tool_use", name: "Write", input: { file_path: "/w/src/add.js" } },
            { type: "tool_use", name: "mcp__premise__progress", input: { text: "x" } },
          ],
        },
      }),
    );
    expect(events).toEqual([
      { kind: "turn", messageId: "msg_1" },
      { kind: "progress", text: "First I look around." },
      { kind: "progress", text: "Running: npm test" },
      { kind: "progress", text: "Writing src/add.js" },
    ]);
  });

  it("reads denials and results", () => {
    expect(
      parseStreamLine(
        line({
          type: "system",
          subtype: "permission_denied",
          tool_name: "Bash",
          message: "denied",
        }),
      ),
    ).toEqual([{ kind: "denied", tool: "Bash", message: "denied" }]);
    expect(
      parseStreamLine(
        line({ type: "result", subtype: "success", is_error: false, result: "ok", num_turns: 3 }),
      ),
    ).toEqual([
      { kind: "result", ok: true, subtype: "success", text: "ok", turns: 3, apiErrorStatus: null },
    ]);
    expect(
      parseStreamLine(
        line({ type: "result", subtype: "success", is_error: true, result: "no" }),
      )[0],
    ).toMatchObject({ ok: false });
  });

  it("keeps going past lines that are not JSON", () => {
    expect(parseStreamLine("not json")).toEqual([{ kind: "unreadable", line: "not json" }]);
    expect(parseStreamLine("   ")).toEqual([]);
    expect(parseStreamLine(line({ type: "user" }))).toEqual([]);
  });

  it("splits a byte stream into whole lines", () => {
    const split = new LineSplitter();
    expect(split.push('{"a":')).toEqual([]);
    expect(split.push('1}\n{"b":2}\n{"c"')).toEqual(['{"a":1}', '{"b":2}']);
    expect(split.end()).toEqual(['{"c"']);
  });
});
