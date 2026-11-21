import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import { ScriptedAgentRunner, loadScriptFile, parseScript } from "../src/agents/scripted-agent.js";
import { tempFolder } from "./helpers.js";

const request = (over: Partial<AgentRequest> = {}): AgentRequest => ({
  jobId: 7,
  softwareId: "s",
  taskKind: "build",
  attempt: 1,
  model: "opus",
  effort: "medium",
  maxTurns: 10,
  maxMinutes: 1,
  brief: "Write a tiny program",
  ...over,
});

describe("scripted agent", () => {
  it("ends done at once when no rule matches", async () => {
    const session = new ScriptedAgentRunner().start(request(), () => {});
    expect(session.sessionId).toBe("scripted-7-1");
    expect(await session.outcome).toEqual({ kind: "done", summary: "Scripted build finished." });
  });

  it("follows the first matching rule, with its progress lines", async () => {
    const runner = new ScriptedAgentRunner(
      parseScript({
        rules: [
          { when: { task: "check" }, end: { outcome: "stuck" } },
          {
            when: { task: "build", brief_contains: "tiny" },
            progress: ["Writing", "Testing"],
            end: { outcome: "failed", failure: "tests-fail", summary: "Two tests fail" },
          },
        ],
      }),
    );
    const progress: string[] = [];
    const outcome = await runner.start(request(), (p) => progress.push(p.text)).outcome;
    expect(progress).toEqual(["Writing", "Testing"]);
    expect(outcome).toEqual({
      kind: "failed",
      summary: "Two tests fail",
      failureSignature: "tests-fail",
    });
  });

  it("can be stopped while it hangs", async () => {
    const runner = new ScriptedAgentRunner(parseScript({ rules: [{ end: { outcome: "hang" } }] }));
    const session = runner.start(request(), () => {});
    session.stop();
    expect(await session.outcome).toEqual({ kind: "stopped" });
  });

  it("says plainly what is wrong with a script", () => {
    expect(() => parseScript({})).toThrow('it must be a JSON object with a "rules" list');
    expect(() =>
      parseScript({ rules: [{ when: { task: "dance" }, end: { outcome: "done" } }] }),
    ).toThrow('rule 1 names task "dance"');
    expect(() => parseScript({ rules: [{ end: { outcome: "failed" } }] })).toThrow(
      "must name the failure",
    );
  });

  it("reads a script file", () => {
    const file = join(tempFolder(), "script.json");
    writeFileSync(file, JSON.stringify({ rules: [{ end: { outcome: "done", summary: "ok" } }] }));
    expect(loadScriptFile(file).rules).toHaveLength(1);
    expect(() => loadScriptFile(join(tempFolder(), "missing.json"))).toThrow(
      "cannot read its script",
    );
  });
});
