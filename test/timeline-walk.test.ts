import { describe, expect, it } from "vitest";
import type { AgentScript, ScriptBehaviour } from "../src/agents/scripted-agent.js";
import { COUNT_DEMO } from "../src/demo/demo-softwares.js";
import { demoOperator, demoScript, runDemo } from "../src/demo/demos.js";
import { readRecord, taskOf } from "../src/demo/scripted-work.js";
import { listIntakeItems } from "../src/intake/items.js";
import type { AskView, TimelineView } from "../src/shared/api-types.js";
import { tempFolder, uniquePortRange } from "./helpers.js";

/**
 * The timeline on the real line with scripted agents (decisions 0320, 0321): the command-line demo
 * planned in two milestones that each stop for the person, walked through the plan, its build
 * tasks, a check that fails, the fix round, a wish taken in while it builds (queued after the
 * milestones), the stop after milestone 1, and a bug reported then (feedback, so it goes before
 * milestone 2). The timeline is read at each point.
 */

type Session = Parameters<NonNullable<Parameters<typeof runDemo>[1]["started"]>>[0]["session"];

const base = demoScript(COUNT_DEMO).rules;
const demoRule = (task: string, purpose?: string) =>
  base.find(
    (r) => r.when?.task === task && (purpose === undefined || r.when?.purpose === purpose),
  )!;

/** The plan in two milestones: lines and characters first, then words and errors. */
const twoMilestones: ScriptBehaviour = (_request, call) => {
  const record = readRecord(call);
  const id = (pattern: RegExp) => record.filter((l) => pattern.test(l.line)).map((l) => l.id);
  call("draft_submit", {
    stage: "plan",
    items: COUNT_DEMO.decisions,
    // A planner that writes the wait into the text: premise makes it the flag (decision 0321).
    milestones: [
      { text: "It counts lines and characters. (wait)" },
      { text: "It counts words and says plainly when it cannot read a file." },
    ],
    tasks: COUNT_DEMO.tasks.map((t, i) => ({
      title: t.title,
      items: t.serves.flatMap((p) => id(p)),
      check: t.check,
      milestone: i < 2 ? 1 : 2,
    })),
    kind: COUNT_DEMO.kind,
    how_to_run: COUNT_DEMO.howToRun,
  });
};

