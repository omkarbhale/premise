import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installTraceHook } from "../src/agents/working-copy.js";
import type { AgentScript, ScriptRule } from "../src/agents/scripted-agent.js";
import { REAL_RUN_EXPECTED, realRunEnv, realRunOperator } from "../src/demo/real-run.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import { readTriage } from "../src/intake/triage.js";
import { planProblems, waitAfterFirst } from "../src/line/plan-checks.js";
import { cutForEffort, estimate, placeFor, scopeCuts, scopeTiers } from "../src/line/scope.js";
import { allowedStages, requiredStages, settleStages } from "../src/line/sizing.js";
import { applyOperations } from "../src/record/change.js";
import type { RecordItem } from "../src/record/format.js";
import { parseRecord } from "../src/record/parse.js";
import type { AskView } from "../src/shared/api-types.js";
import { scopeAnswer, tempFolder, testApp } from "./helpers.js";

/**
 * Effort in proportion to what was asked (decisions 0191, 0192): the scope check, the effort level,
 * the first milestone for what was asked, the plan checks, bugs built straight away, the trace line,
 * a prominent "do not build", and premise's own measures.
 */

function item(id: string, text: string, marks: Partial<RecordItem["marks"]> = {}): RecordItem {
  const kind = id[0] as RecordItem["kind"];
  return {
    id,
    kind,
    number: Number(id.slice(2)),
    file: "what.md",
    line: 1,
    text,
    marks: { from: "assumed", date: "2026-11-21", ...marks },
  };
}

describe("the scope check's tiers", () => {
  const users = [
    item("U-1", "The operator, who reads files from a terminal."),
    item("U-2", "Assumed: another person on the same machine."),
  ];

  it("puts what the operator said and the musts in what was asked, and premise's ideas below", () => {
    const tiers = scopeTiers([
      ...users,
      item("W-1", "It prints the lines last first.", { priority: "must", from: "operator" }),
      item("W-2", "It never changes the file.", { priority: "must" }),
      item("W-3", "Help text for U-2, who runs it without help.", { priority: "must" }),
      item("W-4", "It reads standard input.", { priority: "should" }),
      item("W-5", "It handles huge files. Not checked.", { priority: "could" }),
      item("W-6", "A gentler error, for U-1.", { priority: "must" }),
      item("W-7", "It explains itself.", { priority: "could", from: "operator" }),
    ]);
    expect(tiers.map((t) => [t.item.id, t.tier])).toEqual([
      ["W-1", "asked"],
      ["W-2", "asked"],
      // A need of a user premise assumed is never "what you asked for" (0191 point d).
      ["W-3", "recommended"],
      ["W-4", "recommended"],
      ["W-5", "could"],
      // U-1 is the operator, even though the drafter marked it assumed.
      ["W-6", "asked"],
      // What the operator said is what they asked for, whatever its priority.
      ["W-7", "asked"],
    ]);
    expect(tiers[2]!.note).toContain("U-2, a user premise assumed");
  });

  it("starts on the cut the effort gives, and places each tier by it", () => {
    expect(cutForEffort("low")).toBe("asked");
    expect(cutForEffort("medium")).toBe("recommended");
    expect(cutForEffort("high")).toBe("everything");
    expect(placeFor("asked", "asked")).toBe("first");
    expect(placeFor("recommended", "asked")).toBe("out");
    expect(placeFor("recommended", "recommended")).toBe("later");
    expect(placeFor("could", "recommended")).toBe("out");
    expect(placeFor("could", "everything")).toBe("later");
  });

  it("gives each cut a rough cost that grows with what is added", () => {
    const tiers = scopeTiers([
      item("W-1", "a", { priority: "must", from: "operator" }),
      item("W-2", "b", { priority: "should" }),
      item("W-3", "c", { priority: "could" }),
    ]);
    const cuts = scopeCuts(tiers, { minutesPerSession: 2, itemsPerBuild: 3 });
    expect(cuts.map((c) => c.id)).toEqual(["asked", "recommended", "everything"]);
    expect(cuts[0]!.sessions).toBeLessThan(cuts[1]!.sessions);
    expect(cuts[1]!.sessions).toBeLessThanOrEqual(cuts[2]!.sessions);
    expect(cuts[0]!.minutes).toBe(cuts[0]!.sessions * 2);
    expect(estimate(1, 0, { minutesPerSession: 3, itemsPerBuild: 3 })).toEqual({
      sessions: 7,
      minutes: 21,
    });
  });
});

