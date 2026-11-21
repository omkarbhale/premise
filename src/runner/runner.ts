import { type ChildProcess, spawn } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer, connect } from "node:net";
import { freemem, homedir, networkInterfaces } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import type { AgentOutcome } from "../agents/agent-runner.js";
import { type PremiseConfig, parsePortRange } from "../config/settings.js";
import { Git } from "../git/git.js";
import type { Job } from "../queue/work-queue.js";
import type { RunState, RunView } from "../shared/api-types.js";
import { type Database, now, recordEvent } from "../storage/database.js";
import { confine } from "./confinement.js";
import { secretsFile } from "./secrets.js";
import { type RunInstructions, parseRunInstructions } from "./run-instructions.js";

/**
 * The runner (docs/specs/runner.md): starts a built software from a clean copy of its repository at
 * a commit, by the run instructions in its record; keeps it up while premise runs; restarts it a
 * few times when it crashes; stops it; and tells the page how to open it.
 */

/**
 * The folder holding the Node.js premise runs on, or null when sharing it would expose more than
 * Node.js: the home folder, a folder above it, a filesystem root, or /usr (already readable).
 */
export function nodePrefix(execPath = process.execPath, home = homedir()): string | null {
  const own = dirname(dirname(execPath));
  const fromOwn = relative(own, home);
  const exposesHome = fromOwn === "" || !(fromOwn === ".." || fromOwn.startsWith(`..${sep}`));
  return own === "/usr" || own === dirname(own) || exposesHome ? null : own;
}

export class RunnerError extends Error {
  constructor(
    readonly code: "RUN_FAILED" | "NOTHING_BUILT",
    message: string,
  ) {
    super(message);
    this.name = "RunnerError";
  }
}

/** Every port of the configured range is taken: the message says which setting to change. */
class PortRangeError extends RunnerError {
  constructor(message: string) {
    super("RUN_FAILED", message);
  }
}

const PORT_IN_USE = /EADDRINUSE|address already in use/i;

export interface RunnerDeps {
  db: Database;
  config: PremiseConfig;
  /** Where each software's repository is: the record keeper answers this. */
  repositories: { repositoryPath(softwareId: string): string; git?: Git };
  /** Told when a software keeps crashing and premise stops starting it again. */
  onGaveUp?: (softwareId: string, failure: string) => void;
  /** Free memory on this machine, in bytes; for tests. */
  freeMemory?: () => number;
}

interface RunRow {
  id: number;
  software_id: string;
  commit_sha: string;
  kind: "web" | "command" | "program";
  status: RunState;
  command: string | null;
  port: number | null;
  link: string | null;
  pid: number | null;
  restarts: number;
  exit_code: number | null;
  confined: number;
  failure: string | null;
  sample_output: string | null;
  log_file: string | null;
  started: string;
  ended: string | null;
}

/** What the runner holds in memory about a run that is up. */
interface Live {
  runId: number;
  softwareId: string;
  instructions: RunInstructions;
  copy: string;
  port: number | null;
  child: ChildProcess | null;
  stopping: boolean;
  /** first-start: start() reports a failure itself; up and restarting: a stop by itself is a crash. */
  phase: "first-start" | "up" | "restarting";
  restartTimes: number[];
  /** Ports this run found taken by another program, not to be tried again. */
  busyPorts: Set<number>;
  /** The latest start failed because its port was in use; that is not a crash. */
  portCollision: boolean;
  lines: string[];
  logFile: string;
  timer: NodeJS.Timeout | null;
}

const SAMPLE_OUTPUT_LIMIT = 64 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

/** Addresses of this machine other than loopback: where software must not be reachable. */
function outsideAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((a) => !a.internal && a.family === "IPv4")
    .map((a) => a.address);
}

export class Runner {
  private readonly live = new Map<string, Live>();
  private readonly starting = new Set<string>();
  private readonly git: Git;
  private closed = false;

  constructor(private readonly deps: RunnerDeps) {
    const { config } = deps;
    this.git =
      deps.repositories.git ??
      new Git(
        { name: config.record.commit_author_name, email: config.record.commit_author_email },
        config.record.default_branch,
      );
  }

