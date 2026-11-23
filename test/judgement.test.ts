import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentScript, ScriptRule } from "../src/agents/scripted-agent.js";
import type { ToolEnvelope } from "../src/agents/tool-server.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import { demoScript, runDemo } from "../src/demo/demos.js";
import { itemsOf } from "../src/demo/scripted-work.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import { allowedHosts } from "../src/gate/gate.js";
import type { AskAnswer, AskView, ChatMessage, ReportView } from "../src/shared/api-types.js";
import { scopeAnswer, tempFolder, testApp, uniquePortRange } from "./helpers.js";

/**
 * The judgement fixes from the first real runs (decision 0300), walked with the scripted agent and
 * this file as the person: an overrule keeps its why; the choices at What exists say what they
 * mean; a must that works only under a condition is shown before building; asking for a tool the
 * agents lack has real choices; hedges are kept; the plan's costly choices get the foundation
 * review, and a native dependency must say how it installs.
 */

// Each test walks the line with the scripted agent; under a full run that takes more than 5 s.
vi.setConfig({ testTimeout: 30_000 });

type App = Awaited<ReturnType<typeof testApp>>;
type Args = Record<string, unknown>;

async function open(app: App, softwareId: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${softwareId}&status=open`);
  return body as AskView[];
}

/** The one open ask of the line (not the gate's, and not a "needed" one). */
async function lineAsk(app: App, softwareId: string): Promise<AskView> {
  const asks = (await open(app, softwareId)).filter(
    (a) => a.kind !== "approval" && a.kind !== "needed",
  );
  expect(asks, JSON.stringify(asks.map((a) => a.title))).toHaveLength(1);
  return asks[0]!;
}

async function answer(app: App, ask: AskView, body: AskAnswer) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, { answer: body });
  await app.settle();
  return res;
}

async function keepAll(app: App, ask: AskView) {
  const res = await answer(app, ask, {
    kind: "items",
    items: ask.items.map((i) => ({ key: i.key, decision: "keep" })),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function start(app: App, idea = "A small page where I keep my reading list") {
  const { body } = await app.call("POST", "/api/softwares", { idea });
  await app.settle();
  return body.id as string;
}

async function record(app: App, softwareId: string, file: string) {
  const { body } = await app.call("GET", `/api/softwares/${softwareId}/record`);
  return body.files.find((f: { file: string }) => f.file === file).items as {
    id: string;
    text: string;
    status: string;
    marks: string[];
  }[];
}

async function chat(app: App, softwareId: string): Promise<string[]> {
  const { body } = await app.call("GET", `/api/softwares/${softwareId}/chat`);
  return (body as ChatMessage[]).map((m) => m.text);
}

const rules = (...first: ScriptRule[]): AgentScript => ({
  rules: [...first, ...standInScript(0).rules],
});

/** The researcher finds that something already does the job, and recommends not building. */
const somethingExists: ScriptRule = {
  when: { task: "research", stage: "exists" },
  calls: [
    {
      tool: "draft_submit",
      arguments: {
        stage: "exists",
        items: [
          {
            short: "ccusage reads Claude Code's usage logs and sums cost per day",
            text: "ccusage reads Claude Code's usage logs and sums cost per day and per session; it has no weekly share per session and no budgets.",
            source: "https://example.test/ccusage",
            checked: "read",
          },
        ],
        outcome: "Do not build",
        alternative: "ccusage",
        builds_on: "ccusage",
        deciding_question: "Does anything show the weekly share used by each session?",
        reason: "It already reports usage from the same logs.",
      },
    },
  ],
  end: { outcome: "done" },
};

/** Why and Who, kept. */
async function toExists(app: App, id: string): Promise<AskView> {
  await keepAll(app, await lineAsk(app, id));
  await keepAll(app, await lineAsk(app, id));
  const exists = await lineAsk(app, id);
  expect(exists.stage).toBe("exists");
  return exists;
}

describe("What exists: plain choices, and an overrule keeps its why", () => {
  it("shows only the choices that apply, each saying what it changes, and the question that decides it", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(somethingExists) });
    const id = await start(app);
    const exists = await toExists(app, id);
    expect(exists.title).toBe("premise recommends not building it: something already does this");
    expect(exists.choices).toEqual([
      "Do not build: use ccusage",
      "Build it on top of ccusage",
      "Build it anyway",
    ]);
    expect(exists.bestAttempt).toBe("Do not build: use ccusage");
    expect(Object.keys(exists.choiceNotes!)).toEqual(exists.choices);
    expect(exists.choiceNotes!["Build it on top of ccusage"]).toMatch(
      /builds only what that lacks/,
    );
    expect(exists.instruction).toContain(
      "What decides it: Does anything show the weekly share used by each session?",
    );
    expect(JSON.stringify(exists)).not.toContain("Build something different");
  });

  it("keeps the reason from the card as a Why item from the person, first in the say-back, and learns from it", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(somethingExists) });
    const id = await start(app);
    const exists = await toExists(app, id);
    const res = await answer(app, exists, {
      kind: "text",
      text: "Build it anyway",
      reason: "it has no weekly share per session, and I want budgets",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const why = await record(app, id, "why.md");
    const overrule = why.find((i) => i.text.startsWith("Overruled:"))!;
    expect(overrule.text).toBe(
      'Overruled: it has no weekly share per session, and I want budgets. premise recommended "Do not build: use ccusage"; the operator chose "Build it anyway".',
    );
    expect(overrule.marks.join(" ")).toContain("operator");
    expect((await chat(app, id)).join("\n")).toContain(`Kept as your reason (${overrule.id})`);

    // It counts as a correction for learning, with the person's why.
    const { body: learned } = await app.call("GET", `/api/learning?software=${id}`);
    const correction = learned.corrections.find((c: { what: string }) =>
      c.what.includes("over premise's recommendation"),
    );
    expect(correction).toMatchObject({
      what: "You chose “Build it anyway” over premise's recommendation “Do not build: use ccusage”",
      said: "it has no weekly share per session, and I want budgets",
    });

    // It comes first in the say-back, where it can be struck.
    await keepAll(app, await lineAsk(app, id)); // what
    const scope = await lineAsk(app, id);
    await answer(app, scope, scopeAnswer(scope));
    const sayBack = await lineAsk(app, id);
    expect(sayBack.kind).toBe("say-back");
    expect(sayBack.items[0]).toMatchObject({ text: overrule.text, refs: [overrule.id] });
    expect(sayBack.items.filter((i) => i.refs?.includes(overrule.id))).toHaveLength(1);
  });

  it("records an overrule with no reason given when the box is empty, and a later chat message is ordinary chat", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(somethingExists) });
    const id = await start(app);
    const exists = await toExists(app, id);
    await answer(app, exists, { kind: "text", text: "Build it on top of ccusage" });
    const why = await record(app, id, "why.md");
    const overrule = why.find((i) => i.text.startsWith("Overruled:"))!;
    expect(overrule.text).toBe(
      'Overruled: no reason given. premise recommended "Do not build: use ccusage"; the operator chose "Build it on top of ccusage".',
    );
    const said = (await chat(app, id)).join("\n");
    expect(said).not.toContain("In one line, why?");
    const event = app.db
      .prepare("SELECT detail FROM events WHERE module = 'line' AND kind = 'overruled'")
      .get() as { detail: string };
    expect(JSON.parse(event.detail)).toMatchObject({ why: "", item: overrule.id });
    await app.call("POST", `/api/softwares/${id}/chat`, { text: "Also, make it dark." });
    await app.settle();
    expect(
      (await record(app, id, "why.md")).filter((i) => i.text.startsWith("Overruled:")),
    ).toHaveLength(1);
  });

  it("does not ask why when the choice is premise's own recommendation", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" });
    const id = await start(app);
    const exists = await toExists(app, id);
    // No gap was checked by the scripted researcher, so premise does not claim nothing exists.
    expect(exists.choices).toEqual(["Build it", "Do not build it"]);
    await answer(app, exists, { kind: "text", text: "Build it" });
    expect((await chat(app, id)).join("\n")).not.toContain("In one line, why?");
    expect((await record(app, id, "why.md")).some((i) => i.text.startsWith("Overruled:"))).toBe(
      false,
    );
  });

  it("says 'Overruled' with the why in the report when the person chose not to build", async () => {
    const gap: ScriptRule = {
      when: { task: "research", stage: "exists" },
      calls: [
        {
          tool: "draft_submit",
          arguments: {
            stage: "exists",
            items: [
              { text: "Nothing found keeps a reading list with reminders.", checked: "read" },
            ],
            outcome: "Build it",
            gap: "nothing reminds anyone to read",
          },
        },
      ],
      end: { outcome: "done" },
    };
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(gap) });
    const id = await start(app);
    const exists = await toExists(app, id);
    expect(exists.choices).toEqual([
      "Build it: nothing out there does this (nothing reminds anyone to read)",
      "Do not build it",
    ]);
    await answer(app, exists, {
      kind: "text",
      text: "Do not build it",
      reason: "a paper list is enough for me",
    });
    const { body } = await app.call("GET", `/api/softwares/${id}/report`);
    const report = body as ReportView;
    const decided = report.sections.find((s) => s.title === "Decided")!;
    expect(decided.lines.map((l) => l.text)).toContain(
      'Overruled: a paper list is enough for me. premise recommended "Build it: nothing out there does this nothing reminds anyone to read"; the operator chose "Do not build it".',
    );
  });
});

/** The stand-in plan, with these decisions added to what it submits. */
function planWith(extra: (call: (tool: string, args: Args) => ToolEnvelope) => Args[]): ScriptRule {
  const base = standInScript(0).rules.find(
    (r) => r.when?.task === "plan" && r.when.purpose === "draft",
  )!;
  return {
    ...base,
    behave: (request, call) =>
      base.behave!(request, (tool, args) =>
        tool === "draft_submit"
          ? call(tool, { ...args, items: [...(args.items as Args[]), ...extra(call)] })
          : call(tool, args),
      ),
  };
}

function firstMust(call: (tool: string, args: Args) => ToolEnvelope): string {
  const read = call("record_read", { items: ["what.md"] });
  const lines = (read.result as { lines: { id: string; line: string }[] }).lines;
  return lines.find((l) => /\(must;/.test(l.line))!.id;
}

async function toMilestones(app: App, id: string): Promise<AskView> {
  const exists = await toExists(app, id);
  await answer(app, exists, { kind: "text", text: "Build it" });
  await keepAll(app, await lineAsk(app, id)); // what
  const scope = await lineAsk(app, id);
  await answer(app, scope, scopeAnswer(scope));
  await keepAll(app, await lineAsk(app, id)); // say-back
  const milestones = await lineAsk(app, id);
  expect(milestones.title).toBe("Milestones: is this the right order?");
  return milestones;
}

describe("a must that works only under a condition is shown before building", () => {
  const refused: ToolEnvelope[] = [];
  const conditional = planWith((call) => {
    const must = firstMust(call);
    // A condition naming an item that is not a must is refused, with what to name instead.
    refused.push(
      call("draft_submit", {
        stage: "plan",
        items: [{ kind: "D", text: "x. Reason: y. Rejected: z.", condition: "c", must: ["W-99"] }],
        milestones: [{ text: "m" }],
        tasks: [{ title: "t", items: [must], milestone: 1 }],
      }),
    );
    return [
      {
        kind: "D",
        text: "Weekly shares come from the status line. Reason: it carries the share. Rejected: polling the account page.",
        condition: "sessions started without a terminal run the status line",
        must: [must],
      },
      {
        kind: "D",
        text: "The status line command is premise's own. Reason: one place. Rejected: a wrapper.",
        condition: "the operator sets the status line command in Claude Code's settings",
        must: [must],
        who: "operator",
      },
    ];
  });

  it("puts it on the milestones question, asks the person who can meet the other, and checks it first when asked", async () => {
    refused.length = 0;
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(conditional) });
    const id = await start(app);
    const milestones = await toMilestones(app, id);
    expect(refused[0]).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    expect(refused[0]!.diagnostics[0]).toMatch(
      /names W-99 in "must", but W-99 is not a live must item/,
    );

    const condition = milestones.items.find((i) => i.condition)!;
    expect(condition.text).toMatch(
      /works only if: sessions started without a terminal run the status line$/,
    );
    expect(milestones.instruction).toContain(
      "Keep it as it is, strike it, or have it checked first",
    );
    // The condition a person can meet is asked of them, and nothing waits on it.
    const needed = (await open(app, id)).find((a) => a.kind === "needed")!;
    expect(needed.title).toMatch(
      /^Needed for W-\d+ to work: the operator sets the status line command/,
    );
    expect(needed.role).toBe("operator");
    const blocking = app.db.prepare("SELECT blocking FROM asks WHERE id = ?").get(needed.id) as {
      blocking: number;
    };
    expect(blocking.blocking).toBe(0);

    const res = await answer(app, milestones, {
      kind: "items",
      items: milestones.items.map((i) =>
        i.condition ? { key: i.key, decision: "check" } : { key: i.key, decision: "keep" },
      ),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const said = (await chat(app, id)).join("\n");
    expect(said).toContain(
      "The builder first checks whether sessions started without a terminal run the status line, before building on it",
    );
    const plan = JSON.parse(readFileSync(join(app.folder, "plans", id, "plan.json"), "utf8")) as {
      tasks: { check?: string }[];
    };
    expect(plan.tasks[0]!.check).toMatch(
      /^First check whether sessions started without a terminal run the status line, before building on it/,
    );
    // The condition stays with the decision in the record, where the checker judges it.
    const decisions = await record(app, id, "decisions.md");
    expect(
      decisions.some((d) =>
        d.text.includes("Holds only if: sessions started without a terminal run the status line."),
      ),
    ).toBe(true);

    // The person cannot meet the other condition: noted, and what it means said plainly.
    const cannot = await answer(app, needed, {
      kind: "needed",
      decision: "cannot",
      reason: "No access",
    });
    expect(cannot.status, JSON.stringify(cannot.body)).toBe(200);
    expect((await chat(app, id)).join("\n")).toMatch(
      /cannot be done for now\. premise builds W-\d+ anyway/,
    );
    const event = app.db
      .prepare("SELECT kind FROM events WHERE module = 'line' AND kind = 'condition-unmet'")
      .get();
    expect(event).toBeTruthy();
  });

  it("changes nothing when the milestones answer is refused", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(conditional) });
    const id = await start(app);
    const milestones = await toMilestones(app, id);
    const planFile = join(app.folder, "plans", id, "plan.json");
    const before = readFileSync(planFile, "utf8");
    const res = await answer(app, milestones, {
      kind: "items",
      items: milestones.items.map((i) =>
        i.condition
          ? { key: i.key, decision: "strike", reason: "no" }
          : { key: i.key, decision: "strike" },
      ),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(readFileSync(planFile, "utf8")).toBe(before);
    expect((await record(app, id, "what.md")).some((i) => i.status === "struck")).toBe(false);
    const check = milestones.items.find((i) => i.condition)!;
    const retry = await answer(app, milestones, {
      kind: "items",
      items: milestones.items.map((i) =>
        i.key === check.key ? { key: i.key, decision: "check" } : { key: i.key, decision: "keep" },
      ),
    });
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    const plan = JSON.parse(readFileSync(planFile, "utf8")) as { tasks: { check?: string }[] };
    const first = plan.tasks[0]!.check!;
    expect(first.match(/First check whether/g)).toHaveLength(1);
  });

  it("strikes the must when the person strikes the condition", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(conditional) });
    const id = await start(app);
    const milestones = await toMilestones(app, id);
    const condition = milestones.items.find((i) => i.condition)!;
    const res = await answer(app, milestones, {
      kind: "items",
      items: milestones.items.map((i) =>
        i.condition
          ? { key: i.key, decision: "strike", reason: "Not worth it without the status line" }
          : { key: i.key, decision: "keep" },
      ),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const what = await record(app, id, "what.md");
    const must = what.find((i) => i.id === condition.refs![0])!;
    expect(must.status).toBe("struck");
    // A milestone item cannot be "checked first"; only a condition can.
    expect(
      (
        await app.call("POST", `/api/asks/${milestones.id}/answer`, {
          answer: { kind: "items", items: [{ key: milestones.items[0]!.key, decision: "check" }] },
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
});

describe("asking for a tool the agents lack", () => {
  const program = `premise-test-tool-${process.pid}`;
  const asksForTool: ScriptRule = {
    when: { task: "research", stage: "exists" },
    behave: (_request, call) => {
      for (let n = 0; n < 2; n++) {
        call("ask", {
          role: "operator",
          kind: "needed",
          tool: program,
          host: "https://downloads.example.org/engine/4.3/",
          why: "The game is built with it, and it is not installed here.",
          items: [`Install it so that ${program} runs in a new terminal.`],
        });
      }
      call("draft_submit", {
        stage: "exists",
        items: [{ text: "Nothing found does this.", checked: "read" }],
        outcome: "Build it",
      });
    },
    end: { outcome: "done" },
  };

  async function toolCard(app: App, id: string): Promise<AskView> {
    await keepAll(app, await lineAsk(app, id));
    await keepAll(app, await lineAsk(app, id));
    const cards = (await open(app, id)).filter((a) => a.kind === "needed");
    expect(cards).toHaveLength(1); // asked twice, one card
    return cards[0]!;
  }

  it("offers allowing the one host for this software, and records it as an approval the agents' sandbox reads", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(asksForTool) });
    const id = await start(app);
    const other = await start(app, "Another small tool for notes");
    const card = await toolCard(app, id);
    expect(card.tool).toEqual({
      name: program,
      host: "downloads.example.org",
      why: "The game is built with it, and it is not installed here.",
    });
    expect(card.instruction).toContain("Agents cannot install or download programs themselves");
    const res = await answer(app, card, { kind: "needed", decision: "allow" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(allowedHosts(app.db, id)).toEqual(["downloads.example.org"]);
    expect(allowedHosts(app.db, other)).toEqual([]);
    const request = app.session.gate.list(id).find((r) => r.act === "allow-host")!;
    expect(request).toMatchObject({
      kind: "network",
      status: "done",
      items: ["downloads.example.org"],
    });
    expect((await chat(app, id)).join("\n")).toContain("Allowed: agents working on");
  });

  it("checks a tool the person says they installed, and says plainly when the agents cannot run it", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(asksForTool) });
    const id = await start(app);
    const card = await toolCard(app, id);
    const missing = await app.call("POST", `/api/asks/${card.id}/answer`, {
      answer: { kind: "needed", decision: "installed" },
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error ?? missing.body.message).toMatch(
      new RegExp(`looked for ${program} .* and did not find it`),
    );
    const bin = tempFolder();
    writeFileSync(join(bin, program), "#!/bin/sh\necho 1.0\n");
    chmodSync(join(bin, program), 0o755);
    const before = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${before ?? ""}`;
    try {
      const res = await answer(app, card, { kind: "needed", decision: "installed" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    } finally {
      process.env.PATH = before;
    }
    expect((await chat(app, id)).join("\n")).toContain(
      `premise found ${program} at ${join(bin, program)}`,
    );
  });

  it("goes on without it, and says the check marks what needs it 'could not check'", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(asksForTool) });
    const id = await start(app);
    const card = await toolCard(app, id);
    const res = await answer(app, card, { kind: "needed", decision: "without" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await chat(app, id)).join("\n")).toContain(
      `Going on without ${program}. The agents do what they can without it, and the check marks whatever needs it as "could not check"`,
    );
    const event = app.db
      .prepare("SELECT reference FROM events WHERE module = 'line' AND kind = 'tool-without'")
      .get() as { reference: string };
    expect(event.reference).toBe(program);
  });
});

