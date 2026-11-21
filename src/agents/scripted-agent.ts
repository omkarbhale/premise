import { readFileSync } from "node:fs";
import { AGENT_TASK_KINDS } from "../config/settings.js";
import type {
  AgentOutcome,
  AgentProgress,
  AgentRequest,
  AgentRunner,
  AgentSession,
} from "./agent-runner.js";

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
 *     { "when": { "task": "check" }, "end": { "outcome": "hang" } }
 *   ]
 * }
 */

export type ScriptEnd =
  | { outcome: "done"; summary?: string }
  | { outcome: "failed"; summary?: string; failure: string }
  | { outcome: "stuck"; summary?: string }
  | { outcome: "usage-limit"; reset_at?: string | null }
  | { outcome: "hang" };

export interface ScriptRule {
  when?: { task?: string; attempt?: number; brief_contains?: string };
  progress?: string[];
  delay_ms?: number;
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
    if (rule.delay_ms !== undefined && (!Number.isInteger(rule.delay_ms) || rule.delay_ms < 0)) {
      fail(`${where} has a delay_ms that is not a whole number of milliseconds`);
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
    (when.brief_contains === undefined || request.brief.includes(when.brief_contains))
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

  constructor(private readonly script: AgentScript = { rules: [] }) {}

  start(request: AgentRequest, onProgress: (progress: AgentProgress) => void): AgentSession {
    this.requests.push(request);
    const rule = this.script.rules.find((r) => matches(r, request));
    const end: ScriptEnd = rule?.end ?? { outcome: "done" };
    let stop: () => void = () => {};
    const stopped = new Promise<AgentOutcome>((resolve) => {
      stop = () => resolve({ kind: "stopped" });
    });
    const finished = (async (): Promise<AgentOutcome> => {
      for (const text of rule?.progress ?? []) {
        onProgress({ time: new Date().toISOString(), text });
      }
      if (rule?.delay_ms) await new Promise((r) => setTimeout(r, rule.delay_ms));
      const outcome = toOutcome(end, request);
      return outcome ?? new Promise<AgentOutcome>(() => {});
    })();
    return {
      sessionId: `scripted-${request.jobId}-${request.attempt}`,
      runtime: this.runtime,
      outcome: Promise.race([finished, stopped]),
      stop: () => stop(),
    };
  }
}
