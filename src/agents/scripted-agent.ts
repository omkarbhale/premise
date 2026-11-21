import { readFileSync } from "node:fs";
import { AGENT_TASK_KINDS } from "../config/settings.js";
import type {
  AgentOutcome,
  AgentProgress,
  AgentRequest,
  AgentRunner,
  AgentSession,
} from "./agent-runner.js";
import { accessFor } from "./roles.js";
import type { AgentToolServer, ToolEnvelope } from "./tool-server.js";
import { prepareWorkingCopy, removeWorkingCopy, saveEvidence } from "./working-copy.js";

/**
 * The scripted agent: a deterministic stand-in for Claude that calls no LLM (decisions 0134, 0148).
 * A script is a list of rules; the first rule whose "when" matches a request decides what the
 * session says and how it ends. With no matching rule, the session ends done at once.
 *
 * {
 *   "rules": [
 *     { "when": { "task": "build", "attempt": 1 },
 *       "progress": ["Writing the code", "Running the tests"],
 *       "delay_ms": 10,
 *       "end": { "outcome": "failed", "summary": "Tests fail", "failure": "tests-fail" } },
 *     { "when": { "task": "check" }, "end": { "outcome": "hang" } },
 *     { "when": { "task": "draft", "stage": "why" },
 *       "calls": [{ "tool": "draft_submit", "arguments": { "stage": "why", "items": ["..."] } }],
 *       "end": { "outcome": "done" } }
 *   ]
 * }
 *
 * "calls" are premise tool calls the session makes before it ends, through the same checks as a
 * real agent's (the tool server's callDirect). "stage" and "purpose" match the task's context, set
 * by the line engine. A rule written in code may instead have "behave", a function that makes calls.
 */

export type ScriptEnd =
  | { outcome: "done"; summary?: string }
  | { outcome: "failed"; summary?: string; failure: string }
  | { outcome: "stuck"; summary?: string }
  | { outcome: "usage-limit"; reset_at?: string | null }
  | { outcome: "hang" };

export interface ScriptCall {
  tool: string;
  arguments?: Record<string, unknown>;
}

/** Makes tool calls; "call" returns the tool's result envelope. */
export type ScriptBehaviour = (
  request: AgentRequest,
  call: (tool: string, args: Record<string, unknown>) => ToolEnvelope,
) => void | Promise<void>;

export interface ScriptRule {
  when?: {
    task?: string;
    attempt?: number;
    brief_contains?: string;
    stage?: string;
    purpose?: string;
  };
  progress?: string[];
  delay_ms?: number;
  calls?: ScriptCall[];
  behave?: ScriptBehaviour;
  end: ScriptEnd;
}

export interface AgentScript {
  rules: ScriptRule[];
}

const OUTCOMES = ["done", "failed", "stuck", "usage-limit", "hang"];

/** Check a script and say plainly what is wrong with it. */
export function parseScript(value: unknown, source = "the script"): AgentScript {
  const fail = (why: string): never => {
    throw new Error(`The scripted agent cannot use ${source}: ${why}.`);
  };
  if (!value || typeof value !== "object" || !Array.isArray((value as AgentScript).rules)) {
    fail('it must be a JSON object with a "rules" list');
  }
  const rules = (value as AgentScript).rules;
  rules.forEach((rule, i) => {
    const where = `rule ${i + 1}`;
    if (!rule || typeof rule !== "object") fail(`${where} is not an object`);
    if (
      rule.when?.task !== undefined &&
      !(AGENT_TASK_KINDS as readonly string[]).includes(rule.when.task)
    ) {
      fail(
        `${where} names task "${rule.when.task}", which is not one of ${AGENT_TASK_KINDS.join(", ")}`,
      );
    }
    if (!rule.end || !OUTCOMES.includes(rule.end.outcome)) {
      fail(`${where} must end with an outcome of ${OUTCOMES.join(", ")}`);
    }
    if (rule.end.outcome === "failed" && typeof rule.end.failure !== "string") {
      fail(`${where} fails, so it must name the failure (a "failure" text)`);
    }
    if (
      rule.end.outcome === "usage-limit" &&
      rule.end.reset_at != null &&
      (typeof rule.end.reset_at !== "string" || Number.isNaN(Date.parse(rule.end.reset_at)))
    ) {
      fail(`${where} has a reset_at that is not a date such as 2026-11-21T11:00:00Z`);
    }
    if (rule.delay_ms !== undefined && (!Number.isInteger(rule.delay_ms) || rule.delay_ms < 0)) {
      fail(`${where} has a delay_ms that is not a whole number of milliseconds`);
    }
    if (rule.calls !== undefined) {
      if (!Array.isArray(rule.calls)) fail(`${where} has "calls" that is not a list`);
      rule.calls.forEach((c, n) => {
        if (!c || typeof c.tool !== "string")
          fail(`${where}, call ${n + 1}, does not name its "tool"`);
        if (
          c.arguments !== undefined &&
          (typeof c.arguments !== "object" || Array.isArray(c.arguments))
        ) {
          fail(`${where}, call ${n + 1}, has "arguments" that is not an object`);
        }
      });
    }
  });
  return { rules };
}

export function loadScriptFile(file: string): AgentScript {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `The scripted agent cannot read its script ${file}: ${(error as Error).message}.`,
    );
  }
  return parseScript(raw, file);
}