describe("hedges are kept", () => {
  it("refuses a drafted item that settles what the person left open, and takes one that keeps it", async () => {
    const seen: ToolEnvelope[] = [];
    const why: ScriptRule = {
      when: { task: "draft", stage: "why" },
      behave: (_request, call) => {
        seen.push(
          call("draft_submit", {
            stage: "why",
            items: [
              {
                text: "People see their reading per chapter.",
                from: "operator",
                quote: "per book or perhaps per chapter",
              },
            ],
          }),
        );
        seen.push(
          call("draft_submit", {
            stage: "why",
            items: [
              {
                text: "People see their reading per book, or perhaps per chapter; the operator is not sure which.",
                from: "operator",
                quote: "per book or perhaps per chapter",
              },
            ],
          }),
        );
      },
      end: { outcome: "done" },
    };
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(why) });
    const id = await start(
      app,
      "A list of my reading, per book or perhaps per chapter. Maybe shared later.",
    );
    expect(seen[0]).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    expect(seen[0]!.diagnostics[0]).toContain("leave a choice open");
    expect(seen[1]!.ok).toBe(true);
    // The drafter is also told which of the person's sentences were unsure.
    expect((seen[1]!.result as { note: string }).note).toContain(
      'The person was unsure here: "Maybe shared later.". If an item rests on that',
    );
    const ask = await lineAsk(app, id);
    expect(ask.items[0]!.text).toContain("or perhaps per chapter");
  });

  it("takes a lesson for the software only after the record was read, and keeps the person's doubt", async () => {
    const tried: ToolEnvelope[] = [];
    const learn: ScriptRule = {
      when: { task: "triage", purpose: "learn" },
      behave: (_request, call) => {
        const lesson = (line: string) =>
          call("lesson_submit", {
            mistake: "assumed a need",
            destination: "software",
            reason: "It is about this software.",
            line,
          });
        tried.push(lesson("Sessions are out of scope."));
        call("record_read", {});
        tried.push(lesson("Sessions are out of scope."));
        tried.push(
          lesson(
            "The operator is unsure whether sessions belong here; do not add session views without asking.",
          ),
        );
      },
      end: { outcome: "done" },
    };
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(learn) });
    const id = await start(app);
    const why = await lineAsk(app, id);
    // Only what premise wrote is premise's to be corrected on.
    const target = why.items.find((i) => i.mark === "assumed")!;
    await answer(app, why, {
      kind: "items",
      items: why.items.map((i) =>
        i.key === target.key
          ? { key: i.key, decision: "strike", reason: "I don't know if it should care about that" }
          : { key: i.key, decision: "keep" },
      ),
    });
    await app.settle();
    expect(tried[0]).toMatchObject({ ok: false });
    expect(tried[0]!.error!.message).toContain("Read the record first with record_read");
    expect(tried[1]).toMatchObject({ ok: false });
    expect(tried[1]!.error!.message).toContain("Keep their doubt in the line");
    expect(tried[2]!.ok).toBe(true);
  });
});

