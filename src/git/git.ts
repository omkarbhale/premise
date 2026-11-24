import { execFile, execFileSync, spawnSync } from "node:child_process";
import { devNull } from "node:os";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Everything premise does with git goes through this one small module (record keeper spec 3).
 * It runs the git program with an argument list (never a shell), ignores the machine's own git
 * settings and hooks, and never forces anything: no force push, no history rewriting.
 */
export type GitErrorCode =
  "GIT_FAILED" | "NOTHING_TO_COMMIT" | "MERGE_CONFLICT" | "PUSH_REFUSED" | "NOT_ALLOWED";

export class GitError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    readonly files: string[] = [],
  ) {
    super(message);
    this.name = "GitError";
  }
}

/**
 * A cheap token that changes whenever a repository's HEAD moves, read from git's own files
 * without running git, so callers can keep what they read from HEAD until it changes. Undefined
 * when it cannot be told this way (a linked working copy, or files git has not written yet);
 * then the caller reads afresh.
 */
export function headToken(cwd: string): string | undefined {
  try {
    const gitFolder = join(cwd, ".git");
    if (!statSync(gitFolder).isDirectory()) return undefined;
    const head = readFileSync(join(gitFolder, "HEAD"), "utf8").trim();
    let ref = "";
    if (head.startsWith("ref: ")) {
      const loose = join(gitFolder, head.slice(5));
      if (existsSync(loose)) ref = readFileSync(loose, "utf8").trim();
    }
    const packedFile = join(gitFolder, "packed-refs");
    const packed = existsSync(packedFile) ? statSync(packedFile) : undefined;
    return `${head}|${ref}|${packed ? `${packed.mtimeMs}:${packed.size}` : ""}`;
  } catch {
    return undefined;
  }
}

