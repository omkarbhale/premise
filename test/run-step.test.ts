import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import type { AgentScript, ScriptBehaviour } from "../src/agents/scripted-agent.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import {
  type OperatorAnswer,
  bubblewrapWorks,
  demoOperator,
  demoScript,
  runDemo,
} from "../src/demo/demos.js";
import { commitAll, scriptedJudge, taskOf, writeFiles } from "../src/demo/scripted-work.js";
import type { AskView } from "../src/shared/api-types.js";
import { tempFolder, uniquePortRange } from "./helpers.js";

/**
 * The Run step (decision 0280), from the first real run: premise started a clean copy and ran only
 * the start line, never the build run.md describes, so a software that needs a build never started;
 * yet "run done", "milestone reached" and a report followed. Now the runner runs run.md's build
 * lines first, and a start that fails holds the line at Run, goes back to Build by itself once with
 * the output, and only then asks the person.
 */

/** A build step that makes dist/count.mjs; without it, dist/ does not exist. */
const BUILD_SCRIPT = [
  'import { copyFileSync, mkdirSync } from "node:fs";',
  'mkdirSync("dist", { recursive: true });',
  'copyFileSync("count.mjs", "dist/count.mjs");',
  'console.log("built dist/count.mjs");',
  "",
].join("\n");

function runMd(lines: string[]): string {
  return [
    "# How to run it",
    "",
    "```premise-run",
    "kind: command",
    ...lines,
    "command: node dist/count.mjs <file>",
    "sample: node dist/count.mjs sample.txt",
    "```",
    "",
  ].join("\n");
}

const WITH_BUILD = runMd(["build: node build.mjs"]);
const WITHOUT_BUILD = runMd([]);
const FAILING_BUILD = runMd([
  "build: node build.mjs",
  "build: node -e \"console.error('gyp ERR! no compiler found'); process.exit(1)\"",
]);

/**
 * The demo's builder, writing the given run.md. `runFor` picks it from the request: a fix after
 * the start failed carries premise's start output as its evidence.
 */
function builder(runFor: (request: AgentRequest) => string): ScriptBehaviour {
  return (request, call) => {
    const copy = request.workingCopy!;
    const task = taskOf(request);
    writeFiles(copy, task.fix ? COUNT_DEMO.fixed() : COUNT_DEMO.build(task.number));
    writeFiles(copy, { "build.mjs": BUILD_SCRIPT, "premise/run.md": runFor(request) });
    commitAll(copy, task.fix ? "Fix" : task.title, task.items.length ? task.items : ["W-2"]);
    call("task_finish", { status: "done" });
  };
}

/** A checker like the one in the first real run: it never confirms run.md as the runner uses it. */
const judgeIgnoringRunMd: ScriptBehaviour = (request, call) =>
  scriptedJudge(request, (tool, args) =>
    call(tool, tool === "verdict_submit" ? { ...args, findings: [] } : args),
  );

function script(build: ScriptBehaviour, judge?: ScriptBehaviour): AgentScript {
  return {
    rules: [
      { when: { task: "build" }, behave: build, end: { outcome: "done" } },
      ...(judge
        ? [
            {
              when: { task: "check" as const, purpose: "check" },
              behave: judge,
              end: { outcome: "done" as const },
            },
          ]
        : []),
      ...demoScript(COUNT_DEMO).rules,
    ],
  };
}

function operatorWith(answers: Record<string, string>): (ask: AskView) => OperatorAnswer {
  const base = demoOperator(COUNT_DEMO);
  return (ask) => {
    const said = Object.entries(answers).find(([title]) => ask.title.startsWith(title));
    return said ? { kind: "text", text: said[1] } : base(ask);
  };
}

async function run(options: { script: AgentScript; operator?: (ask: AskView) => OperatorAnswer }) {
  const { range } = await uniquePortRange(20);
  return runDemo("cli", {
    dataFolder: tempFolder(),
    confinement: "none",
    portRange: range,
    ...options,
  });
}

const fixBriefs: string[] = [];

