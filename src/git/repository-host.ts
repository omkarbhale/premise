import { type Git } from "./git.js";

/**
 * Where a software's repository lives besides this machine. The real implementation, GitHub,
 * is not available yet: it will go through the gate (docs/specs/gate.md) and is not built.
 * Until then the only host premise can reach is a local bare repository, which is what the
 * tests use (decision 0141).
 */
export interface RepositoryRequest {
  softwareId: string;
  /** The repository's name, from the software's name. */
  name: string;
  visibility: "private" | "public";
}

export interface CreatedRepository {
  /** What `git remote add` takes. */
  url: string;
}

export interface RepositoryHost {
  createRepository(request: RepositoryRequest): Promise<CreatedRepository>;
}

export class RepositoryHostError extends Error {
  constructor(
    readonly code: "NOT_AVAILABLE" | "WAITING" | "REFUSED",
    message: string,
  ) {
    super(message);
    this.name = "RepositoryHostError";
  }
}

/** What the gate answers. The gate itself is another module; this is the small seam premise needs from it. */
export interface GateSeam {
  request(request: {
    softwareId: string;
    kind:
      | "make-public"
      | "publish"
      | "post"
      | "credentials"
      | "expose"
      | "access"
      | "spend"
      | "write-repository";
    what: string;
    why: string;
  }): Promise<{ status: "approved" | "asked" | "refused" }>;
}

/** Why premise cannot create a GitHub repository yet, in the words a person reads. */
export function githubNotAvailable(name: string): string {
  return `premise cannot create the GitHub repository ${name} yet: that step is not built, because the owner has not yet allowed premise to create repositories on GitHub. Nothing was created on GitHub; the software's repository stays on this machine, and nothing is lost.`;
}

/**
 * Creating the software's repository on GitHub. It is built to ask the gate before it acts, and
 * the act itself is not built yet (decision 0161), so this always ends in NOT_AVAILABLE (or
 * WAITING, while the gate's question is open) and never calls GitHub.
 */
export class GitHubRepositoryHost implements RepositoryHost {
  constructor(private readonly gate?: GateSeam) {}

  async createRepository(request: RepositoryRequest): Promise<CreatedRepository> {
    if (this.gate && request.visibility === "public") {
      const answer = await this.gate.request({
        softwareId: request.softwareId,
        kind: "make-public",
        what: `Create a public GitHub repository named ${request.name}.`,
        why: "The software's code and its record would be visible to everyone.",
      });
      if (answer.status === "refused") {
        throw new RepositoryHostError("REFUSED", "You said no to making the repository public.");
      }
      if (answer.status === "asked") {
        throw new RepositoryHostError(
          "WAITING",
          `Waiting for your answer before making the repository ${request.name} public. Nothing has been created yet.`,
        );
      }
    }
    throw new RepositoryHostError("NOT_AVAILABLE", githubNotAvailable(request.name));
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
