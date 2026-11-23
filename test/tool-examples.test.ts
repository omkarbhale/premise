import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLE_CALL, assembleInstructions } from "../src/agents/instructions.js";
import { AGENT_ROLES, type AgentRole, PREMISE_TOOLS_BY_ROLE } from "../src/agents/roles.js";
import type { ScriptBehaviour, ScriptRule } from "../src/agents/scripted-agent.js";
import type { ToolEnvelope } from "../src/agents/tool-server.js";
import { standInScript } from "../src/demo/stand-in-script.js";
import type { AskAnswer, AskView } from "../src/shared/api-types.js";
import { commandLineProject } from "./fixtures/existing-projects.js";
import * as intake from "./fixtures/intake-harness.js";
import { scopeAnswer, tempFolder, testApp } from "./helpers.js";

/**
 * Every example call in an agent's instructions is accepted as written. Agents copy the
 * shape of a call from their prompt, so a wrong example teaches a wrong call. The examples are
 * read from each role's assembled instructions, the text the agent receives, and called through the
 * whole wired app with a real session token, inside a job of the kind the role does, with the line
 * walked there by the scripted agent and this file as the operator.
 */

type App = Awaited<ReturnType<typeof testApp>>;
type Args = Record<string, unknown>;

const docs = join(import.meta.dirname, "..", "docs");

/** The example calls in a role's instructions, by tool, parsed from the text as written. */
function examplesIn(role: AgentRole): Map<string, Args> {
  const found = new Map<string, Args>();
  for (const line of assembleInstructions(docs, role).split("\n")) {
    if (!line.startsWith(`${EXAMPLE_CALL} `)) continue;
    const m = /^(\S+) (.+)$/.exec(line.slice(EXAMPLE_CALL.length + 1));
    expect(m, line).not.toBeNull();
    expect(found.has(m![1]!), `${role}: ${m![1]} has two examples`).toBe(false);
    found.set(m![1]!, JSON.parse(m![2]!) as Args);
  }
  return found;
}

const EXAMPLES = new Map(AGENT_ROLES.map((role) => [role, examplesIn(role)]));

/** What each example call answered, by "role tool". */
const answers = new Map<string, ToolEnvelope>();

/**
 * A rule for the job where the role uses these tools: it makes each tool's example call, as written
 * in the role's instructions, and ends. task_finish goes last, as an agent would call it.
 */
function trying(role: AgentRole, when: ScriptRule["when"], tools: readonly string[]): ScriptRule {
  const ordered = [
    ...tools.filter((t) => t !== "task_finish"),
    ...tools.filter((t) => t === "task_finish"),
  ];
  const behave: ScriptBehaviour = (_request, call) => {
    if (ordered.every((tool) => answers.has(`${role} ${tool}`))) return;
    for (const tool of ordered) {
      const args = EXAMPLES.get(role)!.get(tool);
      if (!args) throw new Error(`The ${role}'s instructions have no example for ${tool}.`);
      answers.set(`${role} ${tool}`, call(tool, args));
    }
  };
  return { when, behave, end: { outcome: "done" } };
}

const toolsOf = (role: AgentRole, except: string[] = []) =>
  PREMISE_TOOLS_BY_ROLE[role].filter((t) => !except.includes(t));

/** The operator: keeps every drafted item, takes the scope as offered, refuses the gate. */
function operator(ask: AskView): AskAnswer | null {
  if (ask.kind === "approval") return { kind: "approval", decision: "refuse" };
  if (ask.kind === "scope") return scopeAnswer(ask);
  if (ask.kind === "needed" || ask.kind === "proposal") return null;
  if (ask.items.length > 0 && (ask.kind === "draft" || ask.kind === "say-back")) {
    return { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) };
  }
  if (ask.choices?.includes("Build it")) return { kind: "text", text: "Build it" };
  if (ask.choices?.length) return { kind: "text", text: ask.choices[0]! };
  return { kind: "text", text: "Use your best judgment." };
}

/** Answer what is open until `done`, or until nothing more can be answered. */
async function drive(app: App, id: string, done: () => boolean): Promise<void> {
  for (let round = 0; round < 60 && !done(); round++) {
    await app.settle();
    if (done()) return;
    const open = await app.session.services.asks.list({ softwareId: id, status: "open" });
    let answered = 0;
    for (const ask of open) {
      const answer = operator(ask);
      if (!answer) continue;
      await app.session.services.asks.answer(ask.id, answer);
      answered += 1;
    }
    if (answered === 0) {
      await app.settle();
      return;
    }
  }
}

