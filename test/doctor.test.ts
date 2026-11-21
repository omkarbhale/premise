import { describe, expect, it } from "vitest";
import { type CommandRunner, formatDoctorReport, runDoctor } from "../src/doctor/doctor.js";
import { tempFolder } from "./helpers.js";

function machine(present: string[]): CommandRunner {
  return (command) => Promise.resolve({ ok: present.includes(command), output: `${command} 1.0` });
}

const everything = ["git", "claude", "gh", "bwrap", "socat"];

describe("setup check", () => {
  it("passes on a machine with everything", async () => {
    const report = await runDoctor({
      dataFolder: tempFolder(),
      env: {},
      nodeVersion: "v24.1.0",
      platform: "linux",
      run: machine(everything),
    });
    expect(report.checks.every((c) => c.status === "ok")).toBe(true);
    expect(report.canStart).toBe(true);
    expect(formatDoctorReport(report)).toContain("Everything premise needs to start is here.");
  });

  it("starts with scripted agents when Claude Code and the sandbox tools are missing, and says how to get them", async () => {
    const report = await runDoctor({
      dataFolder: tempFolder(),
      env: {},
      nodeVersion: "v24.1.0",
      platform: "linux",
      run: machine(["git"]),
    });
    expect(report.canStart).toBe(true);
    expect(report.canRunRealAgents).toBe(false);
    const socat = report.checks.find((c) => c.name === "socat")!;
    expect(socat.status).toBe("warn");
    expect(socat.fix).toContain("sudo apt install socat");
  });

  it("marks the sandbox tools missing when real agents are wanted", async () => {
    const report = await runDoctor({
      dataFolder: tempFolder(),
      env: { PREMISE_AGENTS__MODE: "claude" },
      nodeVersion: "v24.1.0",
      platform: "linux",
      run: machine(["git", "claude", "gh"]),
    });
    expect(report.checks.find((c) => c.name === "bubblewrap")!.status).toBe("missing");
    expect(report.canRunRealAgents).toBe(false);
    expect(formatDoctorReport(report)).toContain("real agents will not run");
  });

  it("cannot start with an old Node.js, without git, or with wrong settings", async () => {
    const report = await runDoctor({
      dataFolder: tempFolder(),
      env: { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "0" },
      nodeVersion: "v20.11.0",
      platform: "darwin",
      run: machine([]),
    });
    expect(report.canStart).toBe(false);
    const byName = Object.fromEntries(report.checks.map((c) => [c.name, c]));
    expect(byName["Node.js"]!.status).toBe("missing");
    expect(byName["git"]!.fix).toContain("git-scm.com");
    expect(byName["Settings"]!.detail).toContain("queue.max_agent_sessions");
    expect(byName["Sandbox tools"]!.detail).toBe("not needed on darwin");
  });

  it("notices an API key in the environment", async () => {
    const report = await runDoctor({
      dataFolder: tempFolder(),
      env: { ANTHROPIC_API_KEY: "x" },
      nodeVersion: "v24.1.0",
      platform: "linux",
      run: machine(everything),
    });
    expect(report.checks.find((c) => c.name === "API key")!.status).toBe("warn");
  });
});