  /**
   * When premise starts: whatever was marked as up when it last stopped is not up any more, so say
   * so, rather than showing a link to nothing.
   */
  recoverStale(): number {
    const result = this.deps.db
      .prepare(
        "UPDATE runs SET status = 'stopped', ended = ?, failure = 'premise stopped, so this ended with it.' WHERE status IN ('starting', 'running')",
      )
      .run(now());
    return Number(result.changes);
  }

  // ---- Reading ------------------------------------------------------------------------------

  private latestRow(softwareId: string): RunRow | undefined {
    return this.deps.db
      .prepare("SELECT * FROM runs WHERE software_id = ? ORDER BY id DESC LIMIT 1")
      .get(softwareId) as unknown as RunRow | undefined;
  }

  /** Every run of a software, newest first, for the reporter's facts. */
  history(softwareId: string, limit = 20): RunRow[] {
    return this.deps.db
      .prepare("SELECT * FROM runs WHERE software_id = ? ORDER BY id DESC LIMIT ?")
      .all(softwareId, limit) as unknown as RunRow[];
  }

  private recentOutput(row: RunRow, live: Live | undefined): string[] {
    if (live) return live.lines.slice();
    if (row.kind === "command" && row.sample_output) return row.sample_output.split("\n");
    if (row.log_file && existsSync(row.log_file)) {
      return readFileSync(row.log_file, "utf8")
        .split("\n")
        .filter((l) => l.length > 0)
        .slice(-this.deps.config.runner.output_lines);
    }
    return [];
  }

  view(softwareId: string): RunView {
    const row = this.latestRow(softwareId);
    const empty: RunView = {
      softwareId,
      state: "none",
      plain:
        "Nothing is running yet. When the software has been built and checked, premise starts it here.",
      kind: null,
      commit: null,
      link: null,
      command: null,
      folder: null,
      output: [],
      outputIsSample: false,
      restarts: 0,
      confined: true,
      started: null,
      ended: null,
      canStart: this.canBuildRun(softwareId),
      canStop: false,
    };
    if (!row) return empty;
    const live = this.live.get(softwareId);
    const output = this.recentOutput(row, live);
    const short = row.commit_sha.slice(0, 7);
    const plains: Record<RunState, string> = {
      none: empty.plain,
      starting: "Starting up. This page updates by itself when it is ready.",
      running:
        row.kind === "web"
          ? "It is running. Open the link below; it only works on this computer."
          : "It is running.",
      finished:
        "The command ran once on a sample, and its output is below. To use it yourself, type the command shown.",
      built:
        "It has been built, but premise does not start desktop programs itself. Start it the way shown below.",
      crashed:
        row.failure ??
        "It stopped several times in a row, so premise stopped starting it again. The latest output is below.",
      failed: row.failure ?? "It could not be started. The latest output is below.",
      stopped: row.failure ?? "It was stopped. Press Start to run it again.",
    };
    return {
      softwareId,
      state: row.status,
      plain: plains[row.status],
      kind: row.kind,
      commit: short,
      link: row.status === "running" ? row.link : null,
      command: row.command,
      folder:
        row.command && row.kind !== "web"
          ? join(this.deps.config.data.folder, "work", softwareId, "run")
          : null,
      output,
      outputIsSample: row.kind === "command",
      restarts: row.restarts,
      confined: row.confined === 1,
      started: row.started,
      ended: row.ended,
      canStart: row.status !== "starting" && this.canBuildRun(softwareId),
      canStop: row.status === "running" || row.status === "starting",
    };
  }

  private canBuildRun(softwareId: string): boolean {
    const repo = this.deps.repositories.repositoryPath(softwareId);
    return existsSync(join(repo, ".git")) && this.git.headCommit(repo) !== undefined;
  }

  // ---- Starting and stopping ----------------------------------------------------------------

