/**
 * The machine-readable part of a software's run.md (decision 0162). run.md is free text for
 * people; the runner reads one fenced block in it, written like this:
 *
 *     ```premise-run
 *     kind: web
 *     start: node server.js --port {port}
 *     open: /
 *     ```
 *
 * kind web      start (needed), open (a path, default "/")
 * kind command  command (needed: what a person types), sample (what the runner runs once; defaults to command)
 * kind program  program (needed: what was built and how to start it on the owner's machine)
 *
 * Any kind may also have build lines, one command each, as many as needed:
 *
 *     build: npm ci
 *     build: npm run build
 *
 * The runner runs them in order in the clean copy before the start or the sample (decision 0280),
 * so a software that must be built first starts the same way from a clean copy every time.
 *
 * `{port}` in start is replaced by the port the runner chose; PORT and HOST are also set in the
 * software's environment.
 */

export type RunKind = "web" | "command" | "program";

export interface RunInstructions {
  kind: RunKind;
  start?: string;
  open: string;
  command?: string;
  sample?: string;
  program?: string;
  /** Commands run in order in the clean copy before the start or the sample; empty when none. */
  build: string[];
}

export type ParsedRunInstructions =
  { ok: true; instructions: RunInstructions } | { ok: false; problem: string };

const EXAMPLE = [
  "```premise-run",
  "kind: web",
  "start: node server.js --port {port}",
  "open: /",
  "```",
].join("\n");

const KEYS = ["kind", "build", "start", "open", "command", "sample", "program"] as const;

export function parseRunInstructions(
  text: string | undefined,
  file: string,
): ParsedRunInstructions {
  if (text === undefined) {
    return {
      ok: false,
      problem: `The software has no ${file}, so premise does not know how to start it. The builder should write one, with a block like this in it:\n${EXAMPLE}`,
    };
  }
  const block = /```premise-run[^\S\n]*\n([\s\S]*?)\n[^\S\n]*```/.exec(text);
  if (!block) {
    return {
      ok: false,
      problem: `${file} says nothing premise can start the software from. Add a block like this:\n${EXAMPLE}`,
    };
  }
  const values = new Map<string, string>();
  const build: string[] = [];
  for (const raw of block[1]!.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    const key = colon < 0 ? "" : line.slice(0, colon).trim();
    if (!(KEYS as readonly string[]).includes(key)) {
      return {
        ok: false,
        problem: `In ${file}, the line "${line}" is not understood. Lines look like "key: value", with keys from: ${KEYS.join(", ")}.`,
      };
    }
    const value = line.slice(colon + 1).trim();
    if (key === "build") {
      if (value.length === 0) {
        return {
          ok: false,
          problem: `In ${file}, a "build:" line needs the command to run, such as "build: npm run build".`,
        };
      }
      build.push(value);
      continue;
    }
    values.set(key, value);
  }
  const kind = values.get("kind");
  if (kind !== "web" && kind !== "command" && kind !== "program") {
    return {
      ok: false,
      problem: `In ${file}, "kind" must be web, command or program; it is ${kind === undefined ? "missing" : `"${kind}"`}.`,
    };
  }
  const need = (key: string): string | null => {
    const value = values.get(key);
    return value !== undefined && value.length > 0
      ? null
      : `In ${file}, a ${kind} software needs "${key}:".`;
  };
  const missing =
    kind === "web" ? need("start") : kind === "command" ? need("command") : need("program");
  if (missing) return { ok: false, problem: missing };
  const open = values.get("open") ?? "/";
  if (!open.startsWith("/")) {
    return {
      ok: false,
      problem: `In ${file}, "open" must be a path starting with /, such as /; it is "${open}".`,
    };
  }
  const instructions: RunInstructions = { kind, open, build };
  const start = values.get("start");
  const command = values.get("command");
  const sample = values.get("sample");
  const program = values.get("program");
  if (start) instructions.start = start;
  if (command) instructions.command = command;
  if (command || sample) instructions.sample = sample || command!;
  if (program) instructions.program = program;
  return { ok: true, instructions };
}
