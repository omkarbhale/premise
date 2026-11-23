import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Git } from "../src/git/git.js";
import { LocalRepositoryHost } from "../src/git/repository-host.js";
import { RecordError, RecordKeeper } from "../src/record/record-keeper.js";
import { RecordWriter, droppedLine } from "../src/line/record-writer.js";
import { checkTrailers, readTrailer } from "../src/record/trace.js";
import { type Database, openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

let db: Database;
let keeper: RecordKeeper;
let softwareId: string;
let dataFolder: string;

beforeEach(() => {
  dataFolder = tempFolder();
  const config = testConfig(dataFolder);
  db = openDatabase(dataFolder).db;
  softwareId = createSoftware(db, { name: "Tasks" }, config.softwares).id;
  keeper = new RecordKeeper({ db, config, today: () => "2026-11-22" });
});

/** Propose, accept (consistent review), write and commit in a fresh working copy; merge it. */
function land(
  operations: Parameters<RecordKeeper["propose"]>[1],
  jobKey: string,
  serves: string[] = [],
) {
  const branch = `job-${jobKey}`;
  const copy = keeper.createWorkingCopy(softwareId, jobKey, branch);
  const proposed = keeper.propose(softwareId, operations, "because", { workingCopy: copy });
  expect(proposed.diagnostics).toEqual([]);
  const reviewed = keeper.applyReview(proposed.changeId, { verdict: "consistent" });
  if (reviewed.status === "at-say-back") keeper.applySayBack(proposed.changeId, true);
  keeper.write(proposed.changeId, { workingCopy: copy, serves });
  keeper.mergeJob(softwareId, copy, branch);
  return { copy, proposed };
}

const WHY = {
  op: "add",
  kind: "Y",
  text: "People lose track of tasks.",
  from: "operator",
} as const;
const MUST = {
  op: "add",
  kind: "W",
  text: "Add a task.",
  from: "operator",
  priority: "must",
} as const;

describe("record keeper: changes", () => {
  it("rejects a malformed proposal with diagnostics, and records it", () => {
    const result = keeper.propose(softwareId, [{ op: "strike", id: "W-9", reason: "x" }], "why");
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0]).toMatchObject({ code: "UNKNOWN_ITEM" });
    const row = db
      .prepare("SELECT status FROM record_changes WHERE id = ?")
      .get(result.changeId) as { status: string };
    expect(row.status).toBe("rejected");
  });

  it("needs one reason for the whole change", () => {
    expect(keeper.propose(softwareId, [WHY], " ").status).toBe("rejected");
  });

  it("sends a valid change to the reviewer, then accepts it when consistent", () => {
    const proposed = keeper.propose(softwareId, [WHY], "the owner said so");
    expect(proposed).toMatchObject({ status: "reviewing", assigned: ["Y-1"] });
    expect(keeper.applyReview(proposed.changeId, { verdict: "consistent" }).status).toBe(
      "accepted",
    );
  });

  it("rejects with CONFLICT, naming the live item, when the reviewer finds a conflict", () => {
    const proposed = keeper.propose(softwareId, [WHY], "x");
    const result = keeper.applyReview(proposed.changeId, {
      verdict: "conflicting",
      conflictingItem: "W-1",
      reasons: "it says the opposite",
    });
    expect(result.status).toBe("rejected");
    expect(result.diagnostics[0]!.code).toBe("CONFLICT");
    expect(result.diagnostics[0]!.message).toContain("W-1");
  });

  it("sends the replacement of a must item to the say-back, and writes only if it passes", () => {
    land([WHY, MUST], "a");
    const proposed = keeper.propose(
      softwareId,
      [
        {
          op: "replace",
          id: "W-1",
          text: "Add a task quickly.",
          from: "operator",
          reason: "faster",
        },
      ],
      "faster",
    );
    expect(keeper.applyReview(proposed.changeId, { verdict: "consistent" }).status).toBe(
      "at-say-back",
    );
    expect(keeper.applySayBack(proposed.changeId, false).status).toBe("rejected");
    const again = keeper.propose(
      softwareId,
      [
        {
          op: "replace",
          id: "W-1",
          text: "Add a task quickly.",
          from: "operator",
          reason: "faster",
        },
      ],
      "faster",
    );
    keeper.applyReview(again.changeId, { verdict: "consistent" });
    expect(keeper.applySayBack(again.changeId, true).status).toBe("accepted");
  });

  it("does not move a change through a step that does not apply", () => {
    const proposed = keeper.propose(softwareId, [WHY], "x");
    expect(() => keeper.applySayBack(proposed.changeId, true)).toThrowError(RecordError);
    expect(() => keeper.write(proposed.changeId, { workingCopy: tempFolder() })).toThrowError(
      /reviewing/,
    );
  });

  it("applies a change again when a file it touches changed under it, and writes it with the next free ID", () => {
    const copy = keeper.createWorkingCopy(softwareId, "a", "job-a");
    const first = keeper.propose(softwareId, [WHY], "x", { workingCopy: copy });
    keeper.applyReview(first.changeId, { verdict: "consistent" });
    const other = { ...WHY, text: "Tasks get forgotten." };
    const second = keeper.propose(softwareId, [other], "x", { workingCopy: copy });
    keeper.applyReview(second.changeId, { verdict: "consistent" });
    keeper.write(second.changeId, { workingCopy: copy });
    keeper.write(first.changeId, { workingCopy: copy });
    const why = readFileSync(join(copy, "premise", "why.md"), "utf8");
    expect(why).toContain("[Y-1] Tasks get forgotten.");
    expect(why).toContain("[Y-2] People lose track of tasks.");
    expect(keeper.git.log(copy)[0]!.subject).toBe("Record: add Y-2 People lose track of tasks.");
  });

  it("does not refuse a change because a file it does not touch changed (run.md)", () => {
    land([WHY], "a");
    const copy = keeper.createWorkingCopy(softwareId, "b", "job-b");
    const decision = keeper.propose(
      softwareId,
      [
        {
          op: "add",
          kind: "D",
          text: "Keep tasks in a file. Reason: simple. Rejected: a server.",
          from: "builder",
        },
      ],
      "x",
      { proposer: { agentRole: "builder" } },
    );
    keeper.applyReview(decision.changeId, { verdict: "consistent" });
    writeFileSync(join(copy, "premise", "run.md"), "# How to run it\nnode tasks.js\n");
    keeper.write(decision.changeId, { workingCopy: copy, withCode: true });
    expect(readFileSync(join(copy, "premise", "decisions.md"), "utf8")).toContain("[D-1]");
  });

  it("refuses, saying why, only when the change no longer fits the record as it stands", () => {
    land([WHY, MUST], "a");
    const copy = keeper.createWorkingCopy(softwareId, "b", "job-b");
    const strike = { op: "strike", id: "W-1", reason: "not wanted" } as const;
    const first = keeper.propose(softwareId, [strike], "x", { workingCopy: copy });
    keeper.applyReview(first.changeId, { verdict: "consistent" });
    keeper.applySayBack(first.changeId, true);
    const second = keeper.propose(softwareId, [strike], "x", { workingCopy: copy });
    keeper.applyReview(second.changeId, { verdict: "consistent" });
    keeper.applySayBack(second.changeId, true);
    keeper.write(second.changeId, { workingCopy: copy });
    expect(() => keeper.write(first.changeId, { workingCopy: copy })).toThrowError(
      /no longer fits the record as it stands.*W-1 is already struck through/,
    );
    expect(keeper.change(first.changeId).status).toBe("rejected");
  });

  it("lets a builder propose a decision only", () => {
    const result = keeper.propose(softwareId, [MUST], "x", { proposer: { agentRole: "builder" } });
    expect(result.diagnostics[0]!.code).toBe("NOT_ALLOWED");
  });
});

