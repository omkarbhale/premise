import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, envNameFor, loadConfig, resolveDataFolder } from "../src/config/load.js";
import { configurationReference } from "../src/config/reference.js";
import { tempFolder } from "./helpers.js";

function problemsOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems;
  }
  throw new Error("expected a ConfigError");
}

describe("configuration", () => {
  it("has a default for every setting", () => {
    const config = loadConfig({ dataFolder: tempFolder() });
    expect(config.queue.max_agent_sessions).toBe(2);
    expect(config.agents.mode).toBe("scripted");
    expect(config.agents.claude_config_folder).toBeNull();
    expect(config.agents.tasks.build).toEqual({
      model: "opus",
      effort: "medium",
      max_turns: 200,
      max_minutes: 60,
    });
    expect(config.agents.tasks.triage.model).toBe("sonnet");
    expect(config.usage_ledger.mode).toBe("mock-fixed");
    expect(config.softwares.default_priority).toBe(3);
    expect(config.softwares.default_milestone_waits).toBe(false);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.record).toEqual({
      folder: "premise",
      trailer: "Premise-Trace",
      default_branch: "main",
      commit_author_name: "premise",
      commit_author_email: "premise@localhost",
    });
  });

  it("refuses a record folder or trailer name that cannot be used", () => {
    const problems = problemsOf(() =>
      loadConfig({
        dataFolder: tempFolder(),
        env: { PREMISE_RECORD__FOLDER: "../x", PREMISE_RECORD__TRAILER: "bad trailer" },
      }),
    );
    expect(problems.map((p) => p.key).sort()).toEqual(["record.folder", "record.trailer"]);
  });

  it("reads config.json in the data folder, and environment variables win over it", () => {
    const folder = tempFolder();
    writeFileSync(
      join(folder, "config.json"),
      JSON.stringify({
        queue: { max_agent_sessions: 4 },
        agents: { tasks: { build: { effort: "high" } } },
      }),
    );
    const config = loadConfig({
      dataFolder: folder,
      env: {
        PREMISE_QUEUE__MAX_AGENT_SESSIONS: "6",
        PREMISE_AGENTS__TASKS__REPORT__MODEL: "haiku",
      },
    });
    expect(config.queue.max_agent_sessions).toBe(6);
    expect(config.agents.tasks.build.effort).toBe("high");
    expect(config.agents.tasks.report.model).toBe("haiku");
    expect(config.data.folder).toBe(folder);
  });

  it("names the setting, where it came from and why it is wrong", () => {
    const folder = tempFolder();
    writeFileSync(
      join(folder, "config.json"),
      JSON.stringify({ queue: { max_agent_sessions: 40 } }),
    );
    const problems = problemsOf(() => loadConfig({ dataFolder: folder }));
    expect(problems).toHaveLength(1);
    expect(problems[0]!.key).toBe("queue.max_agent_sessions");
    expect(problems[0]!.source).toContain("config.json");
    expect(problems[0]!.message).toBe("must be a whole number from 1 to 16; it is 40");
  });

  it("reports every wrong setting at once, in plain words", () => {
    const error = (() => {
      try {
        loadConfig({
          dataFolder: tempFolder(),
          env: { PREMISE_AGENTS__MODE: "robot", PREMISE_QUEUE__SPEED: "9" },
        });
      } catch (e) {
        return e as ConfigError;
      }
    })()!;
    expect(error.message).toContain("premise cannot start: 2 settings are wrong.");
    expect(error.message).toContain(
      'agents.mode (environment variable PREMISE_AGENTS__MODE): must be one of "scripted", "claude"',
    );
    expect(error.message).toContain(
      "PREMISE_QUEUE__SPEED (environment): is not a setting premise knows",
    );
  });

  it("refuses unknown keys in the file, so a typo is not silently ignored", () => {
    const folder = tempFolder();
    writeFileSync(join(folder, "config.json"), JSON.stringify({ queue: { max_agent_session: 3 } }));
    expect(problemsOf(() => loadConfig({ dataFolder: folder }))[0]!.key).toBe(
      "queue.max_agent_session",
    );
  });

  it("refuses the real usage-ledger, which is not built yet", () => {
    const problems = problemsOf(() =>
      loadConfig({ dataFolder: tempFolder(), env: { PREMISE_USAGE_LEDGER__MODE: "real" } }),
    );
    expect(problems[0]!.message).toContain("cannot talk to a real usage-ledger yet");
  });

  it("listens on this machine only", () => {
    const problems = problemsOf(() =>
      loadConfig({ dataFolder: tempFolder(), env: { PREMISE_SERVER__HOST: "0.0.0.0" } }),
    );
    expect(problems[0]!.message).toContain("Reaching premise from other machines is off");
  });

  it("says when config.json is not JSON", () => {
    const folder = tempFolder();
    writeFileSync(join(folder, "config.json"), "{ queue: ");
    expect(problemsOf(() => loadConfig({ dataFolder: folder }))[0]!.message).toContain(
      "is not valid JSON",
    );
  });

  it("finds the data folder from the flag, then the environment, then the home folder", () => {
    expect(resolveDataFolder({ flag: "/a", env: { PREMISE_DATA_FOLDER: "/b" }, home: "/h" })).toBe(
      "/a",
    );
    expect(resolveDataFolder({ env: { PREMISE_DATA_FOLDER: "/b" }, home: "/h" })).toBe("/b");
    expect(resolveDataFolder({ env: {}, home: "/h" })).toBe("/h/.premise");
  });

  it("maps keys to environment variable names", () => {
    expect(envNameFor("queue.max_agent_sessions")).toBe("PREMISE_QUEUE__MAX_AGENT_SESSIONS");
  });

  it("keeps docs/reference/configuration.md in step with the code", () => {
    const doc = readFileSync(
      join(import.meta.dirname, "..", "docs", "reference", "configuration.md"),
      "utf8",
    );
    expect(doc, "run `npm run docs:config` to regenerate the reference").toBe(
      configurationReference(),
    );
  });
});
