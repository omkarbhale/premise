import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Git, GitError, buildCommitMessage } from "../src/git/git.js";
import { LocalRepositoryHost } from "../src/git/repository-host.js";
import { tempFolder } from "./helpers.js";

const git = new Git({ name: "premise", email: "premise@localhost" }, "main");

function repoWithCommit(): string {
  const repo = join(tempFolder(), "repo");
  git.init(repo);
  writeFileSync(join(repo, "a.txt"), "one\n");
  git.commit(repo, { subject: "First", trailers: [["Premise-Trace", "W-1"]] });
  return repo;
}

describe("git module", () => {
  it("builds a message with the trailer in its own last paragraph", () => {
    expect(
      buildCommitMessage({
        subject: "Add it",
        body: "Why.",
        trailers: [["Premise-Trace", "W-1, D-2"]],
      }),
    ).toBe("Add it\n\nWhy.\n\nPremise-Trace: W-1, D-2\n");
  });

  it("creates a repository on the default branch and commits with the trailer", () => {
    const repo = repoWithCommit();
    expect(git.currentBranch(repo)).toBe("main");
    const [commit] = git.log(repo);
    expect(commit!.subject).toBe("First");
    expect(commit!.message).toContain("Premise-Trace: W-1");
    expect(git.isClean(repo)).toBe(true);
  });

  it("refuses to create a repository where one exists, and to commit nothing", () => {
    const repo = repoWithCommit();
    expect(() => git.init(repo)).toThrow(GitError);
    expect(() => git.commit(repo, { subject: "Nothing" })).toThrowError(/nothing to commit/i);
  });

  it("ignores the machine's own git settings", () => {
    const repo = repoWithCommit();
    expect(git.log(repo)[0]!.message).not.toContain("Signed-off-by");
  });

  it("makes a working copy, commits on a branch, merges it with a merge commit, and pushes to a local remote", () => {
    const base = tempFolder();
    const remote = join(base, "remote.git");
    git.init(remote, { bare: true });
    const repo = repoWithCommit();
    git.addRemote(repo, "origin", remote);
    git.push(repo, "origin", "main");

    const copy = join(base, "copy");
    git.clone(repo, copy);
    git.createBranch(copy, "job-1");
    writeFileSync(join(copy, "b.txt"), "two\n");
    git.commit(copy, { subject: "Second", trailers: [["Premise-Trace", "W-2"]] });
    git.push(copy, "origin", "job-1");

    git.merge(repo, "job-1", { subject: "Merge job-1", trailers: [["Premise-Trace", "W-2"]] });
    expect(existsSync(join(repo, "b.txt"))).toBe(true);
    expect(git.log(repo)[0]!.parents).toHaveLength(2);

    git.push(repo, "origin", "main");
    const check = join(base, "check");
    git.clone(remote, check);
    expect(readFileSync(join(check, "b.txt"), "utf8")).toBe("two\n");
  });

  it("names the files and undoes the merge when branches conflict", () => {
    const repo = repoWithCommit();
    git.createBranch(repo, "other");
    writeFileSync(join(repo, "a.txt"), "other\n");
    git.commit(repo, { subject: "Other side" });
    git.switchBranch(repo, "main");
    writeFileSync(join(repo, "a.txt"), "main side\n");
    git.commit(repo, { subject: "Main side" });
    try {
      git.merge(repo, "other", { subject: "Merge" });
      throw new Error("expected a conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      expect((error as GitError).code).toBe("MERGE_CONFLICT");
      expect((error as GitError).files).toEqual(["a.txt"]);
    }
    expect(git.isClean(repo)).toBe(true);
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("main side\n");
  });

  it("refuses a push the remote has moved past, and never forces", () => {
    const base = tempFolder();
    const remote = join(base, "remote.git");
    git.init(remote, { bare: true });
    const repo = repoWithCommit();
    git.addRemote(repo, "origin", remote);
    git.push(repo, "origin", "main");
    const other = join(base, "other");
    git.clone(remote, other);
    writeFileSync(join(other, "c.txt"), "x\n");
    git.commit(other, { subject: "Elsewhere" });
    git.push(other, "origin", "main");

    writeFileSync(join(repo, "d.txt"), "y\n");
    git.commit(repo, { subject: "Here" });
    expect(() => git.push(repo, "origin", "main")).toThrowError(/never forces/);
    expect(() => git.push(repo, "origin", "+main")).toThrow(GitError);
  });

  it("lists the commits a remote lacks, all of them when it has no such branch", () => {
    const base = tempFolder();
    const remote = join(base, "remote.git");
    git.init(remote, { bare: true });
    const repo = repoWithCommit();
    git.addRemote(repo, "origin", remote);
    expect(git.commitsToPush(repo, "origin", "main")).toHaveLength(1);
    git.push(repo, "origin", "main");
    expect(git.commitsToPush(repo, "origin", "main")).toHaveLength(0);
    writeFileSync(join(repo, "e.txt"), "z\n");
    git.commit(repo, { subject: "Next" });
    expect(git.commitsToPush(repo, "origin", "main").map((c) => c.subject)).toEqual(["Next"]);
  });

  it("reads a file as it was at a commit, and finds who last changed a line", () => {
    const repo = repoWithCommit();
    const first = git.headCommit(repo)!;
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    git.commit(repo, { subject: "Second" });
    expect(git.readFileAt(repo, first, "a.txt")).toBe("one\n");
    expect(git.readFileAt(repo, first, "missing.txt")).toBeUndefined();
    expect(git.blameLine(repo, "a.txt", 1)).toBe(first);
    expect(git.blameLine(repo, "a.txt", 2)).toBe(git.headCommit(repo));
  });
});

describe("repository host", () => {
  it("creates a local bare repository for tests and for working without GitHub", async () => {
    const folder = tempFolder();
    const host = new LocalRepositoryHost(git, folder);
    const created = await host.createRepository({
      softwareId: "s",
      name: "My Tasks!",
      visibility: "private",
    });
    expect(created.url).toBe(join(folder, "my-tasks.git"));
    expect(existsSync(join(created.url, "HEAD"))).toBe(true);
  });
});
