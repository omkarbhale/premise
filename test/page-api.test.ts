import { describe, expect, it } from "vitest";
import type { AskView } from "../src/shared/api-types.js";
import { scopeAnswer, testApp } from "./helpers.js";

type Call = Awaited<ReturnType<typeof testApp>>["call"];

async function openAsk(call: Call, softwareId: string): Promise<AskView> {
  const { body } = await call("GET", `/api/asks?software=${softwareId}&status=open`);
  const line = (body as AskView[]).filter((a) => a.kind !== "approval");
  expect(line).toHaveLength(1);
  return line[0]!;
}

async function approvals(call: Call, softwareId: string): Promise<AskView[]> {
  const { body } = await call("GET", `/api/asks?software=${softwareId}&status=open`);
  return (body as AskView[]).filter((a) => a.kind === "approval");
}

async function keepAll(call: Call, ask: AskView) {
  // The scope check is answered as the page does when nobody moves an item.
  if (ask.kind === "scope") {
    return call("POST", `/api/asks/${ask.id}/answer`, { answer: scopeAnswer(ask) });
  }
  return call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) },
  });
}

describe("starting a software", () => {
  it("starts one from an idea, names it, and asks the first draft", async () => {
    const { call, settle } = await testApp();
    const started = await call("POST", "/api/softwares", {
      idea: "I want a small app that keeps my reading list",
    });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ name: "Small app", stage: "why" });

    // The work is sized first (quickly), then the Why draft is asked.
    await settle();
    const now = await call("GET", `/api/softwares/${started.body.id}`);
    expect(now.body).toMatchObject({ stage: "why", openAsks: 1 });
    expect(now.body.status).toContain("Waiting on you");

    const ask = await openAsk(call, started.body.id);
    expect(ask).toMatchObject({ kind: "draft", role: "operator", stage: "why" });
    expect(ask.items[0]!.text).toContain("keeps my reading list");

    const chat = await call("GET", `/api/softwares/${started.body.id}/chat`);
    const authors = chat.body.map((m: { author: string }) => m.author);
    expect(authors[0]).toBe("person");
    expect(authors.slice(1).every((a: string) => a === "premise")).toBe(true);
  });

  it("refuses an empty idea with a message that says what to do", async () => {
    const { call } = await testApp();
    const response = await call("POST", "/api/softwares", { idea: "   " });
    expect(response.status).toBe(422);
    expect(response.body.error).toContain("Write a sentence or two");
  });

  it("refuses a name already taken", async () => {
    const { call } = await testApp();
    await call("POST", "/api/softwares", { idea: "x", name: "Notes" });
    const again = await call("POST", "/api/softwares", { idea: "y", name: "notes" });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("Choose another name");
  });

  it("answers 404 for a software that is not there", async () => {
    const { call } = await testApp();
    const response = await call("GET", "/api/softwares/nope");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("start a new one");
  });

  it("answers 422 for a body it cannot read", async () => {
    const { call } = await testApp();
    const response = await call("POST", "/api/softwares", { name: 3 });
    expect(response.status).toBe(422);
    expect(response.body.error).toContain("Reload the page");
  });
});

