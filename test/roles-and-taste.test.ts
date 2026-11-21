import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentRequest } from "../src/agents/agent-runner.js";
import type { AgentScript, ScriptBehaviour } from "../src/agents/scripted-agent.js";
import { READING_LIST_DEMO } from "../src/demo/demo-softwares.js";
import { type OperatorAnswer, demoOperator, demoScript } from "../src/demo/demos.js";
import { taskOf } from "../src/demo/scripted-work.js";
import { secretsFile } from "../src/runner/secrets.js";
import { getAsk } from "../src/storage/asks.js";
import { ServiceError } from "../src/server/services.js";
import type {
  AskAnswer,
  AskView,
  ClaimView,
  MeasuresView,
  Overview,
  SoftwareDetail,
} from "../src/shared/api-types.js";
import { testApp, tempFolder } from "./helpers.js";

/**
 * Every role, in one session (roadmap milestone 3; decisions 0009, 0065, 0084, 0101, 0102, 0196):
 * a scripted run in which one person answers the asks of three roles (the operator; a designer
 * who claimed the look of the main screen and corrects its proposal; an account holder who must
 * create an account with an outside service), each ask labelled with its role. Also: a claim
 * released mid-way, and premise restarting while a proposal waits.
 */

type App = Awaited<ReturnType<typeof testApp>>;

const AREA = "the look of the main screen";
const CORRECTION = "A dark background, with the list in large type in the middle.";
const ENV = {
  PREMISE_LINE__REMOTE: "local",
  PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: "false",
};

/** What each agent was told, by task, to check the answers reached the builder. */
interface Seen {
  proposals: AgentRequest[];
  builds: { task: number; brief: string }[];
}

/**
 * The web demo's script, with a planner that proposes two looks for the claimed area (holding task
 * 1 only), and a builder that cannot do task 2 until the account holder creates an account.
 */
function script(seen: Seen, options: { account?: boolean } = {}): AgentScript {
  const demo = demoScript(READING_LIST_DEMO);
  const build = demo.rules.find((r) => r.when?.task === "build")!.behave!;
  const propose: ScriptBehaviour = (request, call) => {
    seen.proposals.push(request);
    call("proposal_submit", {
      options: [
        {
          title: "Light",
          description: "White background, the list in one column, the box on top.",
        },
        { title: "Cards", description: "Each book as a card in a grid, the box at the bottom." },
      ],
      tasks: [1],
      note: "premise would pick Light: it is the quickest to read.",
    });
    call("task_finish", { status: "done" });
  };
  const builder: ScriptBehaviour = (request, call) => {
    const task = taskOf(request);
    seen.builds.push({ task: task.number, brief: request.brief });
    if (
      options.account !== false &&
      task.number === 2 &&
      !task.fix &&
      !request.brief.includes("marked it done")
    ) {
      call("ask", {
        role: "the account holder",
        kind: "needed",
        what: "Create an account with Postbox, the mail service",
        items: [
          "Go to the Postbox sign-up page and create an account for the reading list.",
          "In its settings, make an API key that may send mail.",
        ],
        secret: "POSTBOX_KEY",
      });
      call("task_finish", { status: "waiting-for-person", note: "Waiting for the account." });
      return;
    }
    return build(request, call);
  };
  return {
    rules: [
      { when: { task: "prototype" }, behave: propose, end: { outcome: "done" } },
      { when: { task: "build" }, behave: builder, end: { outcome: "done" } },
      ...demo.rules,
    ],
  };
}

/** Answer what is open until nothing is left or nobody answers, as one person in one session. */
async function drive(
  t: App,
  id: string,
  answerFor: (ask: AskView) => AskAnswer | OperatorAnswer | null,
  rounds = 80,
): Promise<AskView[]> {
  const seen: AskView[] = [];
  for (let round = 0; round < rounds; round++) {
    await t.settle();
    const open = await t.session.services.asks.list({ softwareId: id, status: "open" });
    const detail = await t.session.services.softwares.get(id);
    if (open.length === 0) {
      if (detail.stage === "intake" || detail.state !== "active") break;
      continue;
    }
    let answered = 0;
    for (const ask of open) {
      if (!seen.some((s) => s.id === ask.id)) seen.push(ask);
      const answer = answerFor(ask);
      if (!answer) continue;
      await t.session.services.asks.answer(ask.id, answer as AskAnswer);
      answered += 1;
    }
    if (answered === 0) break;
  }
  return seen;
}

