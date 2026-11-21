import { describe, expect, it } from "vitest";
import { Measures } from "../src/measures/measures.js";
import type { MeasureFigure, MeasuresView } from "../src/shared/api-types.js";
import { type Database, openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testApp, testConfig } from "./helpers.js";

/**
 * premise's own return (decision 0172), from a scripted history: every row below is written with
 * the time it happened, so each figure can be worked out by hand.
 */

const T0 = Date.parse("2026-11-01T09:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function setup(env: NodeJS.ProcessEnv = {}) {
  const folder = tempFolder();
  const config = testConfig(folder, env);
  const { db } = openDatabase(folder);
  let clock = at(0);
  const measures = new Measures({ db, config, clock: () => new Date(clock) });
  const software = (name: string, created: number) => {
    const s = createSoftware(db, { name, idea: name }, config.softwares);
    db.prepare("UPDATE softwares SET created = ? WHERE id = ?").run(at(created), s.id);
    return s.id;
  };
  return {
    db,
    measures,
    software,
    setClock: (minutes: number) => {
      clock = at(minutes);
    },
  };
}

function event(
  db: Database,
  minutes: number,
  e: { software: string; module: string; kind: string; reference?: string; detail?: unknown },
) {
  db.prepare(
    "INSERT INTO events (time, software_id, module, kind, reference, detail) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    at(minutes),
    e.software,
    e.module,
    e.kind,
    e.reference ?? null,
    e.detail === undefined ? null : JSON.stringify(e.detail),
  );
}

function ask(
  db: Database,
  software: string,
  a: { role?: string; asked: number; answered?: number; shown?: number },
): number {
  const id = Number(
    db
      .prepare(
        `INSERT INTO asks (software_id, role, kind, title, instruction, status, asked, answered)
         VALUES (?, ?, 'question', 'A question', 'Answer it', ?, ?, ?)`,
      )
      .run(
        software,
        a.role ?? "operator",
        a.answered === undefined ? "open" : "answered",
        at(a.asked),
        a.answered === undefined ? null : at(a.answered),
      ).lastInsertRowid,
  );
  if (a.shown !== undefined) {
    db.prepare("INSERT INTO asks_shown (ask_id, shown) VALUES (?, ?)").run(id, at(a.shown));
  }
  return id;
}

function presence(db: Database, from: number, to: number) {
  db.prepare("INSERT INTO page_presence (started, last_seen, ended) VALUES (?, ?, ?)").run(
    at(from),
    at(to),
    at(to),
  );
}

function intakeItem(
  db: Database,
  software: string,
  n: number,
  i: { kind: string; received: number; triaged?: number; fixRunning?: number; touches?: string[] },
) {
  db.prepare(
    `INSERT INTO intake_items (software_id, number, source, sender, text, status, kind, touches, received, triaged, fix_running)
     VALUES (?, ?, 'page', 'operator', ?, 'working', ?, ?, ?, ?, ?)`,
  ).run(
    software,
    n,
    `Item ${n} text`,
    i.kind,
    JSON.stringify((i.touches ?? []).map((id) => ({ id, reason: "it touches it" }))),
    at(i.received),
    i.triaged === undefined ? null : at(i.triaged),
    i.fixRunning === undefined ? null : at(i.fixRunning),
  );
}

function verdict(db: Database, software: string, minutes: number, item: string, v: string) {
  event(db, minutes, {
    software,
    module: "checker",
    kind: "verdict",
    reference: item,
    detail: { verdict: v, evidence: "" },
  });
}

function figure(view: MeasuresView, key: MeasureFigure["key"]): MeasureFigure {
  return view.figures.find((f) => f.key === key)!;
}

