import { describe, expect, it } from "vitest";
import type { AgentScript, ScriptBehaviour } from "../src/agents/scripted-agent.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import { type OperatorAnswer, demoOperator, demoScript, runDemo } from "../src/demo/demos.js";
import { itemsOf } from "../src/demo/scripted-work.js";
import type { AskView } from "../src/shared/api-types.js";
import { tempFolder, uniquePortRange } from "./helpers.js";

/**
 * When a check has passed, and what premise says about it (decision 0197): "passed" only when every
 * must item is met; no failure with some items unchecked lands marked not fully verified; nothing
 * verified at all is asked about once (or landed, when the setting says so); and the report's first
 * line is a plain verdict.
 */

/** A checker that marks the first item met and cannot check the rest, or none at all. */
function judge(metFirst: boolean): ScriptBehaviour {
  return (request, call) => {
    call("verdict_submit", {
      verdicts: itemsOf(request).map((item, n) =>
        metFirst && n === 0
          ? { item, verdict: "met", evidence: "Saw: words: 4" }
          : {
              item,
              verdict: "could-not-check",
              evidence: "It needs a sample file only a person can give.",
            },
      ),
    });
  };
}

function script(behave: ScriptBehaviour, watch?: (brief: string) => void): AgentScript {
  return {
    rules: [
      {
        when: { task: "check", purpose: "check" },
        behave: (request, call) => {
          watch?.(request.brief);
          return behave(request, call);
        },
        end: { outcome: "done" },
      },
      ...demoScript(COUNT_DEMO).rules,
    ],
  };
}

async function run(options: {
  script: AgentScript;
  operator?: (ask: AskView) => OperatorAnswer;
  env?: NodeJS.ProcessEnv;
}) {
  const { range } = await uniquePortRange(20);
  return runDemo("cli", {
    dataFolder: tempFolder(),
    confinement: "none",
    portRange: range,
    ...options,
    env: { PREMISE_LINE__WHEN_NOTHING_VERIFIED: "ask", ...options.env },
  });
}

describe("when a check has passed", () => {
  it("calls an all-met check passed, and the report leads with Works", async () => {
    const result = await run({ script: { rules: demoScript(COUNT_DEMO).rules } });
    expect(result.build!.checks.at(-1)!.status).toBe("passed");
    expect(result.report.headline).toMatch(/^Works: all \d+ things you asked for were checked/);
    expect(result.report.counts).toMatch(/\d+ met, 0 not met, 0 not checked/);
    // Scripted agents made the checks, and the report says what that means.
    expect(result.report.scripted).toMatch(/scripted agents, which cannot judge software/);
  }, 60_000);

  it("never calls a check with unverified must items passed: it lands, marked not fully verified", async () => {
    const result = await run({ script: script(judge(true)) });
    const said = result.said.join("\n");
    expect(result.build!.checks.at(-1)!.status).toBe("not-fully-verified");
    expect(said).not.toMatch(/The check of commit \w+ passed/);
    expect(said).toMatch(/found no failure, but \d+ of \d+ things could not be verified/);
    expect(said).toContain("It needs a sample file only a person can give.");
    // It still lands and runs, and the report says exactly what was not verified.
    expect(result.stage).toBe("intake");
    expect(result.build!.landed).not.toBeNull();
    expect(result.report.headline).toMatch(/^Partly verified: 1 of \d+ things you asked for/);
    expect(result.report.headline).toContain("what is needed to check them");
    expect(result.report.running).not.toBeNull();
    const failed = result.report.sections.find((s) => s.title === "Failed or not checked")!;
    expect(failed.lines.some((l) => l.text.startsWith("Could not be checked:"))).toBe(true);
  }, 60_000);

  it("asks once when nothing could be verified, saying why, how to try it, and the choices", async () => {
    const asked: AskView[] = [];
    const base = demoOperator(COUNT_DEMO);
    const result = await run({
      script: script(judge(false)),
      operator: (ask) => {
        if (ask.title.startsWith("Nothing could be checked")) {
          asked.push(ask);
          return { kind: "text", text: "Land it unverified" };
        }
        return base(ask);
      },
    });
    expect(asked).toHaveLength(1);
    const ask = asked[0]!;
    expect(ask.choices).toEqual(["Land it unverified", "Stop here"]);
    expect(ask.instruction).toContain("could not check any of the");
    expect(ask.instruction).toContain("It needs a sample file only a person can give.");
    expect(ask.instruction).toContain("To try it yourself:");
    expect(ask.instruction).toContain("write what the checker needs");
    expect(ask.instruction).toContain("The agents are scripted: they cannot judge software");
    expect(result.build!.checks.at(-1)!.status).toBe("not-verified");
    expect(result.said.join("\n")).toContain("You said: land it unverified.");
    // Landed and running, and the report leads with a verdict a newcomer can act on.
    expect(result.stage).toBe("intake");
    expect(result.report.headline).toMatch(
      /^Not verified: premise could not check this, so it does not know whether it works\. Try it yourself/,
    );
    expect(result.report.headline).not.toMatch(/passed/);
    expect(result.report.running).not.toBeNull();
  }, 60_000);

  it("gives the checker what the person says it needs, and checks again; stopping lands nothing", async () => {
    const briefs: string[] = [];
    let answers = 0;
    const base = demoOperator(COUNT_DEMO);
    const result = await run({
      script: script(judge(false), (brief) => briefs.push(brief)),
      operator: (ask) => {
        if (ask.title.startsWith("Nothing could be checked")) {
          answers += 1;
          return answers === 1
            ? { kind: "text", text: "Use the file sample.txt in the repository." }
            : { kind: "text", text: "Stop here" };
        }
        return base(ask);
      },
    });
    expect(answers).toBe(2);
    expect(briefs).toHaveLength(2);
    expect(briefs[1]).toContain("From the operator: Use the file sample.txt in the repository.");
    expect(result.said.join("\n")).toContain("Stopped: nothing lands");
    expect(result.build!.landed).toBeNull();
    expect(result.report.headline).not.toMatch(/^Works|passed/);
  }, 60_000);

  it("lands unverified without asking when the setting says land, and says so", async () => {
    const result = await run({
      script: script(judge(false)),
      env: { PREMISE_LINE__WHEN_NOTHING_VERIFIED: "land" },
    });
    expect(result.answered.map((a) => a.title)).not.toContain(
      "Nothing could be checked: land it anyway?",
    );
    expect(result.said.join("\n")).toContain("It lands unverified, because the settings say");
    expect(result.build!.checks.at(-1)!.status).toBe("not-verified");
    expect(result.stage).toBe("intake");
    expect(result.report.headline).toMatch(/^Not verified:/);
  }, 60_000);
});
