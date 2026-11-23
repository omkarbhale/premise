import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import { sessionSettings } from "../src/agents/claude-settings.js";
import { accessFor } from "../src/agents/roles.js";
import type { AgentScript, ScriptBehaviour } from "../src/agents/scripted-agent.js";
import { workingCopyPath } from "../src/agents/working-copy.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import { type OperatorAnswer, demoOperator, demoScript, runDemo } from "../src/demo/demos.js";
import { commitAll, taskOf, writeFiles } from "../src/demo/scripted-work.js";
import { readVerdicts } from "../src/reporter/facts.js";
import type { AskView } from "../src/shared/api-types.js";
import { testApp, tempFolder, uniquePortRange } from "./helpers.js";

/**
 * Build, Check and Run (docs/architecture/build-check-run.md) beyond the demos: a check that keeps
 * failing stops at its limit, a task that keeps failing stops, a task waiting on a person lets the
 * others go on, premise restarting in the middle of Build and of Check, and the checker's scenarios
 * out of the builder's reach.
 */

type App = Awaited<ReturnType<typeof testApp>>;

/** The command-line demo's script with some rules put in front. */
function countScript(...first: AgentScript["rules"]): AgentScript {
  return { rules: [...first, ...demoScript(COUNT_DEMO).rules] };
}

/** A builder that always leaves the planted defect in, even when fixing. */
const alwaysBuggy: ScriptBehaviour = (request, call) => {
  const copy = request.workingCopy!;
  const task = taskOf(request);
  writeFiles(copy, COUNT_DEMO.build(3));
  commitAll(
    copy,
    task.fix ? "Fix (not really)" : task.title,
    task.items.length ? task.items : ["W-2"],
  );
  call("task_finish", { status: "done" });
};

