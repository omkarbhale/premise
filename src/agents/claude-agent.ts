import { withProvidedTools } from "../runner/provided-tools.js";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PremiseConfig } from "../config/settings.js";
import type {
  AgentOutcome,
  AgentProgress,
  AgentRequest,
  AgentRunner,
  AgentSession,
  OutcomeFigures,
  WindowReading,
} from "./agent-runner.js";
import {
  claudeArguments,
  mcpConfig,
  sessionEnvironment,
  sessionSettings,
} from "./claude-settings.js";
import {
  LineSplitter,
  type MessageUsage,
  parseStreamLine,
  type StreamEvent,
} from "./claude-stream.js";
import { assembleInstructions } from "./instructions.js";
import { accessFor } from "./roles.js";
import type { AgentToolServer } from "./tool-server.js";
import { prepareWorkingCopy, removeWorkingCopy, saveEvidence } from "./working-copy.js";

/**
 * Real agents: Claude Code run headless as a child process, one per session (decisions 0071,
 * 0087, 0125). See claude-settings.ts for how each session is confined.
 */

export class PrerequisiteMissingError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `premise will not start real agents: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing. ` +
        `Claude Code's sandbox needs them to keep agents confined, and premise never runs agents unconfined. ` +
        `Install ${missing.length === 1 ? "it" : "them"} (for example \`sudo apt install ${missing.join(" ")}\`) and start premise again, ` +
        `or set agents.mode to "scripted" to try premise without real agents.`,
    );
    this.name = "PrerequisiteMissingError";
  }
}

/** On Linux, Claude Code's sandbox needs bubblewrap and socat. Says which are missing. */
export async function missingSandboxTools(
  platform: NodeJS.Platform = process.platform,
  has: (command: string, args: string[]) => Promise<boolean> = (command, args) =>
    new Promise((resolve) => execFile(command, args, { timeout: 10_000 }, (e) => resolve(!e))),
): Promise<string[]> {
  if (platform !== "linux") return [];
  const missing: string[] = [];
  if (!(await has("bwrap", ["--version"]))) missing.push("bubblewrap");
  if (!(await has("socat", ["-V"]))) missing.push("socat");
  return missing;
}

export interface ClaudeAgentRunnerOptions {
  config: Pick<PremiseConfig, "data" | "agents">;
  tools: AgentToolServer;
  /** Where agents reach premise's tools, e.g. http://127.0.0.1:4610/mcp. */
  toolsUrl: string;
  /** premise's docs folder, holding prompts/ and skills/. */
  docsFolder: string;
  /** premise's own environment; only what a program needs is passed on. */
  env?: NodeJS.ProcessEnv;
  home?: string;
  /**
   * Hosts the person allowed for one software's agents, besides the package registries (decision
   * 0300). Read for every session, so an allowance applies from the next session on, without
   * restarting premise.
   */
  extraHosts?: (softwareId: string) => string[];
  /** Programs the person provided for one software; put on the session's PATH (decision 0311). */
  extraToolPaths?: (softwareId: string) => string[];
}

/** The message that carries a cut-off session on. */
export const RESUME_PROMPT =
  "premise stopped this session before it finished (the usage limit was reached, or premise was restarted). Carry on with the same task from where you left off.";

export class ClaudeAgentRunner implements AgentRunner {
  readonly runtime = "claude";

  constructor(private readonly options: ClaudeAgentRunnerOptions) {}

  /**
   * Checks the sandbox tools first: with any missing, no real agent may start.
   */
  static async create(
    options: ClaudeAgentRunnerOptions,
    platform: NodeJS.Platform = process.platform,
  ): Promise<ClaudeAgentRunner> {
    const missing = await missingSandboxTools(platform);
    if (missing.length > 0) throw new PrerequisiteMissingError(missing);
    return new ClaudeAgentRunner(options);
  }

  start(request: AgentRequest, onProgress: (progress: AgentProgress) => void): AgentSession {
    const session = new ClaudeSession(this.options, request, onProgress);
    void session.run();
    return session;
  }
}

