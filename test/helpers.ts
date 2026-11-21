import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { loadConfig } from "../src/config/load.js";
import type { PremiseConfig } from "../src/config/settings.js";

const folders: string[] = [];

/** A fresh, empty folder removed after the test. */
export function tempFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "premise-test-"));
  folders.push(folder);
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function testConfig(dataFolder: string, env: NodeJS.ProcessEnv = {}): PremiseConfig {
  return loadConfig({ dataFolder, env });
}
