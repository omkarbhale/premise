import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import type { AgentScript, ScriptRule } from "../src/agents/scripted-agent.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import type { AskView, SoftwareDetail, WorkItemView } from "../src/shared/api-types.js";
import { testApp as realApp } from "./helpers.js";
import { DoNothingLaterStages } from "./stand-in-later.js";

/**
 * Sizing of work (decision 0184), with the scripted agent as the sizer and this file as the
 * operator: small pieces skip to Build, wishes get What and a say-back, purpose changes go to Why,
 * split pieces finish after their parts and a check of the whole, and the operator overrides it all.
 */

/** These tests are about sizing, so Build, Check and Run are stand-ins that finish at once. */
const testApp = (env: Record<string, string> = {}, options: Parameters<typeof realApp>[1] = {}) =>
  realApp(env, { ...options, later: new DoNothingLaterStages() });

type App = Awaited<ReturnType<typeof testApp>>;
type Sizing = Record<string, unknown>;

/** A scripted sizer that answers per piece: by its title, or for the software itself. */
function sizer(answer: (piece: { title: string; kind: string }) => Sizing): ScriptRule {
  return {
    when: { task: "size" },
    behave: (request: AgentRequest, call) => {
      const context = request.context ?? {};
      call(
        "sizing_submit",
        answer({ title: String(context.title ?? ""), kind: String(context.piece ?? "") }),
      );
    },
    end: { outcome: "done" },
  };
}

function script(...rules: ScriptRule[]): AgentScript {
  return { rules: [...rules, ...standInScript(0).rules] };
}

const whole = (stages: string[], size = "small"): Sizing => ({
  size,
  size_reason: `It is ${size}.`,
  stages,
  stages_reason: "It needs only these steps.",
  split: [],
  split_reason: "It is one piece.",
});

const ALL = [
  "why",
  "who",
  "exists",
  "what",
  "say-back",
  "plan",
  "build",
  "check",
  "run",
  "report",
  "intake",
];

const splitInto = (...titles: string[]): Sizing => ({
  ...whole(ALL),
  split: titles.map((title) => ({ title, words: `${title}, on its own.` })),
  split_reason: "These parts are completely separate from each other.",
});

async function start(app: App, idea = "A small page where I keep my reading list") {
  const { body } = await app.call("POST", "/api/softwares", { idea });
  await app.settle();
  return body.id as string;
}

async function detail(app: App, id: string): Promise<SoftwareDetail> {
  return (await app.call("GET", `/api/softwares/${id}`)).body as SoftwareDetail;
}

async function work(app: App, id: string): Promise<WorkItemView[]> {
  return (await detail(app, id)).work;
}

