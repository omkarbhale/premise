import { execFile } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  /**
   * For a builder: the exact trace trailer line, such as "Premise-Trace: W-1, D-2". A commit-msg
   * hook adds it to any commit message that names no trace, so it is hard to leave out (0192).
   */
  trace?: string;
}

/** A trailer line safe to put in a shell script: "Name: W-1, D-2", nothing else. */
const TRACE_LINE = /^[A-Za-z][A-Za-z0-9-]*: [A-Z]-[1-9]\d*(, [A-Z]-[1-9]\d*)*$/;

/**
 * Install the commit-msg hook that adds the task's trace trailer when a message names none. It runs
 * in the agent's own git, inside its confinement; the server still checks every commit (0083).
 */
export function installTraceHook(path: string, trace: string): void {
  if (!TRACE_LINE.test(trace)) return;
  const name = trace.slice(0, trace.indexOf(":"));
  const hook = join(path, ".git", "hooks", "commit-msg");
  mkdirSync(join(path, ".git", "hooks"), { recursive: true });
  writeFileSync(
    hook,
    [
      "#!/bin/sh",
      "# Placed by premise: names the record items this task serves when the message names none.",
      `grep -qi '^${name}:' "$1" && exit 0`,
      `git interpret-trailers --in-place --trailer '${trace}' "$1"`,
      "",
    ].join("\n"),
  );
  chmodSync(hook, 0o755);
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

/**
 * The folder, inside a checker's working copy, where it saves its evidence (screenshots, output,
 * logs). premise keeps it in the data folder once the session ends (decision 0089).
 */
export const EVIDENCE_FOLDER = ".premise-evidence";

/** Where premise keeps a check job's evidence after its session. */
export function evidencePath(dataFolder: string, softwareId: string, jobId: number): string {
  return join(dataFolder, "evidence", folderName(softwareId), `job-${jobId}`);
}

/** Copy the evidence a session saved in its working copy into the data folder. */
export function saveEvidence(
  dataFolder: string,
  softwareId: string,
  jobId: number,
  copy: string,
): void {
  const from = join(copy, EVIDENCE_FOLDER);
  if (!existsSync(from)) return;
  const to = evidencePath(dataFolder, softwareId, jobId);
  mkdirSync(join(to, ".."), { recursive: true });
  cpSync(from, to, { recursive: true });
}

/** Marks, inside a clone's .git folder, that premise finished setting the clone up. */
const PREPARED = "premise-prepared";

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
  // A clone is carried on only once it was fully set up: premise may have stopped part-way
  // through, leaving a copy without its branch, identity or hook, which is made again.
  const ready = clone ? existsSync(join(path, ".git", PREPARED)) : existsSync(path);
  if (request.reuse && ready) return { path, branch, isClone: clone };

  rmSync(path, { recursive: true, force: true });
  mkdirSync(join(path, ".."), { recursive: true });
  if (!clone) {
    mkdirSync(path, { recursive: true });
    return { path, branch: null, isClone: false };
  }
  await git(join(path, ".."), ["clone", "--quiet", "--no-hardlinks", request.repository!, path]);
  if (request.ref) await git(path, ["checkout", "--quiet", "--detach", request.ref]);
  if (branch) await git(path, ["checkout", "--quiet", "-b", branch]);
  if (branch && request.trace) installTraceHook(path, request.trace);
  // Commits are made inside the sandbox, where the owner's git identity is not readable.
  await git(path, ["config", "user.name", "premise agent"]);
  await git(path, ["config", "user.email", "agent@premise.invalid"]);
  // The sandbox leaves placeholder files in the working copy; keep them out of every commit.
  appendFileSync(
    join(path, ".git", "info", "exclude"),
    `\n# Placed by the agent sandbox; never part of a change.\n${SANDBOX_PLACEHOLDERS.map((p) => `/${p}`).join("\n")}\n/${EVIDENCE_FOLDER}/\n`,
  );
  // Written last: the copy is ready to carry on after a restart.
  writeFileSync(join(path, ".git", PREPARED), "");
  return { path, branch, isClone: true };
}

export function removeWorkingCopy(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