async function close(t: App): Promise<void> {
  await t.session.queue.close();
  await t.session.runner.close();
  await t.app.close();
  t.db.close();
}

async function start(t: App): Promise<string> {
  const started = await t.session.services.softwares.start({ idea: READING_LIST_DEMO.idea });
  return started.id;
}

async function claim(t: App, id: string, area: string, role?: string) {
  return t.call("POST", `/api/softwares/${id}/claims`, { area, ...(role && { role }) });
}

describe("every role, in one session", () => {
  it("answers the asks of the operator, a designer and an account holder, each labelled", async () => {
    const seen: Seen = { proposals: [], builds: [] };
    const t = await testApp(ENV, { script: script(seen) });
    try {
      const id = await start(t);
      // A label on what is asked, not an account: the designer claims the look of the main screen.
      const claimed = await claim(t, id, AREA, "Designer");
      expect(claimed.status).toBe(201);
      expect((claimed.body as ClaimView).role).toBe("designer");
      expect((claimed.body as ClaimView).state).toBe("waiting");

      const operator = demoOperator(READING_LIST_DEMO);
      let refusal: string | null = null;
      await drive(t, id, (ask) => {
        if (ask.role === "designer") {
          expect(ask.kind).toBe("proposal");
          expect(ask.claim?.area).toBe(AREA);
          expect(ask.items.map((i) => i.text)).toEqual([
            "Light: White background, the list in one column, the box on top.",
            "Cards: Each book as a card in a grid, the box at the bottom.",
          ]);
          return { kind: "proposal", decision: "change", text: CORRECTION };
        }
        if (ask.role === "account holder") {
          expect(ask.kind).toBe("needed");
          expect(ask.secret?.key).toBe("POSTBOX_KEY");
          if (refusal === null) {
            // Marked done before the key is in its file: premise checks, and says what is missing.
            return { kind: "needed", decision: "done" };
          }
          return { kind: "needed", decision: "done" };
        }
        return operator(ask);
      }).catch(async (error: unknown) => {
        if (!(error instanceof ServiceError)) throw error;
        refusal = error.message;
        // The account holder writes the key into the named file by hand, then says it is done.
        const file = secretsFile(t.config.data.folder, id);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "POSTBOX_KEY=pb-test-123\n");
        return drive(t, id, (ask) =>
          ask.role === "account holder"
            ? { kind: "needed", decision: "done" }
            : ask.role === "designer"
              ? { kind: "proposal", decision: "change", text: CORRECTION }
              : operator(ask),
        );
      });

      // premise checked the file and said plainly what to do; it never took the value.
      expect(refusal).toContain("POSTBOX_KEY is not in");
      expect(refusal).toContain("mark this done again");

      const detail = (await t.call("GET", `/api/softwares/${id}`)).body as SoftwareDetail;
      expect(detail.stage).toBe("intake");

      // Every ask is labelled with its role, in that role's terms.
      const all = await t.session.services.asks.list({ softwareId: id });
      const roles = new Set(all.map((a) => a.role));
      expect([...roles].sort()).toEqual(["account holder", "designer", "operator"]);
      const account = all.find((a) => a.role === "account holder")!;
      expect(account.title).toBe("Create an account with Postbox, the mail service");
      expect(account.items.map((i) => i.text)[2]).toContain("POSTBOX_KEY=the value");
      expect(account.instruction).toContain("premise never does it for you");

      // The page knows roles besides the operator are in use, so it shows the labels.
      const overview = (await t.call("GET", "/api/overview")).body as Overview;
      expect(overview.roles).toEqual(["account holder", "designer"]);

      // The proposal came before the area was built, and held only the task that builds it.
      expect(seen.proposals).toHaveLength(1);
      expect(seen.proposals[0]!.brief).toContain(AREA);
      const firstOfTask1 = seen.builds.find((b) => b.task === 1)!;
      expect(firstOfTask1.brief).toContain(
        `The designer decided how ${AREA} should be: ${CORRECTION}`,
      );
      // Task 2 waited for the account, then was built with the answer, never with the secret.
      const task2 = seen.builds.filter((b) => b.task === 2);
      expect(task2.length).toBeGreaterThanOrEqual(2);
      expect(task2.at(-1)!.brief).toContain("The account holder did it and marked it done");
      expect(task2.at(-1)!.brief).not.toContain("pb-test-123");

      // What the designer said is a T item in the record, under their role.
      const record = await t.session.services.records.view(id);
      const taste = record.files.find((f) => f.file === "taste.md")!;
      expect(taste.items.map((i) => i.text)).toContain(`${AREA}: ${CORRECTION}`);
      expect(taste.items[0]!.marks).toContain("from: designer");
      expect(detail.claims[0]).toMatchObject({
        area: AREA,
        state: "decided",
        decision: CORRECTION,
      });

      // The correction feeds the taste lessons.
      t.session.learning.catchUp();
      await t.settle();
      const correction = t.db
        .prepare("SELECT destination, line FROM corrections WHERE what LIKE ?")
        .get("You corrected the proposal for%") as { destination: string; line: string };
      expect(correction.destination).toBe("taste");
      expect(correction.line).toContain(AREA);

      // The measures count the asks per role.
      const measures = (await t.call("GET", `/api/softwares/${id}/measures`)).body as MeasuresView;
      const byRole = measures.figures.find((f) => f.key === "asks-by-role")!;
      expect(byRole.value).toContain("the designer 1");
      expect(byRole.value).toContain("the account holder 1");
      expect(byRole.value).toMatch(/the operator \d+/);
    } finally {
      await close(t);
    }
  }, 120_000);

  it("shows no role but the operator when only the operator is asked", async () => {
    const t = await testApp(ENV, { script: demoScript(READING_LIST_DEMO) });
    try {
      const id = await start(t);
      await drive(t, id, demoOperator(READING_LIST_DEMO));
      const overview = (await t.call("GET", "/api/overview")).body as Overview;
      expect(overview.roles).toEqual([]);
      const report = await t.session.services.reports.view(id, { detail: true });
      const lines = report.sections.flatMap((s) => s.lines.map((l) => l.text));
      expect(lines.join("\n")).not.toContain("For the operator");
    } finally {
      await close(t);
    }
  }, 120_000);

  it("builds an area premise decides itself once its claim is released, withdrawing the proposal", async () => {
    const seen: Seen = { proposals: [], builds: [] };
    const t = await testApp(ENV, { script: script(seen, { account: false }) });
    try {
      const id = await start(t);
      const claimed = (await claim(t, id, AREA, "designer")).body as ClaimView;
      const operator = demoOperator(READING_LIST_DEMO);
      // Answer everything but the proposal; the work waits on it, only the claimed task held.
      await drive(t, id, (ask) => (ask.kind === "proposal" ? null : operator(ask)));
      const proposal = (
        await t.session.services.asks.list({ softwareId: id, status: "open" })
      ).find((a) => a.kind === "proposal")!;
      expect(proposal.role).toBe("designer");
      const waiting = (await t.session.services.softwares.get(id)).build!.tasks;
      expect(waiting.find((task) => task.number === 1)!.status).toBe("waiting-on-person");

      const released = await t.call("POST", `/api/claims/${claimed.id}/release`);
      expect(released.status).toBe(200);
      expect((released.body as ClaimView).state).toBe("released");
      await drive(t, id, operator);

      const withdrawn = getAsk(t.db, proposal.id)!;
      expect(withdrawn.status).toBe("withdrawn");
      expect(withdrawn.answerSummary).toContain("released the claim");
      const detail = await t.session.services.softwares.get(id);
      expect(detail.stage).toBe("intake");
      const record = await t.session.services.records.view(id);
      expect(record.files.find((f) => f.file === "taste.md")?.items ?? []).toHaveLength(0);
      // Released twice is refused plainly.
      const again = await t.call("POST", `/api/claims/${claimed.id}/release`);
      expect(again.status).toBe(422);
    } finally {
      await close(t);
    }
  }, 120_000);

  it("carries on after a restart with a proposal open, from the answer given after it", async () => {
    const folder = tempFolder();
    const seen: Seen = { proposals: [], builds: [] };
    const first = await testApp(ENV, { script: script(seen, { account: false }), folder });
    const operator = demoOperator(READING_LIST_DEMO);
    let id: string;
    try {
      id = await start(first);
      await claim(first, id, AREA, "designer");
      await drive(first, id, (ask) => (ask.kind === "proposal" ? null : operator(ask)));
      const open = await first.session.services.asks.list({ softwareId: id, status: "open" });
      expect(open.map((a) => a.kind)).toEqual(["proposal"]);
    } finally {
      await close(first);
    }
    const second = await testApp(ENV, { script: script(seen, { account: false }), folder });
    try {
      const open = await second.session.services.asks.list({ softwareId: id, status: "open" });
      expect(open).toHaveLength(1);
      const detail = await second.session.services.softwares.get(id);
      expect(detail.claims[0]!.state).toBe("proposal-open");
      await drive(second, id, (ask) =>
        ask.kind === "proposal"
          ? { kind: "proposal", decision: "accept", choice: "o1" }
          : operator(ask),
      );
      const after = await second.session.services.softwares.get(id);
      expect(after.stage).toBe("intake");
      const record = await second.session.services.records.view(id);
      expect(record.files.find((f) => f.file === "taste.md")!.items.map((i) => i.text)).toEqual([
        `${AREA}: Light: White background, the list in one column, the box on top.`,
      ]);
      // Kept, not corrected: nothing to learn from it.
      expect(
        second.db
          .prepare("SELECT COUNT(*) AS n FROM corrections WHERE what LIKE ?")
          .get("You corrected the proposal for%"),
      ).toEqual({ n: 0 });
      expect(seen.proposals).toHaveLength(1);
    } finally {
      await close(second);
    }
  }, 120_000);
});

