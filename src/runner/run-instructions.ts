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

const KEYS = ["kind", "start", "open", "command", "sample", "program"] as const;

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
    values.set(key, line.slice(colon + 1).trim());
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
  const instructions: RunInstructions = { kind, open };
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