describe("the left-out mark in the record", () => {
  const files = new Map([
    ["what.md", "# What it must do\n- [W-1] It counts. (could; from: assumed; 2026-11-21)\n"],
  ]);

  it("marks a W item left out and brings it back, for the operator only", () => {
    const out = applyOperations(files, [{ op: "mark", id: "W-1", leftOut: true }], {
      today: "2026-11-22",
    });
    expect(out.ok).toBe(true);
    const text = (out as { change: { files: Map<string, string> } }).change.files.get("what.md")!;
    expect(text).toContain("(could; from: assumed; left-out; 2026-11-21)");
    expect(parseRecord(new Map([["what.md", text]])).items[0]!.marks.leftOut).toBe(true);
    const back = applyOperations(
      new Map([["what.md", text]]),
      [{ op: "mark", id: "W-1", leftOut: false }],
      { today: "2026-11-22" },
    );
    expect(
      (back as { change: { files: Map<string, string> } }).change.files.get("what.md"),
    ).not.toContain("left-out");
    const byAgent = applyOperations(files, [{ op: "mark", id: "W-1", leftOut: true }], {
      today: "2026-11-22",
      proposer: { agentRole: "planner" },
    });
    expect(byAgent.ok).toBe(false);
  });
});

describe("the plan checks", () => {
  const scope = { first: ["W-1", "W-2"], later: ["W-3"], out: ["W-4"] };

  it("refuses left-out items, additions in milestone 1, tasks with no outcome, and repeats", () => {
    const problems = planProblems(
      [
        { title: "Reverse the lines", items: ["W-1", "W-2", "D-1"], milestone: 1 },
        { title: "Plain errors", items: ["W-2", "D-4"], milestone: 1 },
        { title: "Set up the project", items: ["D-1"], milestone: 1 },
        { title: "Help text", items: ["W-3"], milestone: 1 },
        { title: "Huge files", items: ["W-4"], milestone: 2 },
        { title: "Somewhere", items: ["W-1"], milestone: 5 },
      ],
      2,
      scope,
      { hasOutcomeItems: true },
    );
    expect(problems.join("\n")).toContain(
      'Task 2 ("Plain errors") serves only W-2, which task 1 also serves',
    );
    expect(problems.join("\n")).toContain('Task 3 ("Set up the project") serves no W item');
    expect(problems.join("\n")).toContain("Task 4 is in milestone 1 but serves W-3");
    expect(problems.join("\n")).toContain("Task 5 serves W-4, which the operator left out");
    expect(problems.join("\n")).toContain(
      "Task 6 names milestone 5, but the plan has 2 milestones",
    );
  });

  it("passes a plan of separate outcomes, what was asked first", () => {
    const tasks = [
      { title: "Reverse the lines, with plain errors", items: ["W-1", "W-2", "D-1"], milestone: 1 },
      { title: "Help text", items: ["W-3"], milestone: 2 },
    ];
    expect(planProblems(tasks, 2, scope, { hasOutcomeItems: true })).toEqual([]);
    // Only premise's additions follow: premise stops after the first milestone by default.
    expect(waitAfterFirst(tasks, 2, scope)).toBe(true);
    expect(
      waitAfterFirst([...tasks, { title: "More", items: ["W-1"], milestone: 2 }], 2, scope),
    ).toBe(false);
    expect(waitAfterFirst(tasks.slice(0, 1), 1, scope)).toBe(false);
  });
});

describe("intake: a bug is built straight away", () => {
  const context = { number: 1, others: new Set<number>(), recordIds: new Set(["W-1"]) };
  const base = {
    touches: [],
    size: "small",
    touches_floor: "no",
    route: "in-normally",
    reason: "r",
  };

  it("never lets a bug change what the software must do, and reads changes_what for a wish", () => {
    const bug = readTriage({ ...base, kind: "bug", changes_what: "yes" }, context);
    expect("result" in bug && bug.result.changesWhat).toBe(false);
    expect("result" in bug && bug.result.notes.join(" ")).toContain(
      "builds and checks it straight away",
    );
    const tweak = readTriage({ ...base, kind: "wish", changes_what: "no" }, context);
    expect("result" in tweak && tweak.result.changesWhat).toBe(false);
    const wish = readTriage({ ...base, kind: "wish" }, context);
    expect("result" in wish && wish.result.changesWhat).toBe(true);
  });

  it("gives each kind of intake work only the stages it needs", () => {
    const piece = (origin: "bug" | "change" | "intake") => ({
      kind: "intake" as const,
      origin,
      parentId: 1,
    });
    expect(allowedStages(piece("bug"))).toEqual(["build", "check", "run", "report"]);
    expect(requiredStages(piece("change"))).toEqual(["what", "build", "check", "run", "report"]);
    expect(allowedStages(piece("intake"))).not.toContain("what");
    // A change to What is confirmed once: no say-back is added after it.
    expect(settleStages(piece("change"), ["what", "plan", "build"]).stages).not.toContain(
      "say-back",
    );
  });
});

