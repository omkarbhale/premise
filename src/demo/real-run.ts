import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { nodePrefix } from "../runner/runner.js";
import { AGENT_TASK_KINDS } from "../config/settings.js";
import { envNameFor } from "../config/load.js";
import { type Running, start } from "../server/start.js";
import type { AskView } from "../shared/api-types.js";
import { listChatMessages } from "../storage/chat.js";
import type { OperatorAnswer } from "./demos.js";

/**
 * One real run (decision 0187): a tiny command-line software taken through the whole line by real
 * Claude Code agents, every type of task on model haiku at low effort, one session at a time, a
 * scripted operator answering, a local second copy instead of GitHub, and sandboxing on. It proves
 * premise's procedure with real agents, not the agents' intelligence, and uses the owner's Claude
 * login: run it only on purpose (`premise real-run --confirm`).
 */

export const REAL_RUN_IDEA =
  "A command-line tool that prints the lines of a text file in reverse order: the last line first and the first line last. It reads the file named on the command line and says plainly when it cannot read it.";

/** The settings a real run uses, on top of anything the environment already sets. */
export function realRunEnv(port: number): Record<string, string> {
  const env: Record<string, string> = {
    [envNameFor("agents.mode")]: "claude",
    [envNameFor("line.remote")]: "local",
    [envNameFor("queue.max_agent_sessions")]: "1",
    [envNameFor("runner.confinement")]: "bubblewrap",
    [envNameFor("runner.read_only_paths")]: JSON.stringify(nodePrefix() ? [nodePrefix()] : []),
    [envNameFor("server.port")]: String(port),
    [envNameFor("softwares.default_milestone_waits")]: "false",
  };
  for (const kind of AGENT_TASK_KINDS) {
    env[envNameFor(`agents.tasks.${kind}.model`)] = "haiku";
    env[envNameFor(`agents.tasks.${kind}.effort`)] = "low";
  }
  return env;
}

/**
 * The real run's scripted operator: keeps every list, says "Build it", and answers the line's
 * questions so it always moves forward, trying again once where that is offered.
 */
export function realRunOperator(): (ask: AskView) => OperatorAnswer {
  const tried = new Map<string, number>();
  return (ask) => {
    if (ask.kind === "approval") return { kind: "approval", decision: "refuse" };
    if (ask.items.length > 0 && (ask.kind === "draft" || ask.kind === "say-back")) {
      return { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) };
    }
    const choices = ask.choices ?? [];
    if (choices.includes("Build it")) return { kind: "text", text: "Build it" };
    if (choices.length > 0) {
      const times = tried.get(ask.title) ?? 0;
      tried.set(ask.title, times + 1);
      // Try again once; after that, the choice that moves the line on.
      return { kind: "text", text: choices[Math.min(times, choices.length - 1)]! };
    }
    return {
      kind: "text",
      text: "Use your best judgment and keep it as small as the record allows; nothing more is needed from me.",
    };
  };
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

export interface RealRunEvidence {
  idea: string;
  reachedEnd: boolean;
  minutes: number;
  stages: string[];
  sessions: {
    role: string;
    model: string;
    effort: string;
    ended: string | null;
    reason: string | null;
  }[];
  jobs: {
    id: number;
    kind: string;
    stage: string | null;
    status: string;
    attempts: number;
    result: string | null;
  }[];
  verdicts: { item: string; verdict: string; commit: string | null; evidence: string }[];
  commits: string[];
  run: unknown;
  said: string[];
  answered: string[];
}

