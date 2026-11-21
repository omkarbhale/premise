import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import type { AgentRequest } from "../agents/agent-runner.js";
import type { ScriptBehaviour } from "../agents/scripted-agent.js";
import { parseRunInstructions } from "../runner/run-instructions.js";

/**
 * What scripted builders and checkers do with real files: write and commit code in their working
 * copy, and run a scenario's steps against the software built there. No AI is involved: the code a
 * scripted builder writes is given to it, and a scripted checker runs scenarios whose steps are
 * written in a small fixed form:
 *
 *   run: <shell command>      run in the working copy; its output is what was seen
 *   open: <path>              start the software from run.md (web) and fetch the path
 *   post: <path> <form body>  start it likewise and post the form body to the path
 *
 * and passes a step when the scenario's expected text appears in what was seen.
 */

export type Call = Parameters<ScriptBehaviour>[1];

/** The trailer every commit carries (the default of record.trailer). */
export const TRAILER = "Premise-Trace";

export function writeFiles(copy: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(copy, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/** Commit everything in the working copy, with the trace trailer naming the items. */
export function commitAll(copy: string, subject: string, items: readonly string[]): string {
  execFileSync("git", ["add", "-A"], { cwd: copy });
  execFileSync(
    "git",
    ["commit", "--quiet", "--allow-empty", "-m", subject, "-m", `${TRAILER}: ${items.join(", ")}`],
    { cwd: copy, env: { ...process.env, GIT_AUTHOR_DATE: "", GIT_COMMITTER_DATE: "" } },
  );
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: copy, encoding: "utf8" }).trim();
}

/** The record's live lines, through the agent's own tool. */
export function readRecord(call: Call): { id: string; line: string }[] {
  const read = call("record_read", {});
  return ((read.result as { lines?: { id: string; line: string }[] } | undefined)?.lines ?? []).map(
    (l) => ({ id: l.id, line: l.line }),
  );
}

/** The task a build job was given (the line engine puts it in the request's context). */
export function taskOf(request: AgentRequest): {
  number: number;
  title: string;
  items: string[];
  fix: boolean;
  evidence: string | null;
} {
  const context = request.context ?? {};
  const task = (context.task ?? {}) as { number?: number; title?: string; items?: string[] };
  return {
    number: task.number ?? 1,
    title: task.title ?? "the task",
    items: task.items ?? [],
    fix: context.purpose === "fix",
    evidence: typeof context.evidence === "string" ? context.evidence : null,
  };
}

export interface ScenarioSpec {
  name: string;
  steps: string[];
  expected: string;
}

interface StoredScenario {
  name: string;
  items: string[];
  steps: string[];
  expected: string;
}

/** The scenarios a check job was given (the line engine puts them in the request's context). */
export function scenariosOf(request: AgentRequest): StoredScenario[] {
  const list = request.context?.scenarios;
  return Array.isArray(list) ? (list as StoredScenario[]) : [];
}

export function itemsOf(request: AgentRequest): string[] {
  const list = request.context?.items;
  return Array.isArray(list) ? (list as string[]) : [];
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** A web software started from its run.md, for one check. */
class Started {
  private child: ChildProcess | null = null;
  port = 0;
  output = "";

  constructor(private readonly copy: string) {}

  async start(): Promise<string | null> {
    if (this.child) return null;
    let text: string | undefined;
    try {
      text = readFileSync(join(this.copy, "premise", "run.md"), "utf8");
    } catch {
      text = undefined;
    }
    const parsed = parseRunInstructions(text, "premise/run.md");
    if (!parsed.ok) return parsed.problem;
    if (parsed.instructions.kind !== "web" || !parsed.instructions.start) {
      return "run.md does not say how to start it as a web software.";
    }
    this.port = await freePort();
    const command = parsed.instructions.start.replaceAll("{port}", String(this.port));
    this.child = spawn("sh", ["-c", command], {
      cwd: this.copy,
      env: { ...process.env, PORT: String(this.port), HOST: "127.0.0.1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    this.child.stdout!.on("data", (d: Buffer) => (this.output += d.toString()));
    this.child.stderr!.on("data", (d: Buffer) => (this.output += d.toString()));
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(`http://127.0.0.1:${this.port}/`);
        return null;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    return `It did not answer on its port within 5 seconds. Its output: ${this.output.slice(-300)}`;
  }

  stop(): void {
    if (this.child?.pid !== undefined) {
      try {
        process.kill(-this.child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    this.child = null;
  }
}

/** Run one scenario in a working copy: what was seen, and whether the expected text was in it. */
export async function runScenario(
  copy: string,
  scenario: Pick<StoredScenario, "steps" | "expected">,
): Promise<{ met: boolean; seen: string; problem: string | null }> {
  const web = new Started(copy);
  let seen = "";
  try {
    for (const step of scenario.steps) {
      const [verb, ...rest] = step.split(":");
      const arg = rest.join(":").trim();
      if (verb === "run") {
        try {
          seen = execFileSync("sh", ["-c", arg], {
            cwd: copy,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 20_000,
          });
        } catch (error) {
          const e = error as { stdout?: string; stderr?: string; message: string };
          seen = `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message;
        }
      } else if (verb === "open" || verb === "post") {
        const problem = await web.start();
        if (problem) return { met: false, seen: problem, problem };
        const [path, ...body] = arg.split(" ");
        const response = await fetch(`http://127.0.0.1:${web.port}${path}`, {
          method: verb === "post" ? "POST" : "GET",
          ...(verb === "post" && {
            body: body.join(" "),
            headers: { "content-type": "application/x-www-form-urlencoded" },
          }),
          redirect: "follow",
        });
        seen = `${response.status} ${await response.text()}`;
      } else {
        return {
          met: false,
          seen: "",
          problem: `The step "${step}" is not one the scripted checker can take.`,
        };
      }
    }
  } finally {
    web.stop();
  }
  return { met: seen.includes(scenario.expected), seen: seen.trim().slice(0, 400), problem: null };
}

/**
 * The scripted checker's judging job: run each scenario for each item to check and submit a
 * verdict per item, with what it saw as the evidence. An item with no scenario it can run is
 * "could not check", honestly.
 */
export const scriptedJudge: ScriptBehaviour = async (request, call) => {
  const copy = request.workingCopy;
  const items = itemsOf(request);
  const scenarios = scenariosOf(request);
  const verdicts: { item: string; verdict: string; evidence: string }[] = [];
  for (const item of items) {
    const mine = scenarios.filter((s) => s.items.includes(item));
    const runnable = mine.filter((s) => s.steps.every((st) => /^(run|open|post):/.test(st)));
    if (!copy || runnable.length === 0) {
      verdicts.push({
        item,
        verdict: "could-not-check",
        evidence:
          mine.length === 0
            ? "No scenario was written for this item."
            : "The scripted checker cannot take these steps; a person or a real checker is needed.",
      });
      continue;
    }
    let failed: string | null = null;
    let seen = "";
    for (const scenario of runnable) {
      const result = await runScenario(copy, scenario);
      seen = result.seen;
      if (!result.met) {
        failed = `Scenario "${scenario.name}": expected "${scenario.expected}", saw: ${result.seen || "nothing"}`;
        break;
      }
    }
    verdicts.push(
      failed
        ? { item, verdict: "not-met", evidence: failed }
        : { item, verdict: "met", evidence: `Saw: ${seen}` },
    );
  }
  call("verdict_submit", { verdicts });
};
