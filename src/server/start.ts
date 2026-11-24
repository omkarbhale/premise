import { join } from "node:path";
import { ClaudeAgentRunner, PrerequisiteMissingError } from "../agents/claude-agent.js";
import { allowedHosts } from "../gate/gate.js";
import { providedToolPaths } from "../runner/provided-tools.js";
import { SwitchableRunner } from "../agents/switchable-runner.js";
import { type AgentScript, ScriptedAgentRunner, loadScriptFile } from "../agents/scripted-agent.js";
import { AgentToolServer } from "../agents/tool-server.js";
import { loadConfig } from "../config/load.js";
import type { PremiseConfig } from "../config/settings.js";
import {
  type CommandRunner,
  type DoctorReport,
  formatDoctorReport,
  runDoctor,
} from "../doctor/doctor.js";
import { standInScript } from "../demo/stand-in-script.js";
import type { Job, WorkQueue } from "../queue/work-queue.js";
import { RecordKeeper } from "../record/record-keeper.js";
import { type Database, openDatabase, recordEvent } from "../storage/database.js";
import { createUsageLedger } from "../usage-ledger/create.js";
import { ledgerStore } from "../storage/ledger-sessions.js";
import { createApp } from "./app.js";
import { type PauseStatus } from "../queue/work-queue.js";
import { SuspendWatch } from "../queue/suspend-watch.js";
import type { SleepView, StartupView } from "../shared/api-types.js";
import { comingBackLines, findRunning, removeRunningFile, writeRunningFile } from "./lifecycle.js";
import { issueLinkToken, startupToken } from "./session-token.js";
import { docsFolder, packageRoot } from "./package-root.js";
import type { SessionServices } from "./services.js";
import { createSession } from "./wiring.js";

/** Where the built page is: dist/web, next to dist/server. */
export function defaultWebRoot(): string {
  return join(packageRoot(), "dist", "web");
}

/** Where agents reach premise's tools. */
export function toolsUrl(config: PremiseConfig): string {
  const host = config.server.host === "::1" ? "[::1]" : config.server.host;
  return `http://${host}:${config.server.port}/mcp`;
}

/** The scripted agent: for tests and demos, and the look-around when real agents cannot start. */
export function scriptedRunner(config: PremiseConfig, script?: AgentScript): ScriptedAgentRunner {
  const file = config.agents.scripted.script_file;
  const runner = new ScriptedAgentRunner(
    script ?? (file ? loadScriptFile(file) : standInScript(config.agents.scripted.step_seconds)),
  );
  runner.useWorkingCopies(config.data.folder, config.data.keep_finished_working_copies);
  return runner;
}

/**
 * Real agents when agents.mode is "claude" and they can start; otherwise none, with the reason, so
 * premise still starts and the page says what is missing (decision 0180).
 */
async function createRunner(
  config: PremiseConfig,
  tools: AgentToolServer,
  env: NodeJS.ProcessEnv,
  setup: DoctorReport,
  extraHosts?: (softwareId: string) => string[],
  extraToolPaths?: (softwareId: string) => string[],
  script?: AgentScript,
): Promise<SwitchableRunner> {
  if (config.agents.mode === "scripted") {
    const scripted = scriptedRunner(config, script);
    scripted.useTools(tools);
    return new SwitchableRunner(scripted);
  }
  if (!setup.canRunRealAgents) {
    const missing = setup.checks
      .filter((c) => c.status === "missing")
      .map((c) => c.name)
      .join(", ");
    return new SwitchableRunner(
      null,
      `Real agents cannot start on this machine: ${missing || "something they need"} is missing.`,
    );
  }
  try {
    return new SwitchableRunner(
      await ClaudeAgentRunner.create({
        config,
        tools,
        toolsUrl: toolsUrl(config),
        docsFolder: docsFolder(),
        env,
        ...(extraHosts && { extraHosts }),
        ...(extraToolPaths && { extraToolPaths }),
      }),
    );
  } catch (error) {
    if (error instanceof PrerequisiteMissingError) {
      return new SwitchableRunner(null, error.message);
    }
    throw error;
  }
}