describe("the trace line in the builder's working copy", () => {
  it("adds the task's trailer to a commit that names none, and leaves one that does", () => {
    const repo = tempFolder();
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "--quiet");
    git("config", "user.name", "test");
    git("config", "user.email", "test@example.invalid");
    installTraceHook(repo, "Premise-Trace: W-1, D-2");
    writeFileSync(join(repo, "a.txt"), "a");
    git("add", "a.txt");
    git("commit", "--quiet", "-m", "Add a");
    expect(git("log", "-1", "--format=%B")).toBe("Add a\n\nPremise-Trace: W-1, D-2");
    writeFileSync(join(repo, "b.txt"), "b");
    git("add", "b.txt");
    git("commit", "--quiet", "-m", "Add b\n\nPremise-Trace: W-1");
    expect(git("log", "-1", "--format=%B")).toBe("Add b\n\nPremise-Trace: W-1");
  });

  it("installs nothing for a line that is not a plain trailer", () => {
    const repo = tempFolder();
    mkdirSync(join(repo, ".git"), { recursive: true });
    installTraceHook(repo, "Premise-Trace: W-1'; rm -rf /");
    expect(() => execFileSync("test", ["-e", join(repo, ".git", "hooks", "commit-msg")])).toThrow();
  });
});

// ---- Through the line, with the scripted agent ---------------------------------------------------

type App = Awaited<ReturnType<typeof testApp>>;

