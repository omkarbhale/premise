import { type Git } from "./git.js";

/**
 * Where a software's repository lives besides this machine. The real implementation, GitHub,
 * is not approved yet: it will go through the gate (docs/specs/gate.md) and is not built.
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
    readonly code: "NOT_YET_APPROVED" | "REFUSED",
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
    kind: "make-public" | "publish" | "post" | "credentials" | "expose" | "access" | "spend";
    what: string;
    why: string;
  }): Promise<{ status: "approved" | "asked" | "refused" }>;
}

/**
 * Creating the software's repository on GitHub. It is built to ask the gate before it acts, and
 * the act itself is not approved yet, so this always ends in NOT_YET_APPROVED and never calls GitHub.
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
    }
    throw new RepositoryHostError(
      "NOT_YET_APPROVED",
      `premise cannot create the GitHub repository ${request.name} yet: that step has not been approved. The software's repository stays on this machine, and nothing is lost.`,
    );
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
