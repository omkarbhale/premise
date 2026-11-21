import { execFileSync } from "node:child_process";
import { nodePrefix } from "../runner/runner.js";
import type { AgentScript, ScriptBehaviour, ScriptRule } from "../agents/scripted-agent.js";
import { ScriptedAgentRunner } from "../agents/scripted-agent.js";
import { AgentToolServer } from "../agents/tool-server.js";
import { loadConfig } from "../config/load.js";
import type { AgentTaskKind } from "../config/settings.js";
import { RecordKeeper } from "../record/record-keeper.js";
import { createSession } from "../server/wiring.js";
import type {
  AskView,
  BuildView,
  RecordView,
  ReportView,
  RunView,
  ScopePlace,
  SoftwareUsageView,
} from "../shared/api-types.js";
import { placeFor } from "../line/scope.js";
import { listChatMessages } from "../storage/chat.js";
import { openDatabase } from "../storage/database.js";
import { MockUsageLedger } from "../usage-ledger/mock-usage-ledger.js";
import { DEMOS, type DemoSoftware, type DraftLine } from "./demo-softwares.js";
import {
  type Call,
  commitAll,
  itemsOf,
  readRecord,
  scriptedJudge,
  taskOf,
  writeFiles,
} from "./scripted-work.js";

/**
 * The kept demos (decisions 0108-0110), run again with `premise demo cli` or `premise demo web`
 * and in the test suite: a scripted agent (no AI) and a scripted operator take one small software
 * from its idea to running software, through the real line engine, record keeper, builder and
 * checker orchestration, runner and reporter.
 */

/** Submit a draft, leaving out what people struck before (as a real drafter would). */
function submit(call: Call, stage: string, items: DraftLine[]): void {
  const read = call("record_read", { include_struck: true });
  const struck = ((read.result as { lines?: { line: string }[] } | undefined)?.lines ?? [])
    .filter((l) => l.line.startsWith("- ~~"))
    .map((l) => l.line);
  const fresh = items.filter((i) => !struck.some((line) => line.includes(i.text)));
  call("draft_submit", { stage, items: fresh });
}

function ids(call: Call, patterns: RegExp[]): string[] {
  const record = readRecord(call);
  return patterns
    .map((p) => record.find((l) => p.test(l.line))?.id)
    .filter((x): x is string => Boolean(x));
}

/** The scripted agent's script for one demo software. */
export function demoScript(demo: DemoSoftware): AgentScript {
  const sayBack: ScriptBehaviour = (_request, call) => {
    // What the operator left out at the scope check is not said back: it is not being built.
    const lines = readRecord(call).filter(
      (l) => /^[YUW]-/.test(l.id) && !l.line.includes("left-out"),
    );
    const assumed = lines.filter((l) => l.line.includes("from: assumed"));
    const said = lines.filter((l) => !l.line.includes("from: assumed"));
    call("draft_submit", {
      stage: "say-back",
      kind: "say-back",
      items: [...assumed, ...said].slice(0, 10).map((l) => ({
        text: l.line.replace(/^- \[[A-Z]-\d+\]\s*/, "").replace(/\s*\([^()]*\)\s*$/, ""),
        from: l.line.includes("from: assumed") ? "assumed" : "operator",
        kind: l.id[0],
        refs: [l.id],
      })),
    });
  };
  const plan: ScriptBehaviour = (_request, call) => {
    call("draft_submit", {
      stage: "plan",
      items: demo.decisions,
      milestones: demo.milestones.map((text) => ({ text })),
      tasks: demo.tasks.map((t) => ({
        title: t.title,
        items: ids(call, t.serves),
        check: t.check,
        milestone: 1,
      })),
      kind: demo.kind,
      how_to_run: demo.howToRun,
    });
  };
  const build: ScriptBehaviour = (request, call) => {
    const copy = request.workingCopy;
    if (!copy) return;
    const task = taskOf(request);
    writeFiles(copy, task.fix ? demo.fixed() : demo.build(task.number));
    const items = task.items.length ? task.items : ids(call, [demo.planted]);
    commitAll(copy, task.fix ? "Fix what the check found" : task.title, items);
    call("task_finish", { status: "done" });
  };
  const scenarios: ScriptBehaviour = (request, call) => {
    const record = readRecord(call);
    for (const item of itemsOf(request)) {
      const line = record.find((l) => l.id === item)?.line ?? "";
      for (const s of demo.scenarios.filter((x) => x.match.test(line))) {
        call("scenario_write", { ...s.scenario, items: [item] });
      }
    }
  };
  const review: ScriptBehaviour = (_request, call) => {
    call("review_submit", {
      reviews: [{ decision: "the foundation", verdict: "agree", reasons: "Scripted review." }],
    });
  };
  const rule = (task: AgentTaskKind, extra: Partial<ScriptRule>): ScriptRule => ({
    when: { task, ...extra.when },
    progress: [`${task} (scripted, no AI)`],
    ...(extra.behave && { behave: extra.behave }),
    end: { outcome: "done" },
  });
  return {
    rules: [
      rule("draft", { when: { purpose: "correction" } }),
      rule("draft", { when: { stage: "why" }, behave: (_r, c) => submit(c, "why", demo.why) }),
      rule("draft", { when: { stage: "who" }, behave: (_r, c) => submit(c, "who", demo.who) }),
      rule("draft", { when: { stage: "what" }, behave: (_r, c) => submit(c, "what", demo.what) }),
      rule("draft", { when: { stage: "say-back" }, behave: sayBack }),
      rule("research", {
        behave: (_r, c) => {
          c("draft_submit", {
            stage: "exists",
            items: [{ text: "The demo makes no search; nothing was looked up.", from: "assumed" }],
            outcome: "Build it",
          });
        },
      }),
      rule("plan", { when: { purpose: "draft" }, behave: plan }),
      rule("review", { behave: review }),
      rule("build", { behave: build }),
      rule("check", { when: { purpose: "scenarios" }, behave: scenarios }),
      rule("check", { when: { purpose: "check" }, behave: scriptedJudge }),
    ],
  };
}