describe("record keeper: writing and commits", () => {
  it("writes the record into the working copy, in a commit with the trace trailer", () => {
    const { copy } = land([WHY, MUST], "a");
    const content = readFileSync(join(copy, "premise", "what.md"), "utf8");
    expect(content).toBe(
      "# What it must do\n- [W-1] Add a task. (must; from: operator; 2026-11-22)\n",
    );
    const repo = keeper.repositoryPath(softwareId);
    const commits = keeper.git.log(repo);
    expect(readTrailer(commits.at(-1)!.message, "Premise-Trace")).toEqual({ ids: ["Y-1", "W-1"] });
    // The merge commit carries the trace too.
    expect(readTrailer(commits[0]!.message, "Premise-Trace")).toEqual({ ids: ["Y-1", "W-1"] });
  });

  it("puts the record change in the same commit as the code when asked", () => {
    land([WHY, MUST], "a");
    const copy = keeper.createWorkingCopy(softwareId, "b", "job-b");
    writeFileSync(join(copy, "tasks.js"), "export const add = () => {};\n");
    const proposed = keeper.propose(
      softwareId,
      [
        {
          op: "add",
          kind: "D",
          text: "Keep tasks in a file. Reason: simple. Rejected: a server.",
          from: "assumed",
        },
      ],
      "builder decision",
      { workingCopy: copy, proposer: { agentRole: "builder" } },
    );
    keeper.applyReview(proposed.changeId, { verdict: "consistent" });
    const sha = keeper.write(proposed.changeId, {
      workingCopy: copy,
      serves: ["W-1"],
      withCode: true,
    });
    const changed = keeper.git
      .run(copy, ["show", "--name-only", "--format=", sha])
      .trim()
      .split("\n");
    expect(changed.sort()).toEqual(["premise/decisions.md", "tasks.js"]);
    expect(readTrailer(keeper.git.log(copy)[0]!.message, "Premise-Trace")).toEqual({
      ids: ["D-1", "W-1"],
    });
  });

  it("commits a record change alone when it has no code, leaving other files out", () => {
    const copy = keeper.createWorkingCopy(softwareId, "a", "job-a");
    writeFileSync(join(copy, "scratch.txt"), "not part of it");
    const proposed = keeper.propose(softwareId, [WHY], "x", { workingCopy: copy });
    keeper.applyReview(proposed.changeId, { verdict: "consistent" });
    const sha = keeper.write(proposed.changeId, { workingCopy: copy });
    expect(keeper.git.run(copy, ["show", "--name-only", "--format=", sha]).trim()).toBe(
      "premise/why.md",
    );
  });

  it("refuses a code commit that names no item, or an item that does not exist", () => {
    land([WHY], "a");
    const copy = keeper.createWorkingCopy(softwareId, "b", "job-b");
    writeFileSync(join(copy, "x.js"), "1");
    expect(() => keeper.commitWork(copy, { subject: "Code", serves: [] })).toThrowError(
      /names the items/,
    );
    expect(() => keeper.commitWork(copy, { subject: "Code", serves: ["W-9"] })).toThrowError(/W-9/);
    keeper.commitWork(copy, { subject: "Code", serves: ["Y-1"], intake: ["I-4"] });
    expect(readTrailer(keeper.git.log(copy)[0]!.message, "Premise-Trace")).toEqual({
      ids: ["Y-1", "I-4"],
    });
  });

  it("refuses to merge a branch whose commits have no trace", () => {
    land([WHY], "a");
    const copy = keeper.createWorkingCopy(softwareId, "b", "job-b");
    writeFileSync(join(copy, "x.js"), "1");
    keeper.git.commit(copy, { subject: "No trailer" });
    expect(() => keeper.mergeJob(softwareId, copy, "job-b")).toThrowError(
      /no commit with a Premise-Trace/,
    );
  });
});

