import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NO_NETWORK_PLACEHOLDER,
  claudeArguments,
  deniedPaths,
  mcpConfig,
  pathRule,
  sessionEnvironment,
  sessionSettings,
} from "../src/agents/claude-settings.js";
import { accessFor } from "../src/agents/roles.js";
import { tempFolder } from "./helpers.js";

function layout() {
  const data = tempFolder();
  const home = tempFolder();
  writeFileSync(join(data, "premise.db"), "");
  writeFileSync(join(data, "config.json"), "{}");
  mkdirSync(join(data, "transcripts"));
  mkdirSync(join(data, "scenarios", "s1"), { recursive: true });
  const own = join(data, "work", "s1", "job-2");
  const sibling = join(data, "work", "s1", "job-1");
  const other = join(data, "work", "s2", "job-3");
  for (const folder of [own, sibling, other]) mkdirSync(folder, { recursive: true });
  return { data, home, own, sibling, other };
}

describe("session confinement", () => {
  it("denies premise's data, other sessions and credentials, never the session's own folder", () => {
    const { data, home, own, sibling, other } = layout();
    const denied = deniedPaths({
      workingCopy: own,
      dataFolder: data,
      home,
      access: accessFor("build"),
      allowedDomains: [],
      claudeConfigFolder: "/somewhere/claude-config",
      extraDeniedPaths: ["/secrets"],
    });
    expect(denied).toEqual(
      expect.arrayContaining([
        join(data, "premise.db"),
        join(data, "config.json"),
        join(data, "transcripts"),
        join(data, "scenarios"),
        sibling,
        join(data, "work", "s2"),
        join(home, ".ssh"),
        join(home, ".config", "gh"),
        join(home, ".claude"),
        "/somewhere/claude-config",
        "/secrets",
      ]),
    );
    // Deny rules beat allow rules: no parent of the session's own folder may be denied.
    for (const path of [own, join(data, "work"), join(data, "work", "s1"), data]) {
      expect(denied).not.toContain(path);
    }
    expect(denied).not.toContain(other); // covered by its software's folder
  });

  it("lets a builder write and run commands in its working copy only, and reach the registries", () => {
    const { data, home, own, sibling } = layout();
    const settings = sessionSettings({
      workingCopy: own,
      dataFolder: data,
      home,
      access: accessFor("build"),
      allowedDomains: ["registry.npmjs.org"],
      claudeConfigFolder: null,
      extraDeniedPaths: [],
    });
    expect(settings.sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      network: { allowedDomains: ["registry.npmjs.org"] },
    });
    expect(settings.sandbox.filesystem.denyRead).toContain(sibling);
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining([
        "Bash",
        "mcp__premise",
        `Read(/${own}/**)`,
        `Edit(/${own}/**)`,
        `Write(/${own}/**)`,
      ]),
    );
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining([
        `Read(/${sibling}/**)`,
        `Write(/${sibling})`,
        "WebFetch",
        "WebSearch",
      ]),
    );
    expect(pathRule("Read", "/a/b")).toBe("Read(//a/b/**)");
  });

  it("gives a planner read-only access, no shell and no network", () => {
    const { data, home, own } = layout();
    const settings = sessionSettings({
      workingCopy: own,
      dataFolder: data,
      home,
      access: accessFor("plan"),
      allowedDomains: ["registry.npmjs.org"],
      claudeConfigFolder: null,
      extraDeniedPaths: [],
    });
    expect(settings.permissions.allow).not.toContain("Bash");
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining(["Bash", `Edit(/${own}/**)`, `Write(/${own}/**)`]),
    );
    expect(settings.sandbox.network.allowedDomains).toEqual([NO_NETWORK_PLACEHOLDER]);
  });

  it("gives the researcher web search and fetch, and no shell", () => {
    const { data, home, own } = layout();
    const settings = sessionSettings({
      workingCopy: own,
      dataFolder: data,
      home,
      access: accessFor("research"),
      allowedDomains: [],
      claudeConfigFolder: null,
      extraDeniedPaths: [],
    });
    expect(settings.permissions.allow).toEqual(expect.arrayContaining(["WebFetch", "WebSearch"]));
    expect(settings.permissions.deny).not.toContain("WebFetch");
    expect(accessFor("research").builtInTools).toEqual(["WebSearch", "WebFetch"]);
  });

  it("connects the session to premise's tools with its own token", () => {
    expect(mcpConfig("http://127.0.0.1:4610/mcp", "tok")).toEqual({
      mcpServers: {
        premise: {
          type: "http",
          url: "http://127.0.0.1:4610/mcp",
          headers: { Authorization: "Bearer tok" },
        },
      },
    });
  });
});

describe("the claude command line", () => {
  const base = {
    prompt: "Write a tiny program",
    model: "opus",
    effort: "medium" as const,
    settingsFile: "/d/settings.json",
    mcpConfigFile: "/d/mcp.json",
    instructions: "You are the builder.",
    builtInTools: ["Bash", "Read"],
  };

  it("asks for streamed JSON, denies permission prompts and reads only its own settings", () => {
    const args = claudeArguments({ ...base, sessionId: "abc" });
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(after("-p")).toBe("Write a tiny program");
    expect(after("--output-format")).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(after("--model")).toBe("opus");
    expect(after("--effort")).toBe("medium");
    expect(after("--permission-mode")).toBe("dontAsk");
    expect(after("--permission-prompts")).toBe("none");
    expect(after("--settings")).toBe("/d/settings.json");
    expect(after("--setting-sources")).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(after("--mcp-config")).toBe("/d/mcp.json");
    expect(after("--tools")).toBe("Bash,Read");
    expect(after("--append-system-prompt")).toBe("You are the builder.");
    expect(after("--session-id")).toBe("abc");
    expect(args).not.toContain("--resume");
  });

  it("carries a cut-off session on with --resume", () => {
    const args = claudeArguments({ ...base, sessionId: "new", resumeSessionId: "old" });
    expect(args[args.indexOf("--resume") + 1]).toBe("old");
    expect(args).not.toContain("--session-id");
  });

  it("builds the environment from nothing: no API key reaches the agent", () => {
    const env = sessionEnvironment(
      {
        PATH: "/usr/bin",
        HOME: "/home/x",
        ANTHROPIC_API_KEY: "secret",
        ANTHROPIC_AUTH_TOKEN: "secret",
        CLAUDE_CODE_USE_BEDROCK: "1",
        GH_TOKEN: "secret",
        TERM: "xterm",
      },
      null,
    );
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/x", TERM: "dumb" });
    expect(sessionEnvironment({}, "/cfg").CLAUDE_CONFIG_DIR).toBe("/cfg");
  });
});