async function run(
  options: {
    script?: AgentScript;
    operator?: (ask: AskView) => OperatorAnswer;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const { range } = await uniquePortRange(20);
  return runDemo("cli", {
    dataFolder: tempFolder(),
    confinement: "none",
    portRange: range,
    ...options,
  });
}

/** Answer like the demo's operator, with some answers changed. */
function operatorWith(answers: Record<string, string>): (ask: AskView) => OperatorAnswer {
  const base = demoOperator(COUNT_DEMO);
  return (ask) => {
    const said = Object.entries(answers).find(([title]) => ask.title.startsWith(title));
    return said ? { kind: "text", text: said[1] } : base(ask);
  };
}

describe("the check", () => {
  it("sends a must item not met back to the builder with the evidence, and stops at the round limit", async () => {
    const result = await run({
      script: countScript({
        when: { task: "build" },
        behave: alwaysBuggy,
        end: { outcome: "done" },
      }),
      operator: operatorWith({ "The check failed 3 rounds": "Land it as it is" }),
    });
    const checks = result.build!.checks;
    expect(checks.map((c) => c.status)).toEqual(["not-passed", "not-passed", "stopped"]);
    // Every round judged a new commit, and the not-met evidence went to the builder's next task.
    expect(new Set(checks.map((c) => c.commit)).size).toBe(3);
    expect(result.said.join("\n")).toContain("round 2 of 3");
    expect(result.answered.map((a) => a.title)).toContain("The check failed 3 rounds: what now?");
    // The operator chose to land it as it is: it lands, runs and is reported, with the item open.
    expect(result.stage).toBe("intake");
    expect(result.build!.landed).not.toBeNull();
    expect(result.report.written).not.toBeNull();
  }, 60_000);

  it("gives the fix task the checker's evidence, never the checker's scenarios", async () => {
    const briefs: string[] = [];
    const watch: ScriptBehaviour = (request: AgentRequest, call) => {
      if (request.context?.purpose === "fix") briefs.push(request.brief);
      return demoScript(COUNT_DEMO).rules.find((r) => r.when?.task === "build")!.behave!(
        request,
        call,
      );
    };
    await run({
      script: countScript({ when: { task: "build" }, behave: watch, end: { outcome: "done" } }),
    });
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toContain("W-2 not met");
    expect(briefs[0]).toContain('expected "words: 4"');
    expect(briefs[0]).not.toContain("printf"); // the scenario's steps stay with the checker
  }, 60_000);
});

describe("build tasks", () => {
  it("stops a task after the same failure three times, and the operator decides how to go on", async () => {
    const noCommit: ScriptBehaviour = () => {};
    const result = await run({
      script: countScript({
        when: { task: "build", brief_contains: "2. Count words" },
        behave: noCommit,
        end: { outcome: "done" },
      }),
      operator: operatorWith({ "Task 2 stopped": "Check what was built" }),
    });
    const said = result.said.join("\n");
    expect(said).toContain(
      "Task 2 is tried again (1 of 3): The builder finished without committing anything.",
    );
    expect(said).toContain("Task 2 is tried again (2 of 3)");
    expect(said).toContain("Task 2 stopped. The same problem 3 times");
    expect(result.answered.map((a) => `${a.title} → ${a.answer}`)).toContain(
      "Task 2 stopped: what now? → Check what was built",
    );
    // What was built without task 2 is checked; the missing word count is caught and fixed.
    expect(result.build!.checks.map((c) => c.status)).toEqual(["not-passed", "passed"]);
    expect(result.stage).toBe("intake");
  }, 60_000);

  it("takes a task the builder found already done, with no commit, and leaves the judging to the check", async () => {
    const alreadyDone: ScriptBehaviour = (_request, call) => {
      call("task_finish", { status: "done", note: "An earlier task already did this." });
    };
    const result = await run({
      script: countScript({
        when: { task: "build", brief_contains: "2. Count words" },
        behave: alreadyDone,
        end: { outcome: "done" },
      }),
    });
    expect(result.said.join("\n")).toContain(
      "Task 2 of 3 needed no change: the builder found it already done by an earlier task.",
    );
    expect(result.said.join("\n")).not.toContain("Task 2 is tried again");
    // The check is not taken in by the builder's word: words are missing, so it goes back.
    expect(result.build!.checks.map((c) => c.status)).toEqual(["not-passed", "passed"]);
    expect(result.stage).toBe("intake");
  }, 60_000);

  it("lets the other tasks go on while one waits for a person's answer", async () => {
    const asking: ScriptBehaviour = (request, call) => {
      const answers = (request.context?.answers as string[] | undefined) ?? [];
      if (answers.length === 0) {
        call("ask", {
          role: "operator",
          kind: "question",
          items: ["Should a hyphenated word count as one word?"],
        });
        call("task_finish", { status: "waiting-for-person", note: "Asked about hyphens." });
        return;
      }
      return demoScript(COUNT_DEMO).rules.find((r) => r.when?.task === "build")!.behave!(
        request,
        call,
      );
    };
    const result = await run({
      script: countScript({
        when: { task: "build", brief_contains: "2. Count words" },
        behave: asking,
        end: { outcome: "done" },
      }),
    });
    const said = result.said;
    const waits = said.findIndex((s) => s.startsWith("Task 2 waits for your answer"));
    const third = said.findIndex((s) => s.startsWith("Task 3 of 3 is built"));
    const second = said.findIndex((s) => s.startsWith("Task 2 of 3 is built"));
    expect(waits).toBeGreaterThanOrEqual(0);
    expect(third).toBeGreaterThan(waits);
    expect(second).toBeGreaterThan(third);
    expect(result.stage).toBe("intake");
  }, 60_000);
});

/** Drive a test app's software with the demo operator until nothing is left to answer. */
async function drive(app: App, id: string, until: (app: App) => boolean = () => false) {
  const operator = demoOperator(COUNT_DEMO);
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    await app.settle();
    if (until(app)) return;
    const open = await app.session.services.asks.list({ softwareId: id, status: "open" });
    if (open.length === 0) {
      const detail = await app.session.services.softwares.get(id);
      if (detail.stage === "intake") return;
      continue;
    }
    for (const ask of open) await app.session.services.asks.answer(ask.id, operator(ask));
  }
}

/**
 * Drive without waiting for running sessions to end: one of them never ends in this premise.
 * Returns once `until` holds.
 */
