import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bubblewrapWorks } from "../src/demo/demos.js";
import { confine, linkTargetsOutside } from "../src/runner/confinement.js";
import { Runner, RunnerError } from "../src/runner/runner.js";
import { providedToolPaths, withProvidedTools } from "../src/runner/provided-tools.js";
import { openDatabase, recordEvent } from "../src/storage/database.js";
import { makeSoftware, runBlock } from "./fixtures/fixture-software.js";
import { tempFolder, testConfig } from "./helpers.js";

/**
 * Name lookup inside the runner's sandbox, from the owner's real run on WSL2: /etc/resolv.conf is a
 * link to /mnt/wsl/resolv.conf, which the sandbox did not bind, so every host name failed and the
 * build ran past its time limit (decision 0310).
 */

/** An /etc-like folder whose resolv.conf is a link to a file outside it, and a certificate store. */
function fixture() {
  const root = tempFolder();
  const etc = join(root, "etc");
  const outside = join(root, "mnt", "wsl");
  mkdirSync(etc, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "resolv.conf"), "nameserver 10.0.0.1\n");
  symlinkSync(join(outside, "resolv.conf"), join(etc, "resolv.conf"));
  writeFileSync(join(etc, "hosts"), "127.0.0.1 localhost\n");
  mkdirSync(join(etc, "ssl", "certs"), { recursive: true });
  mkdirSync(join(root, "share", "certs"), { recursive: true });
  writeFileSync(join(root, "share", "certs", "a.pem"), "x");
  symlinkSync(join(root, "share", "certs", "a.pem"), join(etc, "ssl", "certs", "a.pem"));
  return { root, etc, outside };
}

describe("binding what the network's links point to", () => {
  it("binds the real file a link in the system folders points outside them to", () => {
    const { root, etc, outside } = fixture();
    const targets = linkTargetsOutside([join(etc, "resolv.conf"), join(etc, "hosts")], [etc]);
    expect(targets).toEqual([join(outside, "resolv.conf")]);
    const command = confine({
      mode: "bubblewrap",
      copy: root,
      shellCommand: "true",
      network: true,
      readOnlyPaths: [],
      networkPaths: [join(etc, "resolv.conf"), join(etc, "hosts"), join(etc, "ssl")],
    });
    const real = join(outside, "resolv.conf");
    const at = command.args.findIndex((a, i) => a === "--ro-bind" && command.args[i + 1] === real);
    expect(at).toBeGreaterThan(-1);
    expect(command.args[at + 2]).toBe(real);
    // The certificate store's link is followed too, and the folder that holds it is not bound whole.
    const cert = join(root, "share", "certs", "a.pem");
    expect(command.args).toContain(cert);
    expect(command.args).not.toContain(outside);
    expect(command.args).not.toContain(join(root, "mnt"));
  });

  it("leaves out a target already inside a bound folder, and never binds a whole mount", () => {
    const { etc, root } = fixture();
    expect(linkTargetsOutside([join(etc, "resolv.conf")], [join(root, "mnt")])).toEqual([]);
    const top = join(etc, "root-link");
    symlinkSync("/", top);
    expect(linkTargetsOutside([top], [])).toEqual([]);
  });

  it("does nothing for a path that is not there", () => {
    expect(linkTargetsOutside([join(tempFolder(), "nothing")], [])).toEqual([]);
  });
});

describe.skipIf(!bubblewrapWorks())("the early check that names resolve in the sandbox", () => {
  let runner: Runner | undefined;
  afterEach(async () => {
    await runner?.close();
  });

  it("stops before the build with a plain machine-fault message", async () => {
    const dataFolder = tempFolder();
    const config = testConfig(dataFolder, {
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
      PREMISE_RUNNER__NAME_CHECK_HOST: '"nothing.invalid"',
      PREMISE_RUNNER__BUILD_TIMEOUT_SECONDS: "600",
    });
    const { db } = openDatabase(dataFolder);
    runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
    });
    const software = makeSoftware(db, config, "Needs names", {
      "premise/run.md": runBlock([
        "kind: command",
        "build: touch built-marker",
        "command: true",
        "sample: true",
      ]),
    });
    const started = Date.now();
    const error = await runner.start(software.id).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RunnerError);
    expect((error as RunnerError).code).toBe("MACHINE_FAULT");
    expect((error as RunnerError).message).toContain(
      "Names cannot be looked up inside premise's sandbox on this machine",
    );
    expect(Date.now() - started).toBeLessThan(60_000);
    // The build step never ran.
    expect(runner.view(software.id).output.join("\n")).not.toContain("$ touch built-marker");
    db.close();
  }, 90_000);

  it("looks the host up with a program the sandbox has", () => {
    const command = confine({
      mode: "bubblewrap",
      copy: tempFolder(),
      shellCommand: "getent hosts localhost",
      network: true,
      readOnlyPaths: [],
    });
    expect(() => execFileSync(command.file, command.args, { stdio: "ignore" })).not.toThrow();
  });
});

describe.skipIf(!bubblewrapWorks())("programs the person provided (decision 0310)", () => {
  let runner: Runner | undefined;
  const homes: string[] = [];
  afterEach(async () => {
    await runner?.close();
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
  });

  it("shows a provided program in a fake home folder to the build step, and nothing else of the home", async () => {
    // Not under /tmp: the sandbox puts its own empty /tmp over anything bound there.
    mkdirSync(join(process.cwd(), "test-artifacts"), { recursive: true });
    const home = mkdtempSync(join(process.cwd(), "test-artifacts", "home-"));
    homes.push(home);
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const tool = join(home, ".local", "bin", "provided-tool");
    writeFileSync(tool, "#!/bin/sh\necho provided-tool-ran\n", { mode: 0o755 });
    writeFileSync(join(home, "secret.txt"), "private");
    const dataFolder = tempFolder();
    const config = testConfig(dataFolder, {
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
      PREMISE_RUNNER__EXTRA_TOOL_PATHS: JSON.stringify([tool]),
      PREMISE_RUNNER__NAME_CHECK_HOST: '""',
    });
    const { db } = openDatabase(dataFolder);
    runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
    });
    const software = makeSoftware(db, config, "Uses a tool", {
      "premise/run.md": runBlock([
        "kind: command",
        "build: provided-tool > built.txt",
        `command: cat built.txt; ls ${home}/.local/bin; test -e ${home}/secret.txt || echo no-secret`,
        `sample: cat built.txt; ls ${home}/.local/bin; test -e ${home}/secret.txt || echo no-secret`,
      ]),
    });
    const view = await runner.start(software.id);
    const output = view.output.join("\n");
    expect(output).toContain("provided-tool-ran");
    expect(output).toContain("no-secret");
    db.close();
  }, 60_000);

  it("lists the same programs for the runner and the agents: the setting, and what the person said they installed", () => {
    const dataFolder = tempFolder();
    const config = testConfig(dataFolder, {});
    const { db } = openDatabase(dataFolder);
    const tool = join(tempFolder(), "godot");
    writeFileSync(tool, "x", { mode: 0o755 });
    recordEvent(db, {
      softwareId: "s1",
      module: "line",
      kind: "tool-installed",
      reference: "godot",
      detail: { tool: "godot", path: tool },
    });
    expect(providedToolPaths(db, config, "s1")).toEqual([tool]);
    expect(providedToolPaths(db, config, "other")).toEqual([]);
    expect(withProvidedTools("/usr/bin", [tool])).toBe(`${dirname(tool)}:/usr/bin`);
    db.close();
  });
});
