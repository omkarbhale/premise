import { describe, expect, it, vi } from "vitest";
import type { ScriptRule } from "../src/agents/scripted-agent.js";
import { FixtureIssueSource } from "../src/intake/issues.js";
import { readShortList } from "../src/intake/triage.js";
import type { AskView, IntakeView, MeasuresView, ReportView } from "../src/shared/api-types.js";
import {
  type App,
  chat,
  intake,
  item,
  openAsks,
  routed,
  runningSoftware,
  say,
  script,
  testApp,
  triager,
} from "./fixtures/intake-harness.js";

/**
 * Intake beyond the thin form (docs/specs/intake.md): the feedback page, GitHub issues behind a
 * local fixture, duplicates across sources, readings that name the items behind each line, the
 * operator's say on each line, the way back to Why, and counts per route. Planted items against a
 * running demo software; scripted agents; no network and no Claude.
 */

/** A raw request to premise with no session token, as a software's user's browser would make. */
async function plain(app: App, method: "GET" | "POST", url: string, form?: Record<string, string>) {
  const response = await app.app.inject({
    method,
    url,
    headers: {
      host: `localhost:${app.config.server.port}`,
      ...(form && { "content-type": "application/x-www-form-urlencoded" }),
    },
    ...(form && { payload: new URLSearchParams(form).toString() }),
  });
  return {
    status: response.statusCode,
    html: response.body,
    location: response.headers.location as string | undefined,
  };
}

async function feedbackPath(app: App, id: string): Promise<string> {
  const view = await intake(app, id);
  expect(view.feedback).not.toBeNull();
  return view.feedback!.path;
}

