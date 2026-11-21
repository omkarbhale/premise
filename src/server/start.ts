import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRunner } from "../agents/agent-runner.js";
import { ClaudeAgentRunner } from "../agents/claude-agent.js";
import { ScriptedAgentRunner, loadScriptFile } from "../agents/scripted-agent.js";
import { AgentToolServer } from "../agents/tool-server.js";
import { loadConfig } from "../config/load.js";
import type { PremiseConfig } from "../config/settings.js";
import { type CommandRunner, formatDoctorReport, runDoctor } from "../doctor/doctor.js";
import { standInScript } from "../demo/stand-in-script.js";
import type { WorkQueue } from "../queue/work-queue.js";
import { RecordKeeper } from "../record/record-keeper.js";
import { openDatabase, recordEvent } from "../storage/database.js";
import { createUsageLedger } from "../usage-ledger/mock-usage-ledger.js";
import { createApp } from "./app.js";
import { issueSessionToken } from "./session-token.js";
import { createSession } from "./wiring.js";

/** Where the built page is: dist/web, next to dist/server. */
export function defaultWebRoot(): string {
  return join(packageRoot(), "dist", "web");
}

/** premise's own folder: the one holding its package.json. */
function packageRoot(): string {
  let folder = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(folder, "package.json"))) {
    const parent = dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return folder;
}

/** Where agents reach premise's tools. */
export function toolsUrl(config: PremiseConfig): string {
  const host = config.server.host === "::1" ? "[::1]" : config.server.host;
  return `http://${host}:${config.server.port}/mcp`;
}

async function createRunner(
  config: PremiseConfig,
  tools: AgentToolServer,
  env: NodeJS.ProcessEnv,
): Promise<AgentRunner> {
  if (config.agents.mode === "claude") {
    return ClaudeAgentRunner.create({
      config,
      tools,
      toolsUrl: toolsUrl(config),
      docsFolder: join(packageRoot(), "docs"),
      env,
    });
  }
  const file = config.agents.scripted.script_file;
  return new ScriptedAgentRunner(
    file ? loadScriptFile(file) : standInScript(config.agents.scripted.step_seconds),
  );
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
export async function start(
  options: StartOptions,
): Promise<{ close: () => Promise<void>; link: string }> {
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
  if (config.agents.mode === "claude" && !setup.canRunRealAgents) {
    throw new Error(
      `${formatDoctorReport(setup)}\n\npremise does not start real agents without Claude Code, bubblewrap and socat, because it never runs agents unconfined (decisions 0125, 0142). Install what is MISSING above, or set agents.mode to "scripted" to try premise without real agents.`,
    );
  }
  const ledger = createUsageLedger(config.usage_ledger);
  const { db, schemaVersion, backup } = openDatabase(config.data.folder);
  if (backup) print(`Updated premise's database; the copy from before is ${backup}.`);

  const made: { queue: WorkQueue | null } = { queue: null };
  const tools = new AgentToolServer({
    db,
    config,
    isPaused: () => made.queue?.state().paused ?? false,
  });
  let runner: AgentRunner;
  try {
    runner = await createRunner(config, tools, options.env);
  } catch (error) {
    db.close();
    throw error;
  }
  const { queue, services, runner: runs } = createSession({ db, config, ledger, runner });
  runs.recoverStale();
  made.queue = queue;
  const recovered = queue.recover();
  if (recovered.length > 0) {
    print(`Resumed ${recovered.length} job(s) that were cut off when premise last stopped.`);
  }

  const app = await createApp({
    config,
    db,
    schemaVersion,
    services,
    ledger,
    record: new RecordKeeper({ db, config }),
    setup,
    tools,
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
  queue.tick();
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
    `  Agents:        ${config.agents.mode === "scripted" ? "scripted (no AI is called)" : "real Claude Code sessions on your login, confined by its sandbox"}`,
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
    close: async () => {
      await app.close();
      await runs.close();
      await queue.close();
      db.close();
    },
  };
}