describe("the timeline, walked on the real line", () => {
  it("shows where the work is, what runs and what comes next at each point", async () => {
    const seen: Record<string, TimelineView> = {};
    let session: Session | null = null;
    let softwareId = "";
    const look = (name: string) => {
      if (session && !seen[name]) seen[name] = session.line.timeline(softwareId);
    };
    const triage =
      (kind: "wish" | "bug"): ScriptBehaviour =>
      (_request, call) => {
        call("triage_submit", {
          kind,
          // The bug is on what milestone 1 builds; the wish on what milestone 2 will build.
          touches: [
            {
              id: readRecord(call).find((l) =>
                kind === "bug"
                  ? /lines and characters/.test(l.line)
                  : /cannot be read/.test(l.line),
              )!.id,
              reason: "It is what it is about.",
            },
          ],
          size: "small",
          touches_floor: "no",
          changes_what: kind === "bug" ? "no" : "yes",
          route: "in-normally",
          reason: kind === "bug" ? "Something built does not work." : "It asks for something new.",
        });
      };
    let said = false;
    let triaged = 0;
    let wishAtEnd = "";
    const script: AgentScript = {
      rules: [
        {
          // The first item taken in is a wish; the second a bug.
          when: { task: "triage" },
          behave: (request, call) => triage(++triaged === 1 ? "wish" : "bug")(request, call),
          end: { outcome: "done" },
        },
        {
          when: { task: "plan", purpose: "draft" },
          behave: (request, call) => {
            look("plan");
            return twoMilestones(request, call);
          },
          end: { outcome: "done" },
        },
        {
          when: { task: "build" },
          behave: async (request, call) => {
            const task = taskOf(request);
            if (task.fix) look("fix");
            else if (task.number === 2) look("task-2");
            if (!said && session) {
              said = true;
              // A wish taken in while milestone 1 builds: it waits for the milestones.
              await session.services.conversation.say(
                softwareId,
                "Also add a --json flag for scripts.",
              );
            }
            return demoRule("build").behave!(request, call);
          },
          end: { outcome: "done" },
        },
        {
          when: { task: "check", purpose: "check" },
          behave: async (request, call) => {
            if (!seen.check && session) {
              look("check");
              // A bug on what milestone 1 builds, reported while it is checked.
              await session.services.conversation.say(softwareId, "It crashes on an empty file.");
            }
            return demoRule("check", "check").behave!(request, call);
          },
          end: { outcome: "done" },
        },
        ...base,
      ],
    };
    const operator = demoOperator(COUNT_DEMO);
    let stopped = false;
    const { range } = await uniquePortRange(20);
    const result = await runDemo("cli", {
      dataFolder: tempFolder(),
      confinement: "none",
      portRange: range,
      script,
      env: { PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: "false" },
      started: (context) => {
        session = context.session;
        softwareId = context.softwareId;
      },
      operator: (ask: AskView) => {
        if (ask.title.startsWith("Milestone reached") && !stopped) {
          stopped = true;
          look("milestone-wait");
          // The wish and milestone 2 change the same part: build it as part of the milestone.
          const overlap = seen["milestone-wait"]!.overlaps[0];
          if (overlap && session) {
            void session.line.decideOverlap(
              softwareId,
              overlap.milestoneItemId,
              overlap.workItemId,
              true,
            );
          }
        }
        return operator(ask);
      },
      after: async ({ db }) => {
        look("end");
        wishAtEnd = listIntakeItems(db, { softwareId }).find((i) => i.number === 1)!.status;
      },
    });
    expect(result.stage).toBe("intake");

    // Planning: the understanding runs at Plan; building waits for the plan.
    const plan = seen.plan!;
    expect(plan.now[0]).toMatchObject({ kind: "understand", state: "running" });
    expect(plan.now[0]!.step).toMatch(/^Plan: /);
    expect(plan.now[0]!.who.map((w) => w.role)).toContain("planner");
    expect(plan.next[0]!.title).toBe("Build it: the milestones the plan makes");
    expect(plan.next[0]!.startsWhen).toBe("Starts when you confirm the plan.");

    // Build: task 2 of milestone 1, with a checklist; milestone 2 waits behind it.
    const building = seen["task-2"]!;
    expect(building.done.map((e) => e.kind)).toContain("understand");
    const m1 = building.now[0]!;
    expect(m1.title).toBe("Milestone 1: It counts lines and characters");
    expect(m1.step).toMatch(/^Build, task 2 of \d+: /);
    expect(m1.who.map((w) => w.role)).toContain("builder");
    const tasks = m1.steps.find((s) => s.text.startsWith("Build"))!.tasks!;
    expect(tasks[0]!.mark).toBe("done");
    expect(tasks[1]!.mark).toBe("running");
    // The wait written into the text became the flag, and the text is clean.
    expect(m1.milestone).toMatchObject({ wait: true });
    const m2 = building.next.find((e) => e.kind === "milestone")!;
    expect(m2.why).toMatch(/Waits for you to say go on after milestone 1/);

    // The check, then the fix round with what the check found.
    expect(seen.check!.now[0]!.step).toMatch(/^Check, round 1/);
    const fix = seen.fix!.now[0]!;
    expect(fix.step).toMatch(/^Fixing what the check found, task 1 of 1/);
    const round1 = fix.steps.find((s) => s.text === "Check, round 1")!;
    expect(round1.detail).toMatch(/^not passed/);
    expect(fix.steps.some((s) => s.text.startsWith("Fixing what the check found"))).toBe(true);
    // The wish taken in meanwhile is queued after the milestones, with its place and reason.
    const wish = seen.fix!.next.find((e) => e.kind === "change")!;
    expect(wish.title).toMatch(/^Your change I-1: /);
    expect(wish.why).toMatch(
      /in line, after milestone 2: .*It asks for something new, so it goes after the software's milestones\./,
    );
    expect(wish.estimate!.work.words).toBe("not enough history yet");

    // The stop after milestone 1: waiting on you, with the question there.
    const wait = seen["milestone-wait"]!;
    expect(wait.now[0]).toMatchObject({ state: "waiting-on-you", kind: "milestone" });
    expect(wait.now[0]!.asks[0]!.title).toMatch(/^Milestone reached: /);
    // The bug is feedback on what landed: it goes before milestone 2; the wish stays after it.
    expect(wait.next.map((e) => e.title.replace(/:.*/, ""))).toEqual([
      "Your fix I-2",
      "Milestone 2",
      "Your change I-1",
    ]);
    expect(wait.next[0]!.why).toMatch(
      /feedback on what has already landed, so it goes before the milestones not started yet/,
    );
    expect(wait.next[0]!.queue!.placement).toEqual({ before: true, by: "feedback" });
    expect(wait.next[0]!.startsWhen).toMatch(/^Starts after you say go on/);
    expect(result.said.join("\n")).toMatch(
      /Before the milestone "It counts words.*": I-2, feedback on what has already landed/,
    );
    expect(wait.headline).toMatch(/^Waiting on you: Milestone 1/);

    // The wish and milestone 2 both change one part: premise proposed one piece, and the wish was
    // built as one more task of milestone 2.
    expect(wait.overlaps).toHaveLength(1);
    expect(wait.overlaps[0]).toMatchObject({ ref: "I-1" });
    expect(wait.overlaps[0]!.milestoneTitle).toMatch(/^Milestone 2: /);
    expect(result.said.join("\n")).toMatch(/I-1 is now built as part of milestone 2/);
    expect(wishAtEnd).toBe("running");

    // At the end: everything done, nothing queued.
    expect(seen.end!.now).toEqual([]);
    expect(seen.end!.done.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["understand", "milestone", "milestone", "change"]),
    );
  }, 120_000);
});