/** Send feedback on the page and return the path of the receipt page. */
async function sendFeedback(app: App, path: string, text: string): Promise<string> {
  const sent = await plain(app, "POST", path, { text });
  expect(sent.status, sent.html).toBe(303);
  expect(sent.location).toMatch(/\/received\//);
  await app.settle();
  return sent.location!;
}

/** The scripted reader: groups the held items by a word in their text. */
function reader(
  group: (held: { number: number; text: string }[]) => Record<string, unknown>,
): ScriptRule {
  return {
    when: { task: "reading" },
    behave: (request, call) => {
      const held = (request.context?.held ?? []) as { number: number; text: string }[];
      call("reading_submit", group(held));
    },
    end: { outcome: "done" },
  };
}

const refs = (held: { number: number }[], match: (n: number) => boolean) =>
  held.filter((h) => match(h.number)).map((h) => `I-${h.number}`);

async function approvals(app: App, id: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${id}&status=open`);
  return (body as AskView[]).filter((a) => a.kind === "approval");
}

describe("the feedback page", () => {
  it("takes feedback from a software's user and shows them where it stands, end to end", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager((text) =>
            text.includes("lorem")
              ? routed("noise", "merged-or-closed", {
                  reason: "It says nothing about the software.",
                })
              : routed("bug", "in-normally"),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    const path = await feedbackPath(app, id);

    // The page opens with no session token, and says who can reach it.
    const form = await plain(app, "GET", path);
    expect(form.status).toBe(200);
    expect(form.html).toContain("<form");
    expect(form.html).toContain("Who can reach this page: only people using the computer");
    expect(form.html).not.toContain("<script");

    // The session's API stays closed to it.
    const refused = await app.app.inject({
      method: "GET",
      url: `/api/softwares/${id}/intake`,
      headers: { host: `localhost:${app.config.server.port}` },
    });
    expect(refused.statusCode).toBe(401);

    // Feedback comes in as intake, from the feedback page, with a receipt.
    const receipt = await sendFeedback(app, path, "The list forgets the last book");
    const bug = await item(app, id, "I-1");
    expect(bug).toMatchObject({ source: "feedback", kind: "bug", status: "running" });
    expect(bug.senderNote).toContain("receipt");

    // The receipt page shows where it stands, in words for the sender, and nothing else.
    const standing = await plain(app, "GET", receipt);
    expect(standing.status).toBe(200);
    expect(standing.html).toContain("Done");
    expect(standing.html).toContain("The change it led to is now running.");
    expect(standing.html).toContain("The list forgets the last book");
    expect(standing.html).not.toContain("I-1");

    // A wrong receipt, a wrong link and another software's receipt open nothing.
    expect((await plain(app, "GET", `${path}/received/nope`)).status).toBe(404);
    expect((await plain(app, "GET", "/feedback/not-a-link")).status).toBe(404);
    const other = await runningSoftware(app);
    const otherPath = await feedbackPath(app, other);
    expect(otherPath).not.toBe(path);
    expect((await plain(app, "GET", receipt.replace(path, otherPath))).status).toBe(404);

    // Noise is closed, and its sender is told it was closed without internal detail.
    const noisy = await sendFeedback(app, path, "lorem ipsum dolor");
    const closed = await plain(app, "GET", noisy);
    expect(closed.html).toContain("Closed");
    expect(closed.html).not.toContain("says nothing about the software");

    // An empty or over-long message is refused on the page, in plain words, keeping what was typed.
    const empty = await plain(app, "POST", path, { text: "   " });
    expect(empty.status).toBe(422);
    expect(empty.html).toContain("Write what the problem or the wish is first.");
    const long = await plain(app, "POST", path, { text: "x".repeat(5000) });
    expect(long.status).toBe(422);
    expect(long.html).toContain("keep it under 4000");

    // The operator sees both items, and counts per source.
    const view = await intake(app, id);
    expect(view.routes.bySource).toEqual({ feedback: 2 });
  });

  it("can be replaced, switched off, and limited per hour", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__FEEDBACK_PER_HOUR: "2" },
      { script: script(triager(() => routed("opinion", "held"))) },
    );
    const id = await runningSoftware(app);
    const path = await feedbackPath(app, id);
    await sendFeedback(app, path, "First thing I noticed");
    await sendFeedback(app, path, "Second thing I noticed");
    const flood = await plain(app, "POST", path, { text: "Third thing I noticed" });
    expect(flood.status).toBe(422);
    expect(flood.html).toContain("taken a lot of feedback in the last hour");

    // A new link replaces the old one, which stops working.
    const replaced = await app.call("POST", `/api/softwares/${id}/intake/new-feedback-link`);
    expect(replaced.status).toBe(200);
    const fresh = (replaced.body as IntakeView).feedback!.path;
    expect(fresh).not.toBe(path);
    expect((await plain(app, "GET", path)).status).toBe(404);
    expect((await plain(app, "GET", fresh)).status).toBe(200);

    const off = await testApp({ PREMISE_INTAKE__FEEDBACK_PAGE: "false" }, { script: script() });
    const offId = await runningSoftware(off);
    expect((await intake(off, offId)).feedback).toBeNull();
  });
});

describe("GitHub issues as an intake source", () => {
  it("reads issues from a fixture, merges a repeat across sources, and tells the sender through the gate", async () => {
    const issues = new FixtureIssueSource();
    const app = await testApp(
      {},
      {
        issues,
        script: script(triager(() => routed("bug", "in-normally"))),
      },
    );
    const id = await runningSoftware(app);

    // No GitHub repository yet: nothing to read, and the page says so plainly.
    expect((await intake(app, id)).github.repository).toBeNull();
    const none = await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    expect(none.status).toBe(422);
    expect(none.body.error).toContain("no GitHub repository yet");

    issues.link(id, "demo/books");
    issues.open("demo/books", {
      number: 12,
      title: "Saving a book fails",
      body: "It forgets the last one after a restart.",
      author: "reader1",
    });
    const read = await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    await app.settle();
    expect((read.body as IntakeView).github).toMatchObject({
      repository: "demo/books",
      taken: 1,
    });

    const bug = await item(app, id, "I-1");
    expect(bug).toMatchObject({ source: "github", kind: "bug", status: "running" });
    expect(bug.sender).toBe("a user of the software (GitHub: reader1)");

    // Reading again takes nothing twice.
    await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    await app.settle();
    expect((await intake(app, id)).items).toHaveLength(1);

    // The comment to the sender is public and in the owner's name, so it waits at the gate.
    expect(issues.comments).toEqual([]);
    const [card] = await approvals(app, id);
    expect(card!.approval!.action).toContain("Comment on GitHub issue #12 of demo/books");
    expect(card!.approval!.action).toContain("now running");
    expect(bug.senderNote ?? (await item(app, id, "I-1")).senderNote).toContain(
      "waits for your approval",
    );
    const answered = await app.call("POST", `/api/asks/${card!.id}/answer`, {
      answer: { kind: "approval", decision: "approve-once" },
    });
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    await app.settle();
    expect(issues.comments).toHaveLength(1);
    expect(issues.comments[0]).toMatchObject({ repository: "demo/books", number: 12 });
    expect((await item(app, id, "I-1")).senderNote).toContain("was told on GitHub");

    // The same words from the feedback page, another source, merge into the first without an agent.
    const path = await feedbackPath(app, id);
    const receipt = await sendFeedback(
      app,
      path,
      "Saving a book fails\n\nIt forgets the last one after a restart.",
    );
    const repeat = await item(app, id, "I-2");
    expect(repeat).toMatchObject({ status: "merged", joins: "I-1", routedBy: "default" });
    expect(repeat.where).toContain("Merged into I-1");
    expect(app.runner.requests.filter((r) => r.taskKind === "triage")).toHaveLength(1);
    // Its sender is told where the item it joined stands.
    const standing = await plain(app, "GET", receipt);
    expect(standing.html).toContain("Done");
    expect(standing.html).toContain("joined with an earlier report of the same thing");
  });

  it("posts, for each approved request, the words on that request's card, even with two comments waiting for one item", async () => {
    const issues = new FixtureIssueSource();
    const app = await testApp(
      {},
      { issues, script: script(triager(() => routed("opinion", "held"))) },
    );
    const id = await runningSoftware(app);
    issues.link(id, "demo/books");
    issues.open("demo/books", { number: 5, title: "Dark mode please", body: "" });
    await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    await app.settle();
    const held = await item(app, id, "I-1");
    expect(held.status).toBe("held");
    await app.call("POST", `/api/intake/${held.id}/undo`);
    await app.settle();
    // The undone opinion is a wish: taken in and built at once, premise saying what it took.
    expect((await item(app, id, "I-1")).status).toBe("running");

    const cards = await approvals(app, id);
    expect(cards).toHaveLength(2);
    const heldCard = cards.find((c) => c.approval!.action.includes("has been noted"))!;
    const runningCard = cards.find((c) => c.approval!.action.includes("now running"))!;
    expect(heldCard).toBeDefined();
    expect(runningCard).toBeDefined();

    await app.call("POST", `/api/asks/${heldCard.id}/answer`, {
      answer: { kind: "approval", decision: "approve-once" },
    });
    await app.settle();
    expect(issues.comments).toHaveLength(1);
    expect(issues.comments[0]!.text).toContain("has been noted");

    await app.call("POST", `/api/asks/${runningCard.id}/answer`, {
      answer: { kind: "approval", decision: "approve-once" },
    });
    await app.settle();
    expect(issues.comments).toHaveLength(2);
    expect(issues.comments[1]!.text).toContain("now running");
  });

  it("posts the comment at once when posting is already approved as a kind", async () => {
    const issues = new FixtureIssueSource();
    const app = await testApp(
      {},
      { issues, script: script(triager(() => routed("opinion", "held"))) },
    );
    const id = await runningSoftware(app);
    issues.link(id, "demo/books");
    issues.open("demo/books", { number: 6, title: "First opinion", body: "" });
    await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    await app.settle();
    const [card] = await approvals(app, id);
    await app.call("POST", `/api/asks/${card!.id}/answer`, {
      answer: { kind: "approval", decision: "approve-kind" },
    });
    await app.settle();
    expect(issues.comments).toHaveLength(1);

    issues.open("demo/books", { number: 7, title: "Second opinion", body: "" });
    await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    await app.settle();
    expect(await approvals(app, id)).toEqual([]);
    expect(issues.comments).toHaveLength(2);
    expect(issues.comments[1]).toMatchObject({ number: 7 });
    expect((await item(app, id, "I-2")).senderNote).toContain("was told on GitHub");
  });

  it("declining a comment leaves the item visible, and a failing reading is said plainly", async () => {
    const issues = new FixtureIssueSource();
    const app = await testApp(
      {},
      { issues, script: script(triager(() => routed("opinion", "held"))) },
    );
    const id = await runningSoftware(app);
    issues.link(id, "demo/books");
    issues.open("demo/books", { number: 3, title: "Nobody needs this", body: "" });
    await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
    await app.settle();
    expect((await item(app, id, "I-1")).status).toBe("held");

    const [card] = await approvals(app, id);
    await app.call("POST", `/api/asks/${card!.id}/answer`, {
      answer: { kind: "approval", decision: "refuse", reason: "Not now" },
    });
    await app.settle();
    expect(issues.comments).toEqual([]);
    expect((await item(app, id, "I-1")).senderNote).toContain("You declined a comment");

    issues.failWith = "the network is down";
    for (let i = 0; i < 3; i++) {
      const failed = await app.call("POST", `/api/softwares/${id}/intake/read-issues`);
      expect((failed.body as IntakeView).github.problem).toContain("the network is down");
    }
    expect((await chat(app, id)).some((t) => t.includes("failed three times in a row"))).toBe(true);
  });
});

describe("readings that lead somewhere", () => {
  it("reads held opinions together with the items behind each line, and the operator decides each line", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "4" },
      {
        script: script(
          triager((text) =>
            text.includes("ruined")
              ? routed("bug", "in-normally")
              : routed(text.includes("sort") ? "wish" : "opinion", "held"),
          ),
          reader((held) => ({
            wanted: [
              {
                line: "People want to sort by author",
                items: refs(held, (n) => n <= 2),
              },
            ],
            recurring: [
              { line: "It looks dated", items: refs(held, (n) => n === 3) },
              { line: "Some want a dark mode", items: refs(held, (n) => n === 4) },
            ],
            purpose: "The purpose stands; the wish is about sorting.",
            back_to_why: "no",
          })),
        ),
      },
    );
    const id = await runningSoftware(app);
    const path = await feedbackPath(app, id);
    const first = await sendFeedback(app, path, "Please let me sort by author");
    await say(app, id, "I would like to sort by author too, same as my other apps");
    await say(app, id, "It looks dated");
    await say(app, id, "A dark mode would be nice");

    // Four held items start a reading by themselves; the list names the items behind each line.
    const view = await intake(app, id);
    const reading = view.readings[0]!;
    expect(reading).toMatchObject({ trigger: "count", status: "done" });
    expect(reading.shortList!.wanted[0]).toMatchObject({
      text: "People want to sort by author",
      count: 2,
    });
    expect(reading.shortList!.wanted[0]!.items.map((i) => i.ref)).toEqual(["I-1", "I-2"]);
    const ask = (await openAsks(app, id)).find((a) => a.title.includes("held items"))!;
    expect(ask.instruction).toContain("People want to sort by author (2 items: I-1, I-2)");
    expect(ask.instruction).not.toContain("Plainly: people may not want");
    const standingBefore = await plain(app, "GET", first);
    expect(standingBefore.html).toContain("Kept for now");

    // Turn the first line into work: one wish, led by I-1, with I-2 merged behind it; both are told.
    const decided = await app.call("POST", `/api/readings/${reading.id}/decide`, {
      list: "wanted",
      index: 0,
      choice: "work",
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    await app.settle();
    expect(await item(app, id, "I-1")).toMatchObject({
      status: "running",
      kind: "wish",
      routedBy: "operator",
    });
    expect(await item(app, id, "I-2")).toMatchObject({ status: "merged", joins: "I-1" });
    const brief = app.runner.requests.filter((r) => r.taskKind === "draft").at(-1)!.brief;
    expect(brief).toContain("People want to sort by author");
    expect(brief).toContain("I-2");
    expect((await plain(app, "GET", first)).html).toContain("Done");
    // The same line cannot be decided twice.
    const twice = await app.call("POST", `/api/readings/${reading.id}/decide`, {
      list: "wanted",
      index: 0,
      choice: "close",
    });
    expect(twice.status).toBe(422);

    // Keep one line held, close the other.
    await app.call("POST", `/api/readings/${reading.id}/decide`, {
      list: "recurring",
      index: 0,
      choice: "keep",
      reason: "I want to hear it from more people",
    });
    expect(await item(app, id, "I-3")).toMatchObject({ status: "held" });
    expect((await item(app, id, "I-3")).where).toContain("You kept it held after the reading");
    const last = await app.call("POST", `/api/readings/${reading.id}/decide`, {
      list: "recurring",
      index: 1,
      choice: "close",
      reason: "Out of scope",
    });
    const closed = await item(app, id, "I-4");
    expect(closed).toMatchObject({ status: "closed", canUndo: true });
    expect(closed.where).toContain("Out of scope");
    // Every line decided: the question under Waiting on you has no point left, and is withdrawn.
    expect(last.status).toBe(200);
    expect((await openAsks(app, id)).find((a) => a.title.includes("held items"))).toBeUndefined();
    // The kept item waits for time or for the operator, and does not start a reading by itself.
    expect((await intake(app, id)).reading).toBe(false);
  });

  it("says plainly when people do not want the software, with the evidence, and goes back to Why", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "3" },
      {
        script: script(
          triager(() => routed("opinion", "held")),
          reader((held) => ({
            wanted: [],
            recurring: [{ line: "Nobody sees a use for it", items: refs(held, () => true) }],
            purpose: "The problem it solves may not be one people have.",
            back_to_why: "yes",
            not_wanted: refs(held, () => true),
          })),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "I do not see what this is for");
    await say(app, id, "I already have a notebook for this");
    await say(app, id, "Nobody I know would use it");

    const ask = (await openAsks(app, id)).find((a) => a.title.includes("may not want this"))!;
    expect(ask.title).toBe("The 3 held items say people may not want this. Go back to Why?");
    expect(ask.instruction).toContain("Plainly: people may not want what this software does.");
    expect(ask.instruction).toContain("3 items say people do not want what the software does");
    expect(ask.instruction).toContain("I-1 (“I do not see what this is for”)");
    expect(ask.instruction).toContain("the wrong problem may have been solved");
    expect(ask.choices).toEqual(["Noted", "Go back to Why"]);
    expect((await chat(app, id)).some((t) => t.includes("I suggest going back to Why"))).toBe(true);
    const view = await intake(app, id);
    expect(view.readings[0]!.shortList!.evidence).toContain("3 items say people do not want");

    // The operator chooses, and the line engine reopens Why.
    const back = await app.call("POST", `/api/readings/${view.readings[0]!.id}/back-to-why`);
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    await app.settle();
    const why = (await openAsks(app, id)).find((a) => a.stage === "why");
    expect(why).toBeDefined();
    expect(
      (await openAsks(app, id)).find((a) => a.title.includes("may not want this")),
    ).toBeUndefined();
  });

  it("goes back to Why from the question under Waiting on you, too, and keeps undecided lines held on Noted", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "2" },
      {
        script: script(
          triager(() => routed("opinion", "held")),
          reader((held) => ({
            recurring: [{ line: "It is not useful", items: refs(held, () => true) }],
            purpose: "People may not need it.",
            back_to_why: "yes",
            not_wanted: refs(held, () => true),
          })),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Not useful to me");
    await say(app, id, "Not useful to anyone I know");
    const ask = (await openAsks(app, id)).find((a) => a.title.includes("may not want this"))!;
    await app.call("POST", `/api/asks/${ask.id}/answer`, {
      answer: { kind: "text", text: "Go back to Why" },
    });
    await app.settle();
    expect((await openAsks(app, id)).find((a) => a.stage === "why")).toBeDefined();
    // Going back to Why leaves the items as the evidence they are: read, not lost.
    expect((await item(app, id, "I-1")).status).toBe("read");
    const sent = (await intake(app, id)).readings[0]!;
    expect(sent.sentBack).toBe(true);
    const again = await app.call("POST", `/api/readings/${sent.id}/back-to-why`);
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(again.body)).toContain("already went back to Why");
  });

  it("still goes back to Why from the tab after the question was answered Noted, and only once", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "2" },
      {
        script: script(
          triager(() => routed("opinion", "held")),
          reader((held) => ({
            recurring: [{ line: "It is not useful", items: refs(held, () => true) }],
            purpose: "People may not need it.",
            back_to_why: "yes",
            not_wanted: refs(held, () => true),
          })),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Not useful to me");
    await say(app, id, "Not useful to anyone I know");
    const ask = (await openAsks(app, id)).find((a) => a.title.includes("may not want this"))!;
    await app.call("POST", `/api/asks/${ask.id}/answer`, {
      answer: { kind: "text", text: "Noted" },
    });
    await app.settle();
    const reading = (await intake(app, id)).readings[0]!;
    expect(reading.sentBack).toBe(false);
    const first = await app.call("POST", `/api/readings/${reading.id}/back-to-why`);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    await app.settle();
    expect((await openAsks(app, id)).filter((a) => a.stage === "why")).toHaveLength(1);
    const second = await app.call("POST", `/api/readings/${reading.id}/back-to-why`);
    expect(second.status).toBeGreaterThanOrEqual(400);
    await app.settle();
    expect((await openAsks(app, id)).filter((a) => a.stage === "why")).toHaveLength(1);
  });
});

describe("going back to Why when Why does not start", () => {
  it("says so in the conversation, clears the mark and lets the operator try again", async () => {
    const app = await testApp(
      { PREMISE_INTAKE__READING_HELD_COUNT: "2" },
      {
        script: script(
          triager(() => routed("opinion", "held")),
          reader((held) => ({
            recurring: [{ line: "It is not useful", items: refs(held, () => true) }],
            purpose: "People may not need it.",
            back_to_why: "yes",
            not_wanted: refs(held, () => true),
          })),
        ),
      },
    );
    const id = await runningSoftware(app);
    await say(app, id, "Not useful to me");
    await say(app, id, "Not useful to anyone I know");
    const reading = (await intake(app, id)).readings[0]!;
    const spy = vi
      .spyOn(app.session.line, "backToWhy")
      .mockRejectedValueOnce(new Error("the line is busy"));
    const first = await app.call("POST", `/api/readings/${reading.id}/back-to-why`);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    await app.settle();
    expect((await chat(app, id)).some((t) => t.includes("did not start (the line is busy)"))).toBe(
      true,
    );
    expect((await intake(app, id)).readings[0]!.sentBack).toBe(false);
    spy.mockRestore();
    const retry = await app.call("POST", `/api/readings/${reading.id}/back-to-why`);
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    await app.settle();
    expect((await openAsks(app, id)).filter((a) => a.stage === "why")).toHaveLength(1);
    expect((await intake(app, id)).readings[0]!.sentBack).toBe(true);
  });
});

describe("a wish that changes purpose, duplicates and noise from other sources", () => {
  it("asks the operator about a change of purpose from the feedback page, merges a repeat, closes noise, and counts per route", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          triager((text) =>
            text.includes("shop")
              ? routed("change-of-purpose", "asked-at-once")
              : text.includes("lorem")
                ? routed("noise", "merged-or-closed", { reason: "It says nothing." })
                : routed("bug", "in-normally"),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    const path = await feedbackPath(app, id);
    const asked = await sendFeedback(app, path, "Turn it into a shop for used books");
    expect((await item(app, id, "I-1")).status).toBe("asked");
    expect((await plain(app, "GET", asked)).html).toContain("Being considered");
    const [question] = await openAsks(app, id);
    expect(question!.title).toBe("I-1 would change what the software is for. Change it?");

    await say(app, id, "Saving fails");
    await sendFeedback(app, path, "lorem ipsum");
    await sendFeedback(app, path, "SAVING   fails!");
    expect(await item(app, id, "I-3")).toMatchObject({ status: "closed", kind: "noise" });
    expect(await item(app, id, "I-4")).toMatchObject({ status: "merged", joins: "I-2" });

    const view = await intake(app, id);
    expect(view.routes.byRoute).toEqual({
      "asked-at-once": 1,
      "in-normally": 1,
      "merged-or-closed": 2,
    });
    expect(view.routes.bySource).toEqual({ feedback: 3, session: 1 });
    expect(view.routes.words).toBe(
      "4 items came in through intake. Where they went: in normally 1, asked of you 1, merged or closed 2.",
    );

    // The same counts are in the report and in the measures.
    const report = (await app.call("GET", `/api/softwares/${id}/report`)).body as ReportView;
    const section = report.sections.find((s) => s.title === "Intake")!;
    expect(section.lines[0]!.text).toBe(view.routes.words);
    expect(section.lines[1]!.text).toContain("the feedback page (3)");
    const measures = (await app.call("GET", `/api/softwares/${id}/measures`)).body as MeasuresView;
    expect(measures.intakeRoutes.byRoute["merged-or-closed"]).toBe(2);
  });
});

describe("a feedback item joined to another item", () => {
  it("shows its sender the joined item's plain status, never the answer written for it", async () => {
    const secret = "Because the record says the shelf is sorted by title, see I-1.";
    const app = await testApp(
      {},
      {
        script: script(
          triager((text) =>
            text.includes("sorted")
              ? routed("question", "in-normally", { answer: secret })
              : routed("bug", "in-normally"),
          ),
        ),
      },
    );
    const id = await runningSoftware(app);
    const path = await feedbackPath(app, id);
    await say(app, id, "How is the shelf sorted?");
    expect((await item(app, id, "I-1")).status).toBe("answered");

    const receipt = await sendFeedback(app, path, "how is the shelf sorted");
    expect(await item(app, id, "I-2")).toMatchObject({ status: "merged", joins: "I-1" });
    const page = (await plain(app, "GET", receipt)).html;
    expect(page).toContain("joined with an earlier report of the same thing");
    expect(page).toContain("Answered");
    expect(page).not.toContain(secret);
  });
});

describe("reading a short list", () => {
  const read = new Set([1, 2, 3]);

  it("accepts lines that name items, and keeps who is behind each", () => {
    const result = readShortList(
      {
        wanted: [{ line: "Sorting", items: ["I-1", 2] }],
        purpose: "It stands.",
        back_to_why: "no",
      },
      { read },
    );
    expect(result).toEqual({
      list: {
        wanted: [{ text: "Sorting", items: [1, 2], decision: null }],
        recurring: [],
        purpose: "It stands.",
        backToWhy: false,
        notWanted: [],
      },
    });
  });

  it("refuses lines without items, items that were not read, and going back to Why without evidence", () => {
    const bad = readShortList(
      {
        wanted: ["Plain text"],
        recurring: [
          { line: "Unknown", items: ["I-9"] },
          { line: "Empty", items: [] },
        ],
        purpose: "x",
        back_to_why: "yes",
      },
      { read },
    );
    expect(bad).toHaveProperty("problems");
    const problems = (bad as { problems: string[] }).problems.join("\n");
    expect(problems).toContain("say which items are behind it");
    expect(problems).toContain("I-9 was not among the items read");
    expect(problems).toContain("name at least one item behind it");
    expect(problems).toContain("Going back to Why needs its evidence");
  });
});
