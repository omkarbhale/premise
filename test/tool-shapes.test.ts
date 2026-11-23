import AjvModule from "ajv";
import { describe, expect, it } from "vitest";
import { AGENT_ROLES, PREMISE_TOOLS_BY_ROLE } from "../src/agents/roles.js";
import { TOOL_INPUTS } from "../src/agents/tool-inputs.js";
import {
  AgentToolServer,
  type ToolBinding,
  type ToolEnvelope,
  refusedAnswer,
  refusedAnswerWords,
  toolExample,
  toolInput,
} from "../src/agents/tool-server.js";
import { type Shape, fits, jsonSchema, readInput } from "../src/agents/tool-shapes.js";
import { openDatabase } from "../src/storage/database.js";
import { tempFolder, testConfig } from "./helpers.js";

/**
 * Agents' tool inputs, as real agents send them (decision 0285). The cases below are taken from
 * the transcripts of the first real runs, where real Claude Code agents could not hand in their
 * answers: premise declared most tools as open objects, so the agents guessed shapes, and the
 * scripted agent, which always sends exactly what premise wants, never showed it.
 */

type Args = Record<string, unknown>;
const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const ajv = new (
  Ajv as unknown as new (o: object) => {
    compile: (schema: object) => (data: unknown) => boolean;
  }
)({ strict: false, allErrors: true });

const TOOLS = Object.keys(TOOL_INPUTS);

/** Every role's example of a tool, and the tool's own. */
function examplesOf(tool: string): Args[] {
  const roles = AGENT_ROLES.filter((r) => PREMISE_TOOLS_BY_ROLE[r].includes(tool));
  const all = roles.map((r) => toolExample(tool, r));
  return [...new Map(all.map((a) => [JSON.stringify(a), a])).values()];
}

function setup() {
  const folder = tempFolder();
  const config = testConfig(folder);
  const { db } = openDatabase(folder);
  const server = new AgentToolServer({ db, config });
  const seen = new Map<string, Args>();
  // Each tool's module, standing in: it records what reached it and accepts it.
  server.setHandlers({
    tools: Object.fromEntries(
      TOOLS.map((tool) => [
        tool,
        (_b: ToolBinding, args: Args): ToolEnvelope => {
          seen.set(tool, args);
          return { ok: true, result: { status: "received" }, diagnostics: [] };
        },
      ]),
    ),
  });
  const token = (role: ToolBinding["role"], jobId = 7) =>
    server.issue({ role, softwareId: "s1", jobId, onProgress: () => {} });
  return { db, server, seen, token };
}