/** Take the idea through the line with real agents, then gather the evidence. */
export async function realRun(options: {
  dataFolder: string;
  env: NodeJS.ProcessEnv;
  minutes: number;
  print: (line: string) => void;
}): Promise<RealRunEvidence> {
  const { print } = options;
  const began = Date.now();
  const port = await freePort();
  const running: Running = await start({
    dataFolder: options.dataFolder,
    env: { ...options.env, ...realRunEnv(port) },
    print,
  });
  const { services, db } = running;
  const operator = realRunOperator();
  const answered: string[] = [];
  let id = "";
  let reachedEnd = false;
  try {
    const software = await services.softwares.start({ idea: REAL_RUN_IDEA });
    id = software.id;
    print(`Started ${software.name}. Every agent is Claude Code on haiku at low effort.`);
    let heard = 0;
    const deadline = began + options.minutes * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const messages = listChatMessages(db, id).filter((m) => m.author === "premise");
      for (const m of messages.slice(heard)) print(`premise: ${m.text}`);
      heard = messages.length;
      const detail = await services.softwares.get(id);
      const open = await services.asks.list({ softwareId: id, status: "open" });
      if (open.length === 0 && detail.stage === "intake") {
        reachedEnd = true;
        break;
      }
      for (const ask of open) {
        const answer = operator(ask);
        const words =
          answer.kind === "text"
            ? answer.text
            : answer.kind === "approval"
              ? "No"
              : "kept every item";
        print(`operator, to "${ask.title}": ${words}`);
        answered.push(`${ask.title} → ${words}`);
        try {
          await services.asks.answer(ask.id, answer);
        } catch (error) {
          print(`(the answer was not taken: ${(error as Error).message})`);
        }
      }
    }
    if (!reachedEnd) print(`Stopped after ${options.minutes} minutes without reaching the end.`);
  } catch (error) {
    print(`The run broke off: ${(error as Error).message}`);
  }
  const evidence = gather(running, id, began, answered, reachedEnd);
  await running.close();
  const file = join(options.dataFolder, "real-run-evidence.json");
  writeFileSync(file, JSON.stringify(evidence, null, 2));
  print(`Evidence: ${file}`);
  return evidence;
}

function gather(
  running: Running,
  id: string,
  began: number,
  answered: string[],
  reachedEnd: boolean,
): RealRunEvidence {
  const { db, config } = running;
  const rows = <T>(sql: string, ...args: (string | number)[]) =>
    db.prepare(sql).all(...args) as unknown as T[];
  const repo = join(config.data.folder, "repos", id);
  let commits: string[] = [];
  try {
    commits = execFileSync("git", ["log", "--oneline", "--decorate=no", "-30"], {
      cwd: repo,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
  } catch {
    commits = [];
  }
  const verdicts = rows<{ reference: string; detail: string }>(
    "SELECT reference, detail FROM events WHERE software_id = ? AND module = 'checker' AND kind = 'verdict' ORDER BY id",
    id,
  ).map((r) => {
    const d = JSON.parse(r.detail) as { verdict: string; commit: string | null; evidence: string };
    return {
      item: r.reference,
      verdict: d.verdict,
      commit: d.commit,
      evidence: d.evidence.slice(0, 300),
    };
  });
  return {
    idea: REAL_RUN_IDEA,
    reachedEnd,
    minutes: Math.round((Date.now() - began) / 600) / 100,
    stages: rows<{ stage: string }>(
      "SELECT stage FROM stage_runs WHERE software_id = ? ORDER BY id",
      id,
    ).map((r) => r.stage),
    sessions: rows<{
      agent_role: string;
      model: string;
      effort: string;
      ended: string | null;
      end_reason: string | null;
    }>(
      "SELECT s.agent_role, s.model, s.effort, s.ended, s.end_reason FROM agent_sessions s JOIN jobs j ON j.id = s.job_id WHERE j.software_id = ? ORDER BY s.id",
      id,
    ).map((s) => ({
      role: s.agent_role,
      model: s.model,
      effort: s.effort,
      ended: s.ended,
      reason: s.end_reason,
    })),
    jobs: rows<{
      id: number;
      kind: string;
      stage: string | null;
      status: string;
      attempts: number;
      result: string | null;
    }>(
      "SELECT id, kind, stage, status, attempts, result FROM jobs WHERE software_id = ? ORDER BY id",
      id,
    ).map((j) => ({ ...j, result: j.result ? j.result.slice(0, 300) : null })),
    verdicts,
    commits,
    run: rows<Record<string, unknown>>(
      "SELECT commit_sha, kind, status, command, failure FROM runs WHERE software_id = ? ORDER BY id",
      id,
    ),
    said: id
      ? listChatMessages(db, id)
          .filter((m) => m.author === "premise")
          .map((m) => m.text)
      : [],
    answered,
  };
}
