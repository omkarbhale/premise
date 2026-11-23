import { describe, expect, it } from "vitest";
import type { AgentScript } from "../src/agents/scripted-agent.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import { ruleReading } from "../src/learning/rules.js";
import type { AskView, ChatMessage, LearningView } from "../src/shared/api-types.js";
import { testApp } from "./helpers.js";

/**
 * Learning from corrections (decisions 0173 and 0195), with the scripted agent and this file as
 * the operator: a strike becomes a lesson the next draft's brief carries, taste carries to a second
 * software, lines are moved, deleted and dropped at the cap, a checker miss becomes an improvement
 * for premise that never reaches a brief, and all of it survives a restart.
 */

type App = Awaited<ReturnType<typeof testApp>>;

const STRUCK = "Doing this by hand today takes time, or gets skipped.";

/** The What drafter follows the first lesson, and says so. */
const followsScript: AgentScript = {
  rules: [
    {
      when: { task: "draft", stage: "what" },
      behave: (_request, call) => {
        call("draft_submit", {
          stage: "what",
          items: [
            { text: "must: Add a book to the list", follows: "L-1" },
            { text: "should: Mark a book as read" },
          ],
        });
      },
      end: { outcome: "done" },
    },
    ...standInScript(0).rules,
  ],
};

async function lineAsk(app: App, softwareId: string): Promise<AskView> {
  const { body } = await app.call("GET", `/api/asks?software=${softwareId}&status=open`);
  const asks = (body as AskView[]).filter((a) => a.kind !== "approval");
  expect(asks, JSON.stringify(asks.map((a) => a.title))).toHaveLength(1);
  return asks[0]!;
}

async function answer(app: App, ask: AskView, strike: Record<string, string> = {}) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: {
      kind: "items",
      items: ask.items.map((i) =>
        strike[i.text] !== undefined
          ? { key: i.key, decision: "strike", reason: strike[i.text] }
          : { key: i.key, decision: "keep" },
      ),
    },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

async function start(app: App, idea = "A small page where I keep my reading list") {
  const { body } = await app.call("POST", "/api/softwares", { idea });
  await app.settle();
  return body.id as string;
}

