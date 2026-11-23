import { type Git } from "./git.js";
import { GitHubCli, GitHubCliError } from "./github.js";

/**
 * Where a software's repository lives besides this machine. Two hosts: GitHub, through the GitHub
 * CLI login already on this machine (decision 0077), and a local bare repository, which the tests
 * use and which works without GitHub (decision 0141). Creating one is a floor action: the line
 * engine asks the gate first, and only the server, never an agent, calls a host.
 */
export interface RepositoryRequest {
  softwareId: string;
  /** The repository's name, from the software's name or the one the operator chose. */
  name: string;
  visibility: "private" | "public";
  /** A one-line description to give it, where the host keeps one. */
  description?: string;
}

export interface CreatedRepository {
  /** What `git remote add` takes. */
  url: string;
  /** Where a person looks at it, when that differs from nothing at all. */
  link?: string;
  /** "owner/name" on GitHub. */
  fullName?: string;
}

export interface RepositoryHost {
  createRepository(request: RepositoryRequest): Promise<CreatedRepository>;
}

export class RepositoryHostError extends Error {
  constructor(
    readonly code: "NOT_READY" | "NAME_TAKEN" | "FAILED",
    message: string,
    /** For NAME_TAKEN: the taken "owner/name", and a free name premise suggests instead. */
    readonly taken?: { fullName: string; suggestion: string | null },
  ) {
    super(message);
    this.name = "RepositoryHostError";
  }
}

/** A GitHub repository name from what a person typed, or null when GitHub would not take it. */
export function validRepositoryName(text: string): string | null {
  const name = text.trim().replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name.startsWith("-") || /^\.+$/.test(name)) {
    return null;
  }
  return name;
}

/**
 * Creating the software's repository on the GitHub account the GitHub CLI is logged in to. A name
 * already used there is never adopted, overwritten or deleted: it is NAME_TAKEN, with a free name
 * to suggest. Nothing is pushed here; the caller pushes once the remote is added.
 */
export class GitHubRepositoryHost implements RepositoryHost {
  constructor(private readonly cli: GitHubCli = new GitHubCli()) {}

  async createRepository(request: RepositoryRequest): Promise<CreatedRepository> {
    const login = await this.cli.login();
    if (!login.ready) {
      throw new RepositoryHostError("NOT_READY", `${login.problem} ${login.fix}`);
    }
    const owner = login.login;
    const fullName = `${owner}/${request.name}`;
    try {
      if (await this.cli.exists(fullName)) throw new GitHubCliError("NAME_TAKEN", fullName);
      const created = await this.cli.create(
        owner,
        request.name,
        request.visibility,
        request.description ?? "",
      );
      return { url: created.url, link: created.url, fullName };
    } catch (error) {
      if (!(error instanceof GitHubCliError)) throw error;
      if (error.code === "NAME_TAKEN") {
        throw new RepositoryHostError(
          "NAME_TAKEN",
          `A repository named ${request.name} already exists on your GitHub account (${fullName}).`,
          { fullName, suggestion: await this.freeName(owner, request.name) },
        );
      }
      throw new RepositoryHostError(
        error.code === "NOT_READY" ? "NOT_READY" : "FAILED",
        error.message,
      );
    }
  }

  /** A name like the taken one that is free on the account, or null when none of a few is. */
  private async freeName(owner: string, name: string): Promise<string | null> {
    const base = name.replace(/-\d+$/, "");
    for (let n = 2; n <= 6; n++) {
      const candidate = `${base}-${n}`.slice(0, 100);
      try {
        if (!(await this.cli.exists(`${owner}/${candidate}`))) return candidate;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** A local bare repository standing in for the remote, for tests and for working without GitHub. */
export class LocalRepositoryHost implements RepositoryHost {
  constructor(
    private readonly git: Git,
    private readonly folder: string,
  ) {}

  async createRepository(request: RepositoryRequest): Promise<CreatedRepository> {
    const safe =
      request.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "software";
    const path = `${this.folder}/${safe}.git`;
    this.git.init(path, { bare: true });
    return { url: path };
  }
}