/** The session's link: the token rides in the part after #, which browsers never send anywhere. */
export function sessionLink(port: number, token: string): string {
  return `http://localhost:${port}/#token=${token}`;
}

/**
 * "New link" (docs/specs/page-server.md 3.1): a new token for the session; every older link stops
 * working at once, including in pages already open. Works while premise is running.
 */
export function newLink(options: { dataFolder: string; env: NodeJS.ProcessEnv }): string {
  const config = loadConfig({ dataFolder: options.dataFolder, env: options.env });
  const { db } = openDatabase(config.data.folder);
  try {
    return sessionLink(
      config.server.port,
      issueLinkToken(db, {
        bytes: config.server.token_bytes,
        keep: config.server.keep_link,
        dataFolder: config.data.folder,
      }),
    );
  } finally {
    db.close();
  }
}

export interface StartOptions {
  dataFolder: string;
  env: NodeJS.ProcessEnv;
  webRoot?: string;
  print?: (line: string) => void;
  /** For tests: how the setup check runs programs. */
  run?: CommandRunner;
  /** For tests: a script written in code for the scripted agent (agents.mode "scripted"). */
  script?: AgentScript;
}

/** Start premise: check the machine, open the database, resume the queue, serve the page. */
export interface Running {
  link: string;
  close: () => Promise<void>;
  /** What the page uses, for a scripted operator driving premise in this process. */
  services: SessionServices;
  db: Database;
  config: PremiseConfig;
  /** What the last start picked up, as the page says it (null on a first start). */
  startup: StartupView | null;
  /** Nothing new starts from now on (a clean stop has begun). */
  beginStopping(): void;
  /** Jobs still running, sessions and the server's own. */
  stillRunning(): Job[];
  /** Resolves once no job is running. */
  whenIdle(): Promise<void>;
  /** The queue's pause, for a caller that wants to say it. */
  pauseStatus(): PauseStatus;
  /** Names of the built softwares premise is running; they stop with premise. */
  runningSoftwareNames(): string[];
  /** What to say after closing: how to get back, the link, paused or not. */
  goodbye(): string[];
  /** Look at the sessions as if the computer had just woken (a test, or a clock that jumped). */
  checkAfterSleep(asleepMs: number): SleepView | null;
}

const SETTING_STOPPED_SOFTWARES = "runner.running_at_stop";
const SETTING_CUT_OFF = "queue.cut_off_at_stop";

