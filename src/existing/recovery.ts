import type { Operation } from "../record/change.js";
import { type ItemKind, PRIORITIES, type Priority, type RecordItem } from "../record/format.js";
import { parseRunInstructions } from "../runner/run-instructions.js";
import type { RecoveredRun } from "./store.js";

/**
 * The record recovered from an existing software's code (decision 0189): what the drafter's
 * recovery_submit gives, checked; and the two free-text record files it leads to, run.md (how to
 * build, start and check it) and recovered-trace.md (best-guess links from old code, decision 0121).
 */

/** The kinds a recovery may hold: purpose, users, roles, what it does, and visible decisions. */
export const RECOVERED_KINDS: readonly ItemKind[] = ["Y", "U", "R", "W", "D"];

/** Most items one recovery may hold; a larger software is recovered part by part. */
export const MAX_RECOVERED_ITEMS = 200;
const MAX_TEXT = 400;
const MAX_RUN_TEXT = 2000;

export interface RecoveredItem {
  kind: ItemKind;
  text: string;
  priority?: Priority;
  foundation?: boolean;
  /** Files of the old code it is guessed to serve, relative to the repository's top. */
  files: string[];
}

export interface Recovery {
  items: RecoveredItem[];
  run: RecoveredRun;
  couldNotCheck: string[];
  summary: string;
}

function oneLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function block(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_RUN_TEXT) : "";
}

/** A path inside the repository, or null when it reaches outside it. */
function repoPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim().replace(/^\.\//, "");
  if (!path || path.startsWith("/") || path.split("/").includes("..") || path.length > 300) {
    return null;
  }
  return path;
}

/** Check a recovery_submit; problems say what to fix, in words an agent can act on. */
export function readRecovery(args: Record<string, unknown>): Recovery | { problems: string[] } {
  const problems: string[] = [];
  const raw = Array.isArray(args.items) ? args.items : [];
  if (raw.length === 0) problems.push('Give "items": the recovered record, at least one item.');
  if (raw.length > MAX_RECOVERED_ITEMS) {
    problems.push(
      `That is ${raw.length} items; give at most ${MAX_RECOVERED_ITEMS}. Keep to what decides whether the software is the right one.`,
    );
  }
  const items: RecoveredItem[] = [];
  raw.slice(0, MAX_RECOVERED_ITEMS).forEach((entry, i) => {
    const at = `Item ${i + 1}`;
    const value = (typeof entry === "string" ? { text: entry } : (entry ?? {})) as Record<
      string,
      unknown
    >;
    let text = oneLine(value.text, MAX_TEXT + 200);
    let kind = typeof value.kind === "string" ? value.kind.trim().toUpperCase() : "";
    const prefixed = /^([YURWD])\s*[:.-]\s*(.*)$/.exec(text);
    if (!kind && prefixed) {
      kind = prefixed[1]!;
      text = prefixed[2]!;
    }
    if (!(RECOVERED_KINDS as readonly string[]).includes(kind)) {
      problems.push(
        `${at}: give "kind" as Y (why), U (a user), R (a role), W (what it does) or D (a decision).`,
      );
      return;
    }
    let priority: Priority | undefined;
    if (kind === "W") {
      const given = typeof value.priority === "string" ? value.priority.toLowerCase() : "";
      const lead = /^(must|should|could)\s*:\s*(.*)$/i.exec(text);
      if (lead) {
        priority = lead[1]!.toLowerCase() as Priority;
        text = lead[2]!;
      } else {
        priority = (PRIORITIES as readonly string[]).includes(given)
          ? (given as Priority)
          : "should";
      }
    }
    if (value.assumed === true && !/^guess:/i.test(text)) text = `Guess: ${text}`;
    if (kind === "D") {
      // The record wants each decision's reason and what was given up; code rarely shows both.
      if (!/\breason:/i.test(text))
        text = `${text.replace(/\.?$/, ".")} Reason: not known from the code.`;
      if (!/\brejected:/i.test(text))
        text = `${text.replace(/\.?$/, ".")} Rejected: not known from the code.`;
    }
    text = text.slice(0, MAX_TEXT + 80);
    if (!text) {
      problems.push(`${at}: give its "text".`);
      return;
    }
    const files = (Array.isArray(value.files) ? value.files : [])
      .map(repoPath)
      .filter((p): p is string => p !== null)
      .slice(0, 50);
    items.push({
      kind: kind as ItemKind,
      text,
      ...(priority && { priority }),
      ...(kind === "D" && value.foundation === true && { foundation: true }),
      files,
    });
  });
  if (!items.some((i) => i.kind === "Y")) {
    problems.push(
      "Give at least one Y item: why the software exists, as far as the material shows. Mark it assumed when the material does not say.",
    );
  }
  if (problems.length > 0) return { problems };
  const run = (args.run && typeof args.run === "object" ? args.run : {}) as Record<string, unknown>;
  const recovered: RecoveredRun = {};
  for (const key of ["build", "start", "check"] as const) {
    const text = block(run[key]);
    if (text) recovered[key] = text;
  }
  const premiseRun = block(run.premise_run ?? run.premiseRun)
    .replace(/^```premise-run\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  if (premiseRun) recovered.premiseRun = premiseRun;
  const couldNotCheck = (Array.isArray(args.could_not_check) ? args.could_not_check : [])
    .map((t) => oneLine(t, MAX_TEXT))
    .filter(Boolean)
    .slice(0, 20);
  return { items, run: recovered, couldNotCheck, summary: oneLine(args.summary, 600) };
}

/** The record operations that put a recovery in: every item from: recovered, unconfirmed. */
export function recoveryOperations(recovery: Recovery): Operation[] {
  return recovery.items.map((item) => ({
    op: "add" as const,
    kind: item.kind,
    text: item.text,
    from: "recovered",
    ...(item.priority && { priority: item.priority }),
    ...(item.foundation && { foundation: true }),
  }));
}

/** Combine what earlier parts recovered about running it with what this part found. */
export function mergeRun(
  before: { run: RecoveredRun; couldNotCheck: string[] },
  recovery: Pick<Recovery, "run" | "couldNotCheck">,
): { run: RecoveredRun; couldNotCheck: string[] } {
  const run: RecoveredRun = { ...before.run };
  for (const key of ["build", "start", "check", "premiseRun"] as const) {
    const found = recovery.run[key];
    if (!found) continue;
    run[key] = run[key] && run[key] !== found ? `${run[key]}\n\n${found}` : found;
  }
  const couldNotCheck = [...before.couldNotCheck];
  for (const need of recovery.couldNotCheck)
    if (!couldNotCheck.includes(need)) couldNotCheck.push(need);
  return { run, couldNotCheck };
}

/**
 * Whether premise can operate the software from what was recovered: the runner's block must be
 * there and readable. What is missing goes to "could not check", named.
 */
export function runProblems(run: RecoveredRun, recordFolder: string): string[] {
  const problems: string[] = [];
  if (!run.premiseRun) {
    problems.push(
      `How to start it was not found in the code, so premise cannot start it yet. Say in chat how you start it (the command, and the address if it is a web page).`,
    );
  } else {
    const parsed = parseRunInstructions(
      `\`\`\`premise-run\n${run.premiseRun}\n\`\`\``,
      `${recordFolder}/run.md`,
    );
    if (!parsed.ok) {
      problems.push(
        `The start instructions premise recovered cannot be used as they are (${parsed.problem.split("\n")[0]}). Say in chat how you start it.`,
      );
    }
  }
  if (!run.check) {
    problems.push(
      "How to check it works was not found (no tests or check command). Say in chat what working looks like, and premise checks against that.",
    );
  }
  return problems;
}

