import { describe, expect, it, vi } from "vitest";
import { sessionSettings } from "../src/agents/claude-settings.js";
import { accessFor } from "../src/agents/roles.js";
import type { AgentScript, ScriptBehaviour, ScriptRule } from "../src/agents/scripted-agent.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import { type OperatorAnswer, demoOperator, demoScript, runDemo } from "../src/demo/demos.js";
import { commitAll, itemsOf, taskOf, writeFiles } from "../src/demo/scripted-work.js";
import { jobDoing } from "../src/line/working-on.js";
import type { Job } from "../src/queue/work-queue.js";
import { buildReport } from "../src/reporter/build.js";
import { type Facts, readVerdicts } from "../src/reporter/facts.js";
import type { AskView } from "../src/shared/api-types.js";
import { type AnswerFate, getAsk, listAsks } from "../src/storage/asks.js";
import { listIntakeItems } from "../src/intake/items.js";
import { tempFolder, testApp, uniquePortRange } from "./helpers.js";

/**
 * The faults of the owner's second real run (decision 0310), walked with the scripted agent: an
 * answer to a job that had ended was lost; the person could not see what was being worked on; a
 * fix round named the wrong items; rounds were burned on a missing program; nobody saw the game on
 * screen.
 */

vi.setConfig({ testTimeout: 90_000 });

type App = Awaited<ReturnType<typeof testApp>>;
type Args = Record<string, unknown>;

const base = () => demoScript(COUNT_DEMO).rules;
const ruleOf = (task: string, purpose?: string) =>
  base().find((r) => r.when?.task === task && (!purpose || r.when.purpose === purpose))!;

function script(...first: ScriptRule[]): AgentScript {
  return { rules: [...first, ...base()] };
}

async function run(options: {
  script: AgentScript;
  operator?: (ask: AskView) => OperatorAnswer;
  env?: NodeJS.ProcessEnv;
}) {
  const { range } = await uniquePortRange(20);
  return runDemo("cli", {
    dataFolder: tempFolder(),
    confinement: "none",
    portRange: range,
    ...options,
  });
}

const FEEDBACK =
  "No crosshair, no sounds, no bullet tracers, no HUD, no way back to the main menu: overall no polish.";

describe("an answer to a job that has ended is never dropped", () => {
  it("takes the answer in as intake, says so truthfully, and keeps the ask honest while it waits", async () => {
    let asked = false;
    const seen: AskView[] = [];
    const checker: ScriptRule = {
      ...ruleOf("check", "check"),
      behave: async (request, call) => {
        if (!asked) {
          asked = true;
          call("ask", {
            role: "operator",
            kind: "question",
            items: ["How does it feel to use? Tell me what is missing."],
          });
        }
        return ruleOf("check", "check").behave!(request, call);
      },
    };
    const operator = demoOperator(COUNT_DEMO);
    const result = await run({
      script: script(checker),
      operator: (ask) => {
        if (ask.title.startsWith("How does it feel")) {
          seen.push(ask);
          return { kind: "text", text: FEEDBACK };
        }
        return operator(ask);
      },
    });
    // While it waited, the card said plainly where an answer goes, and held nothing up.
    expect(seen[0]!.instruction).toContain(
      "The checker asked this and has since finished, so no agent waits on your answer.",
    );
    const said = result.said.join("\n");
    expect(said).not.toContain("The agent's next step gets your answer");
    expect(said).toMatch(
      /The checker had already finished, so your answer is taken in as I-\d+\. An agent reads it against the record next/,
    );
  });

  it("records where the answer went, for the page", async () => {
    let asked = false;
    const app = await testApp(
      { PREMISE_LINE__REMOTE: "none" },
      {
        script: script({
          ...ruleOf("check", "check"),
          behave: async (request, call) => {
            if (!asked) {
              asked = true;
              call("ask", { role: "operator", kind: "question", items: ["Anything missing?"] });
            }
            return ruleOf("check", "check").behave!(request, call);
          },
        }),
      },
    );
    const id = await startCount(app);
    await drive(app, id, (ask) =>
      ask.title === "Anything missing?" ? { kind: "text", text: FEEDBACK } : undefined,
    );
    const ask = listAsks(app.db, { softwareId: id }).find((a) => a.title === "Anything missing?")!;
    const fate = ask.extra.meta?.fate as AnswerFate;
    expect(fate).toMatchObject({ state: "intake" });
    const item = listIntakeItems(app.db, { softwareId: id }).find((i) =>
      i.text.includes("no bullet tracers"),
    )!;
    expect(item.text).toContain('Answer to the question "Anything missing?"');
    expect(fate.intake).toBe(`I-${item.number}`);
    const { body: view } = await app.call("GET", `/api/asks?software=${id}&status=answered`);
    const card = (view as AskView[]).find((a) => a.id === ask.id)!;
    expect(card.fate).toContain(`Taken in as I-${item.number}`);
    const { body: detail } = await app.call("GET", `/api/softwares/${id}`);
    expect(detail.working.answers[0]).toMatchObject({
      askId: ask.id,
      state: "intake",
      intake: `I-${item.number}`,
    });
  });
});

