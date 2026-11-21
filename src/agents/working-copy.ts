import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SANDBOX_PLACEHOLDERS } from "./claude-settings.js";
import type { WorkingCopyKind } from "./roles.js";

const exec = promisify(execFile);

/**
 * Each job's working copy, under work/<software>/<job>/ in the data folder (decision 0086).
 * premise itself clones (with the owner's git setup); the agent never holds a credential.
 */

export interface WorkingCopyRequest {
  dataFolder: string;
  softwareId: string;
  jobId: number;
  kind: WorkingCopyKind;
  repository?: string | undefined;
  ref?: string | undefined;
  /** Keep what is already there: the session carries on a cut-off one. */
  reuse: boolean;
}

export interface WorkingCopy {
  path: string;
  /** The branch made for the change, for builder jobs. */
  branch: string | null;
  /** It is a clone of the software's repository. */
  isClone: boolean;
}

/** A name safe to use as one folder. */
function folderName(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_") || "_";
}

export function workingCopyPath(dataFolder: string, softwareId: string, jobId: number): string {
  return join(dataFolder, "work", folderName(softwareId), `job-${jobId}`);
}

export function branchFor(jobId: number): string {
  return `premise/job-${jobId}`;
}

async function git(cwd: string, args: string[]): Promise<void> {
  try {
    await exec("git", args, { cwd, timeout: 10 * 60_000 });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(`git ${args[0]} failed: ${stderr || (error as Error).message}`);
  }
}

export async function prepareWorkingCopy(request: WorkingCopyRequest): Promise<WorkingCopy> {
  const path = workingCopyPath(request.dataFolder, request.softwareId, request.jobId);
  const clone = request.kind !== "scratch" && Boolean(request.repository);
  const branch = clone && request.kind === "branch" ? branchFor(request.jobId) : null;
  if (request.reuse && existsSync(path)) return { path, branch, isClone: clone };

  rmSync(path, { recursive: true, force: true });
  mkdirSync(join(path, ".."), { recursive: true });
  if (!clone) {
    mkdirSync(path, { recursive: true });
    return { path, branch: null, isClone: false };
  }
  await git(join(path, ".."), ["clone", "--quiet", "--no-hardlinks", request.repository!, path]);
  if (request.ref) await git(path, ["checkout", "--quiet", "--detach", request.ref]);
  if (branch) await git(path, ["checkout", "--quiet", "-b", branch]);
  // Commits are made inside the sandbox, where the owner's git identity is not readable.
  await git(path, ["config", "user.name", "premise agent"]);
  await git(path, ["config", "user.email", "agent@premise.invalid"]);
  // The sandbox leaves placeholder files in the working copy; keep them out of every commit.
  appendFileSync(
    join(path, ".git", "info", "exclude"),
    `\n# Placed by the agent sandbox; never part of a change.\n${SANDBOX_PLACEHOLDERS.map((p) => `/${p}`).join("\n")}\n`,
  );
  return { path, branch, isClone: true };
}

export function removeWorkingCopy(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