async function openAsks(app: App, id: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${id}&status=open`);
  return (body as AskView[]).filter((a) => a.kind !== "approval");
}

async function only(app: App, id: string): Promise<AskView> {
  const asks = await openAsks(app, id);
  expect(asks, JSON.stringify(asks.map((a) => a.title))).toHaveLength(1);
  return asks[0]!;
}

async function answer(app: App, ask: AskView, value: unknown) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, { answer: value });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

const keep = (ask: AskView) => ({
  kind: "items",
  items: ask.items.map((i) => ({ key: i.key, decision: "keep" })),
});

async function start(app: App, effort?: string) {
  const { body } = await app.call("POST", "/api/softwares", {
    idea: "A small page where I keep my reading list",
    ...(effort && { effort }),
  });
  await app.settle();
  return body.id as string;
}

/** Why, Who, What exists and What, all kept; the scope check is left open. */
async function toScope(app: App, id: string): Promise<AskView> {
  await answer(app, await only(app, id), keep(await only(app, id)));
  await answer(app, await only(app, id), keep(await only(app, id)));
  await answer(app, await only(app, id), { kind: "text", text: "Build it" });
  await answer(app, await only(app, id), keep(await only(app, id)));
  const scope = await only(app, id);
  expect(scope.kind).toBe("scope");
  return scope;
}

function script(...rules: ScriptRule[]): AgentScript {
  return { rules: [...rules, ...standInScript(0).rules] };
}

describe("effort and the scope check, through the line", { timeout: 30_000 }, () => {
  it("starts a low-effort software on 'only what I asked for', with smaller budgets", async () => {
    const app = await testApp();
    const id = await start(app, "low");
    const detail = (await app.call("GET", `/api/softwares/${id}`)).body;
    expect(detail.effort).toBe("low");
    // Half the small Why budget of 15 turns and 10 minutes.
    expect(detail.budget).toMatchObject({ turns: 8, minutes: 5 });

    const scope = await toScope(app, id);
    expect(scope.scope!.preselected).toBe("asked");
    await answer(app, scope, scopeAnswer(scope));
    // What premise added is left out: kept in the record, marked, and not said back.
    const record = (await app.call("GET", `/api/softwares/${id}/record`)).body;
    const what = record.files.find((f: { file: string }) => f.file === "what.md").items as {
      id: string;
      marks: string[];
    }[];
    expect(what.filter((i) => i.marks.includes("left out: not built")).map((i) => i.id)).toEqual([
      "W-3",
      "W-4",
    ]);
    const sayBack = await only(app, id);
    expect(sayBack.kind).toBe("say-back");
    expect(sayBack.items.flatMap((i) => i.refs ?? [])).not.toContain("W-3");
    await answer(app, sayBack, keep(sayBack));
    // One milestone, what was asked for, and so no stop after it.
    const milestones = await only(app, id);
    expect(milestones.items).toHaveLength(1);
    expect(milestones.items[0]!.wait).toBe(false);
    const planner = app.runner.requests.filter((r) => r.taskKind === "plan").at(-1)!;
    expect(planner.brief).toContain("Left out by the operator, not planned or built: W-3, W-4.");
  });

  it("changes a software's effort at any time, and says what it means", async () => {
    const app = await testApp();
    const id = await start(app);
    expect((await app.call("GET", `/api/softwares/${id}`)).body.effort).toBe("medium");
    const res = await app.call("POST", `/api/softwares/${id}/effort`, { effort: "high" });
    expect(res.status).toBe(200);
    expect(res.body.effort).toBe("high");
    const chat = (await app.call("GET", `/api/softwares/${id}/chat`)).body as { text: string }[];
    expect(chat.at(-1)!.text).toContain("Effort set to high: everything premise could add.");
    const wrong = await app.call("POST", `/api/softwares/${id}/effort`, { effort: "max" });
    expect(wrong.status).toBe(422);
  });

  it("puts what was asked first, premise's additions later, and stops after the first", async () => {
    const app = await testApp();
    const id = await start(app);
    const scope = await toScope(app, id);
    // An item moved by hand goes where the operator put it.
    const answerValue = scopeAnswer(scope, "recommended") as {
      items: { key: string; place: string }[];
    };
    answerValue.items.find((i) => i.key === "W-4")!.place = "later";
    await answer(app, scope, answerValue);
    await answer(app, await only(app, id), keep(await only(app, id))); // say-back
    const milestones = await only(app, id);
    expect(milestones.items.map((i) => i.wait)).toEqual([true, false]);
    expect(milestones.instruction).toContain("The first milestone is what you asked for");
  });

  it("takes chat as intake while the scope check is open, not as a correction", async () => {
    const app = await testApp();
    const id = await start(app);
    await toScope(app, id);
    const res = await app.call("POST", `/api/softwares/${id}/chat`, { text: "Dark mode too" });
    expect(res.body.reply.text).toMatch(/^Taken as I-1\./);
  });

  it("skips the scope check when premise has nothing to add", async () => {
    const onlyAsked: ScriptRule = {
      when: { task: "draft", stage: "what" },
      behave: (_r, call) => {
        call("draft_submit", {
          stage: "what",
          items: [{ priority: "must", text: "It keeps the list.", from: "operator" }],
        });
      },
      end: { outcome: "done" },
    };
    const app = await testApp({}, { script: script(onlyAsked) });
    const id = await start(app);
    await answer(app, await only(app, id), keep(await only(app, id)));
    await answer(app, await only(app, id), keep(await only(app, id)));
    await answer(app, await only(app, id), { kind: "text", text: "Build it" });
    await answer(app, await only(app, id), keep(await only(app, id)));
    expect((await only(app, id)).kind).toBe("say-back");
  });

  it("sends a plan back to the planner until each task is a separate outcome", async () => {
    const results: unknown[] = [];
    const planner: ScriptRule = {
      when: { task: "plan", purpose: "draft" },
      behave: (_r, call) => {
        const plan = (tasks: unknown[]) =>
          call("draft_submit", {
            stage: "plan",
            items: [{ kind: "D", text: "A small program. Reason: one user. Rejected: a service." }],
            milestones: [{ text: "What you asked for." }],
            tasks,
          });
        results.push(
          plan([
            { title: "The list", items: ["W-1", "W-2"], milestone: 1 },
            { title: "The list again", items: ["W-2"], milestone: 1 },
          ]),
        );
        results.push(plan([{ title: "The list", items: ["W-1", "W-2"], milestone: 1 }]));
      },
      end: { outcome: "done" },
    };
    const app = await testApp({}, { script: script(planner) });
    const id = await start(app, "low");
    const scope = await toScope(app, id);
    await answer(app, scope, scopeAnswer(scope));
    await answer(app, await only(app, id), keep(await only(app, id))); // say-back
    expect(JSON.stringify(results[0])).toContain("which task 1 also serves");
    expect(JSON.stringify(results[1])).toContain("received");
    expect((await only(app, id)).title).toBe("Milestones: is this the right order?");
  });
});

describe("what exists: not building it is said first", { timeout: 30_000 }, () => {
  it("shows a do-not-build recommendation with its one-line alternative, and records it", async () => {
    const researcher: ScriptRule = {
      when: { task: "research" },
      behave: (_r, call) => {
        call("draft_submit", {
          stage: "exists",
          items: [
            {
              text: "tac prints a file's lines last first. Checked: its manual page.",
              from: "assumed",
            },
          ],
          outcome: "Do not build it",
          alternative: "alias revlines='tac'",
          reason: "tac already does the job.",
        });
      },
      end: { outcome: "done" },
    };
    const app = await testApp({}, { script: script(researcher) });
    const id = await start(app);
    await answer(app, await only(app, id), keep(await only(app, id)));
    await answer(app, await only(app, id), keep(await only(app, id)));
    const exists = await only(app, id);
    expect(exists.title).toBe("premise recommends not building it: something already does this");
    expect(exists.instruction).toMatch(/^Instead: alias revlines='tac'\. /);
    expect(exists.choices![0]).toBe("Do not build it");
    await answer(app, exists, { kind: "text", text: "Do not build it" });
    const record = (await app.call("GET", `/api/softwares/${id}/record`)).body;
    const e = record.files.find((f: { file: string }) => f.file === "exists.md").items as {
      text: string;
    }[];
    expect(e.at(-1)!.text).toBe("Outcome: Do not build it. Instead: alias revlines='tac'");
  });
});

describe("the builder's brief and the report", { timeout: 30_000 }, () => {
  it("gives the builder the exact trace line, and reports sessions and time to running", async () => {
    const app = await testApp({ PREMISE_LINE__WAIT_AFTER_ASKED: "false" });
    const id = await start(app, "low");
    const scope = await toScope(app, id);
    await answer(app, scope, scopeAnswer(scope));
    await answer(app, await only(app, id), keep(await only(app, id))); // say-back
    await answer(app, await only(app, id), keep(await only(app, id))); // milestones
    const build = app.runner.requests.find((r) => r.taskKind === "build")!;
    expect(build.brief).toContain("   Premise-Trace: W-1, W-2\n");
    expect(build.trace).toBe("Premise-Trace: W-1, W-2");

    const report = (await app.call("GET", `/api/softwares/${id}/report?detail=1`)).body;
    const effort = report.sections.find((s: { title: string }) => s.title === "Effort");
    expect(effort.lines[0].text).toMatch(
      /^From your idea to the first running version: .+ and \d+ agent sessions\.$/,
    );
    const sessions = (
      app.db
        .prepare(
          "SELECT COUNT(*) AS n FROM agent_sessions s JOIN jobs j ON j.id = s.job_id WHERE j.software_id = ?",
        )
        .get(id) as { n: number }
    ).n;
    expect(effort.lines[0].text).toContain(`${sessions} agent sessions`);
  });
});

describe("the real run's expectations (not run here: it uses real agents)", () => {
  it("runs at low effort, takes the scope check as it starts, and expects one milestone", () => {
    const env = realRunEnv(4000);
    expect(env.PREMISE_SOFTWARES__DEFAULT_EFFORT).toBe("low");
    expect(REAL_RUN_EXPECTED).toEqual({ milestones: 1, mostSessions: 15 });
    const answer = realRunOperator()({
      id: 1,
      softwareId: "s",
      softwareName: "s",
      role: "operator",
      kind: "scope",
      stage: "what",
      title: "How much to build?",
      instruction: "",
      items: [
        { key: "W-1", text: "a", mark: "from-role", tier: "asked" },
        { key: "W-5", text: "b", mark: "suggestion", tier: "could" },
      ],
      scope: { cuts: [], preselected: "asked", estimateNote: "" },
      status: "open",
      asked: "2026-11-21T00:00:00Z",
    });
    expect(answer).toEqual({
      kind: "scope",
      items: [
        { key: "W-1", place: "first" },
        { key: "W-5", place: "out" },
      ],
    });
  });
});