/** run.md for an existing software: free text for people, with the runner's block when known. */
export function runFile(
  run: RecoveredRun,
  couldNotCheck: readonly string[],
  today: string,
): string {
  const section = (title: string, text: string | undefined, missing: string) =>
    [`## ${title}`, "", text ?? missing, ""].join("\n");
  return [
    "# How to run it",
    "",
    `Recovered by premise from the code on ${today}. Nobody has confirmed it yet by running the software this way; correct it by saying in premise what is wrong.`,
    "",
    section("Build", run.build, "Nothing to build was found, or it was not clear from the code."),
    section("Start", run.start, "How to start it was not found in the code."),
    ...(run.premiseRun ? ["```premise-run", run.premiseRun, "```", ""] : []),
    section("Check", run.check, "No way to check it was found in the code."),
    ...(couldNotCheck.length
      ? ["## Could not check", "", ...couldNotCheck.map((n) => `- ${n}`), ""]
      : []),
  ].join("\n");
}

const TRACE_HEAD = [
  "# Recovered trace",
  "",
  "Best guesses, made when premise took this software on, of which record items each file of the older code serves. Each line is a guess, not a fact. Every commit premise makes from now on names the items it serves in its trace trailer.",
  "",
];

/**
 * recovered-trace.md: one line per file of the old code, naming the items it is guessed to serve
 * (decision 0121). Lines already there are kept; a file named again gets the new items added.
 */
export function traceFile(
  before: string | undefined,
  links: ReadonlyMap<string, string[]>,
): string {
  const lines = new Map<string, Set<string>>();
  for (const line of (before ?? "").split("\n")) {
    const m = /^- `([^`]+)`: (.+?) \(guess\)$/.exec(line);
    if (m) lines.set(m[1]!, new Set(m[2]!.split(", ")));
  }
  for (const [path, ids] of links) {
    const set = lines.get(path) ?? new Set<string>();
    ids.forEach((id) => set.add(id));
    lines.set(path, set);
  }
  const sorted = [...lines.entries()].sort(([a], [b]) => a.localeCompare(b));
  return [
    ...TRACE_HEAD,
    ...sorted.map(([path, ids]) => `- \`${path}\`: ${[...ids].join(", ")} (guess)`),
    "",
  ].join("\n");
}

/** Which files serve which of the newly given IDs, from a recovery and the IDs its items got. */
export function traceLinks(
  recovery: Recovery,
  assigned: readonly (string | undefined)[],
): Map<string, string[]> {
  const links = new Map<string, string[]>();
  recovery.items.forEach((item, i) => {
    const id = assigned[i];
    if (!id) return;
    for (const file of item.files) links.set(file, [...(links.get(file) ?? []), id]);
  });
  return links;
}

/** Live items recovered from the code that nobody has confirmed yet, in the record's order. */
export function unconfirmed(items: readonly RecordItem[]): RecordItem[] {
  return items.filter((i) => !i.struck && i.marks.from === "recovered" && !i.marks.confirmed);
}