describe("answering asks", () => {
  it("answers 422, not 500, for malformed item answers", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const ask = await openAsk(call, sw.id);
    const key = ask.items[0]!.key;
    for (const items of [[null], [{ key, decision: "edit", text: 5 }]]) {
      const res = await call("POST", `/api/asks/${ask.id}/answer`, {
        answer: { kind: "items", items },
      });
      expect(res.status).toBe(422);
    }
  });

  it("takes per-item strike, keep and edit, and writes them to the record", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const ask = await openAsk(call, sw.id);
    const [a, b, c, d] = ask.items;
    const answered = await call("POST", `/api/asks/${ask.id}/answer`, {
      answer: {
        kind: "items",
        items: [
          { key: a!.key, decision: "keep" },
          { key: b!.key, decision: "strike", reason: "Not true for me" },
          { key: c!.key, decision: "edit", text: "It must take under a minute a day." },
          { key: d!.key, decision: "keep" },
        ],
      },
    });
    expect(answered.status).toBe(200);
    expect(answered.body).toMatchObject({
      status: "answered",
      answerSummary: "Kept 2, struck 1, edited 1.",
    });

    const record = await call("GET", `/api/softwares/${sw.id}/record`);
    const why = record.body.files.find((f: { file: string }) => f.file === "why.md");
    // The fourth item was the size class: it sets the size, and is not a record item.
    expect(why.items).toEqual([
      expect.objectContaining({ id: "Y-1", status: "live" }),
      expect.objectContaining({ id: "Y-2", status: "struck", reason: "Not true for me" }),
      expect.objectContaining({
        id: "Y-3",
        status: "live",
        text: "It must take under a minute a day.",
        marks: expect.arrayContaining(["from: operator"]),
      }),
    ]);
    expect(record.body.source).toBe("record");
    const detail = await call("GET", `/api/softwares/${sw.id}`);
    expect(detail.body.stage).toBe("who");
    expect(detail.body.stages.map((s: { position: string }) => s.position).slice(0, 3)).toEqual([
      "done",
      "current",
      "ahead",
    ]);
  });

  it("answers 409 when an ask was already answered, as from another open page", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const ask = await openAsk(call, sw.id);
    expect((await keepAll(call, ask)).status).toBe(200);
    const again = await keepAll(call, ask);
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("already answered");
  });

  it("answers 422 for an answer of the wrong kind or an empty edit", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const ask = await openAsk(call, sw.id);
    const wrongKind = await call("POST", `/api/asks/${ask.id}/answer`, {
      answer: { kind: "text", text: "yes" },
    });
    expect(wrongKind.status).toBe(422);
    const emptyEdit = await call("POST", `/api/asks/${ask.id}/answer`, {
      answer: { kind: "items", items: [{ key: ask.items[0]!.key, decision: "edit", text: " " }] },
    });
    expect(emptyEdit.status).toBe(422);
    expect(emptyEdit.body.error).toContain("Strike it instead");
    expect(
      (await call("POST", "/api/asks/999/answer", { answer: { kind: "text", text: "x" } })).status,
    ).toBe(404);
  });

  it("routes chat to the open draft, and otherwise takes it as intake", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const toDraft = await call("POST", `/api/softwares/${sw.id}/chat`, { text: "Also cacti" });
    expect(toDraft.body.reply.text).toContain("Added to the open Why list");
    const ask = await openAsk(call, sw.id);
    expect(ask.items.at(-1)).toMatchObject({
      text: "Also cacti",
      mark: "from-role",
      from: "operator",
    });

    await keepAll(call, ask);
    // Who is open now: still a draft. Answer it, and the line goes to What exists (a job, no draft).
    await keepAll(call, await openAsk(call, sw.id));
    const toIntake = await call("POST", `/api/softwares/${sw.id}/chat`, {
      text: "Dark mode please",
    });
    expect(toIntake.body.reply.text).toMatch(/^Taken as I-1\./);
  });
});