describe("record keeper: trailer checks before a push", () => {
  function pushSetup() {
    const remote = new LocalRepositoryHost(keeper.git, tempFolder());
    return remote.createRepository({ softwareId, name: "tasks", visibility: "private" });
  }

  it("pushes to a local remote when every commit is traced", async () => {
    land([WHY, MUST], "a");
    const { url } = await pushSetup();
    keeper.setRemote(softwareId, url);
    const repo = keeper.repositoryPath(softwareId);
    expect(keeper.pushChecked(repo, "origin", "main")).toEqual([]);
    const check = join(tempFolder(), "check");
    new Git({ name: "x", email: "x@localhost" }).clone(url, check);
    expect(existsSync(join(check, "premise", "what.md"))).toBe(true);
    const row = db.prepare("SELECT repository FROM softwares WHERE id = ?").get(softwareId) as {
      repository: string;
    };
    expect(row.repository).toBe(url);
  });

  it("refuses the push, naming the commit, when one has no trailer", async () => {
    land([WHY], "a");
    const repo = keeper.repositoryPath(softwareId);
    writeFileSync(join(repo, "sneaky.js"), "1");
    keeper.git.commit(repo, { subject: "Sneaky" });
    const { url } = await pushSetup();
    keeper.setRemote(softwareId, url);
    const failures = keeper.pushChecked(repo, "origin", "main");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ subject: "Sneaky" });
    expect(failures[0]!.reason).toContain('no "Premise-Trace:" line');
    expect(keeper.git.commitsToPush(repo, "origin", "main").length).toBeGreaterThan(0);
  });

  it("refuses a trailer naming an item that is not in the record at that commit", () => {
    land([WHY], "a");
    const repo = keeper.repositoryPath(softwareId);
    writeFileSync(join(repo, "x.js"), "1");
    keeper.git.commit(repo, { subject: "Wrong item", trailers: [["Premise-Trace", "W-5"]] });
    const failures = keeper.checkCommits(repo, keeper.git.log(repo, ["-1"]));
    expect(failures[0]!.reason).toContain("W-5");
  });

  it("checks the item against the record at that commit, not the latest", () => {
    land([WHY], "a");
    const repo = keeper.repositoryPath(softwareId);
    const first = keeper.git.log(repo).at(-1)!;
    land([MUST], "b");
    // A commit that names W-1 while the record at that commit lacks it fails; later ones pass.
    expect(
      checkTrailers(keeper.git, repo, [{ ...first, message: "x\n\nPremise-Trace: W-1\n" }], {
        trailer: "Premise-Trace",
        folder: "premise",
      }),
    ).toHaveLength(1);
    expect(
      checkTrailers(keeper.git, repo, keeper.git.log(repo, ["-1"]), {
        trailer: "Premise-Trace",
        folder: "premise",
      }),
    ).toEqual([]);
  });

  it("reads trailers strictly", () => {
    expect(readTrailer("A\n\nPremise-Trace: W-7, D-3, I-12\n", "Premise-Trace")).toEqual({
      ids: ["W-7", "D-3", "I-12"],
    });
    expect(readTrailer("A\n", "Premise-Trace")).toHaveProperty("problem");
    expect(readTrailer("A\n\nPremise-Trace: \n", "Premise-Trace")).toHaveProperty("problem");
    expect(readTrailer("A\n\nPremise-Trace: seven\n", "Premise-Trace")).toHaveProperty("problem");
    expect(readTrailer("Premise-Trace: W-1\n", "Premise-Trace")).toHaveProperty("problem");
  });

  it("tells a missing trace line from one that is not in the last paragraph", () => {
    const missing = readTrailer("A\n\nbody\n", "Premise-Trace");
    expect(missing).toHaveProperty("problem", expect.stringContaining("has no"));
    const notLast = readTrailer(
      "A\n\nPremise-Trace: W-1\n\nCo-Authored-By: X <x@example.invalid>\n",
      "Premise-Trace",
    );
    expect(notLast).toHaveProperty(
      "problem",
      expect.stringContaining("is there, but it is not in the last paragraph"),
    );
    expect(readTrailer("A\n\nPremise-Trace: \n", "Premise-Trace")).toHaveProperty(
      "problem",
      expect.stringContaining("names no item"),
    );
    expect(readTrailer("A\n\nPremise-Trace: seven\n", "Premise-Trace")).toHaveProperty(
      "problem",
      expect.stringContaining("not an item ID"),
    );
  });
});

