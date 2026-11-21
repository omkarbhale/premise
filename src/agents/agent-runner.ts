import type { AgentTaskKind, Effort } from "../config/settings.js";

/**
 * The agent runner's seam: the only part of premise that knows which agent runtime is used
 * (decision 0107). The rest of premise asks for "an agent for this task" and gets a result.
 * Implementations: the scripted agent (no LLM; every test and demo) and, later, Claude Code.
 */

export interface AgentRequest {
  jobId: number;
  softwareId: string;
  taskKind: AgentTaskKind;
  /** Which attempt this is, from 1. */
  attempt: number;
  model: string;
  effort: Effort;
  maxTurns: number;
  maxMinutes: number;
  /** The filled-in task brief. */
  brief: string;
  /** The folder the agent is confined to, when the task needs one. */
  workingCopy?: string;
}

/** A line of progress, as the page shows it. */
export interface AgentProgress {
  time: string;
  text: string;
}

export type AgentOutcome =
  /** The task finished. */
  | { kind: "done"; summary: string }
  /** The task failed; the signature names the failure so repeats can be counted. */
  | { kind: "failed"; summary: string; failureSignature: string }
  /** The session hit its turn or time limit, or was stuck. */
  | { kind: "stuck"; summary: string }
  /** The subscription's usage limit was reached; all agent work pauses until the reset. */
  | { kind: "usage-limit"; resetAt: string | null }
  /** The session was stopped from outside. */
  | { kind: "stopped" };

export interface AgentSession {
  /** The runtime's own session id, recorded against the task so usage can be attributed. */
  sessionId: string;
  runtime: string;
  /** Resolves once the session has ended. */
  outcome: Promise<AgentOutcome>;
  /** Ask the session to stop; its outcome then resolves as stopped. */
  stop(): void;
}

export interface AgentRunner {
  readonly runtime: string;
  start(request: AgentRequest, onProgress: (progress: AgentProgress) => void): AgentSession;
}
