#!/usr/bin/env node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, envNameFor, resolveDataFolder } from "./config/load.js";
import { runDemo } from "./demo/demos.js";
import { realRun } from "./demo/real-run.js";
import { configurationReference } from "./config/reference.js";
import { checkRecordFolder } from "./record/check-folder.js";
import { formatDoctorReport, runDoctor } from "./doctor/doctor.js";
import { newLink, start } from "./server/start.js";
import { VERSION } from "./version.js";

const HELP = `premise ${VERSION}: from an idea to running software.

Usage:
  premise start [--data <folder>] [--port <number>] [--scripted]
                                                      Start premise and print the link to open.
                                                      --scripted: agents follow a script and call
                                                      no AI (a demo; nothing real is built).
  premise new-link [--data <folder>]                  Print a new link; older links stop working.
  premise doctor [--data <folder>]                    Check this machine and the settings.
  premise record check <folder>                       Check a software's record folder for mistakes.
  premise config reference                            Print every setting, as Markdown.
  premise demo <cli|web> [--data <folder>]            Run a kept demo: a scripted agent (no AI) and a
                                                      scripted operator take a small software from
                                                      its idea to running software.
  premise real-run --confirm [--data <folder>] [--minutes <n>]
                                                      Take a tiny tool through the whole line with
                                                      real agents on YOUR Claude login (haiku, low
                                                      effort). Proves the procedure; use sparingly.
  premise --version

The data folder defaults to ~/.premise. Settings live in config.json inside it;
see docs/reference/configuration.md.`;

interface Parsed {
  command: string | undefined;
  rest: string[];
  data: string | undefined;
  port: string | undefined;
  scripted: boolean;
  confirm: boolean;
  minutes: string | undefined;
}

function parse(argv: string[]): Parsed {
  const parsed: Parsed = {
    command: undefined,
    rest: [],
    data: undefined,
    port: undefined,
    scripted: false,
    confirm: false,
    minutes: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--data") parsed.data = argv[++i];
    else if (arg === "--port") parsed.port = argv[++i];
    else if (arg === "--scripted") parsed.scripted = true;
    else if (arg === "--confirm") parsed.confirm = true;
    else if (arg === "--minutes") parsed.minutes = argv[++i];
    else if (parsed.command === undefined) parsed.command = arg;
    else parsed.rest.push(arg);
  }
  return parsed;
}

async function main(argv: string[]): Promise<number> {
  const args = parse(argv);
  const env = { ...process.env };
  if (args.port !== undefined) env[envNameFor("server.port")] = args.port;
  if (args.scripted) env[envNameFor("agents.mode")] = "scripted";
  if (args.command === "demo" || args.command === "real-run") return trial(args, env);
  const dataFolder = resolveDataFolder({ flag: args.data, env });

  switch (args.command) {
    case "start": {
      const running = await start({ dataFolder, env });
      const stop = () => {
        console.log("\nStopping premise.");
        void running.close().then(() => process.exit(0));
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      return -1;
    }
    case "new-link": {
      const link = newLink({ dataFolder, env });
      console.log(`Open this link: ${link}`);
      console.log(
        "Older links, and pages opened from them, stop working now. Reload with this one.",
      );
      return 0;
    }
    case "doctor": {
      const report = await runDoctor({ dataFolder, env });
      console.log(formatDoctorReport(report));
      return report.canStart ? 0 : 1;
    }
    case "config":
      if (args.rest[0] === "reference") {
        process.stdout.write(configurationReference());
        return 0;
      }
      console.error("Usage: premise config reference");
      return 2;
    case "record":
      if (args.rest[0] === "check" && args.rest[1] !== undefined) {
        const result = checkRecordFolder(args.rest[1]);
        console.log(result.message);
        return result.ok ? 0 : 1;
      }
      console.error("Usage: premise record check <folder>");
      return 2;
    case "--version":
    case "version":
      console.log(VERSION);
      return 0;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;
    default:
      console.error(`premise does not know the command "${args.command}".\n\n${HELP}`);
      return 2;
  }
}

/** The kept demos and the one real run, each in a data folder of its own (never ~/.premise). */
async function trial(args: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const folder = args.data ?? mkdtempSync(join(tmpdir(), `premise-${args.command}-`));
  if (args.command === "demo") {
    const which = args.rest[0];
    if (which !== "cli" && which !== "web") {
      console.error(
        "Usage: premise demo cli   (a command-line utility)\n       premise demo web   (a small web app)",
      );
      return 2;
    }
    console.log(`Data folder for this demo: ${folder}
`);
    const result = await runDemo(which, { dataFolder: folder, log: (line) => console.log(line) });
    console.log("");
    console.log(`Stages, in order: ${result.stages.join(" → ")}`);
    for (const check of result.build?.checks ?? []) {
      console.log(
        `Check round ${check.round} of version ${check.commit.slice(0, 7)}: ${check.status}; ${check.verdicts.map((v) => `${v.item} ${v.verdict}`).join(", ")}`,
      );
    }
    console.log(`Running: ${result.run.plain}`);
    return result.stage === "intake" ? 0 : 1;
  }
  if (!args.confirm) {
    console.log(
      [
        "premise real-run takes a tiny command-line tool (it prints a file's lines in reverse) through",
        "the whole line with real Claude Code agents, on your Claude login: every type of task on haiku",
        "at low effort, one session at a time, a scripted operator answering, a second copy on this",
        "machine instead of GitHub, and the sandbox on. It uses part of your subscription's usage.",
        "",
        "To run it: premise real-run --confirm [--minutes 90] [--data <folder>]",
      ].join("\n"),
    );
    return 2;
  }
  const minutes = Number(args.minutes ?? "90");
  console.log(`Data folder for this run: ${folder}\n`);
  const evidence = await realRun({
    dataFolder: folder,
    env,
    minutes,
    print: (l) => console.log(l),
  });
  console.log("");
  console.log(`Reached the end of the line: ${evidence.reachedEnd ? "yes" : "no"}`);
  console.log(`Stages, in order: ${evidence.stages.join(" → ")}`);
  console.log(`Agent sessions: ${evidence.sessions.length}; minutes: ${evidence.minutes}`);
  return evidence.reachedEnd ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (error: unknown) => {
    console.error(
      error instanceof ConfigError || error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  },
);
