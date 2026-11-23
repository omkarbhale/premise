import { createHash, randomBytes } from "node:crypto";
import type { PremiseConfig } from "../config/settings.js";
import { type Database, recordEvent } from "../storage/database.js";
import { VERSION } from "../version.js";
import { type AgentRole, PREMISE_TOOLS_BY_ROLE } from "./roles.js";

/**
 * premise's tools for agents (docs/specs/agent-tools.md), served over MCP from inside the server
 * process (decision 0073). Each session gets its own token, which binds every call to one session,
 * one role, one software and one job. The token is revoked when the session ends.
 *
 * MCP is spoken in its plain HTTP form: one JSON-RPC message per POST, answered with JSON. No
 * stream is held open, because no tool needs to call the agent back.
 *
 * Tools are acted on by the modules handed in with setHandlers (the line engine, the record keeper
 * and the gate). A tool whose module is not built yet is a stub: every call is checked and recorded
 * as an event, and the agent is told plainly that nothing more comes of it yet.
 */

export const TOOL_ERROR_CODES = [
  "NOT_ALLOWED",
  "UNKNOWN_ITEM",
  "MALFORMED",
  "CONFLICT",
  "TASK_CLOSED",
  "BUDGET_EXHAUSTED",
  "PAUSED",
  "INTERNAL",
] as const;
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export interface ToolEnvelope {
  ok: boolean;
  result?: unknown;
  error?: { code: ToolErrorCode; message: string };
  diagnostics: string[];
}

export interface ToolBinding {
  role: AgentRole;
  softwareId: string;
  jobId: number;
  /** A progress line from the agent, for the page. */
  onProgress: (text: string) => void;
  /** The agent's own account of how the task ended. Never a report source (decision 0097). */
  onFinish?: (account: { status: string; note: string | null }) => void;
}

interface TokenEntry {
  binding: ToolBinding;
  revoked: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The module that will act on it; absent when the tool is fully served here. */
  notBuilt?: string;
  /**
   * The arguments of one complete call that premise accepts, shown to agents in their instructions
   * and in tools/list (test/tool-examples.test.ts calls each one through the real handlers).
   */
  example: Record<string, unknown>;
  /** A role whose use of the tool differs gets its own example. */
  examples?: Partial<Record<AgentRole, Record<string, unknown>>>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});
const anyObject = { type: "object", additionalProperties: true };
const textList = { type: "array", items: { type: "string" } };