describe("the whole line, with the line engine and the scripted agent", () => {
  it("walks from the idea to Intake, with jobs in the queue and a report at the end", async () => {
    const { call, settle, session } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await keepAll(call, await openAsk(call, sw.id)); // why
    await keepAll(call, await openAsk(call, sw.id)); // who
    await settle(); // research job
    const exists = await openAsk(call, sw.id);
    expect(exists).toMatchObject({ kind: "question", stage: "exists" });
    expect(exists.choices).toContain("Build it");
    await call("POST", `/api/asks/${exists.id}/answer`, {
      answer: { kind: "text", text: "Build it" },
    });
    await keepAll(call, await openAsk(call, sw.id)); // what

    // One ask on how much to build, with a rough cost for each choice, started on the effort's.
    const scope = await openAsk(call, sw.id);
    expect(scope).toMatchObject({ kind: "scope", stage: "what", title: "How much to build?" });
    expect(scope.scope!.preselected).toBe("recommended");
    expect(scope.scope!.cuts.map((c) => c.id)).toEqual(["asked", "recommended", "everything"]);
    expect(scope.scope!.estimateNote).toContain("rough estimate");
    expect(scope.items.map((i) => i.tier)).toEqual(["asked", "asked", "recommended", "could"]);
    await keepAll(call, scope);
    await settle();

    const sayBack = await openAsk(call, sw.id);
    expect(sayBack.kind).toBe("say-back");
    expect(sayBack.items.length).toBeLessThanOrEqual(10);
    const editSayBack = await call("POST", `/api/asks/${sayBack.id}/answer`, {
      answer: {
        kind: "items",
        items: [{ key: sayBack.items[0]!.key, decision: "edit", text: "x" }],
      },
    });
    expect(editSayBack.status).toBe(422);
    // Strike one: the record strikes it, its stage is redone, and premise says back again.
    await call("POST", `/api/asks/${sayBack.id}/answer`, {
      answer: { kind: "items", items: [{ key: sayBack.items[1]!.key, decision: "strike" }] },
    });
    await settle();
    await keepAll(call, await openAsk(call, sw.id)); // the stage redone
    await settle();
    const maybeScope = await openAsk(call, sw.id);
    if (maybeScope.kind === "scope") {
      await keepAll(call, maybeScope);
      await settle();
    }
    const sayBackAgain = await openAsk(call, sw.id);
    expect(sayBackAgain.kind).toBe("say-back");
    expect(sayBackAgain.items.flatMap((i) => i.refs ?? [])).not.toContain(
      sayBack.items[1]!.refs![0],
    );
    await keepAll(call, sayBackAgain);

    await settle(); // plan and review jobs
    const milestones = await openAsk(call, sw.id);
    expect(milestones.title).toBe("Milestones: is this the right order?");
    await keepAll(call, milestones);
    const [approval] = await approvals(call, sw.id);
    expect(approval!.approval?.action).toContain("private repository");
    expect(approval!.approval?.floor).toContain("never does without asking");
    await call("POST", `/api/asks/${approval!.id}/answer`, {
      answer: { kind: "approval", decision: "approve-once" },
    });
    await settle(); // build, check, run, for the first milestone

    // premise stops after what was asked for, because what follows is only its own additions.
    const waiting = await call("GET", `/api/softwares/${sw.id}`);
    expect(waiting.body).toMatchObject({ stage: "report", state: "waiting-milestone" });
    const firstReport = await call("GET", `/api/softwares/${sw.id}/report`);
    const effort = firstReport.body.sections.find((x: { title: string }) => x.title === "Effort");
    expect(effort.lines[0].text).toMatch(
      /^From your idea to the first running version: .* and \d+ agent sessions?\.$/,
    );
    const goOn = await openAsk(call, sw.id);
    await call("POST", `/api/asks/${goOn.id}/answer`, { answer: { kind: "text", text: "Go on" } });
    await settle();

    const detail = await call("GET", `/api/softwares/${sw.id}`);
    expect(detail.body.stage).toBe("intake");
    expect(detail.body).not.toHaveProperty("usage");

    const report = await call("GET", `/api/softwares/${sw.id}/report`);
    expect(report.body.written).not.toBeNull();
    expect(report.body.cost.demo).toBe(true);
    // The scripted builder wrote a placeholder program that says it is a trial; it was checked
    // (honestly: could not check), landed and run as a command once.
    const run = await call("GET", `/api/softwares/${sw.id}/run`);
    expect(run.body).toMatchObject({ state: "finished" });
    expect(run.body.output.join("\n")).toContain("a scripted trial");
    expect(
      detail.body.build.checks.at(-1).verdicts.map((v: { verdict: string }) => v.verdict),
    ).toEqual(expect.arrayContaining(["could-not-check"]));
    const titles = report.body.sections.map((s: { title: string }) => s.title);
    expect(titles).toEqual(expect.arrayContaining(["Running"]));

    const activity = await call("GET", "/api/activity");
    expect(activity.body.recent.map((j: { kind: string }) => j.kind)).toEqual(
      expect.arrayContaining(["build", "check", "run"]),
    );
    expect(session.queue.list().map((j) => j.kind)).toEqual(
      expect.arrayContaining(["draft", "research", "plan", "review", "build", "check", "run"]),
    );
  }, 90_000);

  it("stops after the milestone when the software waits there, until the operator says go on", async () => {
    const { call, settle } = await testApp({ PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: "true" });
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await keepAll(call, await openAsk(call, sw.id));
    await keepAll(call, await openAsk(call, sw.id));
    await settle();
    const exists = await openAsk(call, sw.id);
    await call("POST", `/api/asks/${exists.id}/answer`, {
      answer: { kind: "text", text: "Build it" },
    });
    await keepAll(call, await openAsk(call, sw.id)); // what
    await settle();
    await keepAll(call, await openAsk(call, sw.id)); // how much to build
    await settle();
    await keepAll(call, await openAsk(call, sw.id)); // say-back
    await settle();
    await keepAll(call, await openAsk(call, sw.id)); // milestones, each waiting by default
    await settle();
    const waiting = await call("GET", `/api/softwares/${sw.id}`);
    expect(waiting.body).toMatchObject({ stage: "report", state: "waiting-milestone" });
    const goOn = await openAsk(call, sw.id);
    await call("POST", `/api/asks/${goOn.id}/answer`, { answer: { kind: "text", text: "Go on" } });
    await settle();
    // The second milestone waits too.
    const second = await call("GET", `/api/softwares/${sw.id}`);
    expect(second.body).toMatchObject({ stage: "report", state: "waiting-milestone" });
    const goOnAgain = await openAsk(call, sw.id);
    await call("POST", `/api/asks/${goOnAgain.id}/answer`, {
      answer: { kind: "text", text: "Go on" },
    });
    const after = await call("GET", `/api/softwares/${sw.id}`);
    expect(after.body).toMatchObject({ stage: "intake", state: "active" });
  });

  it("ends the line when the operator decides not to build", async () => {
    const { call, settle } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await keepAll(call, await openAsk(call, sw.id));
    await keepAll(call, await openAsk(call, sw.id));
    await settle();
    const exists = await openAsk(call, sw.id);
    await call("POST", `/api/asks/${exists.id}/answer`, {
      answer: { kind: "text", text: "Do not build it" },
    });
    const detail = await call("GET", `/api/softwares/${sw.id}`);
    expect(detail.body).toMatchObject({ state: "ended" });
    expect(detail.body.status).toContain("decided not to build");
  });
}, 30_000);

