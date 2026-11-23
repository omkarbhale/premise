import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import type { AgentScript, ScriptBehaviour, ScriptRule } from "../src/agents/scripted-agent.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import { type OperatorAnswer, demoOperator, demoScript, runDemo } from "../src/demo/demos.js";
import { commitAll, readRecord, taskOf, writeFiles } from "../src/demo/scripted-work.js";
import type { AskView } from "../src/shared/api-types.js";
import { createAsk, listAsks } from "../src/storage/asks.js";
import { listChatMessages } from "../src/storage/chat.js";
import { tempFolder, uniquePortRange } from "./helpers.js";

/**
 * A change that came in through intake is planned and built as a change (decision 0273) and asks
 * at most one question before it is built (decision 0274). Each test builds the command-line demo
 * in two milestones with the scripted agent, then sends it a wish.
 */

type Context = Parameters<NonNullable<Parameters<typeof runDemo>[1]["after"]>>[0];

const WISH = "Also count the paragraphs, separated by empty lines";

interface ChangeScript {
  /** What the drafter makes of the wish at What. */
  what?: Record<string, unknown>[];
  openChoice?: string;
  /** The change's decisions, given the record's lines. */
  decisions?: (record: { id: string; line: string }[]) => Record<string, unknown>[];
  /** Whether the planner may plan yet (for the start-up test). */
  planReady?: () => boolean;
}

/** The plan in two milestones: lines and characters first, then words and errors. */
const twoMilestones: ScriptBehaviour = (_request, call) => {
  const record = readRecord(call);
  const id = (pattern: RegExp) => record.filter((l) => pattern.test(l.line)).map((l) => l.id);
  call("draft_submit", {
    stage: "plan",
    items: COUNT_DEMO.decisions,
    milestones: [
      { text: "It counts lines and characters." },
      { text: "It counts words and says plainly when it cannot read a file." },
    ],
    tasks: COUNT_DEMO.tasks.map((t, i) => ({
      title: t.title,
      items: t.serves.flatMap((p) => id(p)),
      check: t.check,
      milestone: i === 0 ? 1 : 2,
    })),
    kind: COUNT_DEMO.kind,
    how_to_run: COUNT_DEMO.howToRun,
  });
};

function script(change: ChangeScript = {}): AgentScript {
  const rules: ScriptRule[] = [
    {
      when: { task: "triage" },
      behave: (_r, call) => {
        call("triage_submit", {
          kind: "wish",
          touches: [],
          size: "small",
          touches_floor: "no",
          changes_what: "yes",
          route: "in-normally",
          reason: "It asks for something new.",
        });
      },
      end: { outcome: "done" },
    },
    {
      when: { task: "size" },
      behave: (request, call) => {
        const intake = request.context?.piece === "intake";
        call("sizing_submit", {
          size: "small",
          size_reason: "Small.",
          stages: intake
            ? ["what", "plan", "build", "check", "run", "report"]
            : [
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
              ],
          stages_reason: "What it needs.",
          split: [],
          split_reason: "One piece.",
        });
      },
      end: { outcome: "done" },
    },
    {
      when: { task: "draft", stage: "what", brief_contains: "the intake item" },
      behave: (_r, call) => {
        call("draft_submit", {
          stage: "what",
          items: change.what ?? [
            { priority: "must", text: "It prints the number of paragraphs.", from: "operator" },
            {
              priority: "must",
              text: "A paragraph ends at an empty line.",
              from: "assumed",
            },
            {
              priority: "could",
              text: "It also counts sentences.",
              from: "suggestion",
            },
          ],
          ...(change.openChoice && { open_choice: change.openChoice }),
        });
      },
      end: { outcome: "done" },
    },
    { when: { task: "plan", purpose: "draft" }, behave: twoMilestones, end: { outcome: "done" } },
    {
      when: { task: "plan", purpose: "change" },
      behave: (request: AgentRequest, call) => {
        if (change.planReady && !change.planReady()) return;
        const record = readRecord(call);
        const items = (request.context?.items as string[]) ?? [];
        call("draft_submit", {
          stage: "plan",
          items: change.decisions?.(record) ?? [],
          tasks: [{ title: "Count paragraphs", items, check: "It prints paragraphs: 2." }],
        });
      },
      end: { outcome: "done" },
    },
    {
      // The change's builder writes the mended files, so the check has nothing to send back.
      when: { task: "build", brief_contains: "Count paragraphs" },
      behave: (request, call) => {
        const copy = request.workingCopy!;
        const task = taskOf(request);
        writeFiles(copy, { ...COUNT_DEMO.fixed(), "PARAGRAPHS.md": "Counts paragraphs.\n" });
        commitAll(copy, task.title, task.items);
        call("task_finish", { status: "done" });
      },
      end: { outcome: "done" },
    },
  ];
  return { rules: [...rules, ...demoScript(COUNT_DEMO).rules] };
}