async function driveWithoutWaiting(app: App, id: string, until: (app: App) => boolean) {
  const operator = demoOperator(COUNT_DEMO);
  for (let i = 0; i < 2000; i++) {
    app.session.queue.tick();
    await new Promise((r) => setTimeout(r, 5));
    await app.session.line.idle();
    if (until(app)) return;
    for (const ask of await app.session.services.asks.list({ softwareId: id, status: "open" })) {
      await app.session.services.asks.answer(ask.id, operator(ask));
    }
  }
  throw new Error("The software never got there.");
}

describe("restart in the middle of build and of check", () => {
  for (const where of ["build", "check"] as const) {
    it(`carries on after premise stops in the middle of ${where === "build" ? "a build task" : "the check"}`, async () => {
      const hang = {
        when: { task: where, attempt: 1, ...(where === "check" && { purpose: "check" }) },
        progress: ["Working"],
        end: { outcome: "hang" as const },
      };
      const env = { PREMISE_LINE__REMOTE: "none" };
      const first = await testApp(env, { script: countScript(hang) });
      const { body } = await first.call("POST", "/api/softwares", { idea: COUNT_DEMO.idea });
      const id = body.id as string;
      // Cut once the session is under way, as it says in its first progress line: a job counts as
      // running from the moment it starts, while its working copy is still being cloned, and a
      // clone left going would carry on in the stopped premise behind the new one's back.
      const underWay = (app: App) =>
        app.session.queue
          .list("running")
          .filter((j) => j.kind === where && j.payload.purpose !== "scenarios")
          .some((j) =>
            app.db
              .prepare(
                "SELECT 1 FROM events WHERE module = 'agent' AND kind = 'progress' AND reference = ?",
              )
              .get(String(j.id)),
          );
      await driveWithoutWaiting(first, id, underWay);
      const cut = first.session.queue.list("running");
      expect(cut.map((j) => j.kind)).toEqual([where]);

      // premise stops without the job finishing; a new premise opens the same data folder. The
      // stopped premise does nothing more: a budget check still in flight would tick its queue
      // and start the job again, behind the new premise's back.
      await first.session.usage.idle();
      const second = await testApp(env, { script: countScript(), folder: first.folder });
      expect(second.session.queue.recover().map((j) => j.id)).toEqual(cut.map((j) => j.id));
      await drive(second, id);
      const detail = await second.session.services.softwares.get(id);
      expect(detail.stage).toBe("intake");
      expect(detail.build!.landed).not.toBeNull();
      expect(detail.build!.checks.at(-1)!.status).toBe("passed");
    }, 120_000);
  }
});

