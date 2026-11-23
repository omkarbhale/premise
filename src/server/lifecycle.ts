import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Job } from "../queue/work-queue.js";

/**
 * Starting, stopping and coming back (decision 0290): the file that says a premise is running in a
 * data folder, `premise stop`, and what Ctrl+C does. premise stops cleanly when asked once (nothing
 * new starts and it ends once the running work has), and at once when asked twice.
 */

export interface RunningFile {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
}

export function runningFile(dataFolder: string): string {
  return join(dataFolder, "premise.running");
}

export function writeRunningFile(dataFolder: string, info: RunningFile): void {
  writeFileSync(runningFile(dataFolder), `${JSON.stringify(info)}\n`);
}

export function removeRunningFile(dataFolder: string, pid = process.pid): void {
  const found = readRunningFile(dataFolder);
  if (found && found.pid !== pid) return; // another premise's file: leave it
  rmSync(runningFile(dataFolder), { force: true });
}

export function readRunningFile(dataFolder: string): RunningFile | null {
  const file = runningFile(dataFolder);
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as Partial<RunningFile>;
    if (
      typeof value.pid === "number" &&
      typeof value.port === "number" &&
      typeof value.host === "string"
    ) {
      return value as RunningFile;
    }
  } catch {
    // unreadable: treated as not there
  }
  return null;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Whether something on that address answers as premise does. */