describe("the declared shape of every tool", () => {
  it("declares every field of every tool, with a description, and no open objects", () => {
    const open: string[] = [];
    // Every field says what it is; a list's entries and a union's alternatives may lean on it.
    const walk = (shape: Shape, path: string) => {
      if (!shape.description && /\.[A-Za-z_]+$/.test(path)) open.push(`${path}: no description`);
      if ("anyOf" in shape) return shape.anyOf.forEach((s, i) => walk(s, `${path}|${i}`));
      if (shape.type === "array") walk(shape.items, `${path}[]`);
      if (shape.type === "object") {
        if (Object.keys(shape.properties).length === 0) open.push(`${path}: an open object`);
        for (const [k, v] of Object.entries(shape.properties)) walk(v, `${path}.${k}`);
      }
    };
    for (const tool of TOOLS) walk(toolInput(tool), tool);
    expect(open).toEqual([]);
    // Every tool a role can call has a shape.
    for (const role of AGENT_ROLES) {
      for (const tool of PREMISE_TOOLS_BY_ROLE[role]) expect(TOOL_INPUTS[tool], tool).toBeDefined();
    }
  });

  it("serves the declared shape in tools/list, with each field's type and the required ones", () => {
    const { server, token } = setup();
    const answer = server.handleHttp(`Bearer ${token("triager")}`, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const tools = (answer.body as { result: { tools: { name: string; inputSchema: Args }[] } })
      .result.tools;
    const triage = tools.find((t) => t.name === "triage_submit")!.inputSchema;
    expect(triage).toMatchObject({
      type: "object",
      required: ["kind", "route", "reason"],
      properties: {
        touches: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              { type: "object", required: ["id", "reason"], properties: { id: {}, reason: {} } },
            ],
          },
        },
        touches_floor: { type: "boolean" },
        kind: { enum: expect.arrayContaining(["bug", "wish"]) },
      },
    });
  });

  it("takes every example as written, with nothing read leniently", () => {
    for (const tool of TOOLS) {
      for (const example of examplesOf(tool)) {
        const read = readInput(toolInput(tool), example, example);
        expect(read.problems, `${tool} ${JSON.stringify(example)}`).toEqual([]);
        expect(read.notes, tool).toEqual([]);
        expect(fits(toolInput(tool), example), tool).toBe(true);
      }
    }
  });

  it("accepts and refuses exactly what the declared JSON Schema does", () => {
    // Each example, then each made wrong in the ways agents get it wrong: a field left out, the
    // wrong kind of value, a list or an object sent as quoted text, null for a field.
    const variants = (example: Args, shape: Shape): Args[] => {
      const out: Args[] = [];
      if (!("type" in shape) || shape.type !== "object") return out;
      for (const key of Object.keys(shape.properties)) {
        const without = { ...example };
        delete without[key];
        out.push(without);
        for (const wrong of [42, 1.5, "text", "yes", "", [], {}, null, true, ["x"], [{}]]) {
          out.push({ ...example, [key]: wrong });
        }
        const value = example[key];
        if (value !== undefined && typeof value === "object") {
          out.push({ ...example, [key]: JSON.stringify(value) });
          out.push({ ...example, [key]: `${JSON.stringify(value)} and more` });
        }
        if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
          const field = shape.properties[key]!;
          const entryShape = "type" in field && field.type === "array" ? field.items : undefined;
          for (const inner of Object.keys(value[0] as Args)) {
            const rest = { ...(value[0] as Args) };
            delete rest[inner];
            out.push({ ...example, [key]: [rest] });
            out.push({ ...example, [key]: [{ ...(value[0] as Args), [inner]: 42 }] });
          }
          if (entryShape) out.push({ ...example, [key]: [JSON.stringify(value[0])] });
        }
      }
      return out;
    };
    let compared = 0;
    for (const tool of TOOLS) {
      const shape = toolInput(tool);
      const validate = ajv.compile(jsonSchema(shape));
      for (const example of examplesOf(tool)) {
        for (const input of [example, ...variants(example, shape)]) {
          const raw = JSON.parse(JSON.stringify(input)) as Args;
          const read = readInput(shape, raw, example);
          const ok = read.problems.length === 0;
          const label = `${tool} ${JSON.stringify(raw)}`;
          const lenient =
            read.notes.length > 0 || JSON.stringify(read.value) !== JSON.stringify(raw);
          if (!lenient) expect(validate(raw), label).toBe(ok);
          if (ok) expect(validate(JSON.parse(JSON.stringify(read.value))), label).toBe(true);
          else expect(validate(raw), label).toBe(false);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });
});