/** What the scripted operator says to one ask. */
export type OperatorAnswer =
  | { kind: "items"; items: { key: string; decision: "keep" | "strike"; reason?: string }[] }
  | { kind: "scope"; items: { key: string; place: ScopePlace }[] }
  | { kind: "text"; text: string }
  | { kind: "approval"; decision: "refuse" };

/**
 * The scripted operator of a demo (decision 0108): answers written down before the run. It keeps
 * every list, strikes the one planted assumption at the first say-back, says "Build it", takes the
 * scope check's starting choice as it is, and answers any other question with its first choice.
 */
export function demoOperator(demo: DemoSoftware): (ask: AskView) => OperatorAnswer {
  let struck = false;
  return (ask) => {
    if (ask.kind === "approval") return { kind: "approval", decision: "refuse" };
    if (ask.kind === "scope") return scopeAsIs(ask);
    if (ask.kind === "say-back" && !struck) {
      const target = ask.items.find((i) => demo.strike.match.test(i.text));
      if (target) {
        struck = true;
        return {
          kind: "items",
          items: ask.items.map((i) =>
            i.key === target.key
              ? { key: i.key, decision: "strike", reason: demo.strike.reason }
              : { key: i.key, decision: "keep" },
          ),
        };
      }
    }
    if (ask.items.length > 0 && (ask.kind === "draft" || ask.kind === "say-back")) {
      return { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) };
    }
    if (ask.choices?.includes("Build it")) return { kind: "text", text: "Build it" };
    if (ask.choices?.length) return { kind: "text", text: ask.choices[0]! };
    return { kind: "text", text: "Use your best judgment; nothing more is needed from me." };
  };
}

/** What the operator chose at the scope check, in a few words for the log. */
export function scopeWords(answer: Extract<OperatorAnswer, { kind: "scope" }>): string {
  const n = (place: ScopePlace) => answer.items.filter((i) => i.place === place).length;
  return `took the starting choice: ${n("first")} in the first version, ${n("later")} later, ${n("out")} left out`;
}

/** The scope check answered with the choice it starts on, moving nothing (as on the page). */
export function scopeAsIs(ask: AskView): OperatorAnswer {
  const cut = ask.scope?.preselected ?? "recommended";
  return {
    kind: "scope",
    items: ask.items.map((i) => ({ key: i.key, place: placeFor(i.tier ?? "asked", cut) })),
  };
}

export interface DemoResult {
  softwareId: string;
  name: string;
  stage: string;
  /** Every stage the software entered, in order. */
  stages: string[];
  /** What the operator struck at the say-back, with the record's item now struck. */
  struck: { text: string; reason: string } | null;
  record: RecordView;
  build: BuildView | null;
  run: RunView;
  report: ReportView;
  /** premise's words in the session, in order. */
  said: string[];
  answered: { title: string; answer: string }[];
  /** What it used, by step, change and item (mocked), and its budget and any overrun. */
  usage: SoftwareUsageView;
}