describe("the measures, from a scripted history", () => {
  it("says not enough yet, with the count, until a rate or typical time rests on enough", () => {
    const { db, measures, software } = setup();
    const id = software("Reading list", 0);
    ask(db, id, { asked: 1, answered: 3, shown: 2 });
    ask(db, id, { asked: 4, answered: 6 });
    verdict(db, id, 10, "W-1", "met");
    const view = measures.view(id);
    const answer = figure(view, "answer-time");
    expect(answer.enough).toBe(false);
    expect(answer.value).toBe("not enough yet");
    expect(answer.events).toBe(2);
    expect(answer.counts).toContain("2 answered questions so far; a typical time needs at least 5");
    const misses = figure(view, "checker-misses");
    expect(misses.value).toBe("not enough yet");
    expect(misses.counts).toContain("0 of 1 thing");
    expect(figure(view, "idea-to-running").value).toBe("not running yet");
    expect(figure(view, "intake-to-fix").value).toBe("not enough yet");
  });

  it("works out every measure, per software and overall", () => {
    const { db, measures, software, setClock } = setup({ PREMISE_MEASURES__MIN_EVENTS: "2" });
    const id = software("Reading list", 0);
    const other = software("Recipes", 0);
    setClock(200);

    // Attention: the page is open from minute 0 to 60. Two questions overlap from 10 to 15, so
    // those five minutes are shared: 7.5 minutes each, 15 in all. A third stands open while
    // the page is closed and costs no attention.
    presence(db, 0, 60);
    ask(db, id, { role: "operator", asked: 5, shown: 6, answered: 15 });
    ask(db, id, { role: "the designer", asked: 10, answered: 20 });
    ask(db, id, { role: "operator", asked: 70, shown: 70, answered: 80 });

    // From the idea to running: started at 0, first running at 90.
    event(db, 90, { software: id, module: "runner", kind: "started", detail: { run: 1 } });
    event(db, 120, { software: id, module: "runner", kind: "started", detail: { run: 2 } });

    // Intake to fix running: 30 and 50 minutes.
    intakeItem(db, id, 1, { kind: "wish", received: 100, triaged: 101, fixRunning: 130 });
    intakeItem(db, id, 2, { kind: "wish", received: 100, triaged: 101, fixRunning: 150 });

    // Reported working: five items met. A bug against W-2 after it was met is a miss; a bug
    // against W-3, whose latest check said not met, is not; nor is one against an unchecked item.
    for (const item of ["W-1", "W-2", "W-3", "W-4", "W-5"]) verdict(db, id, 110, item, "met");
    verdict(db, id, 111, "W-3", "not-met");
    intakeItem(db, id, 3, { kind: "bug", received: 119, triaged: 120, touches: ["W-2"] });
    intakeItem(db, id, 4, { kind: "bug", received: 119, triaged: 120, touches: ["W-3"] });
    intakeItem(db, id, 5, { kind: "bug", received: 119, triaged: 120, touches: ["W-9"] });
    // A bug triaged before the item was ever met is not a miss either.
    intakeItem(db, other, 1, { kind: "bug", received: 1, triaged: 2, touches: ["W-1"] });
    verdict(db, other, 5, "W-1", "met");

    // Agent sessions: two on the first version, one on a change.
    const root = db.prepare("SELECT id FROM work_items WHERE software_id = ?").get(id) as
      { id: number } | undefined;
    const rootId =
      root?.id ??
      Number(
        db
          .prepare(
            "INSERT INTO work_items (software_id, kind, stages, created) VALUES (?, 'software', '[]', ?)",
          )
          .run(id, at(0)).lastInsertRowid,
      );
    const change = Number(
      db
        .prepare(
          "INSERT INTO work_items (software_id, parent_id, kind, title, ref, stages, created) VALUES (?, ?, 'intake', 'Sort by author', 'I-1', '[]', ?)",
        )
        .run(id, rootId, at(100)).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO stage_runs (software_id, work_item_id, stage, entered) VALUES (?, ?, 'why', ?)",
    ).run(id, rootId, at(0));
    db.prepare(
      "INSERT INTO stage_runs (software_id, work_item_id, stage, entered) VALUES (?, ?, 'build', ?)",
    ).run(id, change, at(100));
    const job = Number(
      db
        .prepare(
          "INSERT INTO jobs (software_id, kind, status, created) VALUES (?, 'draft', 'done', ?)",
        )
        .run(id, at(0)).lastInsertRowid,
    );
    const session = db.prepare(
      "INSERT INTO agent_sessions (runtime_session_id, job_id, agent_role, runtime, model, effort, started) VALUES ('s', ?, 'drafter', 'scripted', 'm', 'low', ?)",
    );
    session.run(job, at(1));
    session.run(job, at(2));
    session.run(job, at(101));

    const view = measures.view(id);
    const attention = figure(view, "attention");
    expect(attention.value).toBe("15 minutes");
    expect(attention.events).toBe(2);
    expect(view.attentionByRole).toEqual([
      { name: "operator", minutes: 7.5, asks: 1 },
      { name: "the designer", minutes: 7.5, asks: 1 },
    ]);
    expect(view.attentionByChange).toEqual([{ name: "The first version", minutes: 15, asks: 2 }]);

    // Shown-to-answered: 9 and 10 minutes (the second was never shown, so from when asked), and
    // the third 10: the middle is 10.
    expect(figure(view, "answer-time").value).toBe("typically 10 minutes");
    expect(figure(view, "idea-to-running").value).toBe("90 minutes");
    expect(figure(view, "intake-to-fix").value).toBe("typically 40 minutes");

    const misses = figure(view, "checker-misses");
    expect(misses.value).toBe("1 of 5 (20%)");
    expect(misses.counts).toContain("1 of the 5 things");
    expect(view.misses).toEqual([
      expect.objectContaining({ intake: "I-3", item: "W-2", softwareId: id }),
    ]);

    expect(figure(view, "sessions").value).toBe("1.5 on average");
    expect(view.sessionsByChange).toEqual([
      { name: "The first version", sessions: 2 },
      { name: "Change I-1: Sort by author", sessions: 1 },
    ]);

    const overview = measures.overview();
    expect(overview.softwares.map((s) => s.name)).toEqual(["Reading list", "Recipes"]);
    expect(figure(overview.overall, "checker-misses").value).toBe("1 of 6 (17%)");
    // One software running is too few for a typical time across softwares.
    expect(figure(overview.overall, "idea-to-running").value).toBe("not enough yet");
    expect(figure(overview.overall, "idea-to-running").counts).toContain("1 software has");

    // Every figure says what it rests on and how it is worked out.
    for (const f of view.figures) {
      expect(f.counts.length).toBeGreaterThan(10);
      expect(f.how.length).toBeGreaterThan(10);
    }
  });

  it("counts a page's presence in stretches: a beat carries one on, a long silence ends it", () => {
    const { db, measures, setClock } = setup();
    setClock(0);
    measures.presence(true);
    setClock(0.5);
    measures.presence(true);
    setClock(1);
    measures.presence(true);
    setClock(10); // silent for nine minutes: a new stretch
    measures.presence(true);
    setClock(10.5);
    measures.presence(false);
    const rows = db
      .prepare("SELECT started, last_seen, ended FROM page_presence ORDER BY id")
      .all();
    expect(rows).toEqual([
      { started: at(0), last_seen: at(1), ended: at(1) },
      { started: at(10), last_seen: at(10.5), ended: at(10.5) },
    ]);
  });

  it("records a question as shown once, through the page's API", async () => {
    const app = await testApp();
    const { body } = await app.call("POST", "/api/softwares", { idea: "A reading list" });
    await app.settle();
    const asks = (await app.call("GET", `/api/asks?software=${body.id}&status=open`)).body as {
      id: number;
    }[];
    expect(asks.length).toBeGreaterThan(0);
    expect((await app.call("POST", `/api/asks/${asks[0]!.id}/shown`)).status).toBe(200);
    const first = app.db.prepare("SELECT shown FROM asks_shown").all();
    await app.call("POST", `/api/asks/${asks[0]!.id}/shown`);
    expect(app.db.prepare("SELECT shown FROM asks_shown").all()).toEqual(first);
    expect((await app.call("POST", "/api/asks/99999/shown")).status).toBe(404);
    expect((await app.call("POST", "/api/presence", { visible: true })).status).toBe(200);
    // Neither writes an event, so the beats never wake other pages.
    const kinds = app.db
      .prepare(
        "SELECT COUNT(*) AS n FROM events WHERE kind LIKE '%presence%' OR kind LIKE '%shown%'",
      )
      .get() as { n: number };
    expect(kinds.n).toBe(0);

    const measures = await app.call("GET", `/api/softwares/${body.id}/measures`);
    expect(measures.status).toBe(200);
    expect((measures.body as MeasuresView).figures).toHaveLength(6);
    expect((await app.call("GET", "/api/softwares/nope/measures")).status).toBe(404);

    // The report carries the block, real and not mocked.
    const report = await app.call("GET", `/api/softwares/${body.id}/report`);
    expect(report.body.doing.plain).toContain("not mocked");
    expect(report.body.doing.lines.map((l: { text: string }) => l.text)).toContainEqual(
      expect.stringContaining("Reported working, came back as a bug: not enough yet"),
    );
  });

  it("counts a stretch still open only until its next beat was due", () => {
    const { db, measures, software, setClock } = setup();
    const id = software("Reading list", 0);
    ask(db, id, { asked: 0 });
    setClock(10);
    measures.presence(true); // one beat, then nothing: counts 30 seconds, not 50 minutes
    setClock(60);
    expect(figure(measures.view(id), "attention").counts).toContain("under a minute");
    expect(figure(measures.view(id), "attention").events).toBe(1);
  });
});