describe("the Run step builds first (decision 0280)", () => {
  it("starts a tool whose sample needs a build step, by running run.md's build lines first", async () => {
    const result = await run({ script: script(builder(() => WITH_BUILD)) });
    expect(result.stage).toBe("intake");
    expect(result.run.state).toBe("finished");
    expect(result.run.output.join("\n")).toContain("lines: 2");
    expect(result.said.join("\n")).not.toContain("would not start");
    expect(result.report.headline).toMatch(/^Works:/);
  }, 90_000);

  it("holds at Run when the start fails, sends it back to Build once by itself, and runs the fix", async () => {
    fixBriefs.length = 0;
    const build = builder((request) => {
      if (request.context?.purpose === "fix") fixBriefs.push(request.brief);
      return String(request.context?.evidence ?? "").includes("would not start")
        ? WITH_BUILD
        : WITHOUT_BUILD;
    });
    const result = await run({ script: script(build, judgeIgnoringRunMd) });
    const said = result.said.join("\n");
    // The first start fails: dist/count.mjs does not exist without the build.
    const failedAt = said.indexOf("Built and checked, but it would not start.");
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(said).toContain("It goes back to Build by itself");
    // No milestone is announced, and nobody is asked, before the fix runs.
    const reachedAt = said.indexOf(" reached: commit");
    expect(reachedAt).toBeGreaterThan(failedAt);
    expect(result.answered.map((a) => a.title)).not.toContain(
      "Built and checked, but it would not start",
    );
    // The builder got premise's own start output as the evidence.
    const brief = fixBriefs.find((b) => b.includes("would not start"));
    expect(brief).toBeDefined();
    expect(brief).toContain('each "build:" line in order');
    expect(brief).toMatch(/dist\/count\.mjs/);
    // Fixed by the send-back: it runs, and the report says it works.
    expect(result.stage).toBe("intake");
    expect(result.run.state).toBe("finished");
    expect(result.report.headline).toMatch(/^Works:/);
    expect(result.stages.filter((s) => s === "run").length).toBeGreaterThanOrEqual(2);
  }, 90_000);

  it("asks the person after the one automatic send-back when the build keeps failing, and never says it works", async () => {
    const result = await run({
      script: script(
        builder(() => FAILING_BUILD),
        judgeIgnoringRunMd,
      ),
      operator: operatorWith({
        "Built and checked, but it would not start": "Leave it not running",
      }),
    });
    const said = result.said.join("\n");
    expect(said.split("It goes back to Build by itself").length - 1).toBe(1);
    const ask = result.answered.find(
      (a) => a.title === "Built and checked, but it would not start",
    );
    expect(ask?.answer).toBe("Leave it not running");
    expect(result.run.state).toBe("failed");
    expect(result.run.plain).toContain("gyp ERR! no compiler found");
    // The report: not "Works", and the last lines of output are under "Failed or not checked".
    expect(result.report.headline).not.toMatch(/^Works/);
    expect(result.report.headline).toContain("would not start");
    const failed = result.report.sections.find((s) => s.title === "Failed or not checked")!;
    expect(failed.lines[0]!.text).toContain("Built and checked, but it would not start");
    expect(failed.lines[0]!.text).toContain("gyp ERR! no compiler found");
    expect(said).toContain("leave it not running");
  }, 120_000);

  it.skipIf(!bubblewrapWorks())(
    "does not send a fault of the machine back to Build: it asks the person at once (decision 0310)",
    async () => {
      fixBriefs.length = 0;
      const build = builder((request) => {
        if (request.context?.purpose === "fix") fixBriefs.push(request.brief);
        return WITH_BUILD;
      });
      const result = await runDemoOnBrokenNames(script(build, judgeIgnoringRunMd));
      const said = result.said.join("\n");
      expect(said).toContain("cannot look up names inside premise's sandbox");
      expect(said).not.toContain("It goes back to Build by itself");
      expect(fixBriefs.filter((b) => b.includes("would not start"))).toEqual([]);
      const ask = result.answered.find(
        (a) => a.title === "Built and checked, but it would not start",
      );
      expect(ask?.answer).toBe("Leave it not running");
      expect(result.run.state).toBe("failed");
    },
    120_000,
  );
});

async function runDemoOnBrokenNames(agentScript: AgentScript) {
  const { range } = await uniquePortRange(20);
  return runDemo("cli", {
    dataFolder: tempFolder(),
    confinement: "bubblewrap",
    portRange: range,
    env: { PREMISE_RUNNER__NAME_CHECK_HOST: '"nothing.invalid"' },
    script: agentScript,
    operator: operatorWith({
      "Built and checked, but it would not start": "Leave it not running",
    }),
  });
}