function bubblewrapWorks(): boolean {
  try {
    execFileSync("bwrap", ["--ro-bind", "/", "/", "true"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run one demo from its idea to running software in a fresh data folder. `confinement` is how the
 * runner confines the started software; by default bubblewrap where it works.
 */
export async function runDemo(
  which: "cli" | "web",
  options: {
    dataFolder: string;
    confinement?: "bubblewrap" | "none";
    portRange?: string;
    log?: (line: string) => void;
    /** For tests: another script, operator or settings than the demo's own. */
    script?: AgentScript;
    operator?: (ask: AskView) => OperatorAnswer;
    env?: NodeJS.ProcessEnv;
    /**
     * A deliberately small budget in dollars a week (mocked figures): the software overruns it, its
     * queue pauses, and the result shows what the operator is told.
     */
    smallBudgetUsd?: number;
  },
): Promise<DemoResult> {
  const demo = DEMOS[which];
  const log = options.log ?? (() => {});
  const config = loadConfig({
    dataFolder: options.dataFolder,
    env: {
      PREMISE_AGENTS__MODE: "scripted",
      PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "0",
      PREMISE_LINE__REMOTE: "local",
      PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: String(demo.waitAfterMilestone),
      PREMISE_RUNNER__CONFINEMENT:
        options.confinement ?? (bubblewrapWorks() ? "bubblewrap" : "none"),
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify(nodePrefix() ? [nodePrefix()] : []),
      ...(options.portRange && { PREMISE_RUNNER__PORT_RANGE: options.portRange }),
      ...options.env,
    },
  });
  const { db } = openDatabase(config.data.folder);
  const ledger = new MockUsageLedger("mock-fixed", 1);
  const tools = new AgentToolServer({ db, config });
  const runner = new ScriptedAgentRunner(options.script ?? demoScript(demo));
  const record = new RecordKeeper({ db, config });
  const session = createSession({ db, config, ledger, runner, tools, record });
  const operator = options.operator ?? demoOperator(demo);
  const answered: DemoResult["answered"] = [];
  let struck: DemoResult["struck"] = null;

  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      session.queue.tick();
      await session.queue.idle();
      await session.gate.idle();
      await session.line.idle();
      await new Promise((r) => setTimeout(r, 5));
      if (session.queue.list("queued").length === 0 && session.queue.list("running").length === 0)
        return;
    }
  };

  try {
    log(`Demo: ${demo.title}. The idea: ${demo.idea}`);
    const started = await session.services.softwares.start({ idea: demo.idea });
    const id = started.id;
    if (options.smallBudgetUsd !== undefined) {
      await session.usage.setBudget(id, { kind: "amount", usd: options.smallBudgetUsd });
    }
    let heard = 0;
    const tell = () => {
      const messages = listChatMessages(db, id).filter((m) => m.author === "premise");
      for (const m of messages.slice(heard)) log(`premise: ${m.text}`);
      heard = messages.length;
    };
    for (let round = 0; round < 60; round++) {
      await settle();
      tell();
      const open = await session.services.asks.list({ softwareId: id, status: "open" });
      const detail = await session.services.softwares.get(id);
      if (open.length === 0) {
        if (detail.stage === "intake" || detail.state !== "active") break;
        continue;
      }
      for (const ask of open) {
        const answer = operator(ask);
        if (answer.kind === "items") {
          const strike = answer.items.find((i) => i.decision === "strike");
          if (strike) {
            const item = ask.items.find((i) => i.key === strike.key)!;
            struck = { text: item.text, reason: strike.reason ?? "" };
          }
        }
        const words =
          answer.kind === "text"
            ? answer.text
            : answer.kind === "approval"
              ? "No"
              : answer.kind === "scope"
                ? scopeWords(answer)
                : answer.items.some((i) => i.decision === "strike")
                  ? `struck "${struck?.text}": ${struck?.reason}`
                  : "kept every item";
        log(`operator, to "${ask.title}": ${words}`);
        answered.push({ title: ask.title, answer: words });
        await session.services.asks.answer(ask.id, answer);
      }
    }
    await settle();
    tell();
    const detail = await session.services.softwares.get(id);
    const stages = (
      db.prepare("SELECT stage FROM stage_runs WHERE software_id = ? ORDER BY id").all(id) as {
        stage: string;
      }[]
    ).map((r) => r.stage);
    return {
      softwareId: id,
      name: detail.name,
      stage: detail.stage,
      stages,
      struck,
      record: await session.services.records.view(id),
      build: detail.build,
      run: await session.runner.view(id),
      report: await session.services.reports.view(id, { detail: true }),
      said: listChatMessages(db, id)
        .filter((m) => m.author === "premise")
        .map((m) => m.text),
      answered,
      usage: await session.usage.view(id),
    };
  } finally {
    await session.queue.close();
    await session.runner.close();
    db.close();
  }
}
