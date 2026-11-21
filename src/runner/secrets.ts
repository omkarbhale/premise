import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Each software's secrets file (decision 0120): written by a person, by hand, in premise's data
 * folder, outside every working copy. premise never takes a secret's value through the page and
 * never stores one in its database; the runner copies the file into the run copy.
 */
export function secretsFile(dataFolder: string, softwareId: string): string {
  return join(dataFolder, "secrets", `${softwareId}.env`);
}

/**
 * Whether the file has a line `KEY=` with a value after it. Only the key and whether a value is
 * there are looked at; the value is never read out or kept.
 */
export function secretWritten(file: string, key: string): boolean {
  if (!existsSync(file)) return false;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  return lines.some((line) => {
    const at = line.indexOf("=");
    if (at < 0) return false;
    const name = line
      .slice(0, at)
      .replace(/^\s*export\s+/, "")
      .trim();
    return name === key && line.slice(at + 1).trim().length > 0;
  });
}