async function answersAsPremise(info: RunningFile, timeoutMs: number): Promise<boolean> {
  const host = info.host === "::1" ? "[::1]" : info.host;
  try {
    const response = await fetch(`http://${host}:${info.port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.json()) as { name?: unknown };
    return body.name === "premise";
  } catch {
    return false;
  }
}

/**
 * The premise running in this data folder, if there is one. A file left behind by a premise that
 * is gone (a crash, a power cut) is removed, so it never blocks a start or sends a signal to some
 * other program that was given the same process number since.
 */
export async function findRunning(dataFolder: string): Promise<RunningFile | null> {
  const info = readRunningFile(dataFolder);
  if (!info) return null;
  if (alive(info.pid) && (await answersAsPremise(info, 2000))) return info;
  rmSync(runningFile(dataFolder), { force: true });
  return null;
}

export interface StopRequestResult {
  outcome: "not-running" | "stopped" | "still-running" | "signal-failed";
  pid?: number;
}

/**
 * `premise stop`: ask the running premise to stop, as Ctrl+C does once (or, with now, as pressing
 * it twice does), and wait for it to end. Where waiting is not wanted, wait is false.
 */
export async function requestStop(options: {
  dataFolder: string;
  now: boolean;
  wait?: boolean;
  /** Longest wait for it to end; for tests. */
  timeoutMs?: number;
  print: (line: string) => void;
}): Promise<StopRequestResult> {
  const found = await findRunning(options.dataFolder);
  if (!found) {
    options.print("premise is not running here, so there is nothing to stop.");
    return { outcome: "not-running" };
  }
  try {
    process.kill(
      found.pid,
      options.now ? "SIGTERM" : process.platform === "win32" ? "SIGINT" : "SIGUSR2",
    );
  } catch {
    options.print(
      `premise (process ${found.pid}) could not be asked to stop. Press Ctrl+C in the terminal where it runs instead.`,
    );
    return { outcome: "signal-failed", pid: found.pid };
  }
  if (options.now) {
    options.print(
      "Asked premise to stop now. Running sessions are stopped, and their unfinished work is redone when you start premise again.",
    );
  } else {
    options.print(
      "Asked premise to stop. It starts nothing new and ends once the running work finishes; its own terminal says what it is waiting for. Asking again changes nothing. To stop at once instead, run: premise stop --now",
    );
  }
  if (options.wait === false) return { outcome: "stopped", pid: found.pid };
  const deadline = Date.now() + (options.timeoutMs ?? Number.POSITIVE_INFINITY);
  while (alive(found.pid)) {
    if (Date.now() > deadline) return { outcome: "still-running", pid: found.pid };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  options.print("premise has stopped. Your work is saved.");
  return { outcome: "stopped", pid: found.pid };
}

/** The first thing a stop says about getting back in. */
export function comingBackLines(options: {
  keepLink: boolean;
  pausedOnStart: boolean;
  command?: string;
}): string[] {
  const command = options.command ?? "npm start";
  const lines = [
    `Start premise again with \`${command}\` and it carries on from where it was.`,
    options.keepLink
      ? "Your link stays the same (server.keep_link is on), so the one you have, or a bookmark of it, opens premise again."
      : "It prints a new link when it starts; the old one stops working. Open the new one it prints.",
  ];
  if (options.pausedOnStart) {
    lines.push("It will start paused, because everything was paused. Press Resume on the page.");
  }
  return lines;
}

/** What the controller needs from a running premise. */
export interface Stoppable {
  /** Nothing new starts from now on. */
  beginStopping(): void;
  /** Jobs still running (sessions, and the server's own jobs). */
  stillRunning(): Job[];
  /** Resolves once no job is running. */
  whenIdle(): Promise<void>;
  /** Stop everything now (sessions are stopped and their jobs put back) and close. */
  close(): Promise<void>;
  /** The lines to say once it has closed. */
  goodbye(): string[];
  /** Built software premise is running, by name; it stops with premise. */
  runningSoftwareNames(): string[];
}

const KIND_WORDS: Record<string, string> = {
  build: "a build",
  check: "a check",
  plan: "planning",
  research: "research",
  review: "a review",
  draft: "a draft",
  run: "starting a software",
  report: "a report",
  size: "sizing",
  triage: "triage",
  reading: "a reading",
  prototype: "a prototype",
  recover: "recovering a record",
};

export function describeJobs(jobs: Job[], softwareName: (id: string) => string): string {
  return jobs
    .map((j) => `${KIND_WORDS[j.kind] ?? j.kind} for ${softwareName(j.softwareId)}`)
    .join("; ");
}

/**
 * Ctrl+C, and what stops premise from another terminal. Once: pause, let the running sessions
 * finish, then stop; say what it is waiting for and that a second Ctrl+C stops now. Twice, or a
 * termination signal: stop now, which is always safe (the cut-off work goes back to the queue).
 */
export class StopController {
  private state: "running" | "stopping" | "closing" = "running";
  private watcher: NodeJS.Timeout | null = null;
  private lastSaid = "";

  constructor(
    private readonly target: Stoppable,
    private readonly options: {
      print: (line: string) => void;
      exit: (code: number) => void;
      softwareName: (id: string) => string;
      /** How often to say what is still being waited for (ms). */
      sayEveryMs?: number;
    },
  ) {}

  get phase(): "running" | "stopping" | "closing" {
    return this.state;
  }

  /** Ctrl+C. */
  interrupt(): void {
    if (this.state === "running") void this.clean();
    else void this.now();
  }

  /**
   * `premise stop` without --now: a clean stop that never escalates. Asked while already stopping,
   * it changes nothing and says what is awaited and how to stop now.
   */
  requestClean(): void {
    if (this.state === "running") void this.clean();
    else if (this.state === "stopping") {
      const jobs = this.target.stillRunning();
      this.options.print(
        `\npremise is already stopping: waiting for ${jobs.length} ${jobs.length === 1 ? "session" : "sessions"} to finish. To stop now, run premise stop --now`,
      );
    }
  }

  /** A request to end (the system, or the terminal closing): stop now; it is safe. */
  terminate(): void {
    void this.now();
  }

  private async clean(): Promise<void> {
    this.state = "stopping";
    this.target.beginStopping();
    const jobs = this.target.stillRunning();
    if (jobs.length === 0) {
      this.options.print("\nStopping premise. Nothing is running, so nothing is lost.");
      await this.finish();
      return;
    }
    this.options.print(
      `\nStopping premise once the running work finishes: ${describeJobs(jobs, this.options.softwareName)}.`,
    );
    this.options.print(
      "Nothing new starts meanwhile. Press Ctrl+C again to stop now; unfinished work is then redone next time.",
    );
    this.lastSaid = jobs.map((j) => j.id).join(",");
    this.watcher = setInterval(() => this.sayWaiting(), this.options.sayEveryMs ?? 5000);
    this.watcher.unref?.();
    await this.target.whenIdle();
    if (this.state === "stopping") await this.finish();
  }

  private sayWaiting(): void {
    const jobs = this.target.stillRunning();
    const key = jobs.map((j) => j.id).join(",");
    if (key === this.lastSaid || jobs.length === 0) return;
    this.lastSaid = key;
    this.options.print(
      `Still waiting for: ${describeJobs(jobs, this.options.softwareName)}. Ctrl+C again stops now.`,
    );
  }

  private async now(): Promise<void> {
    if (this.state === "closing") return;
    const jobs = this.target.stillRunning();
    this.state = "closing";
    this.options.print(
      jobs.length > 0
        ? "\nStopping now. The running sessions are stopped and their unfinished work is redone next time."
        : "\nStopping premise.",
    );
    await this.finish();
  }

  private async finish(): Promise<void> {
    this.state = "closing";
    if (this.watcher) clearInterval(this.watcher);
    const software = this.target.runningSoftwareNames();
    if (software.length > 0) {
      this.options.print(
        `Stopping the built software premise was running (${software.join(", ")}). It stops with premise; start it again from its page.`,
      );
    }
    try {
      await this.target.close();
    } finally {
      for (const line of this.target.goodbye()) this.options.print(line);
      this.options.exit(0);
    }
  }
}
