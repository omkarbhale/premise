import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempFolder } from "./helpers.js";

/**
 * The command line, run for real (through tsx, never starting a server): asking for help prints
 * help wherever the flag is, and a flag premise does not know is an error that starts nothing.
 */
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const CLI = join(process.cwd(), "src", "cli.ts");

function premise(...args: string[]) {
  const result = spawnSync(TSX, [CLI, ...args], { encoding: "utf8", timeout: 20_000 });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe("the command line", () => {
  it("prints help for --help or -h anywhere, and does not start or create anything", () => {
    const data = join(tempFolder(), "data");
    for (const args of [
      ["start", "--help"],
      ["start", "-h", "--data", data],
      ["--data", data, "start", "--scripted", "--help"],
      ["doctor", "--help"],
      ["demo", "cli", "--help"],
    ]) {
      const { code, out } = premise(...args);
      expect(code, args.join(" ")).toBe(0);
      expect(out, args.join(" ")).toContain("Usage:");
    }
    expect(existsSync(data)).toBe(false);
  }, 60_000);

  it("refuses a flag it does not know, and starts nothing", () => {
    const data = join(tempFolder(), "data");
    const { code, out, err } = premise("start", "--hepl", "--data", data);
    expect(code).toBe(2);
    expect(out).toBe("");
    expect(err).toContain('does not know the option "--hepl"');
    expect(err).toContain("Nothing was started");
    expect(existsSync(data)).toBe(false);
  }, 30_000);
});
