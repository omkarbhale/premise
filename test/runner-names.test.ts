import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bubblewrapWorks } from "../src/demo/demos.js";
import {
  confine,
  finalLinkTarget,
  linkTargetsOutside,
  readOnlyBinds,
} from "../src/runner/confinement.js";
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

describe("a read-only path that is a link (the owner's WSL2 run)", () => {
  /** A bound folder holding a link to a program in a folder outside it, like /usr/local/bin -> /opt. */
  function linkedProgram() {
    const root = tempFolder();
    const bin = join(root, "usr", "local", "bin");
    const opt = join(root, "opt", "browser");
    mkdirSync(bin, { recursive: true });
    mkdirSync(opt, { recursive: true });
    writeFileSync(join(opt, "browser"), "#!/bin/sh\necho browser-ran\n", { mode: 0o755 });
    writeFileSync(join(opt, "browser-data.pak"), "x");
    symlinkSync(join(opt, "browser"), join(bin, "browser"));
    return { root, bin, opt, link: join(bin, "browser") };
  }

  it("binds the link's target folder, never the link inside a bound folder", () => {
    const { root, opt, link } = linkedProgram();
    const args = readOnlyBinds([link], [join(root, "usr")]);
    expect(args).toEqual(["--ro-bind", opt, opt]);
  });

  it("recreates a link that is not inside a bound folder", () => {
    const { opt, link } = linkedProgram();
    const args = readOnlyBinds([link], []);
    expect(args).toEqual(["--ro-bind", opt, opt, "--symlink", join(opt, "browser"), link]);
  });

  it("does not bind a plain path again inside a bound folder, nor a link that points nowhere", () => {
    const { root, bin } = linkedProgram();
    const dangling = join(bin, "gone");
    symlinkSync(join(root, "nowhere"), dangling);
    expect(readOnlyBinds([bin, dangling], [join(root, "usr")])).toEqual([]);
    expect(readOnlyBinds([bin], [])).toEqual(["--ro-bind", bin, bin]);
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
    // The sandbox reads this machine's resolv.conf (bound when it is a link), so the link is not blamed.
    expect((error as RunnerError).message).toContain("the host name nothing.invalid was not found");
    expect((error as RunnerError).message).not.toContain("cannot read");
    expect(Date.now() - started).toBeLessThan(60_000);
    // The build step never ran.
    expect(runner.view(software.id).output.join("\n")).not.toContain("$ touch built-marker");
    db.close();
  }, 90_000);

  it("says the sandbox did not start, not that names failed, when bubblewrap itself fails", async () => {
    const dataFolder = tempFolder();
    const config = testConfig(dataFolder, {
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
    });
    const { db } = openDatabase(dataFolder);
    runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
    });
    const check = vi
      .spyOn(Runner.prototype as unknown as { runConfinedCheck: () => unknown }, "runConfinedCheck")
      .mockResolvedValue({
        code: 1,
        output: "bwrap: Can't create file at /usr/local/bin/browser: No such file or directory\n",
      });
    const software = makeSoftware(db, config, "Sandbox fails", {
      "premise/run.md": runBlock(["kind: command", "build: true", "command: true", "sample: true"]),
    });
    const error = (await runner.start(software.id).catch((e: unknown) => e)) as RunnerError;
    check.mockRestore();
    expect(error).toBeInstanceOf(RunnerError);
    expect(error.code).toBe("MACHINE_FAULT");
    expect(error.message).toContain("premise could not start its sandbox");
    expect(error.message).toContain("bwrap: Can't create file at /usr/local/bin/browser");
    expect(error.message).not.toContain("Names cannot be looked up");
    expect(error.message).not.toContain("resolv.conf");
    db.close();
  });

  it("blames a resolv.conf link only after the sandbox could not read it", async () => {
    const dataFolder = tempFolder();
    const config = testConfig(dataFolder, {
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
    });
    const { db } = openDatabase(dataFolder);
    runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
    });
    const check = vi
      .spyOn(Runner.prototype as unknown as { runConfinedCheck: () => unknown }, "runConfinedCheck")
      .mockResolvedValueOnce({ code: 2, output: "" })
      .mockResolvedValueOnce({ code: 1, output: "" });
    const software = makeSoftware(db, config, "Link unreadable", {
      "premise/run.md": runBlock(["kind: command", "build: true", "command: true", "sample: true"]),
    });
    const error = (await runner.start(software.id).catch((e: unknown) => e)) as RunnerError;
    check.mockRestore();
    expect(error.code).toBe("MACHINE_FAULT");
    const target = finalLinkTarget("/etc/resolv.conf");
    expect(error.message).toContain(
      target === null
        ? "was not found there"
        : `/etc/resolv.conf points to ${target}, which premise's sandbox cannot read`,
    );
    db.close();
  });

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

  it("runs a provided program that is a link from a bound folder to a folder outside it", async () => {
    // Like /usr/local/bin/chrome-headless-shell -> /opt/chrome-headless-shell/chrome-headless-shell.
    mkdirSync(join(process.cwd(), "test-artifacts"), { recursive: true });
    const home = mkdtempSync(join(process.cwd(), "test-artifacts", "linked-"));
    homes.push(home);
    const bin = join(home, "local", "bin");
    const opt = join(home, "opt", "browser");
    mkdirSync(bin, { recursive: true });
    mkdirSync(opt, { recursive: true });
    writeFileSync(join(opt, "data.pak"), "browser-data");
    writeFileSync(join(opt, "browser"), `#!/bin/sh\ncat ${opt}/data.pak; echo\n`, { mode: 0o755 });
    symlinkSync(join(opt, "browser"), join(bin, "browser"));
    const dataFolder = tempFolder();
    const config = testConfig(dataFolder, {
      PREMISE_RUNNER__CONFINEMENT: '"bubblewrap"',
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath)), bin]),
      PREMISE_RUNNER__EXTRA_TOOL_PATHS: JSON.stringify([join(bin, "browser")]),
      PREMISE_RUNNER__NAME_CHECK_HOST: '"localhost"',
    });
    const { db } = openDatabase(dataFolder);
    runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => join(dataFolder, "repos", id) },
    });
    const software = makeSoftware(db, config, "Uses a linked tool", {
      "premise/run.md": runBlock([
        "kind: command",
        "build: browser > built.txt",
        "command: cat built.txt",
        "sample: cat built.txt",
      ]),
    });
    const view = await runner.start(software.id);
    expect(view.output.join("\n")).toContain("browser-data");
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