const TOOLS: ToolDefinition[] = [
  {
    name: "record_read",
    description:
      "Read lines of the software's record, with their file and ID. Give item IDs or file names, or nothing for the whole record.",
    inputSchema: obj({ items: textList, include_struck: { type: "boolean" } }),
    notBuilt: "the record keeper",
    example: { items: ["what.md"] },
  },
  {
    name: "record_propose",
    description:
      "Propose a change to the record: add, replace or strike items, with one reason. premise checks it; you never write the record yourself.",
    inputSchema: obj(
      { operations: { type: "array", items: anyObject }, reason: { type: "string" } },
      ["operations", "reason"],
    ),
    notBuilt: "the record keeper",
    example: {
      operations: [
        {
          op: "add",
          kind: "W",
          text: "People can export their list as a CSV file.",
          from: "assumed",
          priority: "should",
        },
      ],
      reason: "The Why says the list is shared; a file is the plainest way to share it.",
    },
    examples: {
      researcher: {
        operations: [
          {
            op: "add",
            kind: "E",
            text: "A spreadsheet already keeps a reading list, but it cannot remind anyone. Source: not checked.",
            from: "assumed",
          },
        ],
        reason: "What already does part of the job.",
      },
      planner: {
        operations: [
          {
            op: "replace",
            id: "W-1",
            text: "People can add a book to the list by its title alone.",
            from: "assumed",
            reason: "The brief asks for the title alone; the author is optional.",
          },
        ],
        reason: "The brief asks to change W-1.",
      },
      builder: {
        operations: [
          {
            op: "add",
            kind: "D",
            text: "Dates are stored as ISO 8601 text. Reason: they sort as text and read plainly. Rejected: Unix timestamps, unreadable in the file.",
            from: "assumed",
          },
        ],
        reason: "A choice made while building that later work depends on.",
      },
    },
  },
  {
    name: "draft_submit",
    description: "Submit a draft of a stage as a short list for people to strike, keep or edit.",
    inputSchema: obj(
      {
        stage: { type: "string" },
        items: { type: "array", items: anyObject },
        milestones: { type: "array", items: anyObject },
        tasks: { type: "array", items: anyObject },
        kind: { type: "string" },
        how_to_run: { type: "string" },
        outcome: { type: "string" },
        alternative: { type: "string" },
        reason: { type: "string" },
      },
      ["stage", "items"],
    ),
    notBuilt: "the line engine",
    example: {
      stage: "what",
      items: [
        {
          text: "People can add a book to the list by its title.",
          priority: "must",
          from: "operator",
          quote: "where I keep my reading list",
        },
        {
          text: "Suggestion: people can mark a book as read.",
          priority: "should",
          from: "assumed",
        },
      ],
    },
    examples: {
      researcher: {
        stage: "exists",
        items: [
          {
            text: "A spreadsheet already keeps a reading list, but it cannot remind anyone. Source: not checked.",
            from: "assumed",
          },
        ],
        outcome: "Build it",
        reason: "Nothing found does the reminding the Why asks for.",
      },
      planner: {
        stage: "plan",
        items: [
          {
            text: "It keeps the list in one JSON file. Reason: one user, nothing to host. Rejected: a database server, more than needed.",
            foundation: true,
          },
        ],
        milestones: [{ text: "The smallest version that runs: add a book and see the list." }],
        tasks: [
          {
            title: "Add a book and list the books, with run.md",
            items: ["W-1"],
            check: "A book added by its title appears in the list.",
            milestone: 1,
          },
        ],
        kind: "a small web page on this machine",
        how_to_run: "Start it with node server.js and open http://localhost:3000.",
      },
    },
  },
  {
    name: "recovery_submit",
    description:
      'Submit the record recovered from an existing software: items (each with kind Y, U, R, W or D, its text, and the files it is guessed to serve), how to build, start and check it ("run"), and what premise would need to check it ("could_not_check"). Submitting again replaces it.',
    inputSchema: obj(
      {
        items: { type: "array", items: anyObject },
        run: anyObject,
        could_not_check: textList,
        summary: { type: "string" },
      },
      ["items"],
    ),
    notBuilt: "the line engine",
    example: {
      items: [
        { kind: "Y", text: "It shows how long a draft is, for writers.", files: ["README.md"] },
        { kind: "U", text: "Writers checking a draft's length." },
        {
          kind: "W",
          priority: "must",
          text: "It counts the words in a text file.",
          files: ["wc.js"],
        },
        {
          kind: "D",
          text: "It is one Node.js script. Reason: nothing to install. Rejected: not known from the code.",
          files: ["wc.js"],
        },
      ],
      run: { build: "Nothing to build.", start: "node wc.js <file>", check: "npm test" },
      could_not_check: ["Whether it handles very large files: none is in the repository."],
      summary: "A word counter for text files.",
    },
  },
  {
    name: "ask",
    description:
      'Ask a person a question, under the label of the role that has the last word, in that role\'s terms. At most a short list of items. For something only a person can do (kind "needed": an account with an outside service, a payment, a signature), give "what" (one line: what is needed) and the items as the exact steps, in order; give "secret" (a key name such as MAIL_API_KEY) when the act ends in a secret the software needs: premise names the file the person writes it into and checks it is there. You never do the act yourself. The job waits for the answer; other jobs go on.',
    inputSchema: obj(
      {
        role: { type: "string" },
        kind: { type: "string", enum: ["question", "proposal", "needed"] },
        items: textList,
        what: { type: "string" },
        secret: { type: "string" },
        waits_on: { type: "string" },
      },
      ["role", "kind", "items"],
    ),
    notBuilt: "the line engine",
    example: {
      role: "operator",
      kind: "question",
      items: ["Should the list be shared with others, or kept on this machine only?"],
    },
  },
  {
    name: "gate_request",
    description:
      'Request an action on the floor (spending money, acting publicly, deleting data, ...). Say exactly what will happen and why, and "role": whose call it is when the record names a role other than the operator (for example the role that holds an outside account). The server, never you, performs it once approved.',
    inputSchema: obj(
      {
        kind: { type: "string" },
        role: { type: "string" },
        action: { type: "string" },
        why: { type: "string" },
        items: textList,
      },
      ["kind", "action", "why"],
    ),
    notBuilt: "the gate",
    example: {
      kind: "spend",
      action: "Buy the domain readinglist.example for 12 USD a year.",
      why: "The record asks for the list at its own web address.",
    },
  },
  {
    name: "proposal_submit",
    description:
      'Submit the proposal for a claimed area: "options", one or two (at most taste.options_max), each with a "title" of a few words and a "description" of what the claiming role would see, in that role\'s terms; "tasks", the numbers of the plan\'s tasks that build this area (they wait for the answer; leave out to hold every task); and an optional "note". The claiming role keeps one or says what to change; that becomes a T item.',
    inputSchema: obj(
      {
        options: { type: "array", items: anyObject },
        tasks: { type: "array", items: { type: "number" } },
        note: { type: "string" },
      },
      ["options"],
    ),
    notBuilt: "taste claims",
    example: {
      options: [
        {
          title: "Plain list",
          description: "White background, the books in one column, the box on top.",
        },
        { title: "Cards", description: "Each book as a card in a grid, the box at the bottom." },
      ],
      tasks: [1],
      note: "premise would pick Plain list: it is the quickest to read.",
    },
  },
  {
    name: "progress",
    description: "Tell the people watching what you are doing now, in one short line.",
    inputSchema: obj({ text: { type: "string" } }, ["text"]),
    example: { text: "Reading the record before drafting." },
  },
  {
    name: "task_finish",
    description:
      "Say how the task ended: done, stuck (with what you tried), or waiting-for-person (with the ask id).",
    inputSchema: obj(
      {
        status: { type: "string", enum: ["done", "stuck", "waiting-for-person"] },
        note: { type: "string" },
        ask_id: { type: "string" },
      },
      ["status"],
    ),
    example: { status: "done", note: "Submitted; nothing waits on a person." },
  },
  {
    name: "scenario_write",
    description:
      "Write a check scenario: its name, the items it checks, the steps and what is expected.",
    inputSchema: obj(
      { name: { type: "string" }, items: textList, steps: textList, expected: { type: "string" } },
      ["name", "items", "steps", "expected"],
    ),
    notBuilt: "the line engine",
    example: {
      name: "Add a book",
      items: ["W-1"],
      steps: ["Open the page.", "Type a title in the box and press Add."],
      expected: "The book appears in the list.",
    },
  },
  {
    name: "verdict_submit",
    description: `Submit the check's verdicts: met, not-met or could-not-check per item, each with evidence, and judged_on: "real" (the real data, service or environment the software is for) or "made-up" (stand-ins only); with "made-up" also try_it_on: what a person should try it on. A verdict without judged_on is refused.`,
    inputSchema: obj(
      {
        verdicts: { type: "array", items: anyObject },
        findings: { type: "array", items: {} },
        run_notes: { type: "string" },
      },
      ["verdicts"],
    ),
    notBuilt: "the line engine",
    example: {
      verdicts: [
        {
          item: "W-1",
          verdict: "met",
          evidence: "After adding a book titled Dune, the page lists Dune (evidence/add-book.txt).",
        },
      ],
    },
  },
  {
    name: "review_submit",
    description:
      "Submit a review: consistent or conflicting per proposed change, or agree or object.",
    inputSchema: obj({ reviews: { type: "array", items: anyObject } }, ["reviews"]),
    notBuilt: "the record keeper",
    example: {
      reviews: [
        {
          decision: "It keeps the list in one JSON file.",
          verdict: "agree",
          reasons: "One user and a short list; moving to a database later is cheap.",
        },
      ],
    },
  },
  {
    name: "triage_submit",
    description: "Submit how one intake item is routed.",
    inputSchema: anyObject,
    notBuilt: "intake",
    example: {
      kind: "wish",
      touches: [{ id: "W-1", reason: "It changes how a book is added." }],
      size: "small",
      touches_floor: "no",
      route: "in-normally",
      reason: "A wish for a small change to adding books; nothing on the floor.",
    },
  },
  {
    name: "lesson_submit",
    description:
      'Submit your reading of one correction: what kind of mistake it was ("mistake"), where what it teaches goes ("destination": software, taste, premise or none), why ("reason"), the one short line to learn ("line", unless none), and for premise a short "topic" so the same thing recurring is grouped.',
    inputSchema: obj(
      {
        mistake: { type: "string" },
        destination: { type: "string", enum: ["software", "taste", "premise", "none"] },
        reason: { type: "string" },
        line: { type: "string" },
        topic: { type: "string" },
      },
      ["mistake", "destination", "reason"],
    ),
    notBuilt: "learning",
    example: {
      mistake: "assumed a need the operator never had",
      destination: "software",
      reason: "It is about this software's users only.",
      line: "Do not assume the list is shared; the operator keeps it alone.",
    },
  },
  {
    name: "reading_submit",
    description:
      'Submit the short list from reading the held intake items: "wanted" and "recurring" (lines, each { "line", "items": ["I-3"] }), "purpose", "back_to_why" (yes or no) and, when yes, "not_wanted" (the item IDs that are the evidence).',
    inputSchema: anyObject,
    notBuilt: "intake",
    example: {
      wanted: [{ line: "People want to sort the list by author.", items: ["I-1"] }],
      recurring: [],
      purpose: "No change: the items ask for more of what it already does.",
      back_to_why: "no",
    },
  },
  {
    name: "sizing_submit",
    description:
      'Submit how big one piece of work is, which stages of the line it needs, and whether it splits, each with its reason. "split" is a list of parts, or empty to keep the piece whole.',
    inputSchema: obj(
      {
        size: { type: "string", enum: ["small", "medium", "large"] },
        size_reason: { type: "string" },
        stages: textList,
        stages_reason: { type: "string" },
        split: { type: "array", items: anyObject },
        split_reason: { type: "string" },
      },
      ["size", "size_reason", "stages", "stages_reason", "split_reason"],
    ),
    notBuilt: "the line engine",
    example: {
      size: "small",
      size_reason: "A few screens for one user.",
      stages: ["why", "what", "say-back", "plan", "build", "check", "run", "report"],
      stages_reason:
        "Who and What exists add nothing: one user, and the idea names what it replaces.",
      split: [],
      split_reason: "One small piece; splitting it would only add steps.",
    },
  },
  {
    name: "facts_read",
    description:
      "Read recorded facts about the software since a time, each with its evidence link.",
    inputSchema: obj({ since: { type: "string" }, kinds: textList }),
    notBuilt: "the reporter",
    example: { since: "2026-11-01T00:00:00Z", kinds: ["verdicts", "runs"] },
  },
  {
    name: "report_submit",
    description: "Submit report lines, each with the evidence link of the fact it rests on.",
    inputSchema: obj({ lines: { type: "array", items: anyObject } }, ["lines"]),
    notBuilt: "the reporter",
    example: {
      lines: [
        {
          section: "Running",
          text: "Adding a book works: the checker added one and saw it listed.",
          evidence: "verdict W-1, job 12",
        },
      ],
    },
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/**
 * The arguments of one complete call of a tool that premise accepts from this role: the role's own
 * example where its use differs, else the tool's. The same example is in the role's instructions and
 * in the tool's description, so the two cannot drift.
 */
export function toolExample(tool: string, role: AgentRole): Record<string, unknown> {
  const definition = TOOLS_BY_NAME.get(tool);
  if (!definition) throw new Error(`premise has no tool "${tool}".`);
  return definition.examples?.[role] ?? definition.example;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function fail(code: ToolErrorCode, message: string, diagnostics: string[] = []): ToolEnvelope {
  return { ok: false, error: { code, message }, diagnostics };
}

function okResult(result: unknown): ToolEnvelope {
  return { ok: true, result, diagnostics: [] };
}

/** A refusal, for the modules that serve tools. */
export const toolFail = fail;
/** A result, for the modules that serve tools. */
export const toolOk = okResult;

/** A module serving one tool. Called after the call passed its checks. */
export type ToolHandler = (binding: ToolBinding, args: Record<string, unknown>) => ToolEnvelope;

/** The modules that act on tools: the line engine, the record keeper and the gate. */
export interface ToolHandlers {
  tools: Partial<Record<string, ToolHandler>>;
  /** Told of every task_finish, besides the session's own listener. */
  onFinish?: (binding: ToolBinding, account: { status: string; note: string | null }) => void;
}

export interface HttpAnswer {
  status: number;
  body?: unknown;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface AgentToolServerOptions {
  db: Database;
  config: Pick<PremiseConfig, "tools">;
  /** The work queue is paused: calls answer PAUSED. */
  isPaused?: () => boolean;
}

export class AgentToolServer {
  private readonly tokens = new Map<string, TokenEntry>();
  private handlers: ToolHandlers = { tools: {} };

  constructor(private readonly options: AgentToolServerOptions) {}

  /** Hand tools to the modules that act on them, once those modules exist. */
  setHandlers(handlers: ToolHandlers): void {
    this.handlers = handlers;
  }

  /** Whether a tool is acted on by a module now, rather than only recorded. */
  private served(tool: string): boolean {
    return this.handlers.tools[tool] !== undefined;
  }

  /**
   * One tool call made in this process, for runtimes that do not speak MCP (the scripted agent).
   * It passes the same checks and is recorded the same way as a call over HTTP.
   */
  callDirect(token: string, tool: string, args: Record<string, unknown>): ToolEnvelope {
    const entry = this.tokens.get(hashToken(token));
    if (!entry) return fail("TASK_CLOSED", "Unknown session token. Stop.");
    return this.call(entry, tool, args);
  }

  /** A new token for one session. Only its hash is kept. */
  issue(binding: ToolBinding): string {
    const token = randomBytes(32).toString("base64url");
    this.tokens.set(hashToken(token), { binding, revoked: false });
    return token;
  }

  revoke(token: string): void {
    const entry = this.tokens.get(hashToken(token));
    if (entry) entry.revoked = true;
  }

  /** The tools a role is served. */
  toolsFor(role: AgentRole): ToolDefinition[] {
    return PREMISE_TOOLS_BY_ROLE[role].map((name) => TOOLS_BY_NAME.get(name)!);
  }

  /** One HTTP request to the MCP endpoint. */
  handleHttp(authorization: string | undefined, body: unknown): HttpAnswer {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
    const entry = token ? this.tokens.get(hashToken(token)) : undefined;
    if (!entry) {
      recordEvent(this.options.db, { module: "agent-tools", kind: "refused-token" });
      return {
        status: 401,
        body: {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Unknown session token." },
        },
      };
    }
    if (Array.isArray(body)) {
      const answers = body
        .map((message) => this.handleMessage(entry, message as JsonRpcRequest))
        .filter((a) => a !== null);
      return answers.length ? { status: 200, body: answers } : { status: 202 };
    }
    const answer = this.handleMessage(entry, body as JsonRpcRequest);
    return answer ? { status: 200, body: answer } : { status: 202 };
  }

  private handleMessage(entry: TokenEntry, message: JsonRpcRequest): unknown {
    if (!message || typeof message !== "object" || typeof message.method !== "string") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Not a JSON-RPC request." },
      };
    }
    const isNotification = message.id === undefined;
    const reply = (result: unknown) =>
      isNotification ? null : { jsonrpc: "2.0", id: message.id, result };
    switch (message.method) {
      case "initialize": {
        const asked = message.params?.protocolVersion;
        return reply({
          protocolVersion: typeof asked === "string" ? asked : "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "premise", version: VERSION },
          instructions:
            "premise's tools for this task. Every result is JSON: ok, result or error (code and message), diagnostics.",
        });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({
          tools: this.toolsFor(entry.binding.role).map((t) => ({
            name: t.name,
            description: `${t.description}\nExample: ${JSON.stringify(toolExample(t.name, entry.binding.role))}`,
            inputSchema: t.inputSchema,
          })),
        });
      case "tools/call": {
        const name = message.params?.name;
        const args = message.params?.arguments;
        const envelope = this.call(
          entry,
          typeof name === "string" ? name : "",
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {},
        );
        return reply({
          content: [{ type: "text", text: JSON.stringify(envelope) }],
          isError: !envelope.ok,
        });
      }
      default:
        if (isNotification) return null;
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `premise does not answer "${message.method}".` },
        };
    }
  }

  /** Check a call, record it, and hand it to whoever owns it. */
  private call(entry: TokenEntry, tool: string, args: Record<string, unknown>): ToolEnvelope {
    const { binding } = entry;
    const envelope = this.check(entry, tool) ?? this.perform(binding, tool, args);
    recordEvent(this.options.db, {
      softwareId: binding.softwareId,
      module: "agent-tools",
      kind: "tool-call",
      reference: String(binding.jobId),
      detail: {
        tool,
        role: binding.role,
        ok: envelope.ok,
        error: envelope.error?.code ?? null,
        ...(envelope.ok &&
        ((TOOLS_BY_NAME.get(tool)?.notBuilt && !this.served(tool)) || tool === "task_finish")
          ? { input: args }
          : {}),
      },
    });
    return envelope;
  }

  private check(entry: TokenEntry, tool: string): ToolEnvelope | null {
    if (entry.revoked) return fail("TASK_CLOSED", "This task has ended. Stop.");
    if (!PREMISE_TOOLS_BY_ROLE[entry.binding.role].includes(tool)) {
      return fail(
        "NOT_ALLOWED",
        `The ${entry.binding.role} does not have the tool "${tool}". Do not retry it; ask a person through "ask" if one must decide, or finish.`,
      );
    }
    if (this.options.isPaused?.()) {
      return fail("PAUSED", "premise has paused all agent work. Stop; the task resumes later.");
    }
    return null;
  }

  private perform(binding: ToolBinding, tool: string, args: Record<string, unknown>): ToolEnvelope {
    const { tools } = this.options.config;
    switch (tool) {
      case "progress": {
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (!text) return fail("MALFORMED", 'Give one line of progress as "text".');
        const line = text.split("\n")[0]!.slice(0, tools.progress_max_chars);
        binding.onProgress(line);
        return okResult(null);
      }
      case "task_finish": {
        const status = args.status;
        if (status !== "done" && status !== "stuck" && status !== "waiting-for-person") {
          return fail("MALFORMED", 'Give a status of "done", "stuck" or "waiting-for-person".');
        }
        const note = typeof args.note === "string" ? args.note : null;
        binding.onFinish?.({ status, note });
        this.handlers.onFinish?.(binding, { status, note });
        return okResult(null);
      }
      case "ask": {
        const items = args.items;
        const problems: string[] = [];
        if (typeof args.role !== "string" || !args.role.trim())
          problems.push("Name the role asked.");
        if (!["question", "proposal", "needed"].includes(args.kind as string)) {
          problems.push('Give a kind of "question", "proposal" or "needed".');
        }
        if (!Array.isArray(items) || items.length === 0) problems.push("Give at least one item.");
        else if (items.length > tools.ask_max_items) {
          problems.push(`Give at most ${tools.ask_max_items} items; you gave ${items.length}.`);
        }
        if (problems.length)
          return fail("MALFORMED", "The question cannot be asked as it is.", problems);
        return this.serve(binding, tool, args);
      }
      case "record_read":
        if (this.served(tool)) return this.serve(binding, tool, args);
        return okResult({
          lines: [],
          note: "premise does not keep this software's record yet, so there is nothing to read. Work from your task brief.",
        });
      case "facts_read":
        return okResult({
          facts: [],
          note: "premise does not collect facts for reports yet, so there are none to read.",
        });
      default:
        return this.serve(binding, tool, args);
    }
  }

  private serve(binding: ToolBinding, tool: string, args: Record<string, unknown>): ToolEnvelope {
    const handler = this.handlers.tools[tool];
    if (!handler) return this.stub(tool);
    try {
      return handler(binding, args);
    } catch (error) {
      return fail("INTERNAL", `premise could not handle this call: ${(error as Error).message}`);
    }
  }

  private stub(tool: string): ToolEnvelope {
    const owner = TOOLS_BY_NAME.get(tool)?.notBuilt ?? "the part of premise that acts on it";
    return okResult({
      status: "recorded",
      note: `premise recorded this call, but ${owner} is not built yet, so nothing more comes of it in this task. Carry on without waiting for it, and say in your final message what is still open.`,
    });
  }
}