describe("what real agents sent", () => {
  it("takes triage_submit's touches sent as quoted JSON text, and says to send a list", () => {
    const { server, seen, token } = setup();
    // Seven calls like this were refused in the first real runs; the agent tried up to four times.
    const answer = server.callDirect(token("triager"), "triage_submit", {
      kind: "wish",
      touches:
        '[{"id":"W-2","reason":"The must item for per-session weekly share."},{"id":"D-6","reason":"Splits overlapping sessions\' share by tokens only."}]',
      size: "medium",
      touches_floor: "no",
      changes_what: "yes",
      route: "asked-at-once",
      reason: "It changes how W-2 is worked out.",
    });
    expect(answer.ok).toBe(true);
    expect(answer.diagnostics[0]).toContain('"touches" came as text holding a list');
    expect(seen.get("triage_submit")).toMatchObject({
      touches: [
        { id: "W-2", reason: expect.any(String) },
        { id: "D-6", reason: expect.any(String) },
      ],
      touches_floor: false,
      changes_what: true,
    });
    const empty = server.callDirect(token("triager"), "triage_submit", {
      kind: "question",
      touches: "[]",
      route: "in-normally",
      reason: "A question about the record's wording.",
      answer: "The record does not say.",
    });
    expect(empty.ok).toBe(true);
    expect(seen.get("triage_submit")!.touches).toEqual([]);
  });

  it("names the field when touches is text that is not a list, with an example", () => {
    const { server, token } = setup();
    const answer = server.callDirect(token("triager"), "triage_submit", {
      kind: "wish",
      touches: "W-2 and D-6",
      route: "in-normally",
      reason: "A wish.",
    });
    expect(answer.ok).toBe(false);
    expect(answer.error!.code).toBe("MALFORMED");
    expect(answer.diagnostics).toEqual([
      '"touches" must be a list, each text or an object with "id", "reason"; it is text "W-2 and D-6". For example: "touches": [{"id":"W-1","reason":"It changes how a book is added."}]',
    ]);
  });

  it("names a record operation's missing field, and points at a field under another name", () => {
    const { server, token } = setup();
    // A builder's add, as sent in the first real runs: the whole record line under "line", no
    // "kind" and no "from".
    const answer = server.callDirect(token("builder"), "record_propose", {
      operations: [
        {
          op: "add",
          file: "decisions.md",
          line: "- [D-22] A task budget counts every session labelled with the task.",
        },
      ],
      reason: "A choice made while building.",
    });
    expect(answer.ok).toBe(false);
    const said = answer.diagnostics.join("\n");
    expect(said).toContain('"operations[0].kind" is missing');
    expect(said).toContain('"operations[0].text" is missing');
    expect(said).toContain('It has "file", "line", which premise does not read here');
    expect(said).toContain('"operations[0].from" is missing');
    expect(said).toContain('For example: "from": "assumed"');
    // Never the role rule: the shape is said first.
    expect(said).not.toContain("may only add decisions");
  });

  it("names the op that is not one premise knows", () => {
    const { server, token } = setup();
    const answer = server.callDirect(token("planner"), "record_propose", {
      operations: [{ op: "update", id: "D-6", text: "New words.", from: "assumed" }],
      reason: "Change D-6.",
    });
    expect(answer.diagnostics[0]).toMatch(
      /^"operations\[0\]\.op" must be one of "add", "replace", "strike", "mark"; it is text "update"\. For example: /,
    );
  });

  it("names a drafted item's missing text, and says the line it sent goes in text", () => {
    const { server, token } = setup();
    const answer = server.callDirect(token("drafter"), "draft_submit", {
      stage: "why",
      items: [
        { line: "- [Y-1] usage-ledger shows where a fleet of coding agents spends its usage." },
        { line: "- [Y-2] For each session spawned, the user gets back how much it used." },
      ],
    });
    expect(answer.ok).toBe(false);
    expect(answer.error!.message).toBe(
      "premise cannot use this draft_submit call: 2 fields are wrong. Fix each as the line below says and call draft_submit again with the whole call.",
    );
    expect(answer.diagnostics[0]).toBe(
      `"items[0].text" is missing: The item's words, one line, without an ID or list mark. It has "line", which premise does not read here: put that in "text". For example: "text": "People can add a book to the list by its title."`,
    );
    expect(answer.diagnostics[1]).toContain('"items[1].text" is missing');
  });

  it("refuses a plan task's milestone given as an ID, where it was dropped before", () => {
    const { server, token } = setup();
    const answer = server.callDirect(token("planner"), "draft_submit", {
      ...toolExample("draft_submit", "planner"),
      tasks: [{ title: "Smallest running ledger", items: ["W-1"], milestone: "M-1" }],
    });
    expect(answer.diagnostics).toEqual([
      '"tasks[0].milestone" must be a whole number from 1; it is text "M-1". For example: "milestone": 1',
    ]);
    // A number sent as text is a number.
    const text = server.callDirect(token("planner"), "draft_submit", {
      ...toolExample("draft_submit", "planner"),
      tasks: [{ title: "Smallest running ledger", items: ["W-1"], milestone: "1" }],
    });
    expect(text.ok).toBe(true);
  });

  it("takes sizing sent with its lists as text, and verdicts in other spellings", () => {
    const { server, seen, token } = setup();
    expect(
      server.callDirect(token("sizer"), "sizing_submit", {
        ...toolExample("sizing_submit", "sizer"),
        stages: '["build", "check"]',
        split: "[]",
        size: "Small",
      }).ok,
    ).toBe(true);
    expect(seen.get("sizing_submit")).toMatchObject({
      stages: ["build", "check"],
      split: [],
      size: "small",
    });
    expect(
      server.callDirect(token("checker"), "verdict_submit", {
        verdicts: [
          { item: "W-1", verdict: "Not met", evidence: "It shows nothing.", judged_on: "real" },
        ],
      }).ok,
    ).toBe(true);
    expect(seen.get("verdict_submit")).toMatchObject({ verdicts: [{ verdict: "not-met" }] });
  });

  it("says so when the same call is refused twice the same way, and gives the whole example", () => {
    const { server, token } = setup();
    const session = token("triager");
    const wrong = { kind: "wish", touches: "W-2", route: "in-normally", reason: "A wish." };
    const first = server.callDirect(session, "triage_submit", wrong);
    expect(first.diagnostics.join(" ")).not.toContain("same refusal");
    const second = server.callDirect(session, "triage_submit", wrong);
    expect(second.diagnostics[0]).toBe(
      `This is the same refusal as your last triage_submit call: it was sent the same way again, so it was refused again. Do not send it unchanged. Copy the shape of this complete call and change only the values: ${JSON.stringify(toolExample("triage_submit", "triager"))}`,
    );
    // Fixed, it is taken, and a new mistake later is not called a repeat.
    expect(server.callDirect(session, "triage_submit", { ...wrong, touches: [] }).ok).toBe(true);
    const later = server.callDirect(session, "triage_submit", wrong);
    expect(later.diagnostics.join(" ")).not.toContain("same refusal");
  });
});

