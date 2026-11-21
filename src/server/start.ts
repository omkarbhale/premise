import { join } from "node:path";
import { ClaudeAgentRunner, PrerequisiteMissingError } from "../agents/claude-agent.js";
import { SwitchableRunner } from "../agents/switchable-runner.js";
import { ScriptedAgentRunner, loadScriptFile } from "../agents/scripted-agent.js";
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
import type { WorkQueue } from "../queue/work-queue.js";
import { RecordKeeper } from "../record/record-keeper.js";
import { type Database, openDatabase, recordEvent } from "../storage/database.js";
import { createUsageLedger } from "../usage-ledger/mock-usage-ledger.js";
import { createApp } from "./app.js";
import { issueSessionToken } from "./session-token.js";
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
export function scriptedRunner(config: PremiseConfig): ScriptedAgentRunner {
  const file = config.agents.scripted.script_file;
  const runner = new ScriptedAgentRunner(
    file ? loadScriptFile(file) : standInScript(config.agents.scripted.step_seconds),
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
): Promise<SwitchableRunner> {
  if (config.agents.mode === "scripted") {
    const scripted = scriptedRunner(config);
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
    return sessionLink(config.server.port, issueSessionToken(db, config.server.token_bytes));
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
}

/** Start premise: check the machine, open the database, resume the queue, serve the page. */
export interface Running {
  link: string;
  close: () => Promise<void>;
  /** What the page uses, for a scripted operator driving premise in this process. */
  services: SessionServices;
  db: Database;
  config: PremiseConfig;
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
  const ledger = createUsageLedger(config.usage_ledger);
  const { db, schemaVersion, backup } = openDatabase(config.data.folder);
  if (backup) print(`Updated premise's database; the copy from before is ${backup}.`);

  const made: { queue: WorkQueue | null } = { queue: null };
  const tools = new AgentToolServer({
    db,
    config,
    isPaused: () => made.queue?.state().paused ?? false,
  });
  let runner: SwitchableRunner;
  try {
    runner = await createRunner(config, tools, options.env, setup);
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
  runs.recoverStale();
  made.queue = queue;
  gate.recoverInterrupted();
  const recovered = queue.recover();
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
  const token = issueSessionToken(db, config.server.token_bytes);
  recordEvent(db, { module: "page-server", kind: "started", detail: { port: config.server.port } });
  const address = app.server.address();
  const port = address && typeof address === "object" ? address.port : config.server.port;
  const link = sessionLink(port, token);

  const warnings = setup.checks.filter((c) => c.status !== "ok");
  print("premise is running.");
  print("");
  print(`  Open this link: ${link}`);
  print("");
  print(
    `  Agents:        ${config.agents.mode === "scripted" ? "scripted (no AI is called)" : runner.ready() ? "real Claude Code sessions on your login, confined by its sandbox" : `NOT READY. ${runner.unavailable} The page says how to fix it.`}`,
  );
  print(
    `  Usage figures: ${ledger.mocked ? `mocked (${ledger.mode}); not real usage` : ledger.mode}`,
  );
  print(`  Data folder:   ${config.data.folder}`);
  if (warnings.length > 0) {
    print(
      `  Setup notes:   ${warnings.map((w) => w.name).join(", ")} (run \`npm run doctor\` for details)`,
    );
  }
  print("");
  print("The link holds a private token: anyone with it on this machine can use premise.");
  print("Lost it? Run `npm run new-link` in another terminal. Press Ctrl+C to stop premise.");

  return {
    link,
    services,
    db,
    config,
    close: async () => {
      intake.close();
      learning.close();
      usage.close();
      await app.close();
      await runs.close();
      await queue.close();
      db.close();
    },
  };
}