describe("the checker's scenarios", () => {
  it("are kept in premise's data folder, which a builder's session settings deny", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: countScript() });
    const { body } = await app.call("POST", "/api/softwares", { idea: COUNT_DEMO.idea });
    const id = body.id as string;
    await drive(app, id);
    const scenarios = join(app.folder, "scenarios");
    const files = readdirSync(scenarios, { recursive: true }).filter((f) =>
      String(f).endsWith(".json"),
    );
    expect(files.length).toBeGreaterThan(0);

    const build = app.session.queue.list().find((j) => j.kind === "build")!;
    const copy = workingCopyPath(app.folder, id, build.id);
    // Nothing of the scenarios is in the builder's working copy.
    const inCopy = readdirSync(copy, { recursive: true }).map(String);
    expect(inCopy.some((f) => f.includes("scenario"))).toBe(false);
    const settings = sessionSettings({
      workingCopy: copy,
      dataFolder: app.folder,
      home: tempFolder(),
      access: accessFor("build"),
      allowedDomains: ["registry.npmjs.org"],
      claudeConfigFolder: null,
      extraDeniedPaths: [],
    });
    expect(settings.sandbox.filesystem.denyRead).toContain(scenarios);
    expect(settings.permissions.deny).toContain(`Read(/${scenarios}/**)`);
    // The checker's own judging session reads them only through its brief.
    const check = app.session.queue
      .list()
      .find((j) => j.kind === "check" && j.payload.purpose === "check")!;
    expect(String(check.payload.brief)).toContain("Words separated by several spaces");
    expect(existsSync(join(app.folder, "transcripts"))).toBe(false);
  }, 60_000);

  it("records each verdict against the commit it judged, and the reporter reads them so", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: countScript() });
    const { body } = await app.call("POST", "/api/softwares", { idea: COUNT_DEMO.idea });
    const id = body.id as string;
    await drive(app, id);
    const checks = (await app.session.services.softwares.get(id)).build!.checks;
    const verdicts = readVerdicts(app.db, id);
    // The latest verdict per item is the passing check's, on its commit.
    expect(new Set(verdicts.map((v) => v.commit))).toEqual(new Set([checks.at(-1)!.commit]));
    expect(app.session.reporter.history(id)[0]!.trigger).toBe("milestone");
  }, 60_000);

  it("refuses verdicts from the scenario session, scenarios from a builder, and verdicts without evidence", async () => {
    const tried: { tool: string; code: string | undefined }[] = [];
    const record = (
      call: Parameters<ScriptBehaviour>[1],
      tool: string,
      args: Record<string, unknown>,
    ) => tried.push({ tool, code: call(tool, args).error?.code });
    const script = countScript(
      {
        when: { task: "check", purpose: "scenarios" },
        behave: (request, call) => {
          record(call, "verdict_submit", { verdicts: [] });
          return demoScript(COUNT_DEMO).rules.find((r) => r.when?.purpose === "scenarios")!.behave!(
            request,
            call,
          );
        },
        end: { outcome: "done" },
      },
      {
        when: { task: "check", purpose: "check" },
        behave: async (request, call) => {
          record(call, "verdict_submit", {
            verdicts: [{ item: "W-1", verdict: "met", evidence: "", judged_on: "real" }],
          });
          record(call, "verdict_submit", {
            verdicts: [{ item: "W-99", verdict: "met", evidence: "x", judged_on: "real" }],
          });
          record(call, "verdict_submit", {
            verdicts: [{ item: "W-1", verdict: "fine", evidence: "x", judged_on: "real" }],
          });
          record(call, "verdict_submit", {
            verdicts: [{ item: "W-1", verdict: "met", evidence: "x" }],
          });
          record(call, "verdict_submit", {
            verdicts: [{ item: "W-1", verdict: "met", evidence: "x", judged_on: "made-up" }],
          });
          const judge = demoScript(COUNT_DEMO).rules.find(
            (r) => r.when?.purpose === "check",
          )!.behave!;
          await judge(request, call);
        },
        end: { outcome: "done" },
      },
      {
        when: { task: "build", attempt: 1, brief_contains: "1. The smallest" },
        behave: (request, call) => {
          record(call, "scenario_write", { name: "x", items: [], steps: ["y"], expected: "z" });
          return demoScript(COUNT_DEMO).rules.find((r) => r.when?.task === "build")!.behave!(
            request,
            call,
          );
        },
        end: { outcome: "done" },
      },
    );
    const result = await run({ script });
    expect(tried).toEqual(
      [
        { tool: "verdict_submit", code: "NOT_ALLOWED" },
        { tool: "scenario_write", code: "NOT_ALLOWED" },
        { tool: "verdict_submit", code: "MALFORMED" },
        { tool: "verdict_submit", code: "MALFORMED" },
        { tool: "verdict_submit", code: "MALFORMED" },
        { tool: "verdict_submit", code: "MALFORMED" },
        { tool: "verdict_submit", code: "MALFORMED" },
        { tool: "verdict_submit", code: "MALFORMED" },
      ].slice(0, tried.length),
    );
    expect(tried.slice(0, 2)).toEqual([
      { tool: "verdict_submit", code: "NOT_ALLOWED" },
      { tool: "scenario_write", code: "NOT_ALLOWED" },
    ]);
    expect(tried.slice(2, 7).every((t) => t.code === "MALFORMED")).toBe(true);
    expect(result.stage).toBe("intake");
  }, 60_000);
});