describe("an agent that ends without a usable answer", () => {
  it("is told by its last refusal, recorded once for premise's improvements", () => {
    const { db, server, token } = setup();
    const session = token("triager", 12);
    server.callDirect(session, "progress", { text: "Reading the item." });
    for (let i = 0; i < 2; i++) {
      server.callDirect(session, "triage_submit", { kind: "wish", touches: "W-2", reason: "x" });
    }
    const refused = refusedAnswer(db, { id: 12, softwareId: "s1" });
    expect(refused).toMatchObject({ tool: "triage_submit", role: "triager" });
    expect(refusedAnswerWords(refused!)).toMatch(
      /^could not hand in its answer: premise refused its last triage_submit call \("route" is missing/,
    );
    refusedAnswer(db, { id: 12, softwareId: "s1" });
    const events = db
      .prepare("SELECT detail FROM events WHERE kind = 'answer-refused' AND reference = '12'")
      .all() as { detail: string }[];
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.detail)).toMatchObject({ tool: "triage_submit", calls: 2 });
  });

  it("is not said when an answer was taken, or none was tried", () => {
    const { db, server, token } = setup();
    const session = token("triager", 13);
    server.callDirect(session, "triage_submit", { kind: "wish", route: "x", reason: "x" });
    server.callDirect(session, "triage_submit", toolExample("triage_submit", "triager"));
    expect(refusedAnswer(db, { id: 13, softwareId: "s1" })).toBeNull();
    server.callDirect(token("triager", 14), "progress", { text: "Thinking." });
    expect(refusedAnswer(db, { id: 14, softwareId: "s1" })).toBeNull();
  });
});
