import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConfigError, loadConfig } from "../config/load.js";
import type { PremiseConfig } from "../config/settings.js";

/**
 * The setup check (`premise doctor`, and at every start): what premise needs on this machine,
 * each with what to do if it is missing (decisions 0135, 0142).
 */

export type CheckStatus = "ok" | "warn" | "missing";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do, when it is not ok. */
  fix?: string;
}

export interface DoctorReport {
  checks: CheckResult[];
  config: PremiseConfig | null;
  /** premise can start: nothing it needs now is missing. */
  canStart: boolean;
  /** Real agents can start: also Claude Code and confinement are here. */
  canRunRealAgents: boolean;
}

export type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<{ ok: boolean; output: string }>;

export const runCommand: CommandRunner = (command, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}${stderr}`.trim() });
    });
  });

export interface DoctorOptions {
  dataFolder: string;
  env: NodeJS.ProcessEnv;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  run?: CommandRunner;
}

export const MIN_NODE = [22, 13] as const;

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}

function nodeIsNewEnough(version: string): boolean {
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

const API_KEY_VARIABLES = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const run = options.run ?? runCommand;
  const platform = options.platform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.version;
  const checks: CheckResult[] = [];

  // Settings first: they say whether real agents are wanted.
  let config: PremiseConfig | null = null;
  let configProblem: string | null = null;
  try {
    config = loadConfig({ dataFolder: options.dataFolder, env: options.env });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    configProblem = error.problems.map((p) => `${p.key} (${p.source}): ${p.message}`).join("; ");
  }
  const wantsRealAgents = config?.agents.mode === "claude";
  const timeoutMs = (config?.doctor.command_timeout_seconds ?? 10) * 1000;

  checks.push(
    nodeIsNewEnough(nodeVersion)
      ? { name: "Node.js", status: "ok", detail: nodeVersion }
      : {
          name: "Node.js",
          status: "missing",
          detail: `${nodeVersion} is too old`,
          fix: `Install Node.js ${MIN_NODE.join(".")} or later (the current LTS) from https://nodejs.org.`,
        },
  );

  const git = await run("git", ["--version"], timeoutMs);
  checks.push(
    git.ok
      ? { name: "git", status: "ok", detail: firstLine(git.output) }
      : {
          name: "git",
          status: "missing",
          detail: "not found",
          fix: "Install git from https://git-scm.com.",
        },
  );

  const claude = await run("claude", ["--version"], timeoutMs);
  checks.push(
    claude.ok
      ? { name: "Claude Code", status: "ok", detail: firstLine(claude.output) }
      : {
          name: "Claude Code",
          status: wantsRealAgents ? "missing" : "warn",
          detail: wantsRealAgents ? "not found" : "not found; not needed while agents are scripted",
          fix: "Install Claude Code (https://claude.com/claude-code), then run `claude` once to log in.",
        },
  );

  const gh = await run("gh", ["--version"], timeoutMs);
  checks.push(
    gh.ok
      ? { name: "GitHub CLI", status: "ok", detail: firstLine(gh.output) }
      : {
          name: "GitHub CLI",
          status: "warn",
          detail: "not found; needed later, when premise creates repositories",
          fix: "Install the GitHub CLI (https://cli.github.com), then run `gh auth login`.",
        },
  );

  if (platform === "linux") {
    const tools: [string, string, string[], string][] = [
      ["bubblewrap", "bwrap", ["--version"], "bubblewrap"],
      ["socat", "socat", ["-V"], "socat"],
    ];
    for (const [name, command, args, pkg] of tools) {
      const result = await run(command, args, timeoutMs);
      checks.push(
        result.ok
          ? { name, status: "ok", detail: firstLine(result.output) || "found" }
          : {
              name,
              status: wantsRealAgents ? "missing" : "warn",
              detail: wantsRealAgents
                ? "not found; real agents cannot run confined without it"
                : "not found; needed only for real agents",
              fix: `Install it with your package manager, for example \`sudo apt install ${pkg}\`.`,
            },
      );
    }
  } else {
    checks.push({
      name: "Sandbox tools",
      status: "ok",
      detail: `not needed on ${platform}`,
    });
  }

  const keys = API_KEY_VARIABLES.filter((name) => options.env[name]);
  checks.push(
    keys.length === 0
      ? { name: "API key", status: "ok", detail: "none set; premise uses no API key" }
      : {
          name: "API key",
          status: "warn",
          detail: `${keys.join(", ")} is set; premise uses no API key and keeps it from agents`,
          fix: `Unset ${keys.join(" and ")} if you did not mean premise to see it.`,
        },
  );

  // The check never creates the folder: it says whether it exists, and whether premise could
  // create it (or write to it) when it starts.
  try {
    if (existsSync(options.dataFolder)) {
      accessSync(options.dataFolder, constants.W_OK);
      checks.push({
        name: "Data folder",
        status: "ok",
        detail: `${options.dataFolder} (exists, and can be written to)`,
      });
    } else {
      let parent = dirname(resolve(options.dataFolder));
      while (!existsSync(parent) && dirname(parent) !== parent) parent = dirname(parent);
      accessSync(parent, constants.W_OK);
      checks.push({
        name: "Data folder",
        status: "ok",
        detail: `${options.dataFolder} (does not exist yet; this check did not create it, premise creates it when it starts)`,
      });
    }
  } catch (error) {
    checks.push({
      name: "Data folder",
      status: "missing",
      detail: `${options.dataFolder} cannot be written (${(error as Error).message})`,
      fix: "Choose another folder with --data <folder> or PREMISE_DATA_FOLDER.",
    });
  }

  checks.push(
    config
      ? {
          name: "Settings",
          status: "ok",
          detail: `valid; agents are ${config.agents.mode}, usage figures are ${config.usage_ledger.mode}`,
        }
      : {
          name: "Settings",
          status: "missing",
          detail: configProblem ?? "invalid",
          fix: "Fix the setting named above; every setting is in docs/reference/configuration.md.",
        },
  );

  const needsNow = new Set(["Node.js", "git", "Data folder", "Settings"]);
  const canStart = checks.every((c) => !(needsNow.has(c.name) && c.status === "missing"));
  const realAgentNeeds = new Set(["Claude Code", "bubblewrap", "socat"]);
  const canRunRealAgents =
    canStart && checks.every((c) => !realAgentNeeds.has(c.name) || c.status === "ok");
  return {
    checks,
    config,
    canStart,
    canRunRealAgents,
  };
}

const MARK: Record<CheckStatus, string> = { ok: "ok  ", warn: "note", missing: "MISSING" };

/** The report as plain text for the terminal. */
export function formatDoctorReport(report: DoctorReport): string {
  const width = Math.max(...report.checks.map((c) => c.name.length));
  const lines = ["premise setup check", ""];
  for (const check of report.checks) {
    lines.push(`  ${MARK[check.status].padEnd(7)} ${check.name.padEnd(width)}  ${check.detail}`);
    if (check.fix && check.status !== "ok")
      lines.push(`  ${"".padEnd(7)} ${"".padEnd(width)}  -> ${check.fix}`);
  }
  lines.push("");
  if (!report.canStart) {
    lines.push("premise cannot start until what is MISSING above is fixed.");
  } else if (report.config?.agents.mode === "claude" && !report.canRunRealAgents) {
    lines.push(
      "premise starts, but its agents wait until what is MISSING above is fixed: it never runs real agents unconfined. Once it is fixed, restart premise. Meanwhile the page offers a look around with scripted agents, which call no AI and do no real work.",
    );
  } else {
    lines.push(
      "Everything premise needs to start is here. Run `npm start` and open the link it prints.",
    );
  }
  return lines.join("\n");
}