describe("record keeper: reading", () => {
  it("lists, gets and gives the history of items, struck ones only when asked", () => {
    land([WHY, MUST], "a");
    land(
      [
        {
          op: "replace",
          id: "W-1",
          text: "Add a task by typing.",
          from: "operator",
          reason: "clearer",
        },
      ],
      "b",
    );
    expect(keeper.list(softwareId).map((i) => i.id)).toEqual(["Y-1", "W-2"]);
    expect(keeper.list(softwareId, { includeStruck: true }).map((i) => i.id)).toEqual([
      "Y-1",
      "W-1",
      "W-2",
    ]);
    expect(keeper.list(softwareId, { kind: "W" })).toHaveLength(1);
    expect(keeper.get(softwareId, "W-1").struck?.reason).toContain("clearer");
    const history = keeper.history(softwareId, "W-2");
    expect(history.replaces).toEqual(["W-1"]);
    expect(history.commits.length).toBeGreaterThan(0);
    expect(keeper.history(softwareId, "W-1").replacedBy).toBe("W-2");
    expect(() => keeper.get(softwareId, "W-9")).toThrowError(/not in this software's record/);
  });

  it("finds the items behind a line of code with blame and the trailer", () => {
    land([WHY, MUST], "a");
    const copy = keeper.createWorkingCopy(softwareId, "b", "job-b");
    writeFileSync(join(copy, "tasks.js"), "export const add = () => {};\n");
    keeper.commitWork(copy, { subject: "Add tasks", serves: ["W-1"] });
    keeper.mergeJob(softwareId, copy, "job-b");
    const found = keeper.itemsForLine(softwareId, "tasks.js", 1);
    expect(found?.items).toEqual(["W-1"]);
  });

  it("reads the record as it was on an earlier commit", () => {
    land([WHY], "a");
    const repo = keeper.repositoryPath(softwareId);
    const first = keeper.git.headCommit(repo)!;
    land([MUST], "b");
    expect(keeper.list(softwareId, { revision: first }).map((i) => i.id)).toEqual(["Y-1"]);
    expect(keeper.list(softwareId).map((i) => i.id)).toEqual(["Y-1", "W-1"]);
  });

  it("is empty for a software with no record yet", () => {
    expect(keeper.list(softwareId)).toEqual([]);
    expect(keeper.effortPlan(softwareId).milestones).toEqual([]);
  });
});

describe("record keeper: milestones and priority", () => {
  it("stores milestones as record items with a wait flag each, and reports the software's priority", () => {
    land(
      [
        { op: "add", kind: "M", text: "Tasks can be added and seen, running.", from: "assumed" },
        { op: "add", kind: "M", text: "Tasks can be shared.", from: "operator", wait: true },
      ],
      "a",
    );
    const plan = keeper.effortPlan(softwareId);
    expect(plan.priority).toBe(3);
    expect(plan.milestones).toEqual([
      { id: "M-1", text: "Tasks can be added and seen, running.", wait: false, date: "2026-11-22" },
      { id: "M-2", text: "Tasks can be shared.", wait: true, date: "2026-11-22" },
    ]);
  });

  it("changes a milestone's wait flag as a record change that keeps its ID", () => {
    land([{ op: "add", kind: "M", text: "First.", from: "assumed" }], "a");
    land([{ op: "mark", id: "M-1", wait: true }], "b");
    expect(keeper.effortPlan(softwareId).milestones[0]).toMatchObject({ id: "M-1", wait: true });
  });
});

describe("landing the changes agents proposed", () => {
  const decision = (text: string) =>
    ({
      op: "add",
      kind: "D",
      text: `${text} Reason: simple. Rejected: a server.`,
      from: "assumed",
    }) as const;

  it("lands every builder's decision though each was checked against an older record, and says once what did not fit", () => {
    land([WHY], "a");
    const writer = new RecordWriter(keeper);
    const ids = ["Keep tasks in a file.", "Print errors as one line.", "Keep tasks in a file."].map(
      (text, i) =>
        keeper.propose(softwareId, [decision(text)], "x", {
          proposer: { agentRole: "builder" },
          proposedBy: `builder, job ${i + 1}`,
        }).changeId,
    );
    const result = writer.landAllProposed(softwareId, ids);
    expect(result.landed).toBe(2);
    expect(result.dropped).toHaveLength(1);
    const decisions = keeper.list(softwareId, { kind: "D" }).map((d) => `${d.id} ${d.text}`);
    expect(decisions).toEqual([
      "D-1 Keep tasks in a file. Reason: simple. Rejected: a server.",
      "D-2 Print errors as one line. Reason: simple. Rejected: a server.",
    ]);
    const line = droppedLine(result.dropped, "a builder")!;
    expect(line).toMatch(/^One record change a builder proposed did not fit/);
    expect(line).toContain("D-1 already says this");
    expect(line).not.toMatch(/propose it again/i);
  });
});
