import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReport, draftReleaseNotes } from "../src/reporter/build.js";
import { gatherFacts } from "../src/reporter/facts.js";
import { Reporter } from "../src/reporter/reporter.js";
import { RecordKeeper } from "../src/record/record-keeper.js";
import { Runner } from "../src/runner/runner.js";
import type { ReportView } from "../src/shared/api-types.js";
import { createAsk } from "../src/storage/asks.js";
import { type Database, openDatabase, recordEvent } from "../src/storage/database.js";
import { MockUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";
import { WEB_SERVER, makeSoftware, runBlock } from "./fixtures/fixture-software.js";
import { tempFolder, testConfig, uniquePortRange } from "./helpers.js";
import { dirname } from "node:path";

let db: Database;
let dataFolder: string;
let config: ReturnType<typeof testConfig>;
let runner: Runner;
let reporter: Reporter;

const WHAT = [
  "# What it must do",
  "",
  "- [W-1] People can open the page and read a greeting. (must; from: operator; 2026-11-22)",
  "- [W-2] People can change the greeting. (should; from: operator; 2026-11-22)",
  "- [W-3] The page works on a phone. (could; from: assumed; 2026-11-22)",
  "",
].join("\n");
const WHY = "# Why\n\n- [Y-1] People want a friendly page. (from: operator; 2026-11-22)\n";

beforeEach(async () => {
  dataFolder = tempFolder();
  config = testConfig(dataFolder, {
    PREMISE_RUNNER__CONFINEMENT: "none",
    PREMISE_RUNNER__PORT_RANGE: JSON.stringify((await uniquePortRange()).range),
    PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
  });
  db = openDatabase(dataFolder).db;
  const keeper = new RecordKeeper({ db, config, today: () => "2026-11-22" });
  runner = new Runner({ db, config, repositories: keeper });
  reporter = new Reporter(
    { db, config, records: keeper, runner, ledger: new MockUsageLedger("mock-fixed", 1) },
    config,
  );
});
afterEach(async () => {
  await runner.close();
  db.close();
});

const FILES = {
  "premise/why.md": WHY,
  "premise/what.md": WHAT,
  "server.js": WEB_SERVER,
  "premise/run.md": runBlock(["kind: web", "start: node server.js"]),
};

function verdict(softwareId: string, item: string, v: string, evidence: string) {
  recordEvent(db, {
    softwareId,
    module: "checker",
    kind: "verdict",
    reference: item,
    detail: { verdict: v, evidence },
  });
}

function verdictAt(softwareId: string, item: string, v: string, commit: string) {
  recordEvent(db, {
    softwareId,
    module: "checker",
    kind: "verdict",
    reference: item,
    detail: { verdict: v, evidence: "Seen.", commit },
  });
}

function allLines(view: ReportView) {
  return view.sections.flatMap((s) => s.lines);
}
const section = (view: ReportView, title: string) =>
  view.sections.find((s) => s.title === title)!.lines.map((l) => l.text);

describe("a report from recorded facts", () => {
  it("says honestly what failed, what was not checked and what could not be", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES, ["W-1", "W-2"]);
    verdict(s.id, "W-1", "met", "The page showed the greeting.");
    verdict(s.id, "W-2", "not-met", "Editing the greeting did nothing.");
    // W-3 has no verdict at all.
    const view = await reporter.view(s.id, { detail: true });

    const failed = section(view, "Failed or not checked");
    expect(failed.some((t) => t.startsWith("Not met:") && t.includes("did nothing"))).toBe(true);
    expect(failed.some((t) => t.startsWith("Not checked:"))).toBe(true);
    expect(failed.some((t) => t.includes("People can open the page"))).toBe(false);
    expect(section(view, "Decided").join("\n")).toContain("must: People can open the page");
    expect(view.limits.join(" ")).toContain("same kind of AI");
    expect(view.cost.mocked).toBe(true);
  });

  it("puts a check that could not run under failed or not checked", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    verdict(s.id, "W-1", "could-not-check", "No browser was available.");
    const view = await reporter.view(s.id);
    expect(section(view, "Failed or not checked").join("\n")).toContain(
      "Could not be checked: People can open the page",
    );
  });

  it("gives every line the recorded fact it rests on", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    verdict(s.id, "W-2", "not-met", "x");
    createAsk(db, {
      softwareId: s.id,
      role: "operator",
      kind: "question",
      title: "Which greeting?",
      instruction: "Pick one.",
    });
    db.prepare(
      "INSERT INTO jobs (software_id, kind, stage, items, payload, status, result, created) VALUES (?, 'build', 'build', '[]', '{}', 'stuck', 'Ran out of turns.', ?)",
    ).run(s.id, new Date().toISOString());
    const view = await reporter.view(s.id, { detail: true });
    const lines = allLines(view);
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(line.evidence, line.text).toBeTruthy();
    expect(section(view, "Needed")).toEqual(["From the operator: Which greeting?. Pick one."]);
    expect(section(view, "Failed or not checked").join("\n")).toContain(
      "got stuck: Ran out of turns.",
    );
  });

  it("states nothing about running software that was never started", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    const view = await reporter.view(s.id);
    expect(view.running).toBeNull();
    expect(section(view, "Running")).toEqual(["Nothing has been started yet."]);
  });

  it("shows how to open the running software, and notes newer unrun changes", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    const view1 = await runner.start(s.id);
    s.commit({ "notes.txt": "more" });
    const view = await reporter.view(s.id);
    expect(section(view, "Running")[0]).toContain("Running. Open");
    expect(view.running?.where).toBe(view1.link);
    expect(section(view, "Running").join("\n")).toContain("1 newer change has been made since");
  });

  it("reports a software that kept crashing as failed", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    db.prepare(
      "INSERT INTO runs (software_id, commit_sha, kind, status, failure, started) VALUES (?, ?, 'web', 'crashed', 'It stopped by itself 3 times.', ?)",
    ).run(s.id, s.git.headCommit(s.repo)!, new Date().toISOString());
    // The fixture runner has no run of its own, so read the row through the runner's history.
    const view = await reporter.view(s.id);
    expect(section(view, "Failed or not checked").join("\n")).toContain(
      "kept crashing and was stopped",
    );
  });

  it("is short by default, keeps failures first, and says how much was left out", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    const facts = await gatherFacts(
      {
        db,
        config,
        records: new RecordKeeper({ db, config }),
        runner,
        ledger: new MockUsageLedger("mock-fixed", 1),
      },
      s.id,
    );
    const short = buildReport(facts, { detail: false, maxLines: 3 });
    const full = buildReport(facts, { detail: true, maxLines: 3 });
    expect(allLines(short)).toHaveLength(3);
    const unlimited = buildReport(facts, { detail: false, maxLines: 999 });
    expect(short.hiddenLines).toBe(allLines(unlimited).length - 3);
    expect(allLines(full).length).toBeGreaterThan(allLines(short).length);
    expect(section(short, "Failed or not checked").length).toBeGreaterThan(0);
    expect(full.hiddenLines).toBe(0);
  });

  it("reports a left-out item as decided, with the way back, and not as failed", async () => {
    const what = WHAT.replace("(could; from: assumed; 2026-11-22)", "(should; from: operator; left-out; 2026-11-22)");
    const s = makeSoftware(db, config, "Greeter", { ...FILES, "premise/what.md": what }, ["W-1", "W-2"]);
    const view = await reporter.view(s.id, { detail: true });
    const line = section(view, "Decided").find((t) => t.startsWith("Left out, not built:"))!;
    expect(line).toContain("Left out, not built: W-3 (should): The page works on a phone.");
    expect(line).toContain("send the software back to What on the Line tab");
    expect(section(view, "Failed or not checked").join("\n")).not.toContain("W-3");
  });

  it("says plainly when the software has no record yet", async () => {
    const { createSoftware } = await import("../src/storage/softwares.js");
    const id = createSoftware(db, { name: "Idea" }, config.softwares).id;
    const view = await reporter.view(id);
    expect(section(view, "Decided")[0]).toContain("Nothing is in this software's record yet");
    expect(
      allLines(view).some((l) => /works|met/.test(l.text) && !l.text.includes("Nothing")),
    ).toBe(false);
  });

  it("treats a verdict recorded for an older commit as not checked at this version", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES, ["W-1", "W-2"]);
    const first = s.git.headCommit(s.repo)!;
    verdictAt(s.id, "W-1", "met", first);
    verdictAt(s.id, "W-2", "met", first);
    const before = await gatherFacts(
      {
        db,
        config,
        records: new RecordKeeper({ db, config }),
        runner,
        ledger: new MockUsageLedger("mock-fixed", 1),
      },
      s.id,
    );
    expect(draftReleaseNotes(before, first)).toContain("People can open the page");
    s.commit({ "extra.txt": "x" }, ["W-1"]);
    const view = await reporter.view(s.id);
    const lines = section(view, "Failed or not checked");
    const stale = lines.find((l) => l.includes("People can open the page"))!;
    expect(stale).toContain("Not checked at this version");
    expect(stale).toContain("last checked at an earlier version");
    expect(stale).toContain("met");
    const after = await gatherFacts(
      {
        db,
        config,
        records: new RecordKeeper({ db, config }),
        runner,
        ledger: new MockUsageLedger("mock-fixed", 1),
      },
      s.id,
    );
    const head = s.git.headCommit(s.repo)!;
    expect(draftReleaseNotes(after, head)).toBeNull();
  });

  it("is about the latest commit even when an older commit is the one running", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES, ["W-1"]);
    const first = s.git.headCommit(s.repo)!;
    const head = s.commit({ "extra.txt": "x" }, ["W-1"]);
    verdictAt(s.id, "W-1", "met", head);
    await runner.start(s.id, first);
    const view = await reporter.view(s.id);
    const failed = section(view, "Failed or not checked");
    expect(failed.some((l) => l.includes("People can open the page"))).toBe(false);
    const running = section(view, "Running").join("\n");
    expect(running).toContain("newer version than the one last started");
    // The version hashes sit behind the line's details, as its evidence.
    const evidence = view.sections
      .find((x) => x.title === "Running")!
      .lines.map((l) => l.evidence ?? "")
      .join("\n");
    expect(evidence).toContain(`version ${head.slice(0, 7)}`);
    expect(evidence).toContain(`version ${first.slice(0, 7)}`);
  });

  it("refuses an unknown software with a plain message", async () => {
    await expect(reporter.view("nope")).rejects.toThrow("There is no software with that id.");
  });
});

