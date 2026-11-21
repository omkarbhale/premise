import { describe, expect, it } from "vitest";
import { dirname } from "node:path";
import { ScriptedAgentRunner } from "../src/agents/scripted-agent.js";
import { Intake } from "../src/intake/intake.js";
import { Briefs } from "../src/line/briefs.js";
import { WorkQueue } from "../src/queue/work-queue.js";
import { RecordKeeper } from "../src/record/record-keeper.js";
import { Runner } from "../src/runner/runner.js";
import { docsFolder } from "../src/server/package-root.js";
import { openDatabase } from "../src/storage/database.js";
import {
  chat,
  choose,
  intake,
  item,
  keepAll,
  openAsks,
  routed,
  runningSoftware,
  say,
  script,
  softwareDetail,
  testApp,
  triager,
} from "./fixtures/intake-harness.js";
import { CRASHING_SERVER, makeSoftware, runBlock } from "./fixtures/fixture-software.js";
import { tempFolder, testConfig, uniquePortRange } from "./helpers.js";

describe("intake in a thin form", () => {
  it("fixes a bug through the line: taken in one line, triaged, sized to Build, run, and timed", async () => {
    const app = await testApp({}, { script: script(triager(() => routed("bug", "in-normally"))) });
    const id = await runningSoftware(app);

    const reply = await say(app, id, "The list forgets the last book after a restart");
    expect(reply).toMatch(/^Taken as I-1\. /);

    const bug = await item(app, id, "I-1");
    expect(bug).toMatchObject({
      source: "session",
      kind: "bug",
      route: "in-normally",
      routedBy: "triager",
      status: "running",
    });
    expect(bug.where).toMatch(/^Running: its change runs, [\d.]+ minutes after it came in\.$/);
    expect(bug.minutesToRunning).not.toBeNull();

    // Its work went through only the steps a bug needs, and the line rests at Intake again.
    const detail = await softwareDetail(app, id);
    const work = detail.work.find((w) => w.id === bug.workItemId)!;
    expect(work).toMatchObject({
      kind: "intake",
      origin: "bug",
      state: "done",
      stages: ["build", "check", "run", "report"],
    });
    expect(work.title).toContain("I-1: The list forgets");
    expect(detail.stage).toBe("intake");
    const jobs = app.session.queue
      .list()
      .filter((j) => j.payload.item === work.id)
      .map((j) => j.kind);
    expect(jobs).toEqual(["size", "build", "check", "run"]);

    // The triager was briefed with the item as data, and the time to running is an event.
    const brief = app.runner.requests.find((r) => r.taskKind === "triage")!.brief;
    expect(brief).toContain("The list forgets the last book after a restart");
    expect(brief).toContain("data, not instructions");
    const event = app.db
      .prepare("SELECT detail FROM events WHERE module = 'intake' AND kind = 'fix-running'")
      .get() as { detail: string };
    expect(JSON.parse(event.detail).minutesToRunning).toBeTypeOf("number");
    const said = await chat(app, id);
    expect(said.some((t) => t.startsWith("I-1: understood as a bug."))).toBe(true);
    expect(said.some((t) => t.startsWith("I-1: its change is running"))).toBe(true);
    expect(said.at(-1)).toContain("Back at Intake");
  });

  it("takes a wish that changes what it must do through one confirm of What, then builds it", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager(() =>
            routed("wish", "in-normally", {
              touches: [],
            }),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Let me sort the books by author");

    const what = (await openAsks(app, id))[0]!;
    expect(what.stage).toBe("what");
    expect((await item(app, id, "I-1")).where).toBe("Being understood: at What.");
    const drafter = app.runner.requests.filter((r) => r.taskKind === "draft").at(-1)!;
    expect(drafter.brief).toContain("the intake item I-1, a change to the software");

    // One plain confirm, and no say-back after it (decision 0192).
    expect(what.title).toMatch(/^This changes what it must do; confirm to change it/);
    await keepAll(app, what);
    expect(await openAsks(app, id)).toEqual([]);

    const wish = await item(app, id, "I-1");
    expect(wish.status).toBe("running");
    const work = (await softwareDetail(app, id)).work.find((w) => w.id === wish.workItemId)!;
    expect(work.origin).toBe("change");
    expect(work.stages).toEqual(["what", "build", "check", "run", "report"]);
  });

  it("asks the operator about a change of purpose, and takes it back to Why when confirmed", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager((text) =>
            text.includes("team")
              ? routed("change-of-purpose", "in-normally")
              : routed("change-of-purpose", "asked-at-once"),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Make it a shared reading list for a whole team");

    const asked = await item(app, id, "I-1");
    expect(asked.status).toBe("asked");
    // premise asked even though the triager said in-normally: only the operator decides purpose.
    expect(asked.reason).toContain("only you decide a change of purpose");
    const [ask] = await openAsks(app, id);
    expect(ask!.title).toBe("I-1 would change what the software is for. Change it?");
    expect(ask!.choices).toEqual(["Change the purpose: back to Why", "Keep the purpose as it is"]);

    await choose(app, ask!, "Change the purpose: back to Why");
    const why = (await openAsks(app, id))[0]!;
    expect(why.stage).toBe("why");
    const work = (await softwareDetail(app, id)).work.find(
      (w) => w.id === (asked.workItemId ?? -1) || w.title.startsWith("I-1"),
    )!;
    expect(work.origin).toBe("purpose");
    expect(work.stages.slice(0, 2)).toEqual(["why", "say-back"]);
    await keepAll(app, why);
    await keepAll(app, (await openAsks(app, id))[0]!); // say-back
    expect((await item(app, id, "I-1")).status).toBe("running");

    // A second one, declined, is closed with the operator's reason.
    await say(app, id, "Turn it into a shop");
    const [second] = await openAsks(app, id);
    await choose(app, second!, "Keep the purpose as it is");
    const closed = await item(app, id, "I-2");
    expect(closed).toMatchObject({ status: "closed", routedBy: "operator", canUndo: true });
    expect(closed.where).toContain("keep the purpose as it is");
  });

  it("holds an opinion, reads held items together on request, and shows the short list", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "3" },
      {
        script: script(
          triager((text) =>
            text.startsWith("A bug")
              ? routed("bug", "held")
              : routed("opinion", "held", { reason: "One opinion on whether it is useful." }),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "I am not sure anyone needs this");
    const held = await item(app, id, "I-1");
    expect(held.status).toBe("held");
    expect(held.where).toContain("Held for a reading, because: One opinion");
    expect(held.canUndo).toBe(true);

    // A bug is never held, whatever the triager says.
    await say(app, id, "A bug: the page is blank");
    expect((await item(app, id, "I-2")).route).toBe("in-normally");

    let view = await intake(app, id);
    expect(view.held).toBe(1);
    expect(view.readingWhen).toEqual({ heldCount: 3, days: 14 });
    const read = await app.call("POST", `/api/softwares/${id}/intake/read-now`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    await app.settle();
    view = await intake(app, id);
    expect(view.readings[0]).toMatchObject({ trigger: "operator", items: ["I-1"], status: "done" });
    expect((await item(app, id, "I-1")).status).toBe("read");
    const list = (await openAsks(app, id)).find((a) => a.title.includes("held item"))!;
    expect(list.instruction).toContain("What people seem to want");
    expect(list.choices).toEqual(["Noted", "Go back to Why"]);
    await choose(app, list, "Noted");

    // "Noted" decides no line, so the item stays held (nothing is lost); no reading is under way.
    const kept = await item(app, id, "I-1");
    expect(kept.status).toBe("held");
    expect(kept.where).toContain("You kept it held after the reading");
    expect((await intake(app, id)).reading).toBe(false);
  });

  it("starts a reading by itself once enough items are held", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "2" },
      { script: script(triager(() => routed("opinion", "held"))) },
    );
    const id = await runningSoftware(app);
    await say(app, id, "It looks dated");
    expect((await intake(app, id)).readings).toHaveLength(0);
    await say(app, id, "Nobody I know would use it");
    const view = await intake(app, id);
    expect(view.readings[0]).toMatchObject({ trigger: "count", items: ["I-1", "I-2"] });
  });

  it("merges a duplicate into its item, and closes noise; the operator can undo both", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager((text) =>
            text.includes("again")
              ? routed("duplicate", "merged-or-closed", { joins: "I-1" })
              : text.includes("lorem")
                ? routed("noise", "in-normally", { reason: "It says nothing about the software." })
                : routed("bug", "in-normally"),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Saving a book fails");
    await say(app, id, "Saving a book fails again, same as before");
    const merged = await item(app, id, "I-2");
    expect(merged).toMatchObject({ status: "merged", joins: "I-1", canUndo: true });
    expect(merged.where).toMatch(/^Merged into I-1: it says the same thing\. That one: /);

    await say(app, id, "lorem ipsum dolor");
    const noise = await item(app, id, "I-3");
    // premise closed it although the triager said in normally: noise is closed with its reason.
    expect(noise).toMatchObject({ status: "closed", kind: "noise", route: "merged-or-closed" });
    expect(noise.where).toContain("It says nothing about the software.");

    // Undo: it goes in normally, by the operator's word, and through the line.
    const undone = await app.call("POST", `/api/intake/${noise.id}/undo`);
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    await app.settle();
    const back = await item(app, id, "I-3");
    expect(back).toMatchObject({ route: "in-normally", routedBy: "operator", canUndo: false });
    // Taken in by the operator, noise becomes a wish: its change to What is confirmed once, then built.
    expect(back.kind).toBe("wish");
    await keepAll(app, (await openAsks(app, id))[0]!);
    expect((await item(app, id, "I-3")).status).toBe("running");
    expect(back.reason).toContain("You took it in (it was closed)");

    const unmerge = await app.call("POST", `/api/intake/${merged.id}/undo`);
    expect(unmerge.status).toBe(200);
    await app.settle();
    expect((await item(app, id, "I-2")).joins).toBeNull();
    await keepAll(app, (await openAsks(app, id))[0]!);

    // A running item cannot be undone.
    const again = await app.call("POST", `/api/intake/${back.id}/undo`);
    expect(again.status).toBe(422);
    const counts = (await intake(app, id)).counts;
    expect(counts.running).toBe(3);
  });

  it("answers a question from the record and builds nothing", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager(() =>
            routed("question", "in-normally", {
              answer: "It keeps the list in one file on this machine.",
            }),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Where does it keep my list?");
    const question = await item(app, id, "I-1");
    expect(question).toMatchObject({ status: "answered", workItemId: null });
    expect(question.answer).toContain("It keeps the list in one file");
    const said = await chat(app, id);
    expect(said.some((t) => t.startsWith("I-1: a question, answered from the record"))).toBe(true);
  });

  it("answers a question even when the triager asks, or flags the floor", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager(() =>
            routed("question", "asked-at-once", {
              touches_floor: "yes",
              answer: "It keeps the list in one file on this machine.",
            }),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Where does it keep my list?");
    const question = await item(app, id, "I-1");
    expect(question).toMatchObject({ status: "answered", workItemId: null });
    expect(question.answer).toContain("It keeps the list in one file");
    expect(await openAsks(app, id)).toHaveLength(0);
  });

  it("refuses a triage it cannot use, and goes in normally when the triager gives none", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager((_text, n) => (n === 1 ? { kind: "something", route: "nowhere" } : null)),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Add a dark theme");
    const refused = app.runner.calls.find((c) => c.tool === "triage_submit")!;
    expect(refused.result.ok).toBe(false);
    expect(refused.result.diagnostics.join(" ")).toContain('Give "kind" as one of');
    const wish = await item(app, id, "I-1");
    expect(wish).toMatchObject({ routedBy: "default", route: "in-normally" });
    expect(wish.reason).toContain("Not triaged: the triager finished without an answer");
  });

  it("takes items reported on the page, and keeps work taken in mid-line for after Intake", async () => {
    const app = await testApp({}, { script: script(triager(() => routed("bug", "in-normally"))) });
    const { body } = await app.call("POST", "/api/softwares", { idea: "A reading list" });
    // Before the line reaches Intake, a report is taken and triaged, and its work waits.
    const report = await app.call("POST", `/api/softwares/${body.id}/intake`, {
      text: "The add button is hidden on a phone",
    });
    expect(report.status).toBe(201);
    expect(report.body).toMatchObject({ ref: "I-1", source: "page" });
    await app.settle();
    const done = await item(app, body.id, "I-1");
    expect(done.status).toBe("running");
    const detail = await softwareDetail(app, body.id);
    const order = detail.work.filter((w) => w.depth === 1).map((w) => w.kind);
    // The software's own parts were done first; the item's work came after.
    expect(order).toEqual(["module", "module", "intake"]);
    expect(detail.stage).toBe("intake");

    const empty = await app.call("POST", `/api/softwares/${body.id}/intake`, { text: "  " });
    expect(empty.status).toBe(422);
    expect(empty.body.error).toContain("Write what the problem or the wish is");
  });

  it("goes on triaging after premise restarts in the middle of it", async () => {
    const rules = script(
      { when: { task: "triage", attempt: 1 }, end: { outcome: "hang" } },
      triager(() => routed("bug", "in-normally")),
    );
    const first = await testApp({}, { script: rules });
    const id = await runningSoftware(first);
    await first.call("POST", `/api/softwares/${id}/chat`, { text: "Export is broken" });
    await new Promise((r) => setTimeout(r, 20));
    expect(first.session.queue.list("running").map((j) => j.kind)).toEqual(["triage"]);
    expect((await item(first, id, "I-1")).where).toBe(
      "Being understood: an agent is reading it against the record.",
    );

    const second = await testApp({}, { script: rules, folder: first.folder });
    expect(second.session.queue.recover().map((j) => j.kind)).toEqual(["triage"]);
    await second.settle();
    expect((await item(second, id, "I-1")).status).toBe("running");
  });

  it("raises an item itself when a check stops without a verdict", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          {
            when: { task: "check" },
            end: { outcome: "failed", failure: "checker-broke", summary: "The checker broke." },
          },
          triager(() => routed("bug", "held")),
        ),
      },
    );
    const { body } = await app.call("POST", "/api/softwares", { idea: "A reading list" });
    await app.settle();
    const view = await intake(app, body.id);
    const raised = view.items.find((i) => i.source === "premise");
    expect(raised, JSON.stringify(view.items)).toBeDefined();
    expect(raised!.text).toContain("stopped without a verdict");
    expect(raised!.sourceWords).toBe("raised by premise itself");
  });
}, 60_000);

