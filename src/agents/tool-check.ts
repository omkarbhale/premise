import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { deniedPaths } from "./claude-settings.js";
import { accessFor } from "./roles.js";

/**
 * "I installed it" (decision 0300): premise checks that a program a person installed can be run by
 * its agents. Agents get premise's own PATH and run inside a sandbox that denies some folders
 * (credentials, premise's data), so the program must be on that PATH, runnable, and not in a folder
 * the sandbox denies. premise says plainly which of these failed.
 */

/** A command name as an agent names a program: no paths, no spaces. */
export const PROGRAM_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

export type ProgramCheck = { found: true; path: string } | { found: false; problem: string };

export function checkProgram(
  name: string,
  options: {
    path: string | undefined;
    dataFolder: string;
    home: string;
    claudeConfigFolder: string | null;
    extraDeniedPaths: string[];
  },
): ProgramCheck {
  if (!PROGRAM_NAME.test(name)) {
    return { found: false, problem: `"${name}" is not a program name premise can look for.` };
  }
  const folders = (options.path ?? "").split(delimiter).filter(Boolean);
  let hit: string | null = null;
  for (const folder of folders) {
    const candidate = join(folder, name);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      hit = candidate;
      break;
    } catch {
      // not here
    }
  }
  if (!hit) {
    return {
      found: false,
      problem: `premise looked for ${name} in the ${folders.length} folders agents search for programs (premise's PATH) and did not find it. Install it so that typing ${name} in a new terminal runs it, then press "I installed it" again. If it is installed somewhere else, put that folder on the PATH premise starts with, and restart premise.`,
    };
  }
  let real = hit;
  try {
    real = realpathSync(hit);
  } catch {
    // keep the path as found
  }
  const denied = deniedPaths({
    workingCopy: join(options.dataFolder, "work", "program-check"),
    dataFolder: options.dataFolder,
    home: options.home,
    access: accessFor("build"),
    allowedDomains: [],
    claudeConfigFolder: options.claudeConfigFolder,
    extraDeniedPaths: options.extraDeniedPaths,
  });
  const blocked = [hit, real].find((p) =>
    denied.some((d) => resolve(p) === d || resolve(p).startsWith(`${d}/`)),
  );
  if (blocked) {
    return {
      found: false,
      problem: `premise found ${name} at ${blocked}, but agents may not read that folder: it holds credentials or premise's own data. Install it somewhere else on the PATH, such as /usr/local/bin, then press "I installed it" again.`,
    };
  }
  return { found: true, path: hit };
}

/** A host a person may allow for one software's agents: a plain public host name. */
export function hostName(value: string): string | null {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  return host;
}