class ClaudeSession implements AgentSession {
  readonly runtime = "claude";
  private currentId: string;
  private child: ChildProcess | null = null;
  private stopRequested = false;
  private limitHit: AgentOutcome | null = null;
  /** Every reading of each window as it came, so each can be given to usage-ledger with its time. */
  private readonly readings: WindowReading[] = [];
  /** The tokens each model message reported, by message id: the figures of a session cut off. */
  private readonly streamed = new Map<string, MessageUsage>();
  private killTimer: NodeJS.Timeout | null = null;
  private resolveOutcome!: (outcome: AgentOutcome) => void;
  readonly outcome: Promise<AgentOutcome>;

  constructor(
    private readonly options: ClaudeAgentRunnerOptions,
    private readonly request: AgentRequest,
    private readonly onProgress: (progress: AgentProgress) => void,
  ) {
    this.currentId = request.resumeSessionId ?? randomUUID();
    this.confirmed = new Promise((resolve) => (this.confirm = resolve));
    if (request.resumeSessionId) this.confirm(request.resumeSessionId);
    this.outcome = new Promise((resolve) => (this.resolveOutcome = resolve));
  }

  readonly confirmed: Promise<string>;
  private confirm!: (id: string) => void;

  get sessionId(): string {
    return this.currentId;
  }

  private say(text: string): void {
    this.onProgress({ time: new Date().toISOString(), text });
  }

  stop(): void {
    this.stopRequested = true;
    this.endChild();
  }

  /** The child process is still there; one that is gone without having reported has died. */
  alive(): boolean {
    if (!this.spawned) return true;
    const child = this.child;
    return !!child && child.exitCode === null && child.signalCode === null;
  }
  private spawned = false;

  /** Ask the child to end, then end it forcibly after the grace time. Its whole group goes. */
  private endChild(): void {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    signalGroup(child, "SIGTERM");
    if (!this.killTimer) {
      this.killTimer = setTimeout(
        () => signalGroup(child, "SIGKILL"),
        this.options.config.agents.claude.stop_grace_seconds * 1000,
      );
      this.killTimer.unref();
    }
  }

  async run(): Promise<void> {
    let outcome: AgentOutcome;
    try {
      outcome = await this.runInside();
    } catch (error) {
      outcome = {
        kind: "failed",
        summary: `The agent could not be started: ${(error as Error).message}`,
        failureSignature: "agent-start-failed",
      };
    }
    this.resolveOutcome(outcome);
  }

  private async runInside(): Promise<AgentOutcome> {
    const { config, tools } = this.options;
    const { request } = this;
    const access = accessFor(request.taskKind);
    const dataFolder = config.data.folder;
    const resuming = Boolean(request.resumeSessionId);

    const copy = await prepareWorkingCopy({
      dataFolder,
      softwareId: request.softwareId,
      jobId: request.jobId,
      kind: access.workingCopy,
      repository: request.repository,
      ref: request.ref,
      ...(request.trace && { trace: request.trace }),
      reuse: resuming,
    });
    if (this.stopRequested) return { kind: "stopped" };

    const sessionFolder = join(dataFolder, "sessions", `job-${request.jobId}-${request.attempt}`);
    mkdirSync(sessionFolder, { recursive: true, mode: 0o700 });
    const transcriptFolder = join(dataFolder, "transcripts");
    mkdirSync(transcriptFolder, { recursive: true });
    const transcript = createWriteStream(
      join(transcriptFolder, `job-${request.jobId}-${request.attempt}.jsonl`),
    );
    transcript.on("error", () => {}); // a transcript that cannot be written must not crash premise

    // The agent's own account of how it ended (task_finish) is recorded as an event by the tool
    // server and never decides the outcome (decision 0097): the outcome comes from the session.
    const token = tools.issue({
      role: access.role,
      softwareId: request.softwareId,
      jobId: request.jobId,
      onProgress: (text) => this.say(text),
    });

    try {
      const settingsFile = join(sessionFolder, "settings.json");
      const mcpFile = join(sessionFolder, "mcp.json");
      writeFileSync(
        settingsFile,
        JSON.stringify(
          sessionSettings({
            workingCopy: copy.path,
            dataFolder,
            home: this.options.home ?? homedir(),
            access,
            allowedDomains: [
              ...config.agents.network.allowed_domains,
              ...(this.options.extraHosts?.(request.softwareId) ?? []),
            ],
            claudeConfigFolder: config.agents.claude_config_folder,
            extraDeniedPaths: config.agents.confinement.extra_denied_paths,
          }),
          null,
          2,
        ),
        { mode: 0o600 },
      );
      writeFileSync(mcpFile, JSON.stringify(mcpConfig(this.options.toolsUrl, token)), {
        mode: 0o600,
      });

      const brief = copy.branch
        ? `${request.brief}\n\nYour working copy is on the branch ${copy.branch}. Commit your change there; premise pushes it.`
        : request.brief;
      const args = claudeArguments({
        prompt: resuming ? RESUME_PROMPT : brief,
        model: request.model,
        effort: request.effort,
        settingsFile,
        mcpConfigFile: mcpFile,
        instructions: assembleInstructions(this.options.docsFolder, access.role),
        builtInTools: access.builtInTools,
        ...(resuming
          ? { resumeSessionId: request.resumeSessionId! }
          : { sessionId: this.currentId }),
      });
      if (this.stopRequested) return { kind: "stopped" };

      this.say(resuming ? "Carrying on the earlier session" : `Starting the ${access.role}`);
      const ended = await this.watch(args, copy.path, transcript);
      const outcome: AgentOutcome = {
        ...this.decide(ended),
        ...this.ownFigures(ended.result),
      };
      if (access.role === "checker") {
        saveEvidence(dataFolder, request.softwareId, request.jobId, copy.path);
      }
      if (
        ["done", "failed", "stuck"].includes(outcome.kind) &&
        !copy.branch &&
        !config.data.keep_finished_working_copies
      ) {
        removeWorkingCopy(copy.path);
      }
      return outcome;
    } finally {
      tools.revoke(token);
      await new Promise<void>((done) => {
        transcript.once("error", () => done());
        transcript.end(() => done());
      });
      rmSync(join(sessionFolder, "mcp.json"), { force: true });
    }
  }