async function start(app: App): Promise<string> {
  const { body } = await app.call("POST", "/api/softwares", {
    idea: "A small page where I keep my reading list",
  });
  await app.settle();
  return body.id as string;
}

async function close(app: App): Promise<void> {
  await app.session.queue.close();
  await app.session.runner.close();
  await app.app.close();
  app.db.close();
}

/** A new software walked along its line until the rules have made their calls. */
async function alongTheLine(
  rules: ScriptRule[],
  done: () => boolean,
  options: { claim?: string; then?: (app: App, id: string) => Promise<void> } = {},
) {
  const app = await testApp({}, { script: { rules: [...rules, ...standInScript(0).rules] } });
  try {
    const id = await start(app);
    if (options.claim) {
      const res = await app.call("POST", `/api/softwares/${id}/claims`, {
        area: options.claim,
        role: "designer",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
    await drive(app, id, done);
    await options.then?.(app, id);
  } finally {
    await close(app);
  }
}

const has = (role: AgentRole, tools: readonly string[]) => () =>
  tools.every((t) => answers.has(`${role} ${t}`));

/**
 * Where each role's examples are called: a job of the kind the role does, reached through premise's
 * own line. Each scenario runs once, in its own app, and only when a test needs it.
 */
const SCENARIOS: Record<string, { covers: [AgentRole, string[]][]; run: () => Promise<void> }> = {
  sizer: {
    covers: [["sizer", toolsOf("sizer")]],
    run: () =>
      alongTheLine(
        [trying("sizer", { task: "size" }, toolsOf("sizer"))],
        has("sizer", toolsOf("sizer")),
      ),
  },
  drafter: {
    covers: [["drafter", toolsOf("drafter", ["recovery_submit"])]],
    run: () => {
      const tools = toolsOf("drafter", ["recovery_submit"]);
      return alongTheLine(
        [trying("drafter", { task: "draft", stage: "what" }, tools)],
        has("drafter", tools),
      );
    },
  },
  researcher: {
    covers: [["researcher", toolsOf("researcher")]],
    run: () =>
      alongTheLine(
        [trying("researcher", { task: "research" }, toolsOf("researcher"))],
        has("researcher", toolsOf("researcher")),
      ),
  },
  planner: {
    covers: [["planner", toolsOf("planner", ["proposal_submit"])]],
    run: () => {
      const tools = toolsOf("planner", ["proposal_submit"]);
      return alongTheLine(
        [trying("planner", { task: "plan", purpose: "draft" }, tools)],
        has("planner", tools),
      );
    },
  },
  proposal: {
    covers: [["planner", ["proposal_submit"]]],
    run: () =>
      alongTheLine(
        [trying("planner", { task: "prototype" }, ["proposal_submit"])],
        has("planner", ["proposal_submit"]),
        { claim: "the look of the main screen" },
      ),
  },
  reviewer: {
    covers: [["reviewer", toolsOf("reviewer")]],
    run: () =>
      alongTheLine(
        [trying("reviewer", { task: "review" }, toolsOf("reviewer"))],
        has("reviewer", toolsOf("reviewer")),
      ),
  },
  builder: {
    covers: [["builder", toolsOf("builder")]],
    run: () =>
      alongTheLine(
        [trying("builder", { task: "build" }, toolsOf("builder"))],
        has("builder", toolsOf("builder")),
      ),
  },
  checker: {
    covers: [["checker", toolsOf("checker")]],
    run: () =>
      alongTheLine(
        [
          trying(
            "checker",
            { task: "check", purpose: "scenarios" },
            toolsOf("checker", ["verdict_submit"]),
          ),
          trying("checker", { task: "check", purpose: "check" }, ["verdict_submit"]),
        ],
        has("checker", toolsOf("checker")),
      ),
  },
  recovery: {
    covers: [["drafter", ["recovery_submit"]]],
    run: async () => {
      const app = await testApp(
        {},
        {
          script: {
            rules: [
              trying("drafter", { task: "recover" }, ["recovery_submit"]),
              ...standInScript(0).rules,
            ],
          },
        },
      );
      try {
        const source = commandLineProject(join(tempFolder(), "wordcount"));
        const res = await app.call("POST", "/api/softwares/existing", { source });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        await drive(app, res.body.id as string, has("drafter", ["recovery_submit"]));
      } finally {
        await close(app);
      }
    },
  },
  lesson: {
    covers: [["triager", ["lesson_submit"]]],
    run: async () => {
      const app = await testApp(
        {},
        {
          script: {
            rules: [
              trying("triager", { task: "triage", purpose: "learn" }, ["lesson_submit"]),
              ...standInScript(0).rules,
            ],
          },
        },
      );
      try {
        const id = await start(app);
        // A strike with its reason is a correction, which the triager reads.
        const [why] = await app.session.services.asks.list({ softwareId: id, status: "open" });
        expect(why?.stage).toBe("why");
        await app.session.services.asks.answer(why!.id, {
          kind: "items",
          items: why!.items.map((i, n) =>
            n === 1
              ? { key: i.key, decision: "strike", reason: "I never do it by hand" }
              : { key: i.key, decision: "keep" },
          ),
        });
        await app.settle();
      } finally {
        await close(app);
      }
    },
  },
  triage: {
    covers: [["triager", toolsOf("triager", ["lesson_submit"])]],
    run: () => {
      // A software walked to the end of its line, so its record holds the W items a triage names.
      const tools = toolsOf("triager", ["lesson_submit"]);
      // A refused gate request is a correction too; its reading stays the stand-in's.
      const learn = standInScript(0).rules.find(
        (r) => r.when?.task === "triage" && r.when.purpose === "learn",
      )!;
      return alongTheLine([learn, trying("triager", { task: "triage" }, tools)], () => false, {
        then: async (app, id) => {
          const detail = await app.session.services.softwares.get(id);
          expect(detail.stage).toBe("intake");
          const res = await app.call("POST", `/api/softwares/${id}/chat`, {
            text: "Let me add a book by its title and author",
          });
          expect(res.status, JSON.stringify(res.body)).toBe(200);
          await app.settle();
        },
      });
    },
  },
  reading: {
    covers: [["reader", toolsOf("reader")]],
    run: async () => {
      const app = await intake.testApp(
        {},
        {
          script: intake.script(
            trying("reader", { task: "reading" }, toolsOf("reader")),
            intake.triager(() => intake.routed("opinion", "held")),
          ),
        },
      );
      try {
        const id = await intake.runningSoftware(app);
        await intake.say(app, id, "I would like to sort the books by author");
        const read = await app.call("POST", `/api/softwares/${id}/intake/read-now`);
        expect(read.status, JSON.stringify(read.body)).toBe(200);
        await app.settle();
      } finally {
        await close(app);
      }
    },
  },
  report: {
    covers: [["reporter", toolsOf("reporter")]],
    run: async () => {
      // The line does not start report jobs yet, so one is queued here as premise would queue it.
      const app = await testApp(
        {},
        {
          script: {
            rules: [
              trying("reporter", { task: "report" }, toolsOf("reporter")),
              ...standInScript(0).rules,
            ],
          },
        },
      );
      try {
        const id = await start(app);
        app.session.queue.enqueue({ softwareId: id, kind: "report", payload: {} });
        await app.settle();
      } finally {
        await close(app);
      }
    },
  },
};

const running = new Map<string, Promise<void>>();

/** The answer to a role's example call of a tool, running the scenario that makes it if needed. */
async function answerTo(role: AgentRole, tool: string): Promise<ToolEnvelope | undefined> {
  const name = Object.keys(SCENARIOS).find((n) =>
    SCENARIOS[n]!.covers.some(([r, tools]) => r === role && tools.includes(tool)),
  );
  expect(name, `no scenario calls the ${role}'s ${tool}`).toBeDefined();
  if (!running.has(name!)) running.set(name!, SCENARIOS[name!]!.run());
  await running.get(name!);
  return answers.get(`${role} ${tool}`);
}

const ALL_TOOLS = [...new Set(AGENT_ROLES.flatMap((r) => PREMISE_TOOLS_BY_ROLE[r]))];

describe("the example calls in agents' instructions", () => {
  it("give one example for every premise tool each role has, and no other", () => {
    for (const role of AGENT_ROLES) {
      expect([...EXAMPLES.get(role)!.keys()].sort(), role).toEqual(
        [...PREMISE_TOOLS_BY_ROLE[role]].sort(),
      );
    }
  });

  for (const tool of ALL_TOOLS) {
    const roles = AGENT_ROLES.filter((r) => PREMISE_TOOLS_BY_ROLE[r].includes(tool));
    it(`are accepted as written: ${tool} (${roles.join(", ")})`, async () => {
      for (const role of roles) {
        const answer = await answerTo(role, tool);
        expect(answer, `the ${role}'s ${tool} example was never called`).toBeDefined();
        expect(answer, `the ${role}'s ${tool} example: ${JSON.stringify(answer)}`).toMatchObject({
          ok: true,
        });
      }
    }, 240_000);
  }
});