function matches(rule: ScriptRule, request: AgentRequest): boolean {
  const when = rule.when ?? {};
  return (
    (when.task === undefined || when.task === request.taskKind) &&
    (when.attempt === undefined || when.attempt === request.attempt) &&
    (when.brief_contains === undefined || request.brief.includes(when.brief_contains)) &&
    (when.stage === undefined || request.context?.stage === when.stage) &&
    (when.purpose === undefined || request.context?.purpose === when.purpose)
  );
}

function toOutcome(end: ScriptEnd, request: AgentRequest): AgentOutcome | null {
  switch (end.outcome) {
    case "done":
      return { kind: "done", summary: end.summary ?? `Scripted ${request.taskKind} finished.` };
    case "failed":
      return {
        kind: "failed",
        summary: end.summary ?? `Scripted ${request.taskKind} failed.`,
        failureSignature: end.failure,
      };
    case "stuck":
      return { kind: "stuck", summary: end.summary ?? `Scripted ${request.taskKind} got stuck.` };
    case "usage-limit":
      return { kind: "usage-limit", resetAt: end.reset_at ?? null };
    case "hang":
      return null;
  }
}

export class ScriptedAgentRunner implements AgentRunner {
  readonly runtime = "scripted";
  /** Every request this runner was given, in order; tests read it. */
  readonly requests: AgentRequest[] = [];

  /** Every tool call sessions made, with its result; tests read it. */
  readonly calls: { jobId: number; tool: string; result: ToolEnvelope }[] = [];
  private tools: AgentToolServer | undefined;

  constructor(
    private readonly script: AgentScript = { rules: [] },
    tools?: AgentToolServer,
  ) {
    this.tools = tools;
  }

  /** Give sessions premise's tools (the tool server), so script calls reach the line engine. */
  useTools(tools: AgentToolServer): void {
    this.tools = tools;
  }

  /**
   * Give sessions working copies, as a real agent gets: a clone of the software's repository under
   * the data folder (a branch for a builder, the commit under check for a checker). A behaviour
   * finds its copy in request.workingCopy. Without this, sessions get none.
   */
  useWorkingCopies(dataFolder: string, keepFinished = false): void {
    this.dataFolder = dataFolder;
    this.keepFinished = keepFinished;
  }

  private dataFolder: string | undefined;
  private keepFinished = false;

  start(request: AgentRequest, onProgress: (progress: AgentProgress) => void): AgentSession {
    this.requests.push(request);
    const rule = this.script.rules.find((r) => matches(r, request));
    const end: ScriptEnd = rule?.end ?? { outcome: "done" };
    let stop: () => void = () => {};
    const stopped = new Promise<AgentOutcome>((resolve) => {
      stop = () => resolve({ kind: "stopped" });
    });
    let ended = false;
    const finished = (async (): Promise<AgentOutcome> => {
      const access = accessFor(request.taskKind);
      let copy: { path: string; branch: string | null } | null = null;
      let session = request;
      if (this.dataFolder && request.repository && access.workingCopy !== "scratch") {
        copy = await prepareWorkingCopy({
          dataFolder: this.dataFolder,
          softwareId: request.softwareId,
          jobId: request.jobId,
          kind: access.workingCopy,
          repository: request.repository,
          ref: request.ref,
          reuse: Boolean(request.resumeSessionId),
        });
        session = { ...request, workingCopy: copy.path };
      }
      try {
        return await this.play(rule, end, session, onProgress, () => ended);
      } finally {
        if (copy && access.role === "checker") {
          saveEvidence(this.dataFolder!, request.softwareId, request.jobId, copy.path);
        }
        if (copy && !copy.branch && !this.keepFinished) removeWorkingCopy(copy.path);
      }
    })();
    return {
      sessionId: `scripted-${request.jobId}-${request.attempt}`,
      runtime: this.runtime,
      outcome: Promise.race([finished, stopped]),
      stop: () => {
        ended = true;
        stop();
      },
    };
  }

  private async play(
    rule: ScriptRule | undefined,
    end: ScriptEnd,
    request: AgentRequest,
    onProgress: (progress: AgentProgress) => void,
    isEnded: () => boolean,
  ): Promise<AgentOutcome> {
    {
      for (const text of rule?.progress ?? []) {
        onProgress({ time: new Date().toISOString(), text });
      }
      if (rule?.delay_ms) await new Promise((r) => setTimeout(r, rule.delay_ms));
      if (!isEnded() && (rule?.calls?.length || rule?.behave) && this.tools) {
        const tools = this.tools;
        const token = tools.issue({
          role: accessFor(request.taskKind).role,
          softwareId: request.softwareId,
          jobId: request.jobId,
          onProgress: (text) => onProgress({ time: new Date().toISOString(), text }),
        });
        const call = (tool: string, args: Record<string, unknown>) => {
          const result = tools.callDirect(token, tool, args);
          this.calls.push({ jobId: request.jobId, tool, result });
          return result;
        };
        try {
          for (const c of rule.calls ?? []) call(c.tool, c.arguments ?? {});
          await rule.behave?.(request, call);
        } finally {
          tools.revoke(token);
        }
      }
      const outcome = toOutcome(end, request);
      return outcome ?? new Promise<AgentOutcome>(() => {});
    }
  }
}