  private environmentFor(softwareId: string): NodeJS.ProcessEnv {
    const env = sessionEnvironment(
      this.options.env ?? process.env,
      this.options.config.agents.claude_config_folder,
    );
    const provided = this.options.extraToolPaths?.(softwareId) ?? [];
    if (provided.length > 0) env.PATH = withProvidedTools(env.PATH, provided);
    return env;
  }

  private watch(
    args: string[],
    cwd: string,
    transcript: NodeJS.WritableStream,
  ): Promise<{
    result: Extract<StreamEvent, { kind: "result" }> | null;
    code: number | null;
    stderr: string;
  }> {
    const { config } = this.options;
    const { request } = this;
    return new Promise((resolve, reject) => {
      const child = spawn(config.agents.claude.command, args, {
        cwd,
        env: this.environmentFor(request.softwareId),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      this.child = child;
      this.spawned = true;
      const turns = new Set<string>();
      let result: Extract<StreamEvent, { kind: "result" }> | null = null;
      let stderr = "";
      const timeLimit = setTimeout(() => {
        this.limitHit = {
          kind: "stuck",
          summary: `The session reached its time limit of ${request.maxMinutes} minutes and was stopped.`,
        };
        this.endChild();
      }, request.maxMinutes * 60_000);
      timeLimit.unref();

      const handle = (event: StreamEvent) => {
        switch (event.kind) {
          case "init":
            this.currentId = event.sessionId;
            this.confirm(event.sessionId);
            if (event.apiKeySource && event.apiKeySource !== "none") {
              this.limitHit = {
                kind: "failed",
                summary:
                  "Claude Code was using an API key, which premise never does. The session was stopped. Remove the key from Claude Code's settings and try again.",
                failureSignature: "api-key-in-use",
              };
              this.endChild();
            }
            break;
          case "turn":
            if (event.usage) this.streamed.set(event.messageId, event.usage);
            if (!turns.has(event.messageId)) {
              turns.add(event.messageId);
              if (turns.size > request.maxTurns && !this.limitHit) {
                this.limitHit = {
                  kind: "stuck",
                  summary: `The session reached its turn limit of ${request.maxTurns} turns and was stopped.`,
                };
                this.endChild();
              }
            }
            break;
          case "progress":
            this.say(event.text);
            break;
          case "denied":
            this.say(`Not allowed: ${event.message}`);
            break;
          case "window":
            this.readings.push({
              window: event.window,
              usedPercent: Math.round(event.usedFraction * 10_000) / 100,
              resetsAt: event.resetsAt,
              status: event.status,
              readAt: new Date().toISOString(),
            });
            break;
          case "usage-warning":
            this.say("The subscription's usage limit is near.");
            break;
          case "usage-limit":
            if (!this.limitHit) this.limitHit = { kind: "usage-limit", resetAt: event.resetAt };
            this.endChild();
            break;
          case "result":
            result = event;
            break;
          case "unreadable":
            break;
        }
      };

      const lines = new LineSplitter();
      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => {
        transcript.write(chunk);
        for (const line of lines.push(chunk)) parseStreamLine(line).forEach(handle);
      });
      child.stderr!.setEncoding("utf8");
      child.stderr!.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000);
      });
      child.on("error", (error) => {
        clearTimeout(timeLimit);
        reject(
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? new Error(
                `Claude Code ("${config.agents.claude.command}") was not found. Install it, or tell premise where it is (the Settings page says how).`,
              )
            : error,
        );
      });
      child.on("close", (code) => {
        clearTimeout(timeLimit);
        if (this.killTimer) clearTimeout(this.killTimer);
        for (const line of lines.end()) parseStreamLine(line).forEach(handle);
        this.child = null;
        resolve({ result, code, stderr });
      });
    });
  }

  /** What the session's own stream and result said it used (decision 0270). */
  private ownFigures(result: Extract<StreamEvent, { kind: "result" }> | null): OutcomeFigures {
    const out: OutcomeFigures = {};
    if (result) {
      out.figures = { turns: result.turns, ...result.figures };
    } else if (this.streamed.size > 0) {
      // Cut off without a result (a pause or a stop): keep what its messages said they used, so a
      // session carried on later does not lose this leg's tokens. The cost is not known.
      const sum = (pick: (u: MessageUsage) => number) =>
        [...this.streamed.values()].reduce((n, u) => n + pick(u), 0);
      out.figures = {
        fromStream: true,
        turns: this.streamed.size,
        costUsd: null,
        inputTokens: sum((u) => u.inputTokens),
        outputTokens: sum((u) => u.outputTokens),
        cacheReadTokens: sum((u) => u.cacheReadTokens),
        cacheWriteTokens: sum((u) => u.cacheWriteTokens),
      };
    }
    if (this.readings.length > 0) out.windows = [...this.readings];
    return out;
  }

  private decide(ended: {
    result: Extract<StreamEvent, { kind: "result" }> | null;
    code: number | null;
    stderr: string;
  }): AgentOutcome {
    if (this.limitHit) return this.limitHit;
    if (this.stopRequested) return { kind: "stopped" };
    const { result, code, stderr } = ended;
    if (result?.ok) {
      return { kind: "done", summary: summarise(result.text) || "The session finished." };
    }
    if (result) {
      if (result.apiErrorStatus === 429) {
        return { kind: "usage-limit", resetAt: null };
      }
      if (/not logged in|\/login/i.test(result.text)) {
        return {
          kind: "failed",
          summary:
            "Claude Code is not logged in. Run `claude` once in a terminal and log in, then the job is tried again.",
          failureSignature: "not-logged-in",
        };
      }
      if (result.subtype === "error_max_turns") {
        return { kind: "stuck", summary: "The session reached Claude Code's own turn limit." };
      }
      return {
        kind: "failed",
        summary: summarise(result.text) || `The session ended with an error (${result.subtype}).`,
        failureSignature: `claude-${result.subtype}`,
      };
    }
    if (/sandbox/i.test(stderr)) {
      return {
        kind: "failed",
        summary:
          "Claude Code's sandbox could not start, so the agent did not run. Run `npm run doctor` to see what is missing.",
        failureSignature: "sandbox-unavailable",
      };
    }
    return {
      kind: "failed",
      summary: `Claude Code stopped without a result (exit code ${code ?? "none"})${stderr.trim() ? `: ${summarise(stderr)}` : "."}`,
      failureSignature: `claude-exit-${code ?? "signal"}`,
    };
  }
}

function summarise(text: string, max = 500): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (child.pid !== undefined) process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already gone.
    }
  }
}