describe("an answer given while the builder still works", () => {
  it("is held, and the task is built again with it once the builder ends", async () => {
    let appRef: App | null = null;
    const briefs: { answers: string[] }[] = [];
    const build = ruleOf("build");
    const asking: ScriptBehaviour = async (request, call) => {
      const answers = (request.context?.answers as string[] | undefined) ?? [];
      if (taskOf(request).number === 1) briefs.push({ answers });
      if (taskOf(request).number === 1 && briefs.length === 1) {
        const envelope = call("ask", {
          role: "operator",
          kind: "question",
          items: ["Should a hyphenated word count as one?"],
        }) as { result?: { ask_id?: number } };
        const askId = envelope.result?.ask_id;
        // Carry on working until the person has answered: the answer comes mid-session.
        for (let i = 0; i < 400; i++) {
          if (askId && appRef && getAsk(appRef.db, askId)?.status === "answered") break;
          await new Promise((r) => setTimeout(r, 5));
        }
      }
      return build.behave!(request, call);
    };
    const app = await testApp(
      { PREMISE_LINE__REMOTE: "none" },
      { script: script({ when: { task: "build" }, behave: asking, end: { outcome: "done" } }) },
    );
    appRef = app;
    const id = await startCount(app);
    await driveLive(app, id, (ask) =>
      ask.title.startsWith("Should a hyphenated")
        ? { kind: "text", text: "Yes, one word." }
        : undefined,
    );
    await drive(app, id);
    const said = (
      app.db
        .prepare("SELECT text FROM chat_messages WHERE software_id = ? AND author = 'premise'")
        .all(id) as { text: string }[]
    ).map((r) => r.text);
    expect(said.join("\n")).toContain(
      "its builder is still working and cannot read it now, so the task is built again with your answer once this attempt ends",
    );
    expect(said.join("\n")).toContain(
      `Task 1's builder finished before it could read your answer to "Should a hyphenated word count as one?", so the task is built again with it next.`,
    );
    expect(briefs.length).toBeGreaterThanOrEqual(2);
    expect(briefs[1]!.answers.join(" ")).toContain("Yes, one word.");
    const ask = listAsks(app.db, { softwareId: id }).find((a) =>
      a.title.startsWith("Should a hyphenated"),
    )!;
    expect(ask.extra.meta?.fate).toMatchObject({ state: "given" });
  });
});

describe("what is being worked on", () => {
  it("says what a fix round does, in plain words", () => {
    const job = {
      kind: "build",
      stage: "build",
      items: ["W-3"],
      payload: {
        purpose: "fix",
        context: {
          purpose: "fix",
          evidence:
            "W-3 not met: shields are missing, so one-headshot kills don't match\nmore detail",
        },
      },
    } as unknown as Job;
    expect(jobDoing(job)).toBe(
      "Fixing what the check found: shields are missing, so one-headshot kills don't match",
    );
  });

  it("shows each running job with what it does and the items it serves, on the page and in Activity", async () => {
    const app = await testApp(
      { PREMISE_LINE__REMOTE: "none" },
      {
        script: script({
          when: { task: "build", attempt: 1 },
          progress: ["Working"],
          end: { outcome: "hang" },
        }),
      },
    );
    const id = await startCount(app);
    await driveLive(
      app,
      id,
      () => undefined,
      (a) => a.session.queue.list("running").some((j) => j.kind === "build"),
    );
    const { body: detail } = await app.call("GET", `/api/softwares/${id}`);
    const job = detail.working.jobs.find((j: { kind: string }) => j.kind === "build");
    expect(job.status).toBe("running");
    expect(job.doing).toMatch(/^Building task 1: /);
    expect(job.items.length).toBeGreaterThan(0);
    expect(job.items[0].text).not.toBe("");
    const { body: activity } = await app.call("GET", "/api/activity");
    expect(activity.running[0].doing).toBe(job.doing);
    expect(activity.running[0].items).toEqual(job.items);
    await app.session.queue.close();
  });
});

