#!/usr/bin/env node
import { ConfigError, envNameFor, resolveDataFolder } from "./config/load.js";
import { configurationReference } from "./config/reference.js";
import { checkRecordFolder } from "./record/check-folder.js";
import { formatDoctorReport, runDoctor } from "./doctor/doctor.js";
import { newLink, start } from "./server/start.js";
import { VERSION } from "./version.js";

const HELP = `premise ${VERSION}: from an idea to running software.

Usage:
  premise start [--data <folder>] [--port <number>]   Start premise and print the link to open.
  premise new-link [--data <folder>]                  Print a new link; older links stop working.
  premise doctor [--data <folder>]                    Check this machine and the settings.
  premise record check <folder>                       Check a software's record folder for mistakes.
  premise config reference                            Print every setting, as Markdown.
  premise --version

The data folder defaults to ~/.premise. Settings live in config.json inside it;
see docs/reference/configuration.md.`;

interface Parsed {
  command: string | undefined;
  rest: string[];
  data: string | undefined;
  port: string | undefined;
}

function parse(argv: string[]): Parsed {
  const parsed: Parsed = { command: undefined, rest: [], data: undefined, port: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--data") parsed.data = argv[++i];
    else if (arg === "--port") parsed.port = argv[++i];
    else if (parsed.command === undefined) parsed.command = arg;
    else parsed.rest.push(arg);
  }
  return parsed;
}

async function main(argv: string[]): Promise<number> {
  const args = parse(argv);
  const env = { ...process.env };
  if (args.port !== undefined) env[envNameFor("server.port")] = args.port;
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