function remember(db: Database, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value, changed) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, changed = excluded.changed`,
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export async function start(options: StartOptions): Promise<Running> {
  const print = options.print ?? ((line: string) => console.log(line));
  const setup = await runDoctor({
    dataFolder: options.dataFolder,
    env: options.env,
    ...(options.run && { run: options.run }),
  });
  if (!setup.canStart || !setup.config) {
    throw new Error(formatDoctorReport(setup));
  }
  const config = setup.config;
  const { db, schemaVersion, backup } = openDatabase(config.data.folder);
  const ledger = createUsageLedger(config, { store: ledgerStore(db), env: options.env });
  if (backup) print(`Updated premise's database; the copy from before is ${backup}.`);

  const made: { queue: WorkQueue | null } = { queue: null };
  const tools = new AgentToolServer({
    db,
    config,
    isPaused: () => made.queue?.state().paused ?? false,
  });
  let runner: SwitchableRunner;
  try {
    runner = await createRunner(
      config,
      tools,
      options.env,
      setup,
      (id) => allowedHosts(db, id),
      (id) => providedToolPaths(db, config, id),
      options.script,
    );
  } catch (error) {
    db.close();
    throw error;
  }
  const record = new RecordKeeper({ db, config });
  const {
    queue,
    services,
    agents,
    gate,
    runner: runs,
    intake,
    line,
    measures,
    learning,
    usage,
    feedback,
    pausing,
  } = createSession({
    db,
    config,
    ledger,
    runner,
    tools,
    record,
    agents: {
      ready: () => runner.ready(),
      unavailable: () => (runner.scriptedDemo ? null : runner.unavailable),
      scriptedDemo: () => runner.scriptedDemo,
      useScriptedDemo: () => {
        const demo = scriptedRunner(config);
        demo.useTools(tools);
        runner.useScriptedDemo(demo);
        made.queue?.tick();
      },
    },
  });
  const previous = await findRunning(config.data.folder);
  if (previous) {
    db.close();
    throw new Error(
      `premise is already running on this data folder (process ${previous.pid}, port ${previous.port}). Open its link, or run \`npm run stop\` to stop it first.`,
    );
  }
  // Built softwares that were up when premise last stopped: a clean stop wrote them down, a crash
  // left their runs marked as up. Either way they are not up now, and the page offers them again.
  const stoppedSoftwares = stoppedBuiltSoftwares(db);
  const cutOffAtStop = takeCutOffAtStop(db);
  runs.recoverStale();
  made.queue = queue;
  gate.recoverInterrupted();
  const recovered = queue.recover();
  const replanned = line.replanChanges();
  if (replanned > 0)
    print(
      `Planning ${replanned} change(s) again on their own, not with the software's milestones.`,
    );
  const before = queue.state();
  const state = queue.applyStartPolicy(config.queue.start_paused);
  const copies = line.resumeTakeOns();
  if (copies > 0)
    print(`Copying ${copies} existing software(s) again: premise stopped while copying.`);
  if (recovered.length > 0) {
    print(`Resumed ${recovered.length} job(s) that were cut off when premise last stopped.`);
  }

  const app = await createApp({
    config,
    db,
    schemaVersion,
    services,
    agents,
    ledger,
    record,
    setup,
    tools,
    measures,
    learning,
    usage,
    feedback,
    pausing,
    webRoot: options.webRoot ?? defaultWebRoot(),
  });
  try {
    await app.listen({ host: config.server.host, port: config.server.port });
  } catch (error) {
    await queue.close();
    db.close();
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new Error(
        `Port ${config.server.port} is already in use, perhaps by another premise. Start with --port <number>, or set server.port.`,
      );
    }
    throw error;
  }
  // Tell usage-ledger each software's budget and look for any already overrun, before work starts.
  await usage.start();
  queue.tick();
  intake.start();
  learning.start();
  const { token, kept } = startupToken(db, {
    bytes: config.server.token_bytes,
    keep: config.server.keep_link,
    dataFolder: config.data.folder,
  });
  recordEvent(db, { module: "page-server", kind: "started", detail: { port: config.server.port } });
  const address = app.server.address();
  const port = address && typeof address === "object" ? address.port : config.server.port;
  const link = sessionLink(port, token);
  writeRunningFile(config.data.folder, {
    pid: process.pid,
    host: config.server.host,
    port,
    startedAt: new Date().toISOString(),
  });
  const cutOff = new Set([
    ...recovered.map((j) => j.id),
    ...cutOffAtStop.filter((id) => {
      const status = queue.get(id)?.status;
      return status === "queued" || status === "running";
    }),
  ]);
  const startup = startupSummary({
    db,
    recovered: cutOff.size,
    state,
    before,
    stoppedSoftwares,
    startedAt: new Date().toISOString(),
  });
  pausing.setStartup(startup);

  const warnings = setup.checks.filter((c) => c.status !== "ok");
  print("premise is running.");
  print("");
  print(`  Open this link: ${link}`);
  print("");
  print(
    `  Agents:        ${config.agents.mode === "scripted" ? "scripted (no AI is called)" : runner.ready() ? "real Claude Code sessions on your login, confined by its sandbox" : `NOT READY. ${runner.unavailable} The page says how to fix it.`}`,
  );
  print(
    `  Usage figures: ${ledger.source === "demo" ? "made-up demo figures (scripted agents use nothing)" : `from usage-ledger ("${config.usage_ledger.command}")`}`,
  );
  print(`  Data folder:   ${config.data.folder}`);
  if (warnings.length > 0) {
    print(
      `  Setup notes:   ${warnings.map((w) => w.name).join(", ")} (run \`npm run doctor\` for details)`,
    );
  }
  if (startup) {
    print("");
    print(`  ${startup.line}`);
  }
  print("");
  if (config.server.keep_link) {
    print(
      kept
        ? "This is the same link as last time (server.keep_link is on). Anyone with it on this machine can use premise."
        : "The link holds a private token: anyone with it on this machine can use premise. It is kept for next time (server.keep_link is on).",
    );
  } else {
    print("The link holds a private token: anyone with it on this machine can use premise.");
    print("premise makes a new link each time it starts; the older ones stop working.");
  }
  print(
    "Lost the link? Run `npm run new-link` in another terminal. Pause or stop premise with the buttons on the page, or Ctrl+C here.",
  );
  print(
    "Ctrl+C once lets running work finish, then stops; Ctrl+C twice stops now. From another terminal: `npm run stop`.",
  );

  const names = (ids: string[]) =>
    ids.map(
      (id) =>
        (
          db.prepare("SELECT name FROM softwares WHERE id = ?").get(id) as
            { name: string } | undefined
        )?.name ?? "a removed software",
    );
  const sleepWatch = new SuspendWatch({
    gapMs: config.queue.suspend_gap_seconds * 1000,
    onSuspend: (asleepMs) => {
      const sleep = checkAfterSleep(asleepMs);
      if (sleep) print(sleep.line);
    },
  });
  const checkAfterSleep = (asleepMs: number): SleepView | null => {
    const result = queue.checkAfterSuspend(asleepMs);
    if (result.checked === 0) return null;
    const minutes = Math.max(1, Math.round(asleepMs / 60_000));
    const line =
      result.restarted.length === 0
        ? `The computer was asleep for about ${minutes} minute(s). The ${result.checked} agent session(s) that were running were checked and are all still there.`
        : `The computer was asleep for about ${minutes} minute(s). Of the ${result.checked} agent session(s) that were running, ${result.restarted.length} had died; they were started again from where they left off.`;
    const sleep: SleepView = {
      noticedAt: new Date().toISOString(),
      asleepMinutes: minutes,
      checked: result.checked,
      restarted: result.restarted.length,
      line,
    };
    pausing.setSleep(sleep);
    queue.tick();
    return sleep;
  };
  sleepWatch.start();

  let closed = false;
  /** Whether everything was paused when premise closed; read after the database is gone. */
  let pausedAtClose = false;
  const pausedForNextStart = () => {
    const state = queue.state();
    return state.paused && state.cause !== "usage-limit";
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    pausedAtClose = pausedForNextStart();
    sleepWatch.stop();
    // Write down which built softwares were up, so the next start can offer them again.
    remember(db, SETTING_STOPPED_SOFTWARES, runs.runningSoftwares());
    // ...and which jobs were cut off by stopping, so the next start can say so.
    remember(
      db,
      SETTING_CUT_OFF,
      queue.runningJobs().map((j) => j.id),
    );
    intake.close();
    learning.close();
    usage.close();
    await app.close();
    await runs.close();
    await queue.close();
    removeRunningFile(config.data.folder);
    db.close();
  };

  return {
    link,
    services,
    db,
    config,
    startup,
    beginStopping: () => queue.beginStopping(),
    stillRunning: () => queue.runningJobs(),
    whenIdle: () => queue.idle(),
    pauseStatus: () => queue.pauseStatus(),
    runningSoftwareNames: () => names(runs.runningSoftwares()),
    goodbye: () =>
      comingBackLines({
        keepLink: config.server.keep_link,
        pausedOnStart: closed ? pausedAtClose : pausedForNextStart(),
      }),
    checkAfterSleep,
    close,
  };
}

