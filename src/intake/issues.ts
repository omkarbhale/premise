import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

/**
 * A software's GitHub issues as an intake source (docs/specs/intake.md 5.1, decision 0240). Intake
 * only knows this interface. Tests use the local fixture below, so nothing here reaches the
 * network in a test; the real reading, through the GitHub command line, stays unexercised until a
 * software has a GitHub repository.
 */

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  /** The GitHub name of whoever opened it, when known. */
  author: string | null;
  url: string;
}

export interface IssueSource {
  /**
   * Which GitHub repository a software's issues are in, when the source knows it (the local
   * fixture does); otherwise intake reads it from the software's remote address.
   */
  repositoryOf?(softwareId: string): GitHubRepository | null;
  /** The open issues of a repository, newest or oldest first; pull requests are not issues. */
  listOpenIssues(repository: GitHubRepository): Promise<GitHubIssue[]>;
  /** Comment on an issue. Public, in the owner's name: call only once the gate approved it. */
  comment(repository: GitHubRepository, number: number, text: string): Promise<void>;
}

export interface GitHubRepository {
  owner: string;
  name: string;
}

/** The GitHub repository a remote address points at, or null when it is not on GitHub. */
export function githubRepository(remote: string | null | undefined): GitHubRepository | null {
  if (!remote) return null;
  const match =
    /^(?:https?:\/\/|git@|ssh:\/\/git@)github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(
      remote.trim(),
    );
  return match ? { owner: match[1]!, name: match[2]! } : null;
}

export function repositoryName(repository: GitHubRepository): string {
  return `${repository.owner}/${repository.name}`;
}

/** Issues held in memory (or read from a JSON file), for tests and for working without GitHub. */
export class FixtureIssueSource implements IssueSource {
  private readonly issues = new Map<string, GitHubIssue[]>();
  readonly comments: { repository: string; number: number; text: string }[] = [];
  /** Set to make the next reading fail, as a network error would. */
  failWith: string | null = null;
  private readonly linked = new Map<string, GitHubRepository>();

  /** Say that a software's issues are in this repository, such as "owner/name". */
  link(softwareId: string, repository: string): void {
    const [owner = "", name = ""] = repository.split("/");
    this.linked.set(softwareId, { owner, name });
  }

  repositoryOf(softwareId: string): GitHubRepository | null {
    return this.linked.get(softwareId) ?? null;
  }

  /** Add an issue, as if someone had opened it. */
  open(
    repository: string,
    issue: Partial<GitHubIssue> & Pick<GitHubIssue, "number" | "title">,
  ): void {
    const list = this.issues.get(repository) ?? [];
    list.push({
      body: "",
      author: null,
      url: `https://github.com/${repository}/issues/${issue.number}`,
      ...issue,
    });
    this.issues.set(repository, list);
  }

  /** Load a fixture file: { "owner/name": [ { number, title, body, author } ] }. */
  static fromFile(path: string): FixtureIssueSource {
    const source = new FixtureIssueSource();
    const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, GitHubIssue[]>;
    for (const [repository, issues] of Object.entries(data)) {
      for (const issue of issues) source.open(repository, issue);
    }
    return source;
  }

  async listOpenIssues(repository: GitHubRepository): Promise<GitHubIssue[]> {
    if (this.failWith) throw new Error(this.failWith);
    return [...(this.issues.get(repositoryName(repository)) ?? [])];
  }

  async comment(repository: GitHubRepository, number: number, text: string): Promise<void> {
    this.comments.push({ repository: repositoryName(repository), number, text });
  }
}

const run = promisify(execFile);

/**
 * The real reading, through the GitHub command line. Not exercised by any test: it needs a
 * software with a GitHub repository, and the command line signed in.
 */
export class GhCliIssueSource implements IssueSource {
  /** `command`: the GitHub CLI program (setting github.command). */
  constructor(private readonly command = "gh") {}

  async listOpenIssues(repository: GitHubRepository): Promise<GitHubIssue[]> {
    const { stdout } = await run(
      this.command,
      [
        "issue",
        "list",
        "--repo",
        repositoryName(repository),
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,title,body,author,url",
      ],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const rows = JSON.parse(stdout) as {
      number: number;
      title: string;
      body: string;
      author?: { login?: string } | null;
      url: string;
    }[];
    return rows.map((r) => ({
      number: r.number,
      title: r.title,
      body: r.body ?? "",
      author: r.author?.login ?? null,
      url: r.url,
    }));
  }

  async comment(repository: GitHubRepository, number: number, text: string): Promise<void> {
    await run(
      this.command,
      ["issue", "comment", String(number), "--repo", repositoryName(repository), "--body", text],
      { timeout: 60_000 },
    );
  }
}