/** The commit HEAD is on, read from a plain repository's loose files; undefined when not found so. */
function headCommitFromFiles(cwd: string): string | undefined {
  try {
    const gitFolder = join(cwd, ".git");
    const head = readFileSync(join(gitFolder, "HEAD"), "utf8").trim();
    const sha = head.startsWith("ref: ")
      ? readFileSync(join(gitFolder, head.slice(5)), "utf8").trim()
      : head;
    return /^[0-9a-f]{40,64}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

export interface GitIdentity {
  name: string;
  email: string;
}

export interface CommitInfo {
  sha: string;
  parents: string[];
  date: string;
  subject: string;
  /** The whole message, subject included. */
  message: string;
}

export interface CommitOptions {
  /** First line of the message. */
  subject: string;
  /** Optional longer text under the subject. */
  body?: string;
  /** Trailer lines, in order, written as `Name: value` at the end of the message. */
  trailers?: [string, string][];
  /** Add every change in the working copy first (the default), or commit only what is staged. */
  addAll?: boolean;
}

/** Build a commit message: subject, optional body, and trailers in their own last paragraph. */
export function buildCommitMessage(options: CommitOptions): string {
  const parts = [options.subject.trim()];
  if (options.body && options.body.trim().length > 0) parts.push(options.body.trim());
  if (options.trailers && options.trailers.length > 0) {
    parts.push(options.trailers.map(([name, value]) => `${name}: ${value}`).join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

const FIELD = "\u001f";
const RECORD = "\u001e";

export class Git {
  constructor(
    readonly identity: GitIdentity,
    readonly defaultBranch = "main",
  ) {}

  private environment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith("GIT_")) env[key] = value;
    }
    return {
      ...env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: devNull,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: this.identity.name,
      GIT_AUTHOR_EMAIL: this.identity.email,
      GIT_COMMITTER_NAME: this.identity.name,
      GIT_COMMITTER_EMAIL: this.identity.email,
    };
  }

  /** Run git in a folder and return what it printed. */
  run(cwd: string, args: string[], timeoutMs?: number): string {
    try {
      return execFileSync(
        "git",
        ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=" + devNull, ...args],
        {
          cwd,
          env: this.environment(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 64 * 1024 * 1024,
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
        },
      );
    } catch (error) {
      const failure = error as {
        stderr?: string;
        stdout?: string;
        message: string;
        killed?: boolean;
        code?: string;
      };
      if (timeoutMs && (failure.killed || failure.code === "ETIMEDOUT")) {
        throw new GitError(
          "GIT_FAILED",
          `git ${args[0] ?? ""} took longer than ${Math.max(1, Math.round(timeoutMs / 60_000))} minute(s) and was stopped`,
        );
      }
      const said = (failure.stderr || failure.stdout || failure.message).toString().trim();
      throw new GitError("GIT_FAILED", `git ${args[0] ?? ""} failed: ${said}`);
    }
  }

  private tryRun(cwd: string, args: string[]): string | undefined {
    try {
      return this.run(cwd, args);
    } catch {
      return undefined;
    }
  }

  /** Create a new repository, with no commits, on the default branch. */
  init(path: string, options: { bare?: boolean } = {}): void {
    if (existsSync(path) && existsSync(`${path}/.git`)) {
      throw new GitError("NOT_ALLOWED", `${path} already holds a repository.`);
    }
    mkdirSync(path, { recursive: true });
    this.run(path, [
      "init",
      "--quiet",
      "--initial-branch",
      this.defaultBranch,
      ...(options.bare ? ["--bare"] : []),
    ]);
  }

  /** A working copy of a repository, for one job's own use. */
  clone(source: string, destination: string, options: { branch?: string } = {}): void {
    mkdirSync(dirname(destination), { recursive: true });
    this.run(dirname(destination), [
      "clone",
      "--quiet",
      ...(options.branch ? ["--branch", options.branch] : []),
      source,
      destination,
    ]);
  }

  addRemote(cwd: string, name: string, url: string): void {
    this.run(cwd, ["remote", "add", name, url]);
  }

  remoteUrl(cwd: string, name: string): string | undefined {
    return this.tryRun(cwd, ["remote", "get-url", name])?.trim();
  }

  currentBranch(cwd: string): string {
    return this.run(cwd, ["symbolic-ref", "--short", "HEAD"]).trim();
  }

  headCommit(cwd: string): string | undefined {
    return this.tryRun(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"])?.trim();
  }

  /**
   * Whether HEAD is on a commit. Read from git's own files when it can be, without running git:
   * the page asks this for every software on every reload.
   */
  hasCommit(cwd: string): boolean {
    return headCommitFromFiles(cwd) !== undefined || this.headCommit(cwd) !== undefined;
  }

  /** Start a branch at the current commit and switch to it. */
  createBranch(cwd: string, name: string): void {
    this.run(cwd, ["checkout", "--quiet", "-b", name]);
  }

  switchBranch(cwd: string, name: string): void {
    this.run(cwd, ["checkout", "--quiet", name]);
  }

  /** True when nothing in the working copy differs from the last commit. */
  isClean(cwd: string): boolean {
    return this.run(cwd, ["status", "--porcelain"]).trim().length === 0;
  }

  /** Commit the working copy with the given message and trailers. Returns the new commit. */
  commit(cwd: string, options: CommitOptions): string {
    if (options.addAll !== false) this.run(cwd, ["add", "--all"]);
    const staged = this.run(cwd, ["diff", "--cached", "--name-only"]).trim();
    if (staged.length === 0) {
      throw new GitError("NOTHING_TO_COMMIT", "There is nothing to commit: no file has changed.");
    }
    this.run(cwd, ["commit", "--quiet", "--message", buildCommitMessage(options)]);
    return this.headCommit(cwd)!;
  }

  /**
   * Merge a branch into the current one, always with a merge commit that carries `options`.
   * On a conflict the merge is undone and the conflicting files are named.
   */
  merge(cwd: string, branch: string, options: CommitOptions): string {
    try {
      this.run(cwd, [
        "merge",
        "--quiet",
        "--no-ff",
        "--message",
        buildCommitMessage(options),
        branch,
      ]);
    } catch (error) {
      const files = (this.tryRun(cwd, ["diff", "--name-only", "--diff-filter=U"]) ?? "")
        .split("\n")
        .filter((f) => f.length > 0);
      this.tryRun(cwd, ["merge", "--abort"]);
      if (files.length > 0) {
        throw new GitError(
          "MERGE_CONFLICT",
          `Merging ${branch} changed the same lines as the current branch in: ${files.join(", ")}. Nothing was merged.`,
          files,
        );
      }
      throw error;
    }
    return this.headCommit(cwd)!;
  }

  /** Whether `ancestor` is `commit` or one of its ancestors. */
  isAncestor(cwd: string, ancestor: string, commit: string): boolean {
    return this.tryRun(cwd, ["merge-base", "--is-ancestor", ancestor, commit]) !== undefined;
  }

  /** The newest commit both have, or undefined when they share none. */
  mergeBase(cwd: string, a: string, b: string): string | undefined {
    return this.tryRun(cwd, ["merge-base", a, b])?.trim() || undefined;
  }

  /** The files that differ between two commits. */
  changedFiles(cwd: string, from: string, to: string): string[] {
    return this.run(cwd, ["diff", "--name-only", from, to])
      .split("\n")
      .filter((f) => f.length > 0);
  }

  /**
   * Merge two commits without touching any working folder: the merged tree, or the files both
   * changed in ways that conflict. Nothing is written but git objects.
   */
  mergeTree(cwd: string, ours: string, theirs: string): { tree: string } | { conflicts: string[] } {
    const result = spawnSync(
      "git",
      [
        "-c",
        "core.hooksPath=" + devNull,
        "merge-tree",
        "--write-tree",
        "--name-only",
        "--no-messages",
        ours,
        theirs,
      ],
      { cwd, env: this.environment(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const lines = (result.stdout ?? "").split("\n").filter((l) => l.length > 0);
    if (result.status === 0 && lines[0]) return { tree: lines[0] };
    if (result.status === 1 && lines.length > 0) return { conflicts: lines.slice(1) };
    throw new GitError(
      "GIT_FAILED",
      `git merge-tree failed: ${(result.stderr || result.stdout || "no output").toString().trim()}`,
    );
  }

  /** Make a commit from a tree and its parents, without touching any working folder. */
  commitTree(
    cwd: string,
    tree: string,
    parents: readonly string[],
    options: CommitOptions,
  ): string {
    return this.run(cwd, [
      "commit-tree",
      tree,
      ...parents.flatMap((p) => ["-p", p]),
      "-m",
      buildCommitMessage(options),
    ]).trim();
  }

  /** Move a branch from the commit it is on now to a new one; refused when it moved meanwhile. */
  moveBranch(cwd: string, branch: string, to: string, from: string): void {
    this.run(cwd, ["update-ref", `refs/heads/${branch}`, to, from]);
  }

  /** The commit a branch or other name points at. */
  resolve(cwd: string, name: string): string | undefined {
    return this.tryRun(cwd, ["rev-parse", "--verify", "--quiet", `${name}^{commit}`])?.trim();
  }

  /** Make sure the remote's latest is known locally. Returns false when the remote has no such branch. */
  fetch(cwd: string, remote: string, branch: string, timeoutMs?: number): boolean {
    const out = this.run(
      cwd,
      ["ls-remote", "--heads", remote, `refs/heads/${branch}`],
      timeoutMs,
    ).trim();
    if (out.length === 0) return false;
    this.run(
      cwd,
      ["fetch", "--quiet", remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`],
      timeoutMs,
    );
    return true;
  }

  /** Push a branch. Never forced: a remote that has moved on refuses, and premise says so. */
  push(cwd: string, remote: string, branch: string, timeoutMs?: number): void {
    if (branch.startsWith("+") || remote.startsWith("-") || branch.startsWith("-")) {
      throw new GitError("NOT_ALLOWED", "premise never forces a push.");
    }
    try {
      this.run(
        cwd,
        ["push", "--quiet", remote, `refs/heads/${branch}:refs/heads/${branch}`],
        timeoutMs,
      );
    } catch (error) {
      throw new GitError(
        "PUSH_REFUSED",
        `The remote did not accept ${branch}: ${(error as Error).message}. Bring the remote's changes in (merge) and push again; premise never forces a push.`,
      );
    }
  }

  /**
   * Push a branch without holding up the server while it goes over the network, within a time
   * limit. Never forced: a remote that has something premise does not refuses, and premise says so.
   */
  pushAsync(cwd: string, remote: string, branch: string, timeoutMs: number): Promise<void> {
    if (branch.startsWith("+") || remote.startsWith("-") || branch.startsWith("-")) {
      return Promise.reject(new GitError("NOT_ALLOWED", "premise never forces a push."));
    }
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        [
          "-c",
          "core.hooksPath=" + devNull,
          "push",
          "--quiet",
          remote,
          `refs/heads/${branch}:refs/heads/${branch}`,
        ],
        { cwd, env: this.environment(), encoding: "utf8", timeout: timeoutMs },
        (error, stdout, stderr) => {
          if (!error) return resolve();
          const killed = (error as { killed?: boolean }).killed === true;
          const said = killed
            ? `it took longer than ${Math.round(timeoutMs / 60_000)} minute(s) and was stopped`
            : (stderr || stdout || error.message).toString().trim().split("\n").slice(-3).join(" ");
          reject(new GitError("PUSH_REFUSED", said));
        },
      );
    });
  }

  /** The commits on HEAD that a remote branch lacks, oldest first; all of them when it has no such branch. */
  commitsToPush(cwd: string, remote: string, branch: string, timeoutMs?: number): CommitInfo[] {
    const known = this.fetch(cwd, remote, branch, timeoutMs);
    return this.log(cwd, known ? [`${remote}/${branch}..HEAD`] : ["HEAD"]).reverse();
  }

  /** Commits, newest first. `range` is anything `git log` accepts before the path. */
  log(cwd: string, range: string[] = ["HEAD"], paths: string[] = []): CommitInfo[] {
    const out = this.tryRun(cwd, [
      "log",
      `--format=%H${FIELD}%P${FIELD}%aI${FIELD}%s${FIELD}%B${RECORD}`,
      ...range,
      ...(paths.length > 0 ? ["--", ...paths] : []),
    ]);
    if (out === undefined) return [];
    return out
      .split(RECORD)
      .map((chunk) => chunk.replace(/^\n/, ""))
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => {
        const [sha, parents, date, subject, message] = chunk.split(FIELD);
        return {
          sha: sha!,
          parents: parents!.length > 0 ? parents!.split(" ") : [],
          date: date!,
          subject: subject!,
          message: message!.replace(/\n+$/, "\n"),
        };
      });
  }

  /** A file's content at a commit, or undefined when the commit has no such file. */
  readFileAt(cwd: string, revision: string, path: string): string | undefined {
    return this.tryRun(cwd, ["show", `${revision}:${path}`]);
  }

  /** The files directly inside a folder at a commit. */
  listFolderAt(cwd: string, revision: string, folder: string): string[] {
    const out = this.tryRun(cwd, ["ls-tree", "--name-only", `${revision}:${folder}`]);
    return out ? out.split("\n").filter((f) => f.length > 0) : [];
  }

  /** The commit that last changed a line of a file, as of HEAD. */
  blameLine(cwd: string, path: string, line: number): string | undefined {
    const out = this.tryRun(cwd, ["blame", "--porcelain", "-L", `${line},${line}`, "--", path]);
    return out?.split(" ")[0];
  }
}