/** The jobs a clean stop cut off, written at the last stop; read once. */
function takeCutOffAtStop(db: Database): number[] {
  const note = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTING_CUT_OFF) as
    { value: string } | undefined;
  if (!note) return [];
  db.prepare("DELETE FROM settings WHERE key = ?").run(SETTING_CUT_OFF);
  try {
    return (JSON.parse(note.value) as unknown[]).filter((x): x is number => typeof x === "number");
  } catch {
    return [];
  }
}

/** Built softwares that were up when premise last stopped, from the clean stop's note or the runs left marked as up. */
function stoppedBuiltSoftwares(db: Database): { softwareId: string; name: string }[] {
  const ids = new Set<string>();
  const note = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(SETTING_STOPPED_SOFTWARES) as { value: string } | undefined;
  if (note) {
    try {
      for (const id of JSON.parse(note.value) as string[]) ids.add(id);
    } catch {
      // an unreadable note says nothing
    }
    db.prepare("DELETE FROM settings WHERE key = ?").run(SETTING_STOPPED_SOFTWARES);
  }
  for (const row of db
    .prepare("SELECT DISTINCT software_id FROM runs WHERE status IN ('starting', 'running')")
    .all() as { software_id: string }[]) {
    ids.add(row.software_id);
  }
  const found: { softwareId: string; name: string }[] = [];
  for (const id of ids) {
    const row = db
      .prepare("SELECT name FROM softwares WHERE id = ? AND archived_at IS NULL")
      .get(id) as { name: string } | undefined;
    if (row) found.push({ softwareId: id, name: row.name });
  }
  return found;
}