describe("writing reports", () => {
  it("writes a report when a change reaches running, with release notes of the met items only", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES, ["W-1", "W-2"]);
    verdict(s.id, "W-1", "met", "Seen.");
    verdict(s.id, "W-2", "not-met", "Broken.");
    const run = await runner.start(s.id);
    const written = await reporter.write(s.id, "change-running");
    expect(written.view.detail).toBe(true);
    expect(written.releaseNotes).toContain("People can open the page and read a greeting.");
    expect(written.releaseNotes).not.toContain("change the greeting");
    expect(written.releaseNotes).toContain(run.commit);
    expect(reporter.history(s.id)).toHaveLength(1);
    const view = await reporter.view(s.id);
    expect(view.written).toBe(written.written);
    const event = db.prepare("SELECT kind FROM events WHERE module = 'reporter'").get();
    expect(event).toMatchObject({ kind: "report-written" });
  });

  it("writes a milestone report that names the milestone", async () => {
    const s = makeSoftware(db, config, "Greeter", {
      ...FILES,
      "premise/milestones.md":
        "# Milestones\n\n- [M-1] A page that greets people. (from: operator; 2026-11-22)\n",
    });
    const written = await reporter.write(s.id, "milestone", "M-1");
    expect(written.view.sections[0]!.lines[0]!.text).toBe(
      "This milestone is reached: A page that greets people.",
    );
  });

  it("notes nothing for release notes when nothing met was served", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    await runner.start(s.id);
    const written = await reporter.write(s.id, "change-running");
    expect(written.releaseNotes).toBeNull();
    const facts = await gatherFacts(
      {
        db,
        config,
        records: new RecordKeeper({ db, config }),
        runner,
        ledger: new MockUsageLedger("mock-fixed", 1),
      },
      s.id,
    );
    expect(draftReleaseNotes(facts, "unknown")).toBeNull();
  });

  it("the report job handler writes the report and ends done", async () => {
    const s = makeSoftware(db, config, "Greeter", FILES);
    const outcome = await reporter.handleReportJob({
      softwareId: s.id,
      payload: { trigger: "paused" },
    } as never);
    expect(outcome).toMatchObject({ kind: "done" });
    expect(join(dataFolder)).toBeTruthy();
  });
});
