import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import type { AgentScript, ScriptRule } from "../src/agents/scripted-agent.js";
import { commitAll, readRecord, taskOf, writeFiles } from "../src/demo/scripted-work.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import type { AskView, SoftwareDetail } from "../src/shared/api-types.js";
import { listChatMessages } from "../src/storage/chat.js";
import { scopeAnswer, testApp } from "./helpers.js";

/**
 * Several pieces of one software at the same time (decision 0313), with the scripted agent: the
 * sizer names what each piece touches, premise builds two at once only when that does not overlap,
 * each lands in turn (checked again when another landed first), a real conflict goes back to its
 * builder, one per software at a time restores the old order, and a restart keeps both going.
 *
 * Each test builds a small software with the stand-in agents, then sends it two bug reports. A
 * report names, in brackets, the folder its fix touches and the file its builder writes.
 */

type App = Awaited<ReturnType<typeof testApp>>;

interface Fix {
  /** A word only this report has, so its builder can be told apart. */
  marker: string;
  /** What the sizer says it touches. */
  touches: string[];
  /** The file the builder writes, and the line it writes into it. */
  file: string;
  line: string;
}

const SHIELD: Fix = {
  marker: "SHIELDFIX",
  touches: ["src/combat/"],
  file: "src/combat/shield.txt",
  line: "The shield holds.",
};
const SOUND: Fix = {
  marker: "SOUNDFIX",
  touches: ["src/sound/"],
  file: "src/sound/volume.txt",
  line: "The volume is right.",
};

const message = (fix: Fix) =>
  `Bug: ${fix.marker} is broken. (touches ${fix.touches.join(", ")}; file ${fix.file})`;

interface Options {
  /** Builders that wait for something before they commit, by marker. */
  hold?: Record<string, () => Promise<void>>;
  /** Called when a builder starts, by marker. */
  started?: (marker: string, request: AgentRequest) => void;
  /** What a builder sent back with evidence (a fix round) does. */
  fix?: (copy: string, request: AgentRequest, items: string[]) => void;
  /** Extra rules before every other. */
  rules?: ScriptRule[];
}

function git(copy: string, args: string[]): string {
  return execFileSync("git", args, { cwd: copy, encoding: "utf8" });
}

function script(fixes: Fix[], options: Options = {}): AgentScript {
  const sizer: ScriptRule = {
    when: { task: "size" },
    behave: (request, call) => {
      const context = request.context ?? {};
      const allowed = Array.isArray(context.allowed) ? (context.allowed as string[]) : [];
      const words = String(context.words ?? "");
      const said = /\(touches ([^;)]*)/.exec(words)?.[1];
      const intake = context.piece === "intake";
      call("sizing_submit", {
        size: "small",
        size_reason: "Small.",
        stages: intake ? ["build", "check", "run", "report"] : allowed,
        stages_reason: intake ? "A bug goes straight to building." : "Every step.",
        split: [],
        split_reason: "One piece.",
        touches: said ? said.split(",").map((t) => t.trim()) : [],
        changes_foundation: false,
      });
    },
    end: { outcome: "done" },
  };
  const items = (request: AgentRequest, call: Parameters<NonNullable<ScriptRule["behave"]>>[1]) => {
    const task = taskOf(request);
    return task.items.length
      ? task.items
      : readRecord(call)
          .filter((l) => l.id.startsWith("W-"))
          .slice(0, 1)
          .map((l) => l.id);
  };
  const fixer: ScriptRule[] = options.fix
    ? [
        {
          when: { task: "build", purpose: "fix" },
          behave: (request, call) => {
            options.fix!(request.workingCopy!, request, items(request, call));
            call("task_finish", { status: "done" });
          },
          end: { outcome: "done" },
        },
      ]
    : [];
  const builders: ScriptRule[] = fixes.map((fix) => ({
    when: { task: "build", brief_contains: fix.marker },
    behave: async (request, call) => {
      options.started?.(fix.marker, request);
      await options.hold?.[fix.marker]?.();
      const copy = request.workingCopy!;
      writeFiles(copy, { [fix.file]: `${fix.line}\n` });
      commitAll(copy, `Fix ${fix.marker}`, items(request, call));
      call("task_finish", { status: "done" });
    },
    end: { outcome: "done" },
  }));
  return {
    rules: [...(options.rules ?? []), sizer, ...fixer, ...builders, ...standInScript(0).rules],
  };
}