describe("send back, size and jobs", () => {
  it("sends a software back to an earlier stage, withdrawing what was open", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await keepAll(call, await openAsk(call, sw.id));
    const who = await openAsk(call, sw.id);
    const back = await call("POST", `/api/softwares/${sw.id}/send-back`, { stage: "why" });
    expect(back.status).toBe(200);
    expect(back.body.stage).toBe("why");
    const late = await keepAll(call, who);
    expect(late.status).toBe(409);
    expect(late.body.error).toContain("withdrawn");
    expect((await openAsk(call, sw.id)).stage).toBe("why");
  });

  it("refuses to send a software forward, or to a stage that does not exist", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const forward = await call("POST", `/api/softwares/${sw.id}/send-back`, { stage: "build" });
    expect(forward.status).toBe(422);
    expect(forward.body.error).toContain("has not reached Build");
    const unknown = await call("POST", `/api/softwares/${sw.id}/send-back`, { stage: "nowhere" });
    expect(unknown.status).toBe(422);
  });

  it("changes the size class", async () => {
    const { call } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const changed = await call("POST", `/api/softwares/${sw.id}/size`, { size: "large" });
    expect(changed.body.sizeClass).toBe("large");
    expect((await call("POST", `/api/softwares/${sw.id}/size`, { size: "huge" })).status).toBe(422);
  });

  it("stops a queued job, and refuses to stop one that has ended", async () => {
    const { call, session } = await testApp();
    const { body: sw } = await call("POST", "/api/softwares", { idea: "Track plant watering" });
    await keepAll(call, await openAsk(call, sw.id));
    const who = await openAsk(call, sw.id);
    session.queue.pauseAll("Testing.", new Date(Date.now() + 3_600_000).toISOString());
    await keepAll(call, who);
    const before = await call("GET", "/api/activity");
    expect(before.body.paused).toBe(true);
    const job = before.body.queued[0];
    expect(job).toMatchObject({ kind: "research", softwareName: sw.name });
    const stopped = await call("POST", `/api/jobs/${job.id}/stop`);
    expect(stopped.status).toBe(200);
    expect(stopped.body.recent[0]).toMatchObject({ id: job.id, status: "stopped" });
    expect((await call("POST", `/api/jobs/${job.id}/stop`)).status).toBe(422);
    expect((await call("POST", "/api/jobs/999/stop")).status).toBe(404);
    const problem = await openAsk(call, sw.id);
    expect(problem.title).toBe("What exists did not finish: try again?");
    expect(problem.instruction).toContain("was stopped");
  });
});