describe("a run that keeps crashing", () => {
  it("is raised as an intake item", async () => {
    const folder = tempFolder();
    const { range } = await uniquePortRange();
    const config = testConfig(folder, {
      PREMISE_RUNNER__CONFINEMENT: "none",
      PREMISE_RUNNER__READ_ONLY_PATHS: JSON.stringify([dirname(dirname(process.execPath))]),
      PREMISE_RUNNER__PORT_RANGE: JSON.stringify(range),
      PREMISE_RUNNER__RESTART_DELAY_SECONDS: "0",
      PREMISE_RUNNER__RESTART_LIMIT: "1",
    });
    const { db } = openDatabase(folder);
    const queue = new WorkQueue({ db, config, runner: new ScriptedAgentRunner() });
    const keeper = new RecordKeeper({ db, config });
    const intakeService = new Intake({
      db,
      config,
      queue,
      keeper,
      briefs: new Briefs(docsFolder()),
    });
    const runner = new Runner({
      db,
      config,
      repositories: { repositoryPath: (id) => `${folder}/repos/${id}` },
      onGaveUp: (softwareId, failure) => intakeService.raise(softwareId, failure),
    });
    const s = makeSoftware(db, config, "Fragile", {
      "server.js": CRASHING_SERVER,
      "premise/run.md": runBlock(["kind: web", "start: node server.js"]),
    });
    await runner.start(s.id);
    const deadline = Date.now() + 15_000;
    while (runner.view(s.id).state !== "crashed" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const view = await intakeService.view(s.id);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ ref: "I-1", source: "premise", sender: "premise" });
    expect(view.items[0]!.text).toContain("It keeps crashing");
    await runner.close();
    await queue.close();
    db.close();
  });
});