  /**
   * Start a software from a clean copy at a commit (the latest when none is given). Resolves once
   * it is up; a web software is up when it answers on its port. Throws RunnerError with a message
   * a person can act on.
   */
  async start(softwareId: string, commit?: string): Promise<RunView> {
    if (this.closed) throw new RunnerError("RUN_FAILED", "premise is stopping.");
    if (this.starting.has(softwareId)) {
      throw new RunnerError("RUN_FAILED", "It is already starting. Wait a moment.");
    }
    this.starting.add(softwareId);
    try {
      await this.stop(softwareId);
      return await this.startFresh(softwareId, commit);
    } finally {
      this.starting.delete(softwareId);
    }
  }

  private async startFresh(softwareId: string, wanted?: string): Promise<RunView> {
    const { db, config } = this.deps;
    const repo = this.deps.repositories.repositoryPath(softwareId);
    const head = existsSync(join(repo, ".git")) ? this.git.headCommit(repo) : undefined;
    if (head === undefined) {
      throw new RunnerError(
        "NOTHING_BUILT",
        "Nothing has been built for this software yet, so there is nothing to run. It runs after Build and Check.",
      );
    }
    const copy = join(config.data.folder, "work", softwareId, "run");
    rmSync(copy, { recursive: true, force: true });
    let sha: string;
    try {
      this.git.clone(repo, copy);
      this.git.run(copy, ["checkout", "--quiet", "--detach", wanted ?? head]);
      sha = this.git.headCommit(copy)!;
      this.git.run(copy, ["remote", "remove", "origin"]);
    } catch (error) {
      throw new RunnerError(
        "RUN_FAILED",
        `premise could not make a clean copy of the code${wanted ? ` at ${wanted.slice(0, 7)}` : ""}: ${(error as Error).message}`,
      );
    }
    this.placeSecrets(softwareId, copy);

    const file = `${config.record.folder}/run.md`;
    const parsed = parseRunInstructions(this.git.readFileAt(copy, "HEAD", file), file);
    const logFolder = join(config.data.folder, "logs", softwareId);
    mkdirSync(logFolder, { recursive: true });

    const insert = (
      kind: RunInstructions["kind"],
      status: RunState,
      extra: Partial<RunRow>,
    ): number =>
      Number(
        db
          .prepare(
            `INSERT INTO runs (software_id, commit_sha, kind, status, command, confined, failure, log_file, started, ended)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            softwareId,
            sha,
            kind,
            status,
            extra.command ?? null,
            extra.confined ?? 1,
            extra.failure ?? null,
            extra.log_file ?? null,
            now(),
            status === "starting" ? null : now(),
          ).lastInsertRowid,
      );

    if (!parsed.ok) {
      insert("program", "failed", { failure: parsed.problem });
      recordEvent(db, { softwareId, module: "runner", kind: "failed", reference: sha });
      throw new RunnerError("RUN_FAILED", parsed.problem);
    }
    const instructions = parsed.instructions;
    const confinedMode = config.runner.confinement === "bubblewrap" ? 1 : 0;

    if (instructions.kind === "program") {
      const id = insert("program", "built", { command: instructions.program!, confined: 1 });
      recordEvent(db, {
        softwareId,
        module: "runner",
        kind: "started",
        reference: sha,
        detail: { run: id, kind: "program" },
      });
      return this.view(softwareId);
    }

    const noRoom = this.noRoom(softwareId, instructions.kind);
    if (noRoom) {
      insert(instructions.kind, "failed", { failure: noRoom });
      throw new RunnerError("RUN_FAILED", noRoom);
    }

    const logFile = join(logFolder, `run-${Date.now()}.log`);
    const runId = insert(instructions.kind, "starting", {
      command: instructions.kind === "web" ? instructions.start! : instructions.command!,
      confined: confinedMode,
      log_file: logFile,
    });
    const live: Live = {
      runId,
      softwareId,
      instructions,
      copy,
      port: null,
      child: null,
      stopping: false,
      phase: "first-start",
      restartTimes: [],
      busyPorts: new Set(),
      portCollision: false,
      lines: [],
      logFile,
      timer: null,
    };

    try {
      if (instructions.kind === "command") {
        await this.runSample(live, sha);
      } else {
        this.live.set(softwareId, live);
        await this.launchOnFreePort(live);
        if (live.stopping) return this.view(softwareId);
        live.phase = "up";
        this.update(runId, {
          status: "running",
          port: live.port,
          link: `http://127.0.0.1:${live.port}${instructions.open}`,
        });
        recordEvent(db, {
          softwareId,
          module: "runner",
          kind: "started",
          reference: sha,
          detail: { run: runId, kind: "web", port: live.port },
        });
      }
    } catch (error) {
      if (live.stopping) return this.view(softwareId);
      this.live.delete(softwareId);
      this.killTree(live);
      const message = (error as Error).message;
      this.update(runId, { status: "failed", failure: message, ended: now() });
      recordEvent(db, {
        softwareId,
        module: "runner",
        kind: "failed",
        reference: sha,
        detail: { run: runId },
      });
      throw error instanceof RunnerError ? error : new RunnerError("RUN_FAILED", message);
    }
    return this.view(softwareId);
  }

  /** The software's secrets file, written by a person in premise's data folder, goes in the copy. */
  private placeSecrets(softwareId: string, copy: string): void {
    const secrets = secretsFile(this.deps.config.data.folder, softwareId);
    if (!existsSync(secrets)) return;
    const target = join(copy, ".env");
    copyFileSync(secrets, target);
    chmodSync(target, 0o600);
    appendFileSync(join(copy, ".git", "info", "exclude"), "\n/.env\n");
  }

  private update(runId: number, values: Record<string, unknown>): void {
    const keys = Object.keys(values);
    this.deps.db
      .prepare(`UPDATE runs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .run(...(keys.map((k) => values[k]) as never[]), runId);
  }

  private async choosePort(live: Live): Promise<number> {
    const range = parsePortRange(this.deps.config.runner.port_range)!;
    const taken = new Set(
      [...this.live.values()].filter((l) => l.softwareId !== live.softwareId).map((l) => l.port),
    );
    for (let port = range.first; port <= range.last; port++) {
      if (!taken.has(port) && !live.busyPorts.has(port) && (await canListen(port))) return port;
    }
    throw new PortRangeError(
      `Every port from ${range.first} to ${range.last} is in use, so there is nowhere to start it. Stop something else, or widen runner.port_range in the settings.`,
    );
  }

  /** The softwares running on this machine now, besides premise itself. */
  runningSoftwares(): string[] {
    return [...this.live.keys()];
  }

  /**
   * Several softwares run at once, each on its own port (decision 0197). Before starting one more,
   * say plainly when this machine is the limit: too many running already, or too little free memory.
   * Returns what to tell the person, or null when there is room.
   */
  private noRoom(softwareId: string, kind: RunInstructions["kind"]): string | null {
    const { db, config } = this.deps;
    const others = this.runningSoftwares().filter((id) => id !== softwareId);
    if (kind === "web" && others.length >= config.runner.max_running_softwares) {
      const names = others
        .map(
          (id) =>
            (
              db.prepare("SELECT name FROM softwares WHERE id = ?").get(id) as
                { name: string } | undefined
            )?.name ?? id,
        )
        .join(", ");
      recordEvent(db, {
        softwareId,
        module: "runner",
        kind: "no-room",
        detail: { reason: "count" },
      });
      return `${others.length} softwares are already running (${names}), which is as many as premise runs at once on this machine. Stop one of them first, or raise runner.max_running_softwares in the settings.`;
    }
    const minimum = config.runner.min_free_memory_mb;
    if (minimum > 0) {
      const freeMb = Math.floor((this.deps.freeMemory ?? freemem)() / (1024 * 1024));
      if (freeMb < minimum) {
        recordEvent(db, {
          softwareId,
          module: "runner",
          kind: "no-room",
          detail: { reason: "memory", freeMb },
        });
        return `This machine has only ${freeMb} MB of memory free, less than the ${minimum} MB premise keeps free before starting a software. Stop a running software or close other programs, then try again; or lower runner.min_free_memory_mb in the settings.`;
      }
    }
    return null;
  }

  /**
   * Pick a free port and start on it. Another program can take the port between the check and the
   * start; then the software says the port is in use, and the next free port is tried, until the
   * range runs out. That is not a crash, so it does not count toward the restart limit.
   */
  private async launchOnFreePort(live: Live): Promise<void> {
    for (;;) {
      live.port = await this.choosePort(live);
      if (live.stopping || this.closed) return;
      live.portCollision = false;
      try {
        await this.launchWeb(live);
        return;
      } catch (error) {
        if (live.stopping || this.closed) return;
        await sleep(150); // let the software's last words arrive
        if (!live.portCollision) throw error;
        live.busyPorts.add(live.port);
        this.killTree(live);
        live.child = null;
      }
    }
  }

  /**
   * Folders running software may read: the setting's, plus the Node.js premise itself runs on, so
   * software written for Node.js starts even when Node.js is installed under the home folder.
   */
  private readOnlyPaths(): string[] {
    const own = nodePrefix();
    const listed = this.deps.config.runner.read_only_paths;
    return own === null || listed.includes(own) ? listed : [...listed, own];
  }

  private environment(live: Live): NodeJS.ProcessEnv {
    const readOnly = this.readOnlyPaths();
    const path = [
      ...readOnly.map((p) => join(p, "bin")),
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ].join(":");
    const env: NodeJS.ProcessEnv = {
      PATH: path,
      HOME: live.copy,
      TMPDIR: "/tmp",
      LANG: "C.UTF-8",
      HOST: "127.0.0.1",
    };
    if (live.port !== null) env.PORT = String(live.port);
    return env;
  }

  private spawnConfined(live: Live, shellCommand: string, network: boolean): ChildProcess {
    const { config } = this.deps;
    const command = confine({
      mode: config.runner.confinement,
      copy: live.copy,
      shellCommand,
      network,
      readOnlyPaths: this.readOnlyPaths(),
    });
    const child = spawn(command.file, command.args, {
      cwd: live.copy,
      env: this.environment(live),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const take = (chunk: Buffer) => this.takeOutput(live, chunk.toString("utf8"));
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    return child;
  }

  private takeOutput(live: Live, text: string): void {
    if (PORT_IN_USE.test(text)) live.portCollision = true;
    appendFileSync(live.logFile, text);
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    live.lines.push(...lines);
    const keep = this.deps.config.runner.output_lines;
    if (live.lines.length > keep) live.lines.splice(0, live.lines.length - keep);
  }

  // ---- Command-line software ----------------------------------------------------------------

  private runSample(live: Live, sha: string): Promise<void> {
    const { config, db } = this.deps;
    const sample = live.instructions.sample!;
    const limit = config.runner.sample_timeout_seconds;
    return new Promise((resolve, reject) => {
      let out = "";
      const child = this.spawnConfined(live, sample, false);
      live.child = child;
      const collect = (chunk: Buffer) => {
        if (out.length < SAMPLE_OUTPUT_LIMIT) out += chunk.toString("utf8");
      };
      child.stdout?.on("data", collect);
      child.stderr?.on("data", collect);
      const timer = setTimeout(() => {
        this.killTree(live);
        reject(
          new RunnerError(
            "RUN_FAILED",
            `The sample run of "${sample}" took more than ${limit} seconds, so premise stopped it. Its output so far:\n${out.trim() || "(none)"}`,
          ),
        );
      }, limit * 1000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(
          new RunnerError(
            "RUN_FAILED",
            `premise could not start the command: ${error.message}. ${this.confinementHint()}`,
          ),
        );
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        const output = out.trim().slice(0, SAMPLE_OUTPUT_LIMIT);
        if (code === 0) {
          this.update(live.runId, {
            status: "finished",
            exit_code: 0,
            sample_output: output,
            command: live.instructions.command ?? sample,
            ended: now(),
          });
          recordEvent(db, {
            softwareId: live.softwareId,
            module: "runner",
            kind: "started",
            reference: sha,
            detail: { run: live.runId, kind: "command" },
          });
          resolve();
        } else {
          this.update(live.runId, { sample_output: output, exit_code: code });
          reject(
            new RunnerError(
              "RUN_FAILED",
              `The sample run of "${sample}" ended with an error (exit code ${code}). Its output:\n${output || "(none)"}`,
            ),
          );
        }
      });
    });
  }

  private confinementHint(): string {
    return this.deps.config.runner.confinement === "bubblewrap"
      ? "premise runs software inside bubblewrap; check that it is installed (the setup check says), or set runner.confinement to none to run without it."
      : "";
  }

  // ---- Web software -------------------------------------------------------------------------

  /** Start the process and wait until it answers on its port. Wires up crash handling. */
  private async launchWeb(live: Live): Promise<void> {
    const { config } = this.deps;
    const port = live.port!;
    const shell = live.instructions.start!.replaceAll("{port}", String(port));
    const child = this.spawnConfined(live, shell, true);
    live.child = child;
    let exited: { code: number | null; signal: string | null } | null = null;
    let spawnError: Error | null = null;
    child.once("error", (error) => (spawnError = error));
    child.once("exit", (code, signal) => {
      exited = { code, signal };
      this.onExit(live, child, code, signal);
    });

    const deadline = Date.now() + config.runner.start_timeout_seconds * 1000;
    while (Date.now() < deadline) {
      if (spawnError || exited || live.stopping) break;
      if (await canConnect("127.0.0.1", port, 500)) {
        const outside = await this.reachableFromOutside(port);
        if (outside) {
          this.killTree(live);
          throw new RunnerError(
            "RUN_FAILED",
            `The software answers on ${outside}, which means other computers could reach it. premise only runs software that listens on this computer alone. Make it listen on 127.0.0.1 (premise gives it HOST and PORT in its environment).`,
          );
        }
        return;
      }
      await sleep(100);
    }
    if (live.stopping) return;
    const tail = live.lines.slice(-15).join("\n");
    if (spawnError) {
      throw new RunnerError(
        "RUN_FAILED",
        `premise could not start it: ${(spawnError as Error).message}. ${this.confinementHint()}`,
      );
    }
    if (exited) {
      const e = exited as { code: number | null; signal: string | null };
      throw new RunnerError(
        "RUN_FAILED",
        `It stopped by itself right after starting (${e.signal ? `signal ${e.signal}` : `exit code ${e.code}`}). Its latest output:\n${tail || "(none)"}`,
      );
    }
    throw new RunnerError(
      "RUN_FAILED",
      `It did not start answering on port ${port} within ${config.runner.start_timeout_seconds} seconds. Its latest output:\n${tail || "(none)"}`,
    );
  }

  private async reachableFromOutside(port: number): Promise<string | null> {
    for (const address of outsideAddresses()) {
      if (await canConnect(address, port, 300)) return `${address}:${port}`;
    }
    return null;
  }

  private onExit(
    live: Live,
    child: ChildProcess,
    code: number | null,
    signal: string | null,
  ): void {
    if (live.child !== child) return;
    live.child = null;
    if (live.stopping || this.closed || live.phase === "first-start") return;
    if (live.phase === "restarting") {
      // Wait for its last words: a port in use is the next port's turn, not a crash.
      setTimeout(() => {
        if (live.stopping || this.closed || live.portCollision) return;
        this.crashed(live, code, signal);
      }, 150);
      return;
    }
    this.crashed(live, code, signal);
  }

  /** The software stopped by itself: start it again, or give up after the limit. */
  private crashed(live: Live, code: number | null, signal: string | null): void {
    const { config, db } = this.deps;
    recordEvent(db, {
      softwareId: live.softwareId,
      module: "runner",
      kind: "crashed",
      detail: { run: live.runId, code, signal },
    });
    const windowStart = Date.now() - config.runner.restart_window_minutes * 60_000;
    live.restartTimes = live.restartTimes.filter((t) => t > windowStart);
    if (live.restartTimes.length >= config.runner.restart_limit) {
      this.live.delete(live.softwareId);
      const tail = live.lines.slice(-10).join("\n");
      const failure = `It stopped by itself ${live.restartTimes.length + 1} times within ${config.runner.restart_window_minutes} minutes, so premise stopped starting it again. Press Start to try again once the cause is fixed. Its latest output:\n${tail || "(none)"}`;
      this.update(live.runId, { status: "crashed", failure, exit_code: code, ended: now() });
      recordEvent(db, {
        softwareId: live.softwareId,
        module: "runner",
        kind: "gave-up",
        detail: { run: live.runId },
      });
      this.deps.onGaveUp?.(live.softwareId, `It keeps crashing: ${failure}`);
      return;
    }
    live.restartTimes.push(Date.now());
    live.phase = "restarting";
    this.update(live.runId, { status: "starting", exit_code: code });
    live.timer = setTimeout(
      () => void this.restart(live),
      config.runner.restart_delay_seconds * 1000,
    );
  }

  private async restart(live: Live): Promise<void> {
    live.timer = null;
    if (live.stopping || this.closed) return;
    const { db } = this.deps;
    try {
      await this.launchOnFreePort(live);
      live.phase = "up";
      const row = this.latestRow(live.softwareId)!;
      this.update(live.runId, {
        status: "running",
        restarts: row.restarts + 1,
        port: live.port,
        link: `http://127.0.0.1:${live.port}${live.instructions.open}`,
      });
      recordEvent(db, {
        softwareId: live.softwareId,
        module: "runner",
        kind: "restarted",
        detail: { run: live.runId },
      });
    } catch (error) {
      if (live.stopping || this.closed) return;
      if (error instanceof PortRangeError) {
        this.live.delete(live.softwareId);
        this.update(live.runId, { status: "failed", failure: error.message, ended: now() });
        recordEvent(db, {
          softwareId: live.softwareId,
          module: "runner",
          kind: "failed",
          detail: { run: live.runId },
        });
        return;
      }
      const child = live.child;
      if (!child) return; // it exited by itself, and that was already counted as a crash
      if (child.pid === undefined) {
        live.child = null;
        this.crashed(live, null, null);
      } else {
        this.killTree(live); // alive but not answering: its exit is counted as a crash
      }
    }
  }

  // ---- Stopping -----------------------------------------------------------------------------

  private killTree(live: Live, signal: NodeJS.Signals = "SIGTERM"): void {
    const pid = live.child?.pid;
    if (pid === undefined) return;
    try {
      process.kill(-pid, signal);
    } catch {
      // already gone
    }
  }

  /** Stop a software's run, if it has one up. Always succeeds. */
  async stop(softwareId: string): Promise<RunView> {
    const live = this.live.get(softwareId);
    if (live) {
      live.stopping = true;
      if (live.timer) clearTimeout(live.timer);
      const child = live.child;
      if (child && child.exitCode === null && child.signalCode === null) {
        const ended = new Promise<void>((resolve) => child.once("exit", () => resolve()));
        this.killTree(live, "SIGTERM");
        const grace = this.deps.config.runner.stop_grace_seconds * 1000;
        const timeout = sleep(grace).then(() => "late" as const);
        if ((await Promise.race([ended.then(() => "ok" as const), timeout])) === "late") {
          this.killTree(live, "SIGKILL");
          await ended;
        }
      }
      this.live.delete(softwareId);
      this.update(live.runId, { status: "stopped", ended: now() });
      recordEvent(this.deps.db, {
        softwareId,
        module: "runner",
        kind: "stopped",
        detail: { run: live.runId },
      });
    }
    return this.view(softwareId);
  }

  /** premise is stopping: take every running software down with it. */
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.live.keys()].map((id) => this.stop(id)));
  }

  // ---- The queue's handler ------------------------------------------------------------------

  /**
   * The handler for jobs of kind "run" (the line engine calls it from the queue's server jobs):
   * the job's payload may name the commit to start. It ends done once the software is up.
   */
  async handleRunJob(job: Job): Promise<AgentOutcome> {
    const commit = typeof job.payload.commit === "string" ? job.payload.commit : undefined;
    try {
      const view = await this.start(job.softwareId, commit);
      const how =
        view.state === "running"
          ? `Running; open ${view.link}.`
          : view.state === "finished"
            ? "The command ran on a sample; its output is on the page."
            : "Built; how to start it is on the page.";
      return { kind: "done", summary: how };
    } catch (error) {
      const message = (error as Error).message;
      return { kind: "failed", summary: message, failureSignature: `run:${message.slice(0, 120)}` };
    }
  }
}