describe("the plan's costly choices", () => {
  it("get the foundation review brief, and the chat says what the reviewer did", async () => {
    const briefs: string[] = [];
    const review: ScriptRule = {
      when: { task: "review" },
      behave: (request, call) => {
        briefs.push(request.brief);
        call("review_submit", {
          reviews: [
            { decision: "It runs as a small program", verdict: "agree", reasons: "Fine." },
            { decision: "It keeps its data in one file", verdict: "agree", reasons: "Fine." },
          ],
        });
      },
      end: { outcome: "done" },
    };
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(review) });
    const id = await start(app);
    await toMilestones(app, id);
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toMatch(/^Foundation review for /);
    expect(briefs[0]).not.toContain("Do not judge whether the change is a good idea");
    const said = (await chat(app, id)).join("\n");
    expect(said).toContain("whether each serves what the software is for");
    expect(said).toContain("The reviewer looked at 2 costly choices and agreed with all of them.");
  });

  it("refuses a dependency that needs a compiler and does not say how it installs without a compiler", async () => {
    const seen: ToolEnvelope[] = [];
    const native = planWith((call) => {
      seen.push(
        call("draft_submit", {
          stage: "plan",
          items: [
            {
              kind: "D",
              foundation: true,
              text: "It stores usage in SQLite. Reason: fast. Rejected: plain JSON files.",
              dependencies: [{ name: "better-sqlite3", needs_compiler: true }],
            },
          ],
          milestones: [{ text: "m" }],
          tasks: [{ title: "t", items: [firstMust(call)], milestone: 1 }],
        }),
      );
      return [];
    });
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script: rules(native) });
    const id = await start(app);
    await toMilestones(app, id);
    expect(seen[0]).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    expect(seen[0]!.diagnostics[0]).toMatch(
      /adds better-sqlite3, which needs a compiler or a system library/,
    );
    expect(seen[0]!.diagnostics[0]).toContain("node:sqlite");
  });
});

