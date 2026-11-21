import { execFile } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { homedir, devNull } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { promisify } from "node:util";
import type { SourceKind } from "./store.js";

const exec = promisify(execFile);

/**
 * Where an existing software comes from, and the two things premise ever does with it (decision
 * 0189): copy it into premise's own data folder, and, once the operator approves through the gate,
 * push premise's record branch to it. premise never writes in the operator's working folder: a copy
 * only reads it, and the push goes to a branch of its own, never one that is checked out there.
 *
 * Both use the owner's own git setup, as cloning for agents does (decision 0086), so a private
 * repository the owner can reach is reachable here; git is never allowed to stop and ask for a
 * password, and no hooks run.
 */

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export interface Source {
  /** As given, trimmed. */
  given: string;
  kind: SourceKind;
  /** What git is given: an absolute folder path or the address. */
  location: string;
}

const ADDRESS = /^(https?|ssh|git|file):\/\/\S+$/i;
const SCP_LIKE = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+$/;

/**
 * Work out what the operator pointed at: a folder on this machine or a clone address. Says plainly
 * what is wrong and what to give instead. `dataFolder` is premise's own, which is never a source.
 */
export function readSource(raw: string, dataFolder: string): Source {
  const given = (raw ?? "").trim();
  if (!given) {
    throw new SourceError(
      "Say where the software is: a folder on this computer (such as /home/you/projects/notes) or a clone address (such as https://github.com/you/notes.git).",
    );
  }
  if (given.length > 2000) throw new SourceError("That is too long to be a folder or an address.");
  if (given.startsWith("-") || /[\n\r\0]/.test(given)) {
    throw new SourceError("That does not look like a folder or a clone address.");
  }
  if (ADDRESS.test(given) || SCP_LIKE.test(given)) {
    return { given, kind: "address", location: given };
  }
  const expanded = given === "~" ? homedir() : given.replace(/^~(?=\/)/, homedir());
  if (!isAbsolute(expanded)) {
    throw new SourceError(
      `premise could not tell where "${given}" is. Give the full path of the folder, starting with / (or ~/ for your home folder), or a clone address such as https://github.com/you/notes.git.`,
    );
  }
  const folder = resolve(expanded);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new SourceError(`There is no folder at ${folder}. Check the path and try again.`);
  }
  const data = resolve(dataFolder);
  if (folder === data || folder.startsWith(`${data}/`) || data.startsWith(`${folder}/`)) {
    throw new SourceError(
      "That folder holds premise's own data. Point at the software's own folder instead.",
    );
  }
  const bare = ["HEAD", "objects", "refs"].every((p) => existsSync(join(folder, p)));
  if (!existsSync(join(folder, ".git")) && !bare) {
    throw new SourceError(
      `${folder} is not a git repository, so premise cannot read its history or keep its own copy. If it is yours, run "git init" there and commit the files, then try again; or give the folder that holds the .git folder.`,
    );
  }
  return { given, kind: "folder", location: folder };
}

function environment(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS: "" };
}

async function git(cwd: string, args: string[], timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-c", `core.hooksPath=${devNull}`, ...args], {
      cwd,
      env: environment(),
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: string; killed?: boolean; message: string };
    if (failure.killed) {
      throw new SourceError(
        `git took longer than ${Math.round(timeoutMs / 60_000)} minutes and was stopped.`,
      );
    }
    const said = (failure.stderr || failure.message).toString().trim().split("\n").slice(-3);
    throw new SourceError(said.join(" "));
  }
}

export interface CopyResult {
  branch: string;
  commit: string;
  commits: number;
}

/**
 * Copy the software into `destination` (premise's own repository for it). The copy keeps the
 * whole history; the operator's repository is its remote "source". A copy cut off part-way is
 * removed first, so this can simply be run again after premise restarts.
 */
export async function copySource(
  source: Source,
  destination: string,
  options: { timeoutMinutes: number; recordFolder: string },
): Promise<CopyResult> {
  const timeout = options.timeoutMinutes * 60_000;
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  try {
    await git(
      dirname(destination),
      [
        "clone",
        "--quiet",
        "--no-hardlinks",
        "--origin",
        "source",
        "--",
        source.location,
        destination,
      ],
      timeout,
    );
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw new SourceError(
      `premise could not copy it: ${(error as Error).message} Check that ${source.kind === "folder" ? "the folder is a git repository you can read" : "the address is right and that git on this computer can reach it (try it with git clone in a terminal)"}, then try again.`,
    );
  }
  const head = (
    await git(destination, ["rev-parse", "--verify", "--quiet", "HEAD"], timeout).catch(() => "")
  ).trim();
  if (!head) {
    rmSync(destination, { recursive: true, force: true });
    throw new SourceError(
      "The repository has no commits yet, so there is nothing to take on. Commit the code first, then try again; or start it as a new software instead.",
    );
  }
  const tracked = (
    await git(destination, ["ls-files", "--", options.recordFolder], timeout)
  ).trim();
  if (tracked) {
    rmSync(destination, { recursive: true, force: true });
    throw new SourceError(
      `The repository already has a ${options.recordFolder}/ folder, so it looks like premise has taken it on before, or something else uses that name. premise does not take over an existing ${options.recordFolder}/ folder yet: rename or remove it, commit, and try again.`,
    );
  }
  const branch = (await git(destination, ["symbolic-ref", "--short", "HEAD"], timeout)).trim();
  const commits = Number((await git(destination, ["rev-list", "--count", "HEAD"], timeout)).trim());
  return { branch, commit: head, commits };
}

/**
 * Push premise's record branch to the operator's repository: the branch `branch` there gets the
 * software's history with premise's record commits on top. Never forced; a branch that has moved on
 * there, or that is checked out in the operator's folder, refuses, and premise says so.
 */
export async function pushRecordBranch(
  repository: string,
  branch: string,
  options: { timeoutMinutes: number },
): Promise<void> {
  if (branch.startsWith("-") || branch.startsWith("+") || branch.includes("..")) {
    throw new SourceError("premise never forces a push, and that branch name is not allowed.");
  }
  try {
    await git(
      repository,
      ["push", "--quiet", "source", `HEAD:refs/heads/${branch}`],
      options.timeoutMinutes * 60_000,
    );
  } catch (error) {
    const said = (error as Error).message;
    if (/checked out|current branch/i.test(said)) {
      throw new SourceError(
        `the branch ${branch} is checked out in your folder, so git would not change it. Switch that folder to another branch, then ask premise again.`,
      );
    }
    if (/non-fast-forward|fetch first|rejected/i.test(said)) {
      throw new SourceError(
        `the branch ${branch} in your repository has commits premise does not have. premise never overwrites them. Merge or rename that branch, then ask premise again.`,
      );
    }
    throw new SourceError(said);
  }
}

/** A name for a software from where it is: the folder's or repository's last part, readable. */
export function nameFromSource(given: string): string {
  const last =
    given
      .replace(/[/\\]+$/, "")
      .replace(/\.git$/i, "")
      .split(/[/:\\]/)
      .filter(Boolean)
      .at(-1) ?? "";
  const words = last
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Existing software";
}