describe("claims", () => {
  it("says plainly what is wrong with a claim", async () => {
    const t = await testApp(ENV);
    try {
      const id = await start(t);
      const short = await claim(t, id, "ui");
      expect(short.status).toBe(422);
      expect(JSON.stringify(short.body)).toContain("the look of the main screen");
      const mine = await claim(t, id, "the wording of error messages");
      expect((mine.body as ClaimView).role).toBe("operator");
      const twice = await claim(t, id, "The wording of error messages", "writer");
      expect(twice.status).toBe(422);
      expect(JSON.stringify(twice.body)).toContain("already claimed");
      const role = await claim(t, id, "the colours", "123");
      expect(role.status).toBe(422);
      expect(existsSync(t.folder)).toBe(true);
    } finally {
      await close(t);
    }
  });

  it("asks the gate's question under the role whose call it is", async () => {
    const t = await testApp(ENV, {
      script: {
        rules: [
          {
            when: { task: "draft", stage: "why" },
            calls: [
              {
                tool: "gate_request",
                arguments: {
                  kind: "spend",
                  role: "account holder",
                  action: "Buy the Postbox starter plan for 5 dollars a month.",
                  why: "Sending reminder mail needs a paid plan.",
                },
              },
            ],
            end: { outcome: "done" },
          },
        ],
      },
    });
    try {
      const id = await start(t);
      await t.settle();
      const asks = await t.session.services.asks.list({ softwareId: id, status: "open" });
      const approval = asks.find((a) => a.kind === "approval")!;
      expect(approval.role).toBe("account holder");
      expect(approval.approval?.action).toContain("Postbox starter plan");
    } finally {
      await close(t);
    }
  });
});
