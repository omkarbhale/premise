import type { AgentProgress, AgentRequest, AgentRunner, AgentSession } from "./agent-runner.js";

/**
 * The runner premise starts with. Normally it holds the real runner (Claude Code). When real agents
 * cannot start on this machine, it holds none: premise starts anyway, agent jobs wait in the queue,
 * and the page says what is missing. The operator may then switch to the scripted agent for a look
 * around, labelled on the page as not real (decision 0180).
 */
export class SwitchableRunner implements AgentRunner {
  private current: AgentRunner | null;
  /** Why real agents cannot start, in plain words; null when they can. */
  readonly unavailable: string | null;
  private demo = false;

  constructor(runner: AgentRunner | null, unavailable: string | null = null) {
    this.current = runner;
    this.unavailable = runner ? null : (unavailable ?? "Real agents cannot start.");
  }

  get runtime(): string {
    return this.current?.runtime ?? "none";
  }

  /** Whether agent jobs can start now. */
  ready(): boolean {
    return this.current !== null;
  }

  /** True after the operator chose the scripted look-around. */
  get scriptedDemo(): boolean {
    return this.demo;
  }

  /** Use the scripted agent until premise restarts. */
  useScriptedDemo(runner: AgentRunner): void {
    if (this.current && !this.demo) return;
    this.current = runner;
    this.demo = true;
  }

  start(request: AgentRequest, onProgress: (progress: AgentProgress) => void): AgentSession {
    if (!this.current) throw new Error(this.unavailable ?? "Real agents cannot start.");
    return this.current.start(request, onProgress);
  }
}