async function openAsks(app: App, id: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${id}&status=open`);
  return (body as AskView[]).filter((a) => a.kind !== "approval");
}

async function lineAsk(app: App, id: string): Promise<AskView> {
  const asks = await openAsks(app, id);
  expect(asks, JSON.stringify(asks.map((a) => a.title))).toHaveLength(1);
  return asks[0]!;
}

async function keepAll(app: App, ask: AskView) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

async function say(app: App, ask: AskView, text: string) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "text", text },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

/** The jobs made for one piece of work, by kind, in order. */
function jobsFor(app: App, itemId: number): string[] {
  return app.session.queue
    .list()
    .filter((j) => j.payload.item === itemId)
    .sort((a, b) => a.id - b.id)
    .map((j) => j.kind);
}

describe("sizing a piece of work", () => {
  it("sends a small fix straight to Build, a wish through What and a say-back, and a purpose change back to Why", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          sizer(({ title, kind }) => {
            if (kind === "software") return splitInto("Fix the title", "Export", "For a team");
            if (title === "Fix the title") return whole(["build", "check"]);
            if (title === "Export") return whole(["what", "build", "check"]);
            return whole(["why", "build", "check"]);
          }),
        ),
      },
    );
    const id = await start(app);

    // The small fix needed no question: it was built and checked, and the wish is at What.
    let items = await work(app, id);
    const fix = items.find((i) => i.title === "Fix the title")!;
    expect(fix).toMatchObject({ state: "done", stages: ["build", "check"] });
    expect(fix.minutesBeforeBuild).not.toBeNull();
    expect(jobsFor(app, fix.id)).toEqual(["size", "build", "check"]);

    // The wish: What, then a say-back that premise added, then Build and Check.
    const exportPart = items.find((i) => i.title === "Export")!;
    expect(exportPart).toMatchObject({
      current: true,
      stages: ["what", "say-back", "build", "check"],
    });
    expect(exportPart.sizing!.stages.reason).toContain("Say back was added");
    const what = await lineAsk(app, id);
    expect(what.stage).toBe("what");

    // The page shows the stages this part does not need as skipped, with the reason.
    const stages = (await detail(app, id)).stages;
    const position = (s: string) => stages.find((x) => x.id === s)!.position;
    expect(position("why")).toBe("skipped");
    expect(position("plan")).toBe("skipped");
    expect(position("what")).toBe("current");
    expect(position("say-back")).toBe("ahead");
    expect(position("run")).toBe("ahead");
    expect(stages.find((x) => x.id === "why")!.why).toContain("only these steps");
    expect((await detail(app, id)).status).toMatch(/^Part 2 of 3, "Export": /);

    // The drafter for the part is told which part it is.
    const drafter = app.runner.requests.filter((r) => r.taskKind === "draft").at(-1)!;
    expect(drafter.brief).toContain("Piece of work: one part of it: Export.");

    await keepAll(app, what);
    expect((await lineAsk(app, id)).stage).toBe("say-back");
    await keepAll(app, await lineAsk(app, id));

    // The purpose change goes to Why, then is said back.
    items = await work(app, id);
    expect(items.find((i) => i.title === "Export")!.state).toBe("done");
    const team = items.find((i) => i.title === "For a team")!;
    expect(team.stages).toEqual(["why", "say-back", "build", "check"]);
    expect((await lineAsk(app, id)).stage).toBe("why");
    await keepAll(app, await lineAsk(app, id));
    await keepAll(app, await lineAsk(app, id)); // say-back

    // Every part done, the whole checked: the software runs, is reported, and reaches Intake.
    const end = await detail(app, id);
    expect(end.stage).toBe("intake");
    expect(end.work.filter((i) => i.depth === 1).every((i) => i.state === "done")).toBe(true);
  });

  it("splits a piece into two separate parts, and finishes the piece only after both and a check of the whole", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          sizer(({ kind }) =>
            kind === "software"
              ? splitInto("A command to add a book", "A page that lists the books")
              : whole(["build", "check"]),
          ),
        ),
      },
    );
    const id = await start(app);
    const items = await work(app, id);
    expect(items.map((i) => [i.depth, i.title, i.state])).toEqual([
      [0, expect.any(String), "working"],
      [1, "A command to add a book", "done"],
      [1, "A page that lists the books", "done"],
    ]);
    expect(items[0]!.sizing!.split).toMatchObject({
      decision: "split",
      by: "sizer",
      reason: "These parts are completely separate from each other.",
    });

    // The whole was checked after both parts, then the software ran and was reported.
    const checks = app.session.queue
      .list()
      .filter((j) => j.kind === "check")
      .map((j) => (j.payload.whole === true ? "whole" : "part"));
    expect(checks).toEqual(["part", "part", "whole"]);
    expect((await detail(app, id)).stage).toBe("intake");
    const said = (await app.call("GET", `/api/softwares/${id}/chat`)).body.map(
      (m: { text: string }) => m.text,
    );
    expect(said.some((t: string) => t.startsWith("Split into 2 separate parts"))).toBe(true);
    expect(said.some((t: string) => t.includes("passed its check"))).toBe(true);

    // Once a part is built, the split cannot be undone.
    const undo = await app.call("POST", `/api/work-items/${items[0]!.id}/undo-split`);
    expect(undo.status).toBe(422);
    expect(undo.body.error).toContain("already been built");
  });

  it("keeps one heavy piece of work whole: the sizer is told so, and premise refuses a split it may not make", async () => {
    const app = await testApp(
      { PREMISE_LINE__SPLIT_MAX_PARTS: "3" },
      {
        script: script({
          when: { task: "size" },
          behave: (_request, call) => {
            // One part only is not a split; four parts is over the limit.
            call("sizing_submit", { ...whole(ALL), split: [{ title: "All of it", words: "x" }] });
            call("sizing_submit", { ...splitInto("a", "b", "c", "d") });
            call("sizing_submit", {
              ...whole(ALL, "large"),
              split_reason: "One heavy piece of work is not by itself a reason to split.",
            });
          },
          end: { outcome: "done" },
        }),
      },
    );
    const id = await start(
      app,
      "A full accounting program: ledgers, invoices, reports and taxes, all sharing one set of books",
    );
    const brief = app.runner.requests.find((r) => r.taskKind === "size")!.brief;
    expect(brief).toContain("One heavy piece of work is NOT by itself a reason to split.");
    expect(brief).toContain("When you are unsure, do not split.");
    expect(brief).toContain("completely separate");

    const refusals = app.runner.calls
      .filter((c) => c.tool === "sizing_submit")
      .map((c) => c.result.diagnostics.join(" "));
    expect(refusals[0]).toContain("at least two parts");
    expect(refusals[1]).toContain("at most 3 parts");

    const items = await work(app, id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sizeClass: "large" });
    expect(items[0]!.sizing!.split).toMatchObject({ decision: "whole", by: "sizer" });
    expect((await lineAsk(app, id)).stage).toBe("why");
  });

  it("never splits when splitting is turned off", async () => {
    const app = await testApp(
      { PREMISE_LINE__SPLITTING: "false" },
      { script: script(sizer(() => splitInto("a", "b"))) },
    );
    const id = await start(app);
    const call = app.runner.calls.find((c) => c.tool === "sizing_submit")!;
    expect(call.result.diagnostics.join(" ")).toContain("Splitting is turned off");
    // The sizer gave no usable answer: the safe default, every stage, whole.
    const [root] = await work(app, id);
    expect(root!.sizing).toMatchObject({ split: { decision: "whole", by: "default" } });
    expect(root!.stages).toHaveLength(11);
    expect((await lineAsk(app, id)).stage).toBe("why");
  });

  it("lets the operator change a piece's size and steps, and undo a split before anything is built", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          sizer(({ kind }) =>
            kind === "software"
              ? splitInto("Reading list", "Book shop")
              : whole(["what", "say-back", "build", "check"]),
          ),
        ),
      },
    );
    const id = await start(app);
    let items = await work(app, id);
    const [root, first] = items;
    expect(first).toMatchObject({ title: "Reading list", current: true, canChange: true });
    expect(root!.canUndoSplit).toBe(true);
    expect((await lineAsk(app, id)).stage).toBe("what");

    // A larger size gives the part's stages a larger budget.
    let res = await app.call("POST", `/api/work-items/${first!.id}/size`, { size: "large" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.budget).toMatchObject({ turns: 60, minutes: 40 });
    const part = (res.body as SoftwareDetail).work.find((i) => i.id === first!.id)!;
    expect(part.sizing!.size).toMatchObject({ by: "operator" });

    // Taking out the step it is at moves it on; Build and Check always stay.
    res = await app.call("POST", `/api/work-items/${first!.id}/stages`, { stages: ["what"] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(
      "Nothing changed: Build, Check are always needed for this kind of work.",
    );
    res = await app.call("POST", `/api/work-items/${first!.id}/stages`, {
      stages: ["build", "check"],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await app.settle();
    items = await work(app, id);
    expect(items.find((i) => i.id === first!.id)!.state).toBe("done");
    expect(items.find((i) => i.title === "Book shop")!.current).toBe(true);

    // The first part is built, so the split cannot be undone any more...
    res = await app.call("POST", `/api/work-items/${root!.id}/undo-split`);
    expect(res.status).toBe(422);

    // ...but the software's own size can still change.
    res = await app.call("POST", `/api/work-items/${root!.id}/size`, { size: "medium" });
    expect(res.status).toBe(200);
    expect(res.body.sizeClass).toBe("medium");
  });

  it("undoes a split: the parts are withdrawn and the piece goes through the line whole", async () => {
    const app = await testApp(
      {},
      {
        script: script(
          sizer(({ kind }) =>
            kind === "software"
              ? splitInto("Reading list", "Book shop")
              : whole(["what", "build", "check"]),
          ),
        ),
      },
    );
    const id = await start(app);
    const [root] = await work(app, id);
    const res = await app.call("POST", `/api/work-items/${root!.id}/undo-split`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await app.settle();
    const items = await work(app, id);
    expect(items.filter((i) => i.depth === 1).map((i) => i.state)).toEqual([
      "withdrawn",
      "withdrawn",
    ]);
    expect(items[0]).toMatchObject({ current: true, canUndoSplit: false });
    expect(items[0]!.sizing!.split).toEqual({
      decision: "whole",
      by: "operator",
      reason: "You undid the split.",
    });
    expect((await lineAsk(app, id)).stage).toBe("why");
    const again = await app.call("POST", `/api/work-items/${root!.id}/undo-split`);
    expect(again.status).toBe(422);
    expect(again.body.error).toContain("not split");
    const part = items.find((i) => i.depth === 1)!;
    const resize = await app.call("POST", `/api/work-items/${part.id}/size`, { size: "large" });
    expect(resize.status).toBe(422);
    expect((await work(app, id)).find((i) => i.id === part.id)!.sizeClass).toBe(part.sizeClass);
  });

  it("makes each confirmed milestone a part of the software, with its wait, edited as before", async () => {
    const app = await testApp();
    const id = await start(app);
    await keepAll(app, await lineAsk(app, id)); // why
    await keepAll(app, await lineAsk(app, id)); // who
    await say(app, await lineAsk(app, id), "Build it");
    await keepAll(app, await lineAsk(app, id)); // what
    await keepAll(app, await lineAsk(app, id)); // say-back
    const milestones = await lineAsk(app, id);
    const res = await app.call("POST", `/api/asks/${milestones.id}/answer`, {
      answer: {
        kind: "items",
        items: milestones.items.map((item, i) => ({
          key: item.key,
          decision: "keep",
          wait: i === 0,
        })),
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await app.settle();

    let software = await detail(app, id);
    expect(software.state).toBe("waiting-milestone");
    const parts = software.work.filter((i) => i.kind === "milestone");
    expect(parts.map((p) => [p.title.slice(0, 4), p.state, p.stages])).toEqual([
      ["M-1:", "working", ["build", "check", "run", "report"]],
      ["M-2:", "ahead", ["build", "check", "run", "report"]],
    ]);
    // Building started: the time before it is recorded for the milestone and the software.
    expect(software.work[0]!.minutesBeforeBuild).not.toBeNull();
    expect(parts[0]!.minutesBeforeBuild).not.toBeNull();
    // The stages the software went through itself show as done while its milestones are built.
    expect(software.stages.find((s) => s.id === "plan")!.position).toBe("done");

    // Waits are edited as before, on the milestone.
    const wait = await app.call("POST", `/api/softwares/${id}/milestones/M-2/wait`, { wait: true });
    expect(wait.status).toBe(200);
    expect(wait.body.milestones[1]).toMatchObject({ id: "M-2", wait: true });

    await say(app, await lineAsk(app, id), "Go on");
    expect((await detail(app, id)).state).toBe("waiting-milestone");

    // Sending back to Plan from inside a milestone goes to the software's own Plan.
    const back = await app.call("POST", `/api/softwares/${id}/send-back`, { stage: "plan" });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    await app.settle();
    const replanned = await detail(app, id);
    expect(replanned.work.find((w) => w.current)!.kind).toBe("software");
    expect(
      replanned.work.filter((w) => w.kind === "milestone").every((w) => w.state === "withdrawn"),
    ).toBe(true);
    const again = await lineAsk(app, id);
    expect(again.title).toBe("Milestones: is this the right order?");
    await app.call("POST", `/api/asks/${again.id}/answer`, {
      answer: {
        kind: "items",
        items: again.items.map((i) => ({
          key: i.key,
          decision: "keep",
          wait: i.key === again.items[0]!.key,
        })),
      },
    });
    await app.settle();
    await say(app, await lineAsk(app, id), "Go on");
    software = await detail(app, id);
    expect(software.stage).toBe("intake");
    // The new milestones are done; the first ones stay listed as withdrawn (hidden on the page).
    expect(software.work.filter((i) => i.kind === "milestone").map((p) => p.state)).toEqual([
      "withdrawn",
      "withdrawn",
      "done",
      "done",
    ]);
  });

  it("goes on sizing after premise restarts in the middle of it", async () => {
    const rules = script(
      { when: { task: "size", attempt: 1 }, end: { outcome: "hang" } },
      sizer(() =>
        whole(["why", "what", "say-back", "plan", "build", "check", "run", "report", "intake"]),
      ),
    );
    const first = await testApp({}, { script: rules });
    const started = await first.call("POST", "/api/softwares", { idea: "A reading list" });
    const id = started.body.id as string;
    expect(first.session.queue.list("running").map((j) => j.kind)).toEqual(["size"]);
    expect((await detail(first, id)).status).toContain("Sizing the work");
    expect((await detail(first, id)).stages.every((s) => s.position === "ahead")).toBe(true);

    const second = await testApp({}, { script: rules, folder: first.folder });
    expect(second.session.queue.recover().map((j) => j.kind)).toEqual(["size"]);
    await second.settle();
    const [root] = await work(second, id);
    expect(root!.sizing!.stages.by).toBe("sizer");
    expect(root!.skipped).toEqual(["who", "exists"]);
    expect((await lineAsk(second, id)).stage).toBe("why");
  });

  it("goes on with every step when the sizer fails, and says so", async () => {
    const app = await testApp(
      {},
      {
        script: script({
          when: { task: "size" },
          end: { outcome: "failed", failure: "broken", summary: "The sizer broke." },
        }),
      },
    );
    const id = await start(app);
    const [root] = await work(app, id);
    expect(root!.sizing!.stages).toMatchObject({ by: "default" });
    expect(root!.sizing!.stages.reason).toContain("Not sized");
    expect((await lineAsk(app, id)).stage).toBe("why");
  });
}, 60_000);