describe("a fix round names the items that were not met", () => {
  it("in its title, its task items and its trace line, also when more rounds are given", async () => {
    let gave = false;
    const buggy: ScriptBehaviour = (request, call) => {
      const copy = request.workingCopy!;
      const task = taskOf(request);
      writeFiles(copy, COUNT_DEMO.build(3));
      commitAll(
        copy,
        task.fix ? "Fix (not really)" : task.title,
        task.items.length ? task.items : ["W-2"],
      );
      call("task_finish", { status: "done" });
    };
    const base = demoOperator(COUNT_DEMO);
    const dataFolder = tempFolder();
    const { range } = await uniquePortRange(20);
    const result = await runDemo("cli", {
      dataFolder,
      confinement: "none",
      portRange: range,
      script: script({ when: { task: "build" }, behave: buggy, end: { outcome: "done" } }),
      env: { PREMISE_LINE__CHECK_ROUNDS_BEFORE_STOP: "1" },
      operator: (ask) => {
        if (ask.title.startsWith("The check failed")) {
          const text = gave ? "Land it as it is" : "Give it more rounds";
          gave = true;
          return { kind: "text", text };
        }
        return base(ask);
      },
    });
    const { openDatabase } = await import("../src/storage/database.js");
    const { db } = openDatabase(dataFolder);
    try {
      const notMet = [
        ...new Set(
          readVerdicts(db, result.softwareId)
            .filter((v) => v.verdict === "not-met")
            .map((v) => v.item),
        ),
      ];
      expect(notMet.length).toBeGreaterThan(0);
      const fixes = (
        db.prepare("SELECT items, payload FROM jobs WHERE kind = 'build'").all() as {
          items: string;
          payload: string;
        }[]
      )
        .map((j) => ({ items: JSON.parse(j.items) as string[], payload: JSON.parse(j.payload) }))
        .filter((j) => j.payload.purpose === "fix");
      expect(fixes.length).toBeGreaterThan(0);
      for (const fix of fixes) {
        expect(fix.items).toEqual(notMet);
        expect(fix.payload.trace).toBe(`Premise-Trace: ${notMet.join(", ")}`);
        expect(fix.payload.context.task.title).toBe(
          `Fix what the check found: ${notMet.join(", ")} not met`,
        );
      }
    } finally {
      db.close();
    }
  });
});

describe("a check that could not run the software for a reason outside it", () => {
  it("does not count as a failed round: the line waits on the ask for the program, then checks again", async () => {
    let round = 0;
    const checker: ScriptRule = {
      ...ruleOf("check", "check"),
      behave: async (request, call) => {
        round += 1;
        if (round === 1) {
          const items = itemsOf(request);
          call("ask", {
            role: "operator",
            kind: "needed",
            tool: "zzz-engine",
            why: "The game needs it to start.",
            items: ["Install zzz-engine."],
          });
          call("verdict_submit", {
            verdicts: items.map((item) => ({
              item,
              verdict: "not-met",
              evidence: "It could not be started: zzz-engine is not here.",
              judged_on: "real",
            })) as Args[],
            seen_on_screen: false,
          });
          return;
        }
        return ruleOf("check", "check").behave!(request, call);
      },
    };
    const result = await run({
      script: script(checker),
      // The demo's first build has a planted defect: one real failed round, under a limit of 2.
      env: { PREMISE_LINE__CHECK_ROUNDS_BEFORE_STOP: "2" },
    });
    const said = result.said.join("\n");
    expect(said).toContain("the agents need zzz-engine, and it is not here");
    expect(said).toContain("so this round does not count toward the stop after 2 failed rounds");
    expect(said).toMatch(/Your answer goes to the check of commit \w+, which runs again now\./);
    // Had it counted, the demo's one real failure would be the second and stop the line.
    const statuses = result.build!.checks.map((c) => c.status);
    expect(statuses).toEqual(["waiting-for-tool", "not-passed", "passed"]);
    expect(result.build!.landed).not.toBeNull();
  });
});

