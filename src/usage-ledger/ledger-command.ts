import { spawn } from "node:child_process";

/**
 * Running the usage-ledger command (decision 0330): directly, never through a shell, with its
 * database and Claude Code's log folder passed in its environment, and a time limit. Every call
 * asks for --json, so the answer is one JSON object, or an error object, on stdout.
 */

export interface LedgerCommandResult {
  /** The process's exit code; null when it did not exit by itself. */
  code: number | null;
  /** The JSON object it printed; null when it printed none. */
  json: Record<string, unknown> | null;
  stderr: string;
}

/** Why a command could not be run or answered nothing usable: said plainly, with what to do. */
export class LedgerCommandError extends Error {
  constructor(
    message: string,
    /** "missing": the program was not found; "failed": it ran and broke, or took too long. */
    readonly kind: "missing" | "failed",
  ) {
    super(message);
  }
}

export type LedgerRun = (args: string[], input?: string) => Promise<LedgerCommandResult>;

export interface LedgerCommandOptions {
  command: string;
  database: string | null;
  /** Claude Code's data folder, the one holding projects/; null leaves usage-ledger's default. */
  logs: string | null;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

/** A .js file is run with the same Node.js as premise, so a path to usage-ledger's cli.js works. */
function program(command: string): { file: string; args: string[] } {
  return /\.(c|m)?js$/.test(command)
    ? { file: process.execPath, args: [command] }
    : { file: command, args: [] };
}

export function ledgerCommand(options: LedgerCommandOptions): LedgerRun {
  return (args, input) =>
    new Promise((resolve, reject) => {
      const { file, args: before } = program(options.command);
      const env: NodeJS.ProcessEnv = { ...(options.env ?? process.env) };
      if (options.database) env.USAGE_LEDGER_DB = options.database;
      if (options.logs) env.USAGE_LEDGER_LOGS = options.logs;
      let child;
      try {
        child = spawn(file, [...before, ...args, "--json"], {
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
        });
      } catch (error) {
        reject(
          new LedgerCommandError(`it could not be started (${(error as Error).message})`, "failed"),
        );
        return;
      }
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (stdout.length < 4_000_000) stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          error.code === "ENOENT"
            ? new LedgerCommandError(`"${options.command}" was not found`, "missing")
            : error.code === "EACCES"
              ? new LedgerCommandError(
                  `"${options.command}" cannot be run (not allowed)`,
                  "missing",
                )
              : new LedgerCommandError(`it could not be started (${error.message})`, "failed"),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(
            new LedgerCommandError(
              `it took longer than ${Math.round(options.timeoutMs / 1000)} seconds`,
              "failed",
            ),
          );
          return;
        }
        let json: Record<string, unknown> | null = null;
        try {
          const parsed = JSON.parse(stdout) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            json = parsed as Record<string, unknown>;
          }
        } catch {
          json = null;
        }
        resolve({ code, json, stderr: stderr.trim() });
      });
      child.stdin.on("error", () => {
        // The program may exit before reading its input; the exit code says what happened.
      });
      child.stdin.end(input ?? "");
    });
}

/** The error object usage-ledger printed, if it printed one. */
export function ledgerError(result: LedgerCommandResult): { code: string; message: string } | null {
  const error = result.json?.error;
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: unknown; message?: unknown };
  return {
    code: typeof e.code === "string" ? e.code : "unknown",
    message: typeof e.message === "string" ? e.message : "no message",
  };
}
