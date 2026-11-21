import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeAgentRunner } from "../src/agents/claude-agent.js";
import { AgentToolServer } from "../src/agents/tool-server.js";
import { openDatabase } from "../src/storage/database.js";
import { tempFolder, testConfig } from "./helpers.js";

/**
 * One tiny real Claude Code session, to prove the procedure end to end on this machine: started
 * headless, confined by the sandbox, on the cheapest model at low effort. It uses the owner's
 * Claude Code login, so it never runs in CI or by default (decision 0134): set
 * RUN_CLAUDE_SMOKE_TEST=1 to run it, on a machine with Claude Code logged in, bubblewrap and socat.
 */
const enabled = process.env.RUN_CLAUDE_SMOKE_TEST === "1";

describe.skipIf(!enabled)("one real Claude Code session (opt-in)", () => {
  it("runs a tiny task confined, on haiku at low effort, and ends done", async () => {
    const folder = tempFolder();
    const config = testConfig(folder);
    const { db } = openDatabase(folder);
    const runner = await ClaudeAgentRunner.create({
      config,
      tools: new AgentToolServer({ db, config }),
      toolsUrl: `http://127.0.0.1:${config.server.port}/mcp`,
      docsFolder: join(import.meta.dirname, "..", "docs"),
    });
    const progress: string[] = [];
    const session = runner.start(
      {
        jobId: 1,
        softwareId: "smoke",
        taskKind: "triage",
        attempt: 1,
        model: "haiku",
        effort: "low",
        maxTurns: 3,
        maxMinutes: 3,
        brief:
          "This is a test of premise's agent runner, not a real task. Do not use any tool. Reply with the single word: ready",
      },
      (p) => progress.push(p.text),
    );
    const outcome = await session.outcome;
    expect(outcome.kind, JSON.stringify(outcome)).toBe("done");
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    const transcript = readFileSync(join(folder, "transcripts", "job-1-1.jsonl"), "utf8");
    expect(transcript).toContain('"apiKeySource":"none"');
  }, 240_000);
});