async function learned(app: App, softwareId: string | null): Promise<LearningView> {
  const res = await app.call("GET", `/api/learning${softwareId ? `?software=${softwareId}` : ""}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as LearningView;
}

function briefsFor(app: App, softwareId: string, stage: string): string[] {
  return app.runner.requests
    .filter((r) => r.softwareId === softwareId && r.context?.stage === stage)
    .map((r) => r.brief);
}

async function chat(app: App, softwareId: string): Promise<string[]> {
  const { body } = await app.call("GET", `/api/softwares/${softwareId}/chat`);
  return (body as ChatMessage[]).map((m) => m.text);
}

describe("learning from corrections", () => {
  it("turns a strike into a lesson that the next draft's brief carries, and the draft says it follows it", async () => {
    const app = await testApp({}, { script: followsScript });
    const id = await start(app);
    await answer(app, await lineAsk(app, id), { [STRUCK]: "I never skip it" });

    const view = await learned(app, id);
    expect(view.explain.adapting).toContain("lesson");
    expect(view.explain.improving).toContain("never change how premise works");
    expect(view.corrections).toHaveLength(1);
    const correction = view.corrections[0]!;
    expect(correction).toMatchObject({
      kind: "strike",
      status: "read",
      destination: "software",
      decidedBy: "agent",
    });
    expect(correction.what).toContain(`You struck “${STRUCK}” at Why`);
    expect(correction.reason).toContain("Scripted triager");
    expect(view.software!.lines).toHaveLength(1);
    const lesson = view.software!.lines[0]!;
    expect(lesson.label).toBe("L-1");
    expect(lesson.text).toBe(
      `Do not assume “${STRUCK.replace(/\.$/, "")}”; it was struck: I never skip it.`,
    );
    expect(lesson.source).toContain("You struck");
    // Proposed in passing, in the conversation, never as a question.
    expect((await chat(app, id)).join("\n")).toContain("Learned from your correction");
    const { body: open } = await app.call("GET", `/api/asks?software=${id}&status=open`);
    expect((open as AskView[]).every((a) => !a.title.toLowerCase().includes("lesson"))).toBe(true);

    // Who's brief was written before the lesson existed; What's, after it, carries it.
    await answer(app, await lineAsk(app, id)); // who
    await app.call("POST", `/api/asks/${(await lineAsk(app, id)).id}/answer`, {
      answer: { kind: "text", text: "Build it" },
    });
    await app.settle();
    const what = briefsFor(app, id, "what");
    expect(what.at(-1)).toContain(`L-1: ${lesson.text}`);
    expect(what.at(-1)).toContain('"follows": "L-n"');

    const draft = await lineAsk(app, id);
    expect(draft.items[0]!.follows).toEqual({ label: "L-1", text: lesson.text });
    expect(draft.items[1]!.follows).toBeUndefined();

    const after = await learned(app, id);
    expect(after.software!.lines[0]!.uses).toBeGreaterThanOrEqual(1);
    expect(after.software!.lines[0]!.lastUsed).not.toBeNull();
  }, 30_000);

  it("carries taste to a second software, and stops using a deleted line", async () => {
    const app = await testApp();
    const first = await start(app);
    await answer(app, await lineAsk(app, first), { [STRUCK]: "I like plain words" });
    const correction = (await learned(app, first)).corrections[0]!;

    // A lesson for one software stays with it.
    const second = await start(app, "A list of recipes I want to try");
    expect(briefsFor(app, second, "why").at(-1)).not.toContain("L-1");

    // Moved to taste in one click, it reaches every software.
    const moved = await app.call("POST", `/api/corrections/${correction.id}/move`, {
      destination: "taste",
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const view = await learned(app, first);
    expect(view.software!.lines).toHaveLength(0);
    expect(view.taste.lines.map((l) => l.label)).toEqual(["L-1"]);
    expect(view.corrections[0]).toMatchObject({ destination: "taste", decidedBy: "operator" });
    const third = await start(app, "A tracker for the plants on my balcony");
    const brief = briefsFor(app, third, "why").at(-1)!;
    expect(brief).toContain("The operator's taste, for every software:");
    expect(brief).toContain("L-1:");

    // Edited, then deleted from the page in one click: the next brief has no line.
    expect(
      (await app.call("POST", "/api/lessons/1/edit", { text: "Use plain words." })).status,
    ).toBe(200);
    expect((await learned(app, null)).taste.lines[0]!.text).toBe("Use plain words.");
    expect((await app.call("POST", "/api/lessons/1/delete")).status).toBe(200);
    const fourth = await start(app, "A list of films to watch");
    expect(briefsFor(app, fourth, "why").at(-1)).not.toContain("L-1");
    const after = await learned(app, null);
    expect(after.taste.lines).toHaveLength(0);
    expect(after.ended[0]).toMatchObject({ label: "L-1", note: "Deleted by you." });
    // The correction it came from says its lesson is gone, rather than look still in force.
    const source = after.corrections.find((c) => c.lessonEnded?.label === "L-1");
    expect(source).toMatchObject({ lessonId: null, lessonEnded: { note: "Deleted by you." } });
    // A deleted line cannot be deleted again; the message says what to do.
    const again = await app.call("POST", "/api/lessons/1/delete");
    expect(again.status).toBe(404);
    expect(again.body.error).toContain("Reload the page");
  }, 30_000);

  it("keeps each list to its cap by dropping the least-used line, with a note", async () => {
    const app = await testApp({
      PREMISE_LEARNING__SOFTWARE_LINES_MAX: "2",
      PREMISE_LEARNING__READ_WITH_AGENT: "false",
    });
    const id = await start(app);
    await answer(app, await lineAsk(app, id), { [STRUCK]: "Not for me" }); // L-1
    expect((await learned(app, id)).corrections[0]!.decidedBy).toBe("rule");
    // A brief carries L-1, so it has been used; then two items are struck at Who.
    expect(app.session.learning.section("drafter", id)).toContain("L-1:");
    const who = await lineAsk(app, id);
    const [a, b] = who.items.filter((i) => i.mark !== "from-role");
    await answer(app, who, { [a!.text]: "Wrong people", [b!.text]: "Not a role here" });

    const view = await learned(app, id);
    expect(view.software!.max).toBe(2);
    expect(view.software!.lines.map((l) => l.label)).toEqual(["L-1", "L-3"]);
    expect(view.ended).toEqual([
      expect.objectContaining({
        label: "L-2",
        note: expect.stringContaining("Dropped to keep the list at 2 lines: it was the least used"),
      }),
    ]);
    expect((await chat(app, id)).join("\n")).toContain("dropped its least-used line");
  }, 30_000);

  it("reads a send-back as nothing to learn, and the person can move it to a list", async () => {
    const app = await testApp();
    const id = await start(app);
    await answer(app, await lineAsk(app, id)); // why, nothing struck
    const res = await app.call("POST", `/api/softwares/${id}/send-back`, { stage: "why" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await app.settle();
    const view = await learned(app, id);
    const sent = view.corrections.find((c) => c.kind === "send-back")!;
    expect(sent).toMatchObject({ destination: "none", lessonId: null });
    expect(sent.reason).toContain("Say in chat what was wrong");
    await app.call("POST", `/api/corrections/${sent.id}/move`, { destination: "software" });
    const moved = await learned(app, id);
    expect(moved.software!.lines).toHaveLength(1);
    expect(moved.software!.lines[0]!.text).toContain("You sent the work back to Why");
    const wrong = await app.call("POST", `/api/corrections/${sent.id}/move`, {
      destination: "elsewhere",
    });
    expect(wrong.status).toBe(422);
  }, 30_000);

  it("keeps a checker miss as an improvement for premise: grouped, exportable, never in a brief", async () => {
    const app = await testApp();
    const id = await start(app);
    const db = app.db;
    const miss = (n: number, item: string) => {
      db.prepare(
        "INSERT INTO events (time, software_id, module, kind, reference, detail) VALUES (?, ?, 'checker', 'verdict', ?, ?)",
      ).run(new Date().toISOString(), id, item, JSON.stringify({ verdict: "met", evidence: "" }));
      db.prepare(
        `INSERT INTO intake_items (software_id, number, source, sender, text, status, kind, touches, received, triaged)
         VALUES (?, ?, 'page', 'operator', 'Adding a book does nothing', 'working', 'bug', ?, ?, ?)`,
      ).run(
        id,
        n,
        JSON.stringify([{ id: item, reason: "adding books" }]),
        new Date().toISOString(),
        new Date(Date.now() + 1000).toISOString(),
      );
      db.prepare(
        "INSERT INTO events (time, software_id, module, kind, reference, detail) VALUES (?, ?, 'intake', 'triaged', ?, ?)",
      ).run(new Date().toISOString(), id, `I-${n}`, JSON.stringify({ kind: "bug" }));
    };
    miss(1, "W-1");
    miss(2, "W-2");
    app.session.learning.catchUp();
    const view = await learned(app, id);
    expect(view.corrections.filter((c) => c.kind === "bug-after-met")).toHaveLength(2);
    expect(view.corrections[0]).toMatchObject({ destination: "premise", decidedBy: "rule" });
    expect(view.improvements).toHaveLength(1);
    expect(view.improvements[0]).toMatchObject({ topic: "checker-miss", seen: 2 });
    expect(view.software!.lines).toHaveLength(0);
    expect(view.taste.lines).toHaveLength(0);

    // Never in a brief: improvements do not change how premise works.
    const other = await start(app, "A list of recipes");
    expect(briefsFor(app, other, "why").at(-1)).not.toContain("check said");
    expect(app.session.learning.section("checker", id)).toBeNull();

    // Exported as a text file.
    const file = await app.app.inject({
      method: "GET",
      url: "/api/improvements.txt",
      headers: app.headers,
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toContain("text/plain");
    expect(file.headers["content-disposition"]).toContain("premise-improvements.txt");
    expect(file.body).toContain("Improvements for premise");
    expect(file.body).toContain("Seen 2 times");
    expect(file.body).toContain("I-1 reported a bug in W-1");

    // Deleted as a group.
    expect(
      (await app.call("POST", "/api/improvements/delete", { topic: "checker-miss" })).status,
    ).toBe(200);
    expect((await learned(app, id)).improvements).toHaveLength(0);
  }, 30_000);

  it("survives a restart: lines stay, nothing is taken in twice, and a cut-off reading finishes", async () => {
    const hang: AgentScript = {
      rules: [
        { when: { task: "triage", purpose: "learn" }, end: { outcome: "hang" } },
        ...standInScript(0).rules,
      ],
    };
    const first = await testApp({}, { script: hang });
    const id = await start(first);
    // Not settled: the reading never finishes in this premise.
    const why = await lineAsk(first, id);
    await first.call("POST", `/api/asks/${why.id}/answer`, {
      answer: {
        kind: "items",
        items: why.items.map((i) =>
          i.text === STRUCK
            ? { key: i.key, decision: "strike", reason: "Not true" }
            : { key: i.key, decision: "keep" },
        ),
      },
    });
    first.session.learning.catchUp();
    first.session.queue.tick();
    await new Promise((r) => setTimeout(r, 50));
    const reading = await learned(first, id);
    expect(reading.corrections[0]!.status).toBe("reading");
    expect(reading.software!.lines).toHaveLength(0);

    const second = await testApp({}, { folder: first.folder });
    second.session.queue.recover();
    await second.settle();
    second.session.learning.recover();
    second.session.learning.catchUp();
    const view = await learned(second, id);
    expect(view.corrections).toHaveLength(1);
    expect(view.corrections[0]!.status).toBe("read");
    expect(view.software!.lines.map((l) => l.label)).toEqual(["L-1"]);

    // A third start changes nothing.
    const third = await testApp({}, { folder: first.folder });
    third.session.learning.recover();
    third.session.learning.catchUp();
    const again = await learned(third, id);
    expect(again.corrections).toHaveLength(1);
    expect(again.software!.lines).toHaveLength(1);
  }, 30_000);

  it("refuses a malformed reading and takes a good one", async () => {
    const script: AgentScript = {
      rules: [
        {
          when: { task: "triage", purpose: "learn" },
          behave: (_request, call) => {
            const bad = call("lesson_submit", { destination: "somewhere", mistake: "" });
            expect(bad.ok).toBe(false);
            expect(bad.diagnostics.join(" ")).toContain('"destination" must be one of');
            const good = call("lesson_submit", {
              mistake: "assumed how the person works",
              destination: "taste",
              reason: "It is how this person likes to work, whatever the software.",
              line: "Assume the person keeps lists by hand only when they say so.",
            });
            expect(good.ok).toBe(true);
            const twice = call("lesson_submit", {
              mistake: "x",
              destination: "none",
              reason: "x",
            });
            expect(twice.error!.code).toBe("CONFLICT");
          },
          end: { outcome: "done" },
        },
        ...standInScript(0).rules,
      ],
    };
    const app = await testApp({}, { script });
    const id = await start(app);
    await answer(app, await lineAsk(app, id), { [STRUCK]: "No" });
    const view = await learned(app, id);
    expect(view.taste.lines.map((l) => l.text)).toEqual([
      "Assume the person keeps lists by hand only when they say so.",
    ]);
    expect((await chat(app, id)).join("\n")).toContain("Noted as your taste, for every software");
  }, 30_000);
});

describe("premise's fixed rules for a correction", () => {
  it("gives each kind of correction one destination, with a reason", () => {
    const base = { what: "", said: null, subject: null, replacement: null, stage: null };
    expect(
      ruleReading({ ...base, kind: "decline-gate", subject: "Push the code to GitHub" }),
    ).toMatchObject({ destination: "software" });
    expect(
      ruleReading({ ...base, kind: "decline-gate", subject: "Push the code to GitHub" }).line,
    ).toBe("Do not plan on this without asking first: Push the code to GitHub.");
    expect(
      ruleReading({ ...base, kind: "edit", subject: "Readers", replacement: "Book clubs" }).line,
    ).toBe("Where premise wrote “Readers”, the person meant “Book clubs”.");
    expect(ruleReading({ ...base, kind: "reject-draft" })).toMatchObject({
      destination: "none",
      line: null,
    });
    expect(ruleReading({ ...base, kind: "undo-split" })).toMatchObject({
      destination: "premise",
      topic: "split-too-eagerly",
    });
  });
});