async function run(
  change: ChangeScript,
  then: (context: Context) => Promise<void>,
  options: {
    operator?: (ask: AskView) => OperatorAnswer;
    env?: NodeJS.ProcessEnv;
    dataFolder?: string;
  } = {},
) {
  const { range } = await uniquePortRange(20);
  const dataFolder = options.dataFolder ?? tempFolder();
  const result = await runDemo("cli", {
    dataFolder,
    confinement: "none",
    portRange: range,
    script: script(change),
    ...(options.operator && { operator: options.operator }),
    ...(options.env && { env: options.env }),
    after: then,
  });
  return { result, dataFolder };
}

async function sendWish(context: Context): Promise<void> {
  await context.session.services.conversation.say(context.softwareId, WISH);
}

/** What the operator was asked, by purpose, from the database. */
function asked(context: Context, purpose: string): AskView["title"][] {
  return listAsks(context.db, { softwareId: context.softwareId })
    .filter((a) => a.extra.meta?.purpose === purpose)
    .map((a) => a.title);
}

describe("a change is planned and built as a change", () => {
  it("plans one task, asks no milestones question, builds only that task, and checks the touched and the met musts", async () => {
    let plan: string | null = null;
    let seen: Record<string, unknown> = {};
    const dataFolder = tempFolder();
    const { result } = await run(
      {},
      async (context) => {
        const { session, softwareId, runner, db } = context;
        // The software was built in two milestones and rests at Intake.
        const detail = await session.services.softwares.get(softwareId);
        expect(detail.milestones.map((m) => m.position)).toEqual(["reached", "reached"]);
        const planFile = join(dataFolder, "plans", softwareId, "plan.json");
        plan = readFileSync(planFile, "utf8");
        const before = runner.requests.length;

        await sendWish(context);
        // The operator never answers: a plain wish asks no question, it is built at once.
        for (let i = 0; i < 40; i++) {
          session.queue.tick();
          await session.queue.idle();
          await session.line.idle();
          await new Promise((r) => setTimeout(r, 5));
          const open = listAsks(db, { softwareId, status: "open" }).filter(
            (a) => a.extra.meta?.notice !== true,
          );
          expect(open.map((a) => a.title)).toEqual([]);
          if ((await session.services.softwares.get(softwareId)).stage === "intake") break;
        }
        const after = runner.requests.slice(before);
        seen = {
          milestoneAsks: asked(context, "milestones").length,
          builds: after.filter((r) => r.taskKind === "build").map((r) => taskOf(r).title),
          checkItems: after
            .filter((r) => r.taskKind === "check" && r.context?.purpose === "check")
            .map((r) => r.context?.items as string[]),
          plannerBrief: after.find((r) => r.taskKind === "plan")?.brief ?? "",
          notice: listAsks(db, { softwareId }).find(
            (a) => a.extra.meta?.purpose === "change-notice",
          ),
          stage: (await session.services.softwares.get(softwareId)).stage,
          planAfter: readFileSync(planFile, "utf8"),
          changePlans: existsSync(join(dataFolder, "plans", softwareId, "changes")),
          said: listChatMessages(db, softwareId)
            .filter((m) => m.author === "premise")
            .map((m) => m.text),
          record: await session.services.records.view(softwareId),
        };
      },
      { dataFolder },
    );
    expect(result.answered.some((a) => a.title.startsWith("Milestones:"))).toBe(true);
    // No milestones question for the change, and the software's plan was not replaced.
    expect(seen.milestoneAsks).toBe(1);
    expect(seen.planAfter).toBe(plan);
    expect(seen.changePlans).toBe(true);
    expect(seen.plannerBrief).toContain("Plan this change to");
    expect(seen.plannerBrief).toContain("the intake item I-1");
    expect(seen.plannerBrief).toContain("do not plan it again");
    // Only the change's one task was built.
    expect(seen.builds).toEqual(["Count paragraphs"]);
    // The check judged the change's items and every must already met, against the new commit.
    const record = seen.record as { files: { items: { id: string; text: string }[] }[] };
    const items = record.files.flatMap((f) => f.items);
    const paragraphs = items.find((i) => /number of paragraphs/.test(i.text))!.id;
    const lines = items.find((i) => /lines and characters/.test(i.text))!.id;
    const checked = (seen.checkItems as string[][]).at(-1)!;
    expect(checked).toContain(paragraphs);
    expect(checked).toContain(lines);
    // The suggestion was not built: it is not in the record.
    expect(items.some((i) => /sentences/.test(i.text))).toBe(false);
    // premise said once what it took and assumed, and built at once.
    const said = seen.said as string[];
    const notice = said.find((t) => t.startsWith("I-1 taken as:"))!;
    expect(notice).toContain("It prints the number of paragraphs");
    expect(notice).toContain("Assumed, not checked with you: A paragraph ends at an empty line");
    expect(notice).toContain("Building now: 1. Count paragraphs");
    expect(said.some((t) => t.startsWith("Building your change I-1: Count paragraphs"))).toBe(true);
    expect(said.some((t) => t.startsWith("I-1 changed: Count paragraphs."))).toBe(true);
    expect(said.some((t) => t.startsWith("Checked again so nothing that worked is broken:"))).toBe(
      true,
    );
    expect(seen.stage).toBe("intake");
    // The notice stays open after the change is done only because a suggestion is still offered.
    expect((seen.notice as { status: string } | undefined)?.status).toBe("open");
  }, 150_000);

  it("asks one question when the change replaces a foundation decision, naming it", async () => {
    const seen: { asks: AskView[]; said: string[] } = { asks: [], said: [] };
    await run(
      {
        decisions: (record) => {
          const node = record.find((l) => /Node\.js script/.test(l.line))!;
          return [
            {
              text: "A Node.js script that reads the file as a stream",
              reason: "Paragraphs are counted while reading.",
              replaces: node.id,
            },
          ];
        },
      },
      async (context) => {
        const { session, softwareId, db } = context;
        await sendWish(context);
        await new Promise((r) => setTimeout(r, 5));
        for (let i = 0; i < 40; i++) {
          session.queue.tick();
          await session.queue.idle();
          await session.line.idle();
          const open = (await session.services.asks.list({ softwareId, status: "open" })).filter(
            (a) => !a.notice,
          );
          if (open.length) {
            seen.asks = open;
            break;
          }
        }
        expect(seen.asks).toHaveLength(1);
        await context.drive();
        seen.said = listChatMessages(db, softwareId).map((m) => m.text);
        expect(asked(context, "milestones")).toHaveLength(1);
        expect(asked(context, "draft").filter((t) => t.includes("I-1"))).toEqual([]);
      },
    );
    const [ask] = seen.asks;
    expect(ask!.title).toBe("Your change I-1: check this once before it is built");
    expect(ask!.instruction).toMatch(/replaces the foundation decision D-\d+/);
    expect(ask!.instruction).toContain("It will build 1. Count paragraphs");
    expect(ask!.items.some((i) => i.mark === "assumed" && /paragraph ends/.test(i.text))).toBe(
      true,
    );
    expect(
      ask!.items.some((i) => /reads the file as a stream \(replaces D-\d+\)/.test(i.text)),
    ).toBe(true);
    expect(seen.said.some((t) => t.startsWith("Thank you. Building your change I-1 now"))).toBe(
      true,
    );
  }, 150_000);

  it("asks once when the person's words left a real choice open", async () => {
    let asks: AskView[] = [];
    await run({ openChoice: "Whether a line of spaces counts as empty" }, async (context) => {
      await sendWish(context);
      await context.session.line.idle();
      for (let i = 0; i < 20 && asks.length === 0; i++) {
        context.session.queue.tick();
        await context.session.queue.idle();
        await context.session.line.idle();
        asks = (
          await context.session.services.asks.list({
            softwareId: context.softwareId,
            status: "open",
          })
        ).filter((a) => !a.notice);
      }
      await context.drive();
    });
    expect(asks).toHaveLength(1);
    expect(asks[0]!.instruction).toContain(
      "your words left a choice open: Whether a line of spaces counts as empty",
    );
    expect(asks[0]!.suggestions?.map((s) => s.text)).toEqual(["It also counts sentences."]);
  }, 150_000);

  it.each([
    ["every-change", 1],
    ["when-it-matters", 0],
    ["never", 0],
  ] as const)(
    "with %s, a plain wish asks %i questions",
    async (mode, count) => {
      let questions = -1;
      await run({}, async (context) => {
        await context.session.services.softwares.setChangeQuestions(context.softwareId, mode);
        await sendWish(context);
        await context.drive();
        questions = asked(context, "change-confirm").length;
      });
      expect(questions).toBe(count);
    },
    150_000,
  );

  it("never asks with never, even when a foundation decision changes", async () => {
    let questions = -1;
    let said: string[] = [];
    await run(
      {
        decisions: (record) => [
          {
            text: "A Node.js script that reads the file as a stream",
            reason: "Paragraphs are counted while reading.",
            replaces: record.find((l) => /Node\.js script/.test(l.line))!.id,
          },
        ],
      },
      async (context) => {
        await context.session.services.softwares.setChangeQuestions(context.softwareId, "never");
        await sendWish(context);
        await context.drive();
        questions = asked(context, "change-confirm").length;
        said = listChatMessages(context.db, context.softwareId).map((m) => m.text);
      },
    );
    expect(questions).toBe(0);
    expect(said.find((t) => t.startsWith("I-1 taken as:"))).toMatch(
      /Assumed, not checked with you: .*reads the file as a stream/,
    );
  }, 150_000);

  it("adds a suggestion only when the person adds it, as a change of its own", async () => {
    let titles: string[] = [];
    await run(
      {},
      async (context) => {
        const { session, softwareId } = context;
        await sendWish(context);
        let notice: AskView | undefined;
        for (let i = 0; i < 200 && !notice; i++) {
          session.queue.tick();
          await session.queue.idle();
          await session.line.idle();
          await new Promise((r) => setTimeout(r, 5));
          notice = (await session.services.asks.list({ softwareId })).find((a) => a.notice);
        }
        expect(notice).toBeDefined();
        if (!notice) return;
        expect(notice.suggestions).toEqual([{ key: "s1", text: "It also counts sentences." }]);
        const added = await session.services.asks.addSuggestion(notice.id, "s1");
        expect(added.suggestions![0]!.added).toBe("I-2");
        await context.drive();
        titles = (await session.services.intake.view(softwareId)).items.map(
          (i) => `${i.ref}: ${i.text}`,
        );
      },
      // The operator lets the notice be: answering it is never needed.
      {
        operator: (ask) =>
          ask.notice ? { kind: "items", items: [] } : demoOperator(COUNT_DEMO)(ask),
      },
    );
    expect(titles).toContain("I-2: Add premise's suggestion for I-1: It also counts sentences.");
  }, 150_000);

  it("withdraws an open milestones question of a change at start-up and plans the change again", async () => {
    let ready = false;
    let said: string[] = [];
    let built: string[] = [];
    await run({ planReady: () => ready }, async (context) => {
      const { session, softwareId, runner, db } = context;
      await sendWish(context);
      for (let i = 0; i < 20; i++) {
        session.queue.tick();
        await session.queue.idle();
        await session.line.idle();
      }
      // As an older premise left it: the change at Plan, with the software's milestones asked.
      for (const a of listAsks(db, { softwareId, status: "open" })) {
        db.prepare("UPDATE asks SET status = 'withdrawn' WHERE id = ?").run(a.id);
      }
      createAsk(db, {
        softwareId,
        role: "operator",
        kind: "draft",
        stage: "plan",
        title: "Milestones: is this the right order?",
        instruction: "The first milestone is what you asked for.",
        items: [],
        extra: { meta: { purpose: "milestones", items: [] } },
      });
      ready = true;
      const before = runner.requests.length;
      expect(session.line.replanChanges()).toBe(1);
      await context.drive();
      said = listChatMessages(db, softwareId).map((m) => m.text);
      built = runner.requests
        .slice(before)
        .filter((r) => r.taskKind === "build")
        .map((r) => taskOf(r).title);
      expect(
        listAsks(db, { softwareId })
          .filter((a) => a.extra.meta?.purpose === "milestones")
          .map((a) => a.status)
          .sort(),
      ).toEqual(["answered", "withdrawn"]);
    });
    expect(
      said.some((t) =>
        t.startsWith(
          "premise was updated: your change I-1 is now planned on its own, not with the software's milestones",
        ),
      ),
    ).toBe(true);
    expect(built).toEqual(["Count paragraphs"]);
  }, 150_000);
});