describe("the researcher reads a long page in parts", () => {
  it("is served over the agents' HTTP endpoint, only to a live researcher session", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" });
    const rpc = (name: string, args: Args) => ({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const read = async (token: string, args: Args) => {
      const answer = await app.tools.handleHttpAsync(`Bearer ${token}`, rpc("page_read", args));
      const body = answer.body as { result: { content: { text: string }[] } };
      return JSON.parse(body.result.content[0]!.text) as ToolEnvelope;
    };
    const binding = (role: "researcher" | "builder") => ({
      role,
      softwareId: "s1",
      jobId: 1,
      onProgress: () => {},
    });
    const researcher = app.tools.issue(binding("researcher"));
    // Sent the way real agents send numbers: as text.
    const page = await read(researcher, { url: "https://example.org/docs", part: "1" });
    expect(page).toMatchObject({ ok: true, result: { status: "read", part: 1, parts: 1 } });
    expect((page.result as { text: string }).text).toContain("Its text.");
    const local = await read(researcher, { url: "http://127.0.0.1:4610/api/softwares" });
    expect(local).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    const builder = app.tools.issue(binding("builder"));
    expect(await read(builder, { url: "https://example.org/docs" })).toMatchObject({
      ok: false,
      error: { code: "NOT_ALLOWED" },
    });
  });
});

describe("the checker says 'could not check' when the real thing is out of reach", () => {
  it("refuses met on made-up data, needs what to try, judges the plan's assumptions, and is told what agents went without", async () => {
    const base = demoScript(COUNT_DEMO).rules;
    const of = (task: string, purpose?: string) =>
      base.find((r) => r.when?.task === task && (!purpose || r.when.purpose === purpose))!;
    const tried: ToolEnvelope[] = [];
    const seen: { brief: string; items: string[] }[] = [];
    let askedForTool = false;
    const script: AgentScript = {
      rules: [
        {
          ...of("plan", "draft"),
          behave: (request, call) =>
            of("plan", "draft").behave!(request, (tool, args) =>
              tool === "draft_submit"
                ? call(tool, {
                    ...args,
                    items: [
                      ...(args.items as Args[]),
                      {
                        kind: "D",
                        text: "Files are read as UTF-8. Reason: the common case. Rejected: guessing the encoding. Assumed, not checked: every file it is given is UTF-8.",
                      },
                    ],
                  })
                : call(tool, args),
            ),
        },
        {
          ...of("build"),
          behave: (request, call) => {
            if (!askedForTool) {
              askedForTool = true;
              call("ask", {
                role: "operator",
                kind: "needed",
                tool: "zzz-render",
                why: "To draw the counts as a picture.",
                items: ["Install zzz-render."],
              });
            }
            return of("build").behave!(request, call);
          },
        },
        {
          ...of("check", "check"),
          behave: async (request, call) => {
            const items = itemsOf(request);
            seen.push({ brief: request.brief, items });
            const w = items.find((i) => i.startsWith("W-"))!;
            tried.push(
              call("verdict_submit", {
                verdicts: [
                  { item: w, verdict: "met", evidence: "On my sample.", judged_on: "made-up" },
                ],
              }),
            );
            tried.push(
              call("verdict_submit", {
                verdicts: [
                  {
                    item: w,
                    verdict: "could-not-check",
                    evidence: "No real file.",
                    judged_on: "real",
                  },
                ],
              }),
            );
            await of("check", "check").behave!(request, call);
            const d = items.find((i) => i.startsWith("D-"));
            if (d) {
              call("verdict_submit", {
                verdicts: [
                  {
                    item: d,
                    verdict: "not-met",
                    evidence: "A Latin-1 file was counted wrong.",
                    judged_on: "real",
                  },
                ],
              });
            }
          },
        },
        ...base,
      ],
    };
    const { range } = await uniquePortRange(20);
    const result = await runDemo("cli", {
      dataFolder: tempFolder(),
      confinement: "none",
      portRange: range,
      script,
      env: { PREMISE_LINE__WHEN_NOTHING_VERIFIED: "land" },
    });
    expect(tried[0]).toMatchObject({ ok: false, error: { code: "MALFORMED" } });
    expect(tried[0]!.diagnostics.join(" ")).toContain(
      "met on made-up data only is not met. When the real data, service or tool was out of your reach, the verdict is could-not-check",
    );
    expect(tried[1]!.diagnostics.join(" ")).toContain('add "try_it_on"');
    // The plan's assumption is among the items judged, and the brief says what agents lack.
    const check = seen[0]!;
    expect(check.items.some((i) => i.startsWith("D-"))).toBe(true);
    expect(check.brief).toContain(
      "- zzz-render: not available here; the person chose to go on without it.",
    );
    const said = result.said.join("\n");
    expect(said).toContain("Going on without zzz-render.");
    expect(said).toMatch(
      /something the plan assumed without checking does not hold: D-\d+: A Latin-1 file was counted wrong\./,
    );
    // A false assumption is not the builder's to fix: it does not hold up landing.
    expect(result.stage).toBe("intake");
    expect(result.build!.landed).not.toBeNull();
  }, 90_000);
});
