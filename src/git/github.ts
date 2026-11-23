import { execFile } from "node:child_process";

/**
 * The GitHub command line, as the server uses it (decision 0077): only the server runs it, with the
 * login already on this machine, so premise holds no GitHub secret of its own and agents never see
 * one. Tests put a fake `gh` first on the PATH (test/fixtures/fake-gh); nothing here is ever run
 * against GitHub by a test.
 */

/** Whether premise can act on GitHub now, and if not, what to do about it, in plain words. */
export type GitHubLogin =
  { ready: true; login: string } | { ready: false; problem: string; fix: string };

export class GitHubCliError extends Error {
  constructor(
    readonly code: "NAME_TAKEN" | "NOT_READY" | "FAILED",
    message: string,
  ) {
    super(message);
    this.name = "GitHubCliError";
  }
}

export interface GitHubCliOptions {
  /** The program to run; "gh" on the PATH by default. */
  command?: string;
  /** The environment it runs in; read at each call, so a test can change it between calls. */
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

interface Ran {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** The program is not on this machine at all. */
  missing: boolean;
}

/** What `gh` says when there is no such repository. */
const NO_SUCH_REPOSITORY = /could not resolve to a repository|not found|http 404/i;
/** What `gh` says when the name is already used on the account. */
const NAME_IN_USE = /name already exists|already exists on this account/i;

export const GITHUB_CLI_MISSING: { problem: string; fix: string } = {
  problem: "The GitHub CLI (the gh program) is not installed on this machine.",
  fix: "Install it from https://cli.github.com, then run `gh auth login` in a terminal and log in to your GitHub account.",
};

export const GITHUB_CLI_LOGGED_OUT: { problem: string; fix: string } = {
  problem: "The GitHub CLI is installed but not logged in to a GitHub account.",
  fix: "Run `gh auth login` in a terminal and log in to your GitHub account.",
};

export class GitHubCli {
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: GitHubCliOptions = {}) {
    this.command = options.command ?? "gh";
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  private run(args: string[]): Promise<Ran> {
    return new Promise((resolve) => {
      execFile(
        this.command,
        args,
        {
          env: { ...(this.options.env ?? process.env), GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
          timeout: this.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const missing = (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
          const killed = (error as { killed?: boolean } | null)?.killed === true;
          resolve({
            ok: !error,
            stdout: String(stdout ?? ""),
            stderr: killed
              ? `the GitHub CLI took longer than ${Math.round(this.timeoutMs / 1000)} seconds and was stopped`
              : String(stderr ?? "") || (error ? error.message : ""),
            missing,
          });
        },
      );
    });
  }

  /** Who the GitHub CLI is logged in as, or what is in the way. */
  async login(): Promise<GitHubLogin> {
    const ran = await this.run(["api", "user", "--jq", ".login"]);
    if (ran.missing) return { ready: false, ...GITHUB_CLI_MISSING };
    const login = ran.stdout.trim();
    if (ran.ok && login) return { ready: true, login };
    if (/auth login|not logged|authenticat|401|bad credentials/i.test(ran.stderr)) {
      return { ready: false, ...GITHUB_CLI_LOGGED_OUT };
    }
    return {
      ready: false,
      problem: `The GitHub CLI could not reach your GitHub account: ${lastLine(ran.stderr)}.`,
      fix: "Check that this machine is online and that `gh auth status` says you are logged in, then try again.",
    };
  }

  /** Whether `owner/name` exists (and the login can see it). */
  async exists(fullName: string): Promise<boolean> {
    const ran = await this.run(["repo", "view", fullName, "--json", "name"]);
    if (ran.ok) return true;
    if (ran.missing) throw new GitHubCliError("NOT_READY", GITHUB_CLI_MISSING.problem);
    if (NO_SUCH_REPOSITORY.test(ran.stderr)) return false;
    throw new GitHubCliError(
      "FAILED",
      `premise could not tell whether ${fullName} exists on GitHub: ${lastLine(ran.stderr)}`,
    );
  }

  /**
   * Create an empty repository on the logged-in account and return its address. Never adopts one
   * that exists: a name in use is NAME_TAKEN, and nothing on GitHub is changed.
   */
  async create(
    owner: string,
    name: string,
    visibility: "private" | "public",
    description: string,
  ): Promise<{ url: string }> {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name.startsWith("-")) {
      throw new GitHubCliError("FAILED", `${name} is not a name GitHub takes for a repository.`);
    }
    const ran = await this.run([
      "repo",
      "create",
      name,
      `--${visibility}`,
      "--description",
      description,
    ]);
    if (ran.missing) throw new GitHubCliError("NOT_READY", GITHUB_CLI_MISSING.problem);
    if (!ran.ok) {
      if (NAME_IN_USE.test(ran.stderr)) {
        throw new GitHubCliError("NAME_TAKEN", `${owner}/${name} already exists.`);
      }
      throw new GitHubCliError("FAILED", lastLine(ran.stderr));
    }
    const view = await this.run([
      "repo",
      "view",
      `${owner}/${name}`,
      "--json",
      "url",
      "--jq",
      ".url",
    ]);
    const url = view.stdout.trim() || ran.stdout.trim().split("\n").at(-1)?.trim() || "";
    if (!url) {
      throw new GitHubCliError(
        "FAILED",
        `GitHub created ${owner}/${name} but did not say its address.`,
      );
    }
    return { url };
  }
}

function lastLine(text: string): string {
  return (
    text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.$/, "") ?? "it gave no reason"
  );
}