async function detail(app: App, id: string): Promise<SoftwareDetail> {
  return (await app.call("GET", `/api/softwares/${id}`)).body as SoftwareDetail;
}

async function openAsks(app: App, id: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${id}&status=open`);
  return (body as AskView[]).filter((a) => !a.notice);
}

/** Answer every open ask as a person who keeps what premise says, until the line rests. */
async function answerAll(app: App, id: string, until: () => Promise<boolean>): Promise<void> {
  for (let round = 0; round < 60; round++) {
    await app.settle();
    if (await until()) return;
    const asks = await openAsks(app, id);
    if (asks.length === 0) continue;
    for (const ask of asks) {
      const answer =
        ask.kind === "approval"
          ? { kind: "approval", decision: "refuse" }
          : ask.kind === "needed"
            ? { kind: "needed", decision: ask.tool ? "without" : "cannot" }
            : ask.kind === "scope"
              ? scopeAnswer(ask)
              : ask.kind === "question" && (ask.bestAttempt || ask.choices?.length)
                ? { kind: "text", text: ask.bestAttempt ?? ask.choices![0] }
                : ask.items.length > 0
                  ? {
                      kind: "items",
                      items: ask.items.map((i) => ({ key: i.key, decision: "keep" })),
                    }
                  : ask.choices?.includes("Build it")
                    ? { kind: "text", text: "Build it" }
                    : { kind: "text", text: ask.choices?.[0] ?? "Go on." };
      await app.call("POST", `/api/asks/${ask.id}/answer`, { answer });
    }
  }
  const now = await detail(app, id);
  const asks = await openAsks(app, id);
  throw new Error(
    `The line did not come to rest: ${now.stage}, ${now.status}; asks: ${asks.map((a) => a.title).join(" | ")}; said: ${said(app, id).slice(-4).join(" | ")}`,
  );
}

/** A software built to its end with the stand-in agents, resting at Intake. */
async function builtSoftware(app: App): Promise<string> {
  const { body } = await app.call("POST", "/api/softwares", {
    idea: "A small game where a knight blocks arrows with a shield",
  });
  const id = body.id as string;
  await answerAll(app, id, async () => (await detail(app, id)).stage === "intake");
  return id;
}

/**
 * Tick the queue until `done` holds, without waiting for running jobs to end (some are held on
 * purpose, or hang until a restart).
 */
async function waitFor(app: App, done: () => Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    app.session.queue.tick();
    await app.session.line.idle();
    if (await done()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Never happened: ${what}`);
}

async function send(app: App, id: string, fix: Fix): Promise<void> {
  await app.session.services.conversation.say(id, message(fix));
}

/** Events of one kind for a software, in order. */
interface EventDetail {
  reason?: string;
  alongside?: number[];
  waitsFor?: number[];
}

function events(app: App, id: string, kind: string): { reference: string; detail: EventDetail }[] {
  return (
    app.db
      .prepare(
        "SELECT reference, detail FROM events WHERE software_id = ? AND kind = ? ORDER BY id",
      )
      .all(id, kind) as { reference: string; detail: string | null }[]
  ).map((r) => ({
    reference: r.reference,
    detail: (r.detail ? JSON.parse(r.detail) : {}) as EventDetail,
  }));
}

/** The intake work item of a bug report, by its marker. */
function itemOf(app: App, id: string, fix: Fix): number {
  const row = app.db
    .prepare("SELECT id FROM work_items WHERE software_id = ? AND kind = 'intake' AND words LIKE ?")
    .get(id, `%${fix.marker}%`) as { id: number } | undefined;
  if (!row) throw new Error(`No work item for ${fix.marker}`);
  return row.id;
}

function itemState(app: App, item: number): string {
  return (
    app.db.prepare("SELECT state FROM work_items WHERE id = ?").get(item) as { state: string }
  ).state;
}