/**
 * The one line a start says about what it picked up: what was cut off and restarted, what is
 * waiting on the person, what is paused, and what stopped with premise. Null when there is nothing
 * to say (a first start).
 */
export function startupSummary(options: {
  db: Database;
  recovered: number;
  state: ReturnType<WorkQueue["state"]>;
  before: ReturnType<WorkQueue["state"]>;
  stoppedSoftwares: { softwareId: string; name: string }[];
  startedAt: string;
}): StartupView | null {
  const { db, recovered, state, before, stoppedSoftwares } = options;
  const waitingOnYou = (
    db.prepare("SELECT COUNT(*) AS n FROM asks WHERE status = 'open'").get() as { n: number }
  ).n;
  const parts: string[] = [];
  const s = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (recovered > 0) {
    parts.push(
      `${s(recovered, "job")} that ${recovered === 1 ? "was" : "were"} running when premise stopped ${recovered === 1 ? "was" : "were"} cut off and put back to start again`,
    );
  }
  if (waitingOnYou > 0) {
    parts.push(`${waitingOnYou} ${waitingOnYou === 1 ? "thing is" : "things are"} waiting on you`);
  }
  if (state.paused) {
    if (state.cause === "usage-limit") {
      parts.push("agent work is paused until the subscription's usage limit resets");
    } else if (state.cause === "setting" && !before.paused) {
      parts.push(
        "everything is paused, because the queue.start_paused setting is on (press Resume to start work)",
      );
    } else {
      parts.push("everything is paused, as you left it (press Resume to carry on)");
    }
  }
  if (stoppedSoftwares.length > 0) {
    parts.push(
      `${stoppedSoftwares.map((x) => x.name).join(", ")} ${stoppedSoftwares.length === 1 ? "was" : "were"} running and stopped with premise; start ${stoppedSoftwares.length === 1 ? "it" : "them"} again from ${stoppedSoftwares.length === 1 ? "its" : "their"} Run tab`,
    );
  }
  if (parts.length === 0) return null;
  return {
    line: `Picked up where premise stopped: ${parts.join("; ")}.`,
    startedAt: options.startedAt,
    cutOff: recovered,
    waitingOnYou,
    paused: state.paused,
    stoppedSoftwares,
  };
}