/** Run the line until the change's one question is open, and return it. */
async function untilQuestion(context: Context, after = 0): Promise<AskView> {
  const { session, softwareId } = context;
  for (let i = 0; i < 200; i++) {
    session.queue.tick();
    await session.queue.idle();
    await session.line.idle();
    await new Promise((r) => setTimeout(r, 5));
    const open = (await session.services.asks.list({ softwareId, status: "open" })).filter(
      (a) => !a.notice && a.id > after,
    );
    if (open.length) return open[0]!;
  }
  throw new Error("the change was never asked about");
}

function keepAll(ask: AskView, edit?: { key: string; text: string }) {
  return {
    kind: "items" as const,
    items: ask.items.map((i) =>
      edit && i.key === edit.key
        ? { key: i.key, decision: "edit" as const, text: edit.text }
        : { key: i.key, decision: "keep" as const },
    ),
  };
}

describe("a change planned again and an edited decision", () => {
  it("keeps the person's edit of a decision that has no reason and replaces nothing", async () => {
    let lines: string[] = [];
    await run(
      { decisions: () => [{ text: "Count paragraphs while reading" }] },
      async (context) => {
        const { session, softwareId } = context;
        await session.services.softwares.setChangeQuestions(softwareId, "every-change");
        await sendWish(context);
        const ask = await untilQuestion(context);
        await session.services.asks.answer(
          ask.id,
          keepAll(ask, { key: "d1", text: "Count paragraphs from a stream" }),
        );
        await context.drive();
        const record = (await session.services.records.view(softwareId)) as {
          files: { items: { text: string }[] }[];
        };
        lines = record.files.flatMap((f) => f.items.map((i) => i.text));
      },
    );
    expect(lines.some((t) => t.startsWith("Count paragraphs from a stream"))).toBe(true);
    expect(lines.some((t) => t.startsWith("Count paragraphs while reading"))).toBe(false);
  }, 150_000);

  const struckOnce = async (context: Context, again: "strike" | "keep") => {
    const { session, softwareId } = context;
    await session.services.softwares.setChangeQuestions(softwareId, "every-change");
    await sendWish(context);
    const first = await untilQuestion(context);
    await session.services.asks.answer(first.id, {
      kind: "items",
      items: first.items.map((i) =>
        i.key === "d1"
          ? { key: i.key, decision: "strike" as const, reason: "Not as a stream." }
          : { key: i.key, decision: "keep" as const },
      ),
    });
    await context.drive();
    await session.line.sendBack(softwareId, "plan");
    const second = await untilQuestion(context, first.id);
    await session.services.asks.answer(second.id, {
      kind: "items",
      items: second.items.map((i) =>
        i.key === "d1" && again === "strike"
          ? { key: i.key, decision: "strike" as const, reason: "Still not." }
          : { key: i.key, decision: "keep" as const },
      ),
    });
    await context.drive();
    const record = (await session.services.records.view(softwareId)) as {
      files: { items: { text: string }[] }[];
    };
    return {
      second,
      lines: record.files.flatMap((f) => f.items.map((i) => i.text)),
      asks: asked(context, "change-confirm").length,
    };
  };
  const decisions = () => [{ text: "Read the file as a stream", reason: "Counted while reading." }];

  it("asks again after a send-back, shows the earlier strike selected, and keeps it struck when confirmed", async () => {
    let seen: Awaited<ReturnType<typeof struckOnce>> | undefined;
    await run({ decisions }, async (context) => {
      seen = await struckOnce(context, "strike");
    });
    const d1 = seen!.second.items.find((i) => i.key === "d1")!;
    expect(d1.earlier).toEqual({ decision: "strike", reason: "Not as a stream." });
    expect(seen!.asks).toBe(2);
    expect(seen!.lines.some((t) => t.startsWith("Read the file as a stream"))).toBe(false);
  }, 250_000);

  it("lets the person change the earlier answer, and records what they keep this time", async () => {
    let seen: Awaited<ReturnType<typeof struckOnce>> | undefined;
    await run({ decisions }, async (context) => {
      seen = await struckOnce(context, "keep");
    });
    expect(seen!.lines.some((t) => t.startsWith("Read the file as a stream"))).toBe(true);
  }, 250_000);
});
