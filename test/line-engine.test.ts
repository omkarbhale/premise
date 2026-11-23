import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentScript } from "../src/agents/scripted-agent.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import type { AskView, ChatMessage } from "../src/shared/api-types.js";
import { scopeAnswer, testApp } from "./helpers.js";

/**
 * The whole Why-to-Plan path with the scripted agent and a scripted operator (this file plays the
 * operator): struck items changing the record, a milestone wait stopping and resuming, the gate
 * approving and refusing, and premise restarting in the middle of a stage.
 */

type App = Awaited<ReturnType<typeof testApp>>;

async function open(app: App, softwareId: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${softwareId}&status=open`);
  return body as AskView[];
}

/** The one open ask that is not the gate's. */
async function lineAsk(app: App, softwareId: string): Promise<AskView> {
  const asks = (await open(app, softwareId)).filter((a) => a.kind !== "approval");
  expect(asks, JSON.stringify(asks.map((a) => a.title))).toHaveLength(1);
  return asks[0]!;
}

async function keepAll(app: App, ask: AskView) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
  return res;
}

async function say(app: App, ask: AskView, text: string) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "text", text },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

async function record(app: App, softwareId: string, file: string) {
  const { body } = await app.call("GET", `/api/softwares/${softwareId}/record`);
  return body.files.find((f: { file: string }) => f.file === file).items as {
    id: string;
    text: string;
    status: string;
    reason?: string;
    marks: string[];
  }[];
}

async function chat(app: App, softwareId: string): Promise<string[]> {
  const { body } = await app.call("GET", `/api/softwares/${softwareId}/chat`);
  return (body as ChatMessage[]).map((m) => m.text);
}

async function start(app: App, idea = "A small page where I keep my reading list") {
  const { body } = await app.call("POST", "/api/softwares", { idea });
  await app.settle();
  return body.id as string;
}

/** Why, Who, What exists and What, all kept. */
async function toSayBack(app: App, id: string) {
  await keepAll(app, await lineAsk(app, id)); // why
  await keepAll(app, await lineAsk(app, id)); // who
  await say(app, await lineAsk(app, id), "Build it"); // what exists
  await keepAll(app, await lineAsk(app, id)); // what
  await chooseScope(app, await lineAsk(app, id)); // how much to build
}

/** The scope check, answered with the cut the effort level starts on. */
async function chooseScope(app: App, ask: AskView) {
  expect(ask.kind).toBe("scope");
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, { answer: scopeAnswer(ask) });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

/** From the say-back to the milestones list, through the planner and the reviewer. */
async function toMilestones(app: App, id: string) {
  await keepAll(app, await lineAsk(app, id)); // say-back, nothing struck
  const milestones = await lineAsk(app, id);
  expect(milestones.title).toBe("Milestones: is this the right order?");
  return milestones;
}

describe("the line engine, Why to Plan", () => {
  it("records each of the plan's decisions once, even when the planner also proposed it", async () => {
    const base = standInScript(0);
    const planRule = base.rules.find((r) => r.when?.task === "plan" && r.when.purpose === "draft")!;
    const script: AgentScript = {
      rules: base.rules.map((rule) =>
        rule === planRule
          ? {
              ...rule,
              behave: async (request, call) => {
                const proposed = call("record_propose", {
                  operations: [
                    {
                      op: "add",
                      kind: "D",
                      foundation: true,
                      text: "It runs as a small program on this machine. Reason: one user, nothing to host. Rejected: a hosted service, which costs money and needs a lock.",
                      from: "assumed",
                    },
                  ],
                  reason: "The first foundation decision.",
                });
                expect(proposed.ok, JSON.stringify(proposed)).toBe(true);
                await planRule.behave!(request, call);
              },
            }
          : rule,
      ),
    };
    const app = await testApp({}, { script });
    const id = await start(app);
    await toSayBack(app, id);
    await keepAll(app, await toMilestones(app, id));
    const decisions = await record(app, id, "decisions.md");
    const texts = decisions.map((d) => d.text);
    expect(texts).toHaveLength(3);
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toMatch(/^It runs as a small program on this machine\./);
  });

  it("makes the local second copy only once the plan confirmation has committed", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "local" });
    const id = await start(app);
    await toSayBack(app, id);
    const milestones = await toMilestones(app, id);
    const remotes = join(app.folder, "remotes");
    expect(existsSync(remotes) ? readdirSync(remotes) : []).toEqual([]);
    await app.call("POST", `/api/asks/${milestones.id}/answer`, {
      answer: {
        kind: "items",
        items: milestones.items.map((i) => ({ key: i.key, decision: "keep" })),
      },
    });
    await app.settle();
    expect(readdirSync(remotes).filter((n) => n.endsWith(".git"))).toHaveLength(1);
  });

  it("makes no local second copy when the plan confirmation rolls back", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "local" });
    const id = await start(app);
    await toSayBack(app, id);
    const milestones = await toMilestones(app, id);
    // The first milestone begins (with its sizing) right after the repository step.
    const line = app.session.line as unknown as { beginItem: () => never };
    line.beginItem = () => {
      throw new Error("the confirmation failed after the repository step");
    };
    const res = await app.call("POST", `/api/asks/${milestones.id}/answer`, {
      answer: {
        kind: "items",
        items: milestones.items.map((i) => ({ key: i.key, decision: "keep" })),
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await app.settle();
    const remotes = join(app.folder, "remotes");
    expect(
      existsSync(remotes) ? readdirSync(remotes).filter((n) => n.endsWith(".git")) : [],
    ).toEqual([]);
  });

  it("drafts each stage with an agent, writes what the operator confirmed to the record, and gives each job its stage budget", async () => {
    const app = await testApp();
    const id = await start(app);
    const why = await lineAsk(app, id);
    expect(why).toMatchObject({ kind: "draft", stage: "why", role: "operator" });
    expect(why.items.at(-1)!.text).toMatch(/^Size: small/);

    // The drafter got the published Why brief, filled in, and the small budget for its stage.
    const request = app.runner.requests.find((r) => r.taskKind === "draft")!;
    expect(app.runner.requests[0]!.taskKind).toBe("size");
    expect(request.brief).toContain("Stage: Why, for");
    expect(request.brief).toContain("A small page where I keep my reading list");
    expect(request).toMatchObject({ maxTurns: 15, maxMinutes: 10 });

    const [a, b, c] = why.items;
    await app.call("POST", `/api/asks/${why.id}/answer`, {
      answer: {
        kind: "items",
        items: [
          { key: a!.key, decision: "keep" },
          { key: b!.key, decision: "strike", reason: "I do it on paper and like it" },
          { key: c!.key, decision: "edit", text: "It must take less effort than paper." },
        ],
      },
    });
    await app.settle();
    const items = await record(app, id, "why.md");
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ["Y-1", "live"],
      ["Y-2", "struck"],
      ["Y-3", "live"],
    ]);
    expect(items[1]!.reason).toBe("I do it on paper and like it");
    expect(items[2]).toMatchObject({ text: "It must take less effort than paper." });
    expect(items[2]!.marks).toContain("from: operator");

    // Every record change went through the record keeper into the software's own repository.
    const commits = app.record.commitsNaming(id, "Y-1");
    expect(commits.length).toBeGreaterThan(0);
    expect((await app.call("GET", `/api/softwares/${id}`)).body.stage).toBe("who");
  });

  it("goes through Who, What exists and What to the say-back, with at most ten items", async () => {
    const app = await testApp();
    const id = await start(app);
    await keepAll(app, await lineAsk(app, id));
    const who = await lineAsk(app, id);
    expect(who.title).toBe("Who it is for: is this right?");
    await keepAll(app, who);
    const exists = await lineAsk(app, id);
    expect(exists).toMatchObject({ kind: "question", stage: "exists", bestAttempt: "Build it" });
    expect(exists.items[0]!.text).toContain("No search was made");
    await say(app, exists, "Build it");
    expect((await record(app, id, "exists.md")).map((i) => i.text)).toContain("Outcome: Build it");
    await keepAll(app, await lineAsk(app, id)); // what
    const what = await record(app, id, "what.md");
    expect(what[0]!.marks).toContain("must");
    await chooseScope(app, await lineAsk(app, id));
    const sayBack = await lineAsk(app, id);
    expect(sayBack.kind).toBe("say-back");
    expect(sayBack.items.length).toBeGreaterThan(0);
    expect(sayBack.items.length).toBeLessThanOrEqual(10);
    expect(sayBack.items.every((i) => i.refs && i.refs.length === 1)).toBe(true);
    // No sentence twice, and no "Suggestion:" repeated inside a labelled item.
    const texts = sayBack.items.map((i) => i.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.some((t) => t.includes("suggestion:"))).toBe(false);
  });

  it("shows each What exists finding as one short line with its source and whether it was read, lets each be struck, and keeps a reason for choosing against the recommendation", async () => {
    const long =
      "A hosted reading-list service that covers saving links and tags, and leaves out offline use, exports, and anything you can keep on your own machine; it is free for one user but changes its terms often and has no command-line client at all, so scripts cannot reach it.";
    const script: AgentScript = {
      rules: [
        {
          when: { task: "research", stage: "exists" },
          calls: [
            {
              tool: "draft_submit",
              arguments: {
                stage: "exists",
                items: [
                  {
                    short: "A hosted reading-list service",
                    text: long,
                    source: "https://example.test/list",
                    checked: "read",
                  },
                  {
                    text: "A browser extension that saves pages.",
                    source: "a search result",
                    checked: "only a summary",
                  },
                  { text: "A note-taking app that might do the same." },
                ],
                outcome: "Build on something that exists",
                reason: "Part of it is covered.",
              },
            },
          ],
          end: { outcome: "done" },
        },
        ...standInScript(0).rules,
      ],
    };
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script });
    const id = await start(app);
    await keepAll(app, await lineAsk(app, id));
    await keepAll(app, await lineAsk(app, id));
    const exists = await lineAsk(app, id);
    expect(exists.stage).toBe("exists");
    // One short line each; none is marked "assumed"; the source and the reading are separate.
    expect(exists.items.map((i) => [i.mark, i.checked])).toEqual([
      ["found", "read"],
      ["found", "summary"],
      ["found", "not-read"],
    ]);
    expect(exists.items.every((i) => i.text.length <= 110)).toBe(true);
    expect(exists.items[0]).toMatchObject({
      text: "A hosted reading-list service",
      source: "https://example.test/list",
      detail: long,
    });
    expect(exists.items[1]!.detail).toBeUndefined();
    // An answer must name findings that are on the list.
    const bad = await app.call("POST", `/api/asks/${exists.id}/answer`, {
      answer: { kind: "text", text: "Build it", struck: [{ key: "nope" }] },
    });
    expect(bad.status).toBe(422);
    // Strike the second finding with a reason, and choose against the recommendation, saying why.
    const res = await app.call("POST", `/api/asks/${exists.id}/answer`, {
      answer: {
        kind: "text",
        text: "Build it",
        struck: [{ key: exists.items[1]!.key, reason: "It is only a rumour" }],
        reason: "I want my own, kept on my machine",
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await app.settle();
    const items = (await record(app, id, "exists.md")).map((i) => i.text);
    const findingsLeft = items.filter((t) => !t.startsWith("Outcome:"));
    expect(findingsLeft.some((t) => t.includes("A browser extension"))).toBe(false);
    expect(items.some((t) => t.includes("A hosted reading-list service"))).toBe(true);
    expect(items.some((t) => t.includes("A note-taking app"))).toBe(true);
    const outcome = items.find((t) => t.startsWith("Outcome:"))!;
    expect(outcome).toContain("Reason: I want my own, kept on my machine");
    expect(outcome).toContain("Struck 1 of 3 findings");
    expect(outcome).toContain("It is only a rumour");
  });

  it("strikes a say-back assumption in the record, redoes its stage, and says back again", async () => {
    const app = await testApp();
    const id = await start(app);
    await toSayBack(app, id);
    const sayBack = await lineAsk(app, id);
    const target = sayBack.items.find(
      (i) => i.refs?.[0]?.startsWith("Y-") && i.mark === "assumed",
    )!;
    const ref = target.refs![0]!;
    await app.call("POST", `/api/asks/${sayBack.id}/answer`, {
      answer: {
        kind: "items",
        items: [{ key: target.key, decision: "strike", reason: "That is not why I want it" }],
      },
    });
    await app.settle();

    const why = await record(app, id, "why.md");
    expect(why.find((i) => i.id === ref)).toMatchObject({
      status: "struck",
      reason: "Struck at the say back: That is not why I want it",
    });
    expect((await app.call("GET", `/api/softwares/${id}`)).body.stage).toBe("why");
    // The drafter is told what was struck, and why.
    expect(app.runner.requests.at(-1)!.brief).toContain("That is not why I want it");

    // The redone list shows what was struck and why, so the person sees they were heard.
    const redone = await lineAsk(app, id);
    expect(redone.struckBefore).toEqual([
      { text: expect.any(String), reason: "That is not why I want it" },
    ]);
    await keepAll(app, redone); // why, redrafted
    const again = await lineAsk(app, id);
    expect(again.kind).toBe("say-back");
    expect(again.items.flatMap((i) => i.refs ?? [])).not.toContain(ref);
  });

  it("plans, has the reviewer look at foundation choices, and writes the confirmed milestones and decisions", async () => {
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" });
    const id = await start(app);
    await toSayBack(app, id);
    const milestones = await toMilestones(app, id);
    expect(app.runner.requests.map((r) => r.taskKind)).toEqual(
      expect.arrayContaining(["plan", "review"]),
    );
    expect(milestones.items).toHaveLength(2);
    await app.call("POST", `/api/asks/${milestones.id}/answer`, {
      answer: {
        kind: "items",
        items: [
          { key: milestones.items[0]!.key, decision: "keep", wait: true },
          { key: milestones.items[1]!.key, decision: "keep" },
        ],
      },
    });
    await app.settle();
    const decisions = await record(app, id, "decisions.md");
    expect(decisions.length).toBe(3);
    expect(decisions[0]!.marks).toContain("foundation");
    const ms = await record(app, id, "milestones.md");
    expect(ms.map((m) => m.id)).toEqual(["M-1", "M-2"]);
    expect(ms[0]!.marks).toContain("stop after it");

    // M-1 has a wait: after building (a stand-in), the line stops at its report.
    const waiting = await app.call("GET", `/api/softwares/${id}`);
    expect(waiting.body).toMatchObject({ stage: "report", state: "waiting-milestone" });
    expect(waiting.body.milestones).toMatchObject([
      { id: "M-1", position: "reached", wait: true },
      { id: "M-2", position: "ahead" },
    ]);
    const goOn = await lineAsk(app, id);
    expect(goOn.title).toMatch(/^Milestone reached: .+\. Go on\?$/);
    expect(goOn.milestone).toMatchObject({ id: "M-1" });
    expect(goOn.instruction).not.toMatch(/\.\./);
    expect(goOn.choices).toEqual(["Go on", "Go back to Why"]);
    // No new job starts while it waits.
    expect(app.session.queue.list("queued").filter((j) => j.softwareId === id)).toHaveLength(0);
    await say(app, goOn, "Go on");
    const end = await app.call("GET", `/api/softwares/${id}`);
    expect(end.body).toMatchObject({ stage: "intake", state: "active" });
    expect(end.body.milestones.map((m: { position: string }) => m.position)).toEqual([
      "reached",
      "reached",
    ]);
  });

  it("offers the way back to Why at a milestone wait", async () => {
    const app = await testApp({
      PREMISE_LINE__REMOTE: "none",
      PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: "true",
    });
    const id = await start(app);
    await toSayBack(app, id);
    await keepAll(app, await toMilestones(app, id));
    await say(app, await lineAsk(app, id), "Go back to Why");
    const detail = await app.call("GET", `/api/softwares/${id}`);
    expect(detail.body).toMatchObject({ stage: "why", state: "active" });
    expect((await lineAsk(app, id)).stage).toBe("why");
  });

  it("ends the line with a report when the operator decides not to build", async () => {
    const app = await testApp();
    const id = await start(app);
    await keepAll(app, await lineAsk(app, id));
    await keepAll(app, await lineAsk(app, id));
    await say(app, await lineAsk(app, id), "Do not build it");
    const detail = await app.call("GET", `/api/softwares/${id}`);
    expect(detail.body).toMatchObject({ state: "ended", stage: "report" });
    // Building, checking and running never happened: they show as skipped, never done or passed.
    const position = (id: string) =>
      detail.body.stages.find((s: { id: string }) => s.id === id).position;
    expect(["build", "check", "run"].map(position)).toEqual(["skipped", "skipped", "skipped"]);
    expect(detail.body.stages.find((s: { id: string }) => s.id === "build").why).toMatch(
      /decided not to build/,
    );
    expect(detail.body.status).toMatch(/nothing was built/);
    // The reporter writes the report from recorded facts.
    await app.settle();
    const report = await app.call("GET", `/api/softwares/${id}/report`);
    expect(report.body.written).not.toBeNull();
    expect(app.session.reporter.history(id)[0]!.trigger).toBe("do-not-build");
  });
}, 30_000);

describe("the gate on the line", () => {
  async function toGate(env: NodeJS.ProcessEnv = {}) {
    // Straight on to the end of the line: no stop after what was asked for.
    const app = await testApp({ PREMISE_LINE__WAIT_AFTER_ASKED: "false", ...env });
    const id = await start(app);
    await toSayBack(app, id);
    await keepAll(app, await toMilestones(app, id));
    const approvals = (await open(app, id)).filter((a) => a.kind === "approval");
    expect(approvals).toHaveLength(1);
    return { app, id, approval: approvals[0]! };
  }

  it("asks before creating the repository on GitHub; with scripted agents nothing leaves this machine, and it says so", async () => {
    const { app, id, approval } = await toGate();
    expect(approval.title).toMatch(/^Create a private repository on GitHub for /);
    expect(approval.approval!.action).toMatch(
      /^Create a private repository named .* on your GitHub account/,
    );
    expect(approval.approval!.floor).toContain("never does without asking");
    // The standing approval covers only this kind of action, and the card says nothing will happen.
    expect(approval.approval!.kindLabel).toBe("creating private repositories on GitHub");
    expect(approval.approval!.real).toBe(false);
    expect(approval.approval!.reality).toMatch(
      /^Nothing is created on GitHub whichever you choose: premise is running with scripted agents/,
    );
    // Building went on meanwhile: only the work that depends on the answer waits.
    expect((await app.call("GET", `/api/softwares/${id}`)).body.stage).toBe("intake");

    await app.call("POST", `/api/asks/${approval.id}/answer`, {
      answer: { kind: "approval", decision: "approve-once" },
    });
    await app.settle();
    const said = await chat(app, id);
    // Never "not approved" after the person approved it: approved, but nothing was done, and why.
    expect(said.at(-1)).toMatch(
      /^Approved, but nothing was done: Nothing was created on GitHub: premise is running with scripted agents .* stays on this machine, and nothing is lost/,
    );
    expect(said.join("\n")).not.toMatch(/not been approved/);
    const requests = app.session.gate.list(id);
    expect(requests[0]).toMatchObject({
      status: "unavailable",
      kind: "publish",
      act: "create-repository",
    });
    // Every request and outcome is an event, for the reporter.
    const kinds = (
      app.db.prepare("SELECT kind FROM events WHERE module = 'gate' ORDER BY id").all() as {
        kind: string;
      }[]
    ).map((e) => e.kind);
    expect(kinds).toEqual([
      "gate-requested",
      "approval-given",
      "gate-approved",
      "gate-unavailable",
    ]);
  });

  it("records a refusal and goes on, leaving the software on this machine", async () => {
    const { app, id, approval } = await toGate();
    await app.call("POST", `/api/asks/${approval.id}/answer`, {
      answer: { kind: "approval", decision: "refuse", reason: "Not yet" },
    });
    await app.settle();
    // The gate's own reply, then (in passing) what premise learned from the refusal.
    const said = await chat(app, id);
    expect(said.filter((t) => !t.startsWith("Learned from")).at(-1)).toContain(
      "Declined: nothing was created",
    );
    expect(said.at(-1)).toContain("Learned from your correction");
    expect(app.session.gate.list(id)[0]).toMatchObject({
      status: "refused",
      outcome: "Declined: Not yet",
    });
    expect((await app.call("GET", `/api/softwares/${id}`)).body.stage).toBe("intake");
  });

  it("serves an agent's gate_request without asking: premise cannot carry out what an agent asks for, so it says so and asks no one", async () => {
    const script: AgentScript = {
      rules: [
        {
          when: { task: "research" },
          calls: [
            {
              tool: "gate_request",
              arguments: {
                kind: "post",
                action: "Comment on an issue in a public project.",
                why: "To ask its author a question.",
              },
            },
            {
              tool: "gate_request",
              arguments: {
                kind: "spend",
                action: "Buy a 5 dollar report.",
                why: "It lists similar tools.",
              },
            },
          ],
          end: { outcome: "done" },
        },
        ...standInScript(0).rules,
      ],
    };
    const app = await testApp({ PREMISE_LINE__REMOTE: "none" }, { script });
    const id = await start(app);
    await keepAll(app, await lineAsk(app, id));
    await keepAll(app, await lineAsk(app, id));
    // The researcher finished without a draft. Nothing was asked of the person for its two
    // requests: premise cannot do either, so they are recorded as unavailable and said in chat.
    expect((await open(app, id)).filter((a) => a.kind === "approval")).toEqual([]);
    const requests = app.session.gate
      .list(id)
      .filter((r) => r.requestedBy.startsWith("researcher"));
    expect(requests.map((r) => [r.kind, r.status, r.askId])).toEqual([
      ["post", "unavailable", null],
      ["spend", "unavailable", null],
    ]);
    expect((await chat(app, id)).join("\n")).toMatch(
      /premise cannot do that itself, so you are not asked/,
    );

    // A request premise can ask about (here from the server itself) still asks, and a kind
    // approval then lets the next one of its kind through by rule.
    const first = app.session.gate.request({
      softwareId: id,
      kind: "post",
      action: "Comment.",
      why: "x",
      requestedBy: "test",
    });
    expect(first.status).toBe("asked");
    await app.call("POST", `/api/asks/${first.askId}/answer`, {
      answer: { kind: "approval", decision: "approve-kind" },
    });
    await app.settle();
    const detail = await app.call("GET", `/api/softwares/${id}`);
    expect(detail.body.approvals).toMatchObject([
      { kind: "post", label: "posting comments and messages" },
    ]);
    const later = app.session.gate.request({
      softwareId: id,
      kind: "post",
      action: "Comment again.",
      why: "A follow-up.",
      requestedBy: "test",
    });
    expect(later.status).toBe("approved");
    await app.settle();
    expect(app.session.gate.get(later.id)!.status).toBe("unavailable");
    // Withdrawn, it asks again.
    await app.call("POST", `/api/approvals/${detail.body.approvals[0].id}/withdraw`);
    expect(
      app.session.gate.request({
        softwareId: id,
        kind: "post",
        action: "Once more.",
        why: "x",
        requestedBy: "test",
      }).status,
    ).toBe("asked");
  });
}, 30_000);

describe("chat and stage problems", () => {
  it("puts chat into the open draft and has the drafter work it in", async () => {
    const app = await testApp();
    const id = await start(app);
    const res = await app.call("POST", `/api/softwares/${id}/chat`, {
      text: "My partner reads it too.",
    });
    expect(res.body.reply.text).toContain("Added to the open Why list");
    await app.settle();
    const why = await lineAsk(app, id);
    expect(why.items.at(-1)).toMatchObject({ text: "My partner reads it too.", mark: "from-role" });
    const correction = app.runner.requests.at(-1)!;
    expect(correction.context).toMatchObject({ purpose: "correction" });
    expect(correction.brief).toContain("My partner reads it too.");
    await keepAll(app, why);
    expect((await record(app, id, "why.md")).at(-1)).toMatchObject({
      text: "My partner reads it too.",
    });
  });

  it("asks the operator when a stage's job ends without a draft, and tries again with twice the budget", async () => {
    const script: AgentScript = {
      rules: [
        {
          when: { task: "draft", stage: "why", attempt: 1 },
          end: { outcome: "stuck", summary: "Reached the turn limit." },
        },
        ...standInScript(0).rules,
      ],
    };
    const app = await testApp({}, { script });
    const id = await start(app);
    script.rules.shift(); // the next try goes normally
    const problem = await lineAsk(app, id);
    expect(problem.title).toBe("Why did not finish: try again?");
    expect(problem.instruction).toContain("Nothing was lost");
    await say(app, problem, "Try again with twice the budget");
    expect(app.runner.requests.at(-1)).toMatchObject({ maxTurns: 30, maxMinutes: 20 });
    expect((await lineAsk(app, id)).title).toBe("Why build it: is this right?");
  });

  it("marks a drafted line as the operator's only when it quotes what they said, and tells the drafter what to supply", async () => {
    const script: AgentScript = {
      rules: [
        {
          when: { task: "draft", stage: "why" },
          calls: [
            {
              tool: "draft_submit",
              arguments: {
                stage: "why",
                items: [
                  { text: "Keeping a list matters.", from: "operator", quote: "I keep my reading list" },
                  { text: "Reading is a habit worth supporting.", from: "operator" },
                  { text: "A friend should see it.", from: "operator", quote: "share it with a friend" },
                ],
              },
            },
          ],
          end: { outcome: "done" },
        },
        ...standInScript(0).rules,
      ],
    };
    const app = await testApp({}, { script });
    const id = await start(app);
    const why = await lineAsk(app, id);
    expect(why.items.map((i) => i.mark)).toEqual(["from-role", "assumed", "assumed"]);
    expect(why.items[0]!.detail).toContain("I keep my reading list");
    const reply = app.runner.calls.find((c) => c.tool === "draft_submit")!.result;
    expect(JSON.stringify(reply)).toContain("quote");
    expect(id).toBeTruthy();
  });

  it("refuses a draft that does not fit the record, and tells the agent why", async () => {
    const script: AgentScript = {
      rules: [
        {
          when: { task: "draft", stage: "why" },
          calls: [
            { tool: "draft_submit", arguments: { stage: "who", items: ["x"] } },
            { tool: "draft_submit", arguments: { stage: "why", items: [] } },
          ],
          end: { outcome: "done" },
        },
        ...standInScript(0).rules,
      ],
    };
    const app = await testApp({}, { script });
    await start(app);
    expect(
      app.runner.calls.filter((c) => c.tool === "draft_submit").map((c) => c.result.error?.code),
    ).toEqual(["MALFORMED", "MALFORMED"]);
  });
}, 30_000);

describe("restart in the middle of a stage", () => {
  it("resumes the cut-off drafter after premise starts again, and the stage goes on", async () => {
    const script: AgentScript = {
      rules: [
        { when: { task: "draft", stage: "why", attempt: 1 }, end: { outcome: "hang" } },
        ...standInScript(0).rules,
      ],
    };
    const first = await testApp({}, { script });
    // Not settled: the drafter never finishes in this premise.
    const started = await first.call("POST", "/api/softwares", { idea: "A reading list" });
    const id = started.body.id as string;
    expect(first.session.queue.list("running")).toHaveLength(1);
    expect(await open(first, id)).toHaveLength(0);

    // premise stops without the job finishing; a new premise opens the same data folder.
    const second = await testApp({}, { script, folder: first.folder });
    const recovered = second.session.queue.recover();
    expect(recovered.map((j) => j.status)).toEqual(["queued"]);
    await second.settle();
    const why = await lineAsk(second, id);
    expect(why.title).toBe("Why build it: is this right?");
    expect(second.runner.requests[0]!.brief).toContain("cut off");
    await keepAll(second, why);
    expect((await second.call("GET", `/api/softwares/${id}`)).body.stage).toBe("who");
  });
}, 30_000);