describe("seeing a game or desktop program on screen", () => {
  it("lets only the checker start its own virtual screen, keeping the machine's sockets out of reach", () => {
    const base = {
      workingCopy: "/data/work/s/1",
      dataFolder: "/data",
      home: "/home/someone",
      allowedDomains: ["registry.npmjs.org"],
      claudeConfigFolder: null,
      extraDeniedPaths: [],
      virtualDisplay: true,
    };
    const checker = sessionSettings({ ...base, access: accessFor("check") });
    expect(checker.sandbox.network.allowAllUnixSockets).toBe(true);
    for (const path of ["/tmp/.X11-unix", "/var/run/docker.sock", "/run/user"]) {
      expect(checker.sandbox.filesystem.denyRead).toContain(path);
    }
    const builder = sessionSettings({ ...base, access: accessFor("build") });
    expect(builder.sandbox.network.allowAllUnixSockets).toBeUndefined();
    expect(builder.sandbox.filesystem.denyRead).not.toContain("/tmp/.X11-unix");
    const off = sessionSettings({ ...base, virtualDisplay: false, access: accessFor("check") });
    expect(off.sandbox.network.allowAllUnixSockets).toBeUndefined();
  });
});

// ---- Helpers ------------------------------------------------------------------------------------

async function startCount(app: App): Promise<string> {
  const { body } = await app.call("POST", "/api/softwares", { idea: COUNT_DEMO.idea });
  return body.id as string;
}

/** Answer as the demo operator, with some answers of the test's own. */
function answerer(
  own: (ask: AskView) => OperatorAnswer | undefined,
): (ask: AskView) => OperatorAnswer {
  const operator = demoOperator(COUNT_DEMO);
  return (ask) => own(ask) ?? operator(ask);
}

/** Drive until nothing is left to answer, letting every job end first. */
async function drive(
  app: App,
  id: string,
  own: (ask: AskView) => OperatorAnswer | undefined = () => undefined,
) {
  const answer = answerer(own);
  const deadline = Date.now() + 80_000;
  while (Date.now() < deadline) {
    await app.settle();
    const open = await app.session.services.asks.list({ softwareId: id, status: "open" });
    if (open.length === 0) {
      const detail = await app.session.services.softwares.get(id);
      if (detail.stage === "intake") return;
      continue;
    }
    for (const ask of open) await app.session.services.asks.answer(ask.id, answer(ask));
  }
}

/** Drive without waiting for running jobs to end, answering as they ask, until `until` holds. */
async function driveLive(
  app: App,
  id: string,
  own: (ask: AskView) => OperatorAnswer | undefined,
  until: (app: App) => boolean = (a) =>
    a.session.queue.list("running").length === 0 && a.session.queue.list("queued").length === 0,
) {
  const answer = answerer(own);
  for (let i = 0; i < 4000; i++) {
    app.session.queue.tick();
    await new Promise((r) => setTimeout(r, 5));
    await app.session.line.idle();
    for (const ask of await app.session.services.asks.list({ softwareId: id, status: "open" })) {
      await app.session.services.asks.answer(ask.id, answer(ask));
    }
    if (i > 10 && until(app)) return;
  }
  throw new Error("The software never got there.");
}

describe("a game or desktop program nobody saw on screen", () => {
  const facts = (screen: Facts["screen"]): Facts => ({
    softwareId: "s",
    softwareName: "A game",
    generated: "2026-11-24T00:00:00.000Z",
    recordAvailable: true,
    items: [],
    commits: [{ sha: "abcdef1234", date: "2026-11-24", subject: "Build it", items: [] }],
    verdicts: [],
    runs: [
      {
        id: 1,
        commit: "abcdef1234",
        kind: "program",
        status: "built",
        command: "godot --path .",
        link: null,
        restarts: 0,
        failure: null,
        started: "2026-11-24T00:00:00.000Z",
        ended: "2026-11-24T00:00:00.000Z",
      },
    ],
    runView: null,
    jobs: [],
    asks: [],
    usage: null,
    usageProblem: null,
    measures: null,
    lastReport: null,
    milestone: null,
    doing: null,
    intake: null,
    later: [],
    screen,
  });
  const lines = (screen: Facts["screen"]) =>
    buildReport(facts(screen), { detail: true, maxLines: 999 })
      .sections.flatMap((s) => s.lines)
      .map((l) => l.text);

  it("says so plainly in the report, unless a check saw it", () => {
    const unseen = "Nobody has seen it on screen";
    expect(lines(null).some((l) => l.startsWith(unseen))).toBe(true);
    expect(lines({ seen: false, commit: "abcdef1234" }).some((l) => l.startsWith(unseen))).toBe(
      true,
    );
    expect(lines({ seen: true, commit: "abcdef1234" }).some((l) => l.startsWith(unseen))).toBe(
      false,
    );
  });
});