/** The software's main branch, as it is now. */
function mainFile(app: App, id: string, file: string): string | null {
  const repo = join(app.folder, "repos", id);
  try {
    return git(repo, ["show", `HEAD:${file}`]);
  } catch {
    return null;
  }
}

async function bothDone(app: App, id: string, fixes: Fix[]): Promise<boolean> {
  const items = fixes.map((f) => {
    try {
      return itemOf(app, id, f);
    } catch {
      return null;
    }
  });
  if (items.some((i) => i === null)) return false;
  return items.every((i) => itemState(app, i!) === "done");
}

function said(app: App, id: string): string[] {
  return listChatMessages(app.db, id)
    .filter((m) => m.author === "premise")
    .map((m) => m.text);
}

describe("several pieces of one software at once", () => {
  it("builds two independent bug fixes at the same time, and both land", async () => {
    let soundStarted: () => void = () => {};
    const soundRunning = new Promise<void>((resolve) => (soundStarted = resolve));
    let overlapped = false;
    const app = await testApp(
      {},
      {
        script: script([SHIELD, SOUND], {
          started: (marker) => {
            if (marker === SOUND.marker) soundStarted();
          },
          hold: {
            // The shield's builder finishes only once the sound's builder is running too.
            [SHIELD.marker]: async () => {
              await Promise.race([
                soundRunning.then(() => (overlapped = true)),
                new Promise((r) => setTimeout(r, 20_000)),
              ]);
            },
          },
        }),
      },
    );
    const id = await builtSoftware(app);
    await send(app, id, SHIELD);
    await send(app, id, SOUND);
    await answerAll(app, id, () => bothDone(app, id, [SHIELD, SOUND]));

    expect(overlapped).toBe(true);
    const shield = itemOf(app, id, SHIELD);
    const sound = itemOf(app, id, SOUND);
    // The decision to build the sound fix alongside is recorded, with its reason.
    const flights = events(app, id, "piece-in-flight");
    const soundFlight = flights.find((e) => Number(e.reference) === sound)!;
    expect(soundFlight.detail.alongside).toEqual([shield]);
    expect(soundFlight.detail.reason).toMatch(
      /^Built alongside I-\d+ .*: they change different parts/,
    );
    expect(events(app, id, "piece-waits")).toEqual([]);
    // Both landed: each file is on the software's main branch.
    expect(mainFile(app, id, SHIELD.file)).toBe(`${SHIELD.line}\n`);
    expect(mainFile(app, id, SOUND.file)).toBe(`${SOUND.line}\n`);
    // The one that landed second had the first brought in and was checked again before landing.
    expect(events(app, id, "main-brought-in")).toHaveLength(1);
    expect(said(app, id).some((t) => /Other work landed while this was built/.test(t))).toBe(true);
    const checks = app.runner.requests.filter(
      (r) => r.taskKind === "check" && r.context?.purpose === "check",
    );
    expect(checks.length).toBeGreaterThanOrEqual(3);
    // The line rests at Intake again, with nothing in flight.
    const end = await detail(app, id);
    expect(end.stage).toBe("intake");
    expect(end.inFlight).toEqual([]);
  }, 120_000);

  it("builds two fixes that touch the same part one after the other, and says why the second waits", async () => {
    const SHIELD2: Fix = { ...SOUND, marker: "ARMOURFIX", touches: ["src/combat/armour.js"] };
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    const app = await testApp(
      {},
      { script: script([SHIELD, SHIELD2], { hold: { [SHIELD.marker]: () => released } }) },
    );
    const id = await builtSoftware(app);
    await send(app, id, SHIELD);
    await send(app, id, SHIELD2);
    // Wait until the second is ready to build and waits for the first.
    let page: SoftwareDetail | null = null;
    await waitFor(
      app,
      async () => {
        const now = await detail(app, id);
        if (now.inFlight.some((p) => p.state === "waiting")) page = now;
        return page !== null;
      },
      "the second piece waits",
    );
    const waiting = page!.inFlight.find((p) => p.state === "waiting")!;
    const building = page!.inFlight.find((p) => p.state === "building")!;
    expect(building.name).toMatch(/^I-\d+/);
    expect(building.touches).toContain("src/combat/");
    expect(waiting.reason).toMatch(/^Waits for I-\d+ .*: both change src\/combat\/\.$/);
    expect(waiting.waitsFor).toEqual([building.name]);
    expect(page!.status).toMatch(/In flight: .*being built.*waits for other work/);
    expect(said(app, id).some((t) => /is ready to build\. Waits for I-\d+/.test(t))).toBe(true);

    release();
    await answerAll(app, id, () => bothDone(app, id, [SHIELD, SHIELD2]));
    const first = itemOf(app, id, SHIELD);
    const second = itemOf(app, id, SHIELD2);
    const done = events(app, id, "work-item-done").map((e) => Number(e.reference));
    expect(done.indexOf(first)).toBeLessThan(done.indexOf(second));
    // The second went only after the first landed, so nothing had to be brought in.
    expect(events(app, id, "main-brought-in")).toEqual([]);
    const flights = events(app, id, "piece-in-flight").map((e) => Number(e.reference));
    expect(flights).toEqual([first, second]);
    expect(mainFile(app, id, SHIELD2.file)).toBe(`${SHIELD2.line}\n`);
  }, 120_000);

  it("sends a real conflict back to its builder once, and lands both when the builder merges", async () => {
    // The sizer was wrong: both write the same file, though it said they touch different parts.
    const A: Fix = { ...SHIELD, file: "notes.txt", line: "Shield note." };
    const B: Fix = { ...SOUND, file: "notes.txt", line: "Sound note." };
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    const evidence: string[] = [];
    const app = await testApp(
      {},
      {
        script: script([A, B], {
          started: (marker) => {
            if (marker === B.marker) release();
          },
          hold: { [A.marker]: () => released },
          fix: (copy, request, items) => {
            evidence.push(String(request.context?.evidence ?? ""));
            try {
              git(copy, ["merge", "--quiet", "origin/main"]);
            } catch {
              // The conflict the evidence named: keep both lines.
            }
            writeFiles(copy, { "notes.txt": `${A.line}\n${B.line}\n` });
            git(copy, ["add", "-A"]);
            commitAll(copy, "Keep both notes", items);
          },
        }),
      },
    );
    const id = await builtSoftware(app);
    await send(app, id, A);
    await send(app, id, B);
    await answerAll(app, id, () => bothDone(app, id, [A, B]));

    expect(events(app, id, "land-conflict")).toHaveLength(1);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toContain("both changed the same lines in: notes.txt");
    expect(evidence[0]).toContain("git merge origin/main");
    expect(said(app, id).some((t) => /goes back to its builder once/.test(t))).toBe(true);
    // Nobody was asked: the builder's merge was checked and landed.
    expect(
      (await app.call("GET", `/api/asks?software=${id}`)).body.some(
        (a: AskView) => a.title === "Two pieces of work changed the same lines",
      ),
    ).toBe(false);
    expect(mainFile(app, id, "notes.txt")).toBe(`${A.line}\n${B.line}\n`);
  }, 120_000);

  it("asks the person when the conflict is still there after the builder's round", async () => {
    const A: Fix = { ...SHIELD, file: "notes.txt", line: "Shield note." };
    const B: Fix = { ...SOUND, file: "notes.txt", line: "Sound note." };
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    const app = await testApp(
      {},
      {
        script: script([A, B], {
          started: (marker) => {
            if (marker === B.marker) release();
          },
          hold: { [A.marker]: () => released },
          fix: (copy, request, items) => {
            const evidence = String(request.context?.evidence ?? "");
            if (/Build this change again from the version that runs now/.test(evidence)) {
              // Built again on the new version: keep what is there, add its own line.
              const before = readFileSync(join(copy, "notes.txt"), "utf8");
              writeFiles(copy, { "notes.txt": `${before}${B.line}\n` });
            } else {
              // A builder that does not manage the merge: it changes the line again.
              writeFiles(copy, { "notes.txt": "Sound note, again.\n" });
            }
            commitAll(copy, "Try again", items);
          },
        }),
      },
    );
    const id = await builtSoftware(app);
    await send(app, id, A);
    await send(app, id, B);
    let asked: AskView | undefined;
    for (let i = 0; i < 40 && !asked; i++) {
      await app.settle();
      asked = (await openAsks(app, id)).find(
        (a) => a.title === "Two pieces of work changed the same lines",
      );
    }
    expect(asked, "the person was never asked").toBeDefined();
    expect(asked!.instruction).toContain("notes.txt");
    expect(asked!.choices).toEqual([
      "Have the builder try again",
      "Build it again on the new version",
    ]);
    expect(events(app, id, "land-conflict")).toHaveLength(2);
    await app.call("POST", `/api/asks/${asked!.id}/answer`, {
      answer: { kind: "text", text: "Build it again on the new version" },
    });
    await answerAll(app, id, () => bothDone(app, id, [A, B]));
    expect(mainFile(app, id, "notes.txt")).toBe(`${A.line}\n${B.line}\n`);
  }, 120_000);

  it("builds one piece after another when the software is set to one at a time", async () => {
    const app = await testApp({}, { script: script([SHIELD, SOUND]) });
    const id = await builtSoftware(app);
    const set = await app.call("POST", `/api/softwares/${id}/pieces-in-flight`, { value: 1 });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect((set.body as SoftwareDetail).piecesInFlight).toEqual({
      value: 1,
      chosen: true,
      default: 2,
    });
    expect(said(app, id).at(-1)).toContain("now builds one piece of work at a time");
    await send(app, id, SHIELD);
    await send(app, id, SOUND);
    await answerAll(app, id, () => bothDone(app, id, [SHIELD, SOUND]));
    // Nothing went into flight: each was built in front, the second after the first was done.
    expect(events(app, id, "piece-in-flight")).toEqual([]);
    const first = itemOf(app, id, SHIELD);
    const second = itemOf(app, id, SOUND);
    const sizedSecond = app.db
      .prepare("SELECT id FROM events WHERE kind = 'work-item-sized' AND reference = ?")
      .get(String(second)) as { id: number };
    const doneFirst = app.db
      .prepare("SELECT id FROM events WHERE kind = 'work-item-done' AND reference = ?")
      .get(String(first)) as { id: number };
    expect(doneFirst.id).toBeLessThan(sizedSecond.id);
    expect(mainFile(app, id, SOUND.file)).toBe(`${SOUND.line}\n`);

    // Back to the default.
    const back = await app.call("POST", `/api/softwares/${id}/pieces-in-flight`, { value: null });
    expect((back.body as SoftwareDetail).piecesInFlight).toEqual({
      value: 2,
      chosen: false,
      default: 2,
    });
    const refused = await app.call("POST", `/api/softwares/${id}/pieces-in-flight`, {
      value: 0,
    });
    expect(refused.status).toBe(422);
  }, 120_000);

  it("carries two pieces in flight through a restart, and both land", async () => {
    const hang: ScriptRule[] = [SHIELD, SOUND].map((fix) => ({
      when: { task: "build", attempt: 1, brief_contains: fix.marker },
      end: { outcome: "hang" },
    }));
    const rules = script([SHIELD, SOUND], { rules: hang });
    const first = await testApp({}, { script: rules });
    const id = await builtSoftware(first);
    await send(first, id, SHIELD);
    await send(first, id, SOUND);
    await waitFor(
      first,
      async () =>
        first.session.queue.list("running").filter((j) => j.kind === "build").length === 2,
      "both builders running",
    );
    const before = await detail(first, id);
    expect(before.inFlight.map((p) => p.state)).toEqual(["building", "building"]);
    expect(first.session.queue.list("running").map((j) => j.kind)).toEqual(["build", "build"]);

    const second = await testApp({}, { script: rules, folder: first.folder });
    expect(second.session.queue.recover().map((j) => j.kind)).toEqual(["build", "build"]);
    expect((await detail(second, id)).inFlight.map((p) => p.state)).toEqual([
      "building",
      "building",
    ]);
    await answerAll(second, id, () => bothDone(second, id, [SHIELD, SOUND]));
    expect(mainFile(second, id, SHIELD.file)).toBe(`${SHIELD.line}\n`);
    expect(mainFile(second, id, SOUND.file)).toBe(`${SOUND.line}\n`);
    expect((await detail(second, id)).stage).toBe("intake");
  }, 120_000);
});
