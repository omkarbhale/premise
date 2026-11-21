import { expect } from "vitest";
import type { AgentRequest } from "../../src/agents/agent-runner.js";
import type { AgentScript, ScriptRule } from "../../src/agents/scripted-agent.js";
import { standInScript } from "../../src/demo/stand-in-script.js";
import type {
  AskView,
  IntakeItemView,
  IntakeView,
  SoftwareDetail,
} from "../../src/shared/api-types.js";
import { testApp as realApp } from "../helpers.js";
import { DoNothingLaterStages } from "../stand-in-later.js";

/**
 * Shared by the intake tests (docs/specs/intake.md): the scripted agent as triager, sizer and
 * reader, and the test as the operator. Each software is first walked to the end of its line, so
 * it rests at Intake as a running demo software (its Build, Check and Run finish at once).
 */

export const testApp = (...[env, options]: Parameters<typeof realApp>) =>
  realApp(env, { ...options, later: new DoNothingLaterStages() });

export type App = Awaited<ReturnType<typeof testApp>>;
export type Triage = Record<string, unknown>;

/** A scripted triager that answers by the item's text. */
export function triager(answer: (text: string, number: number) => Triage | null): ScriptRule {
  return {
    when: { task: "triage" },
    behave: (request: AgentRequest, call) => {
      const result = answer(String(request.context?.text ?? ""), Number(request.context?.number));
      if (result) call("triage_submit", result);
    },
    end: { outcome: "done" },
  };
}

/**
 * The sizer: the software splits into two small parts, so it reaches Intake with no question asked;
 * an intake item gets the stages its kind needs.
 */
export const sizer: ScriptRule = {
  when: { task: "size" },
  behave: (request, call) => {
    const piece = String(request.context?.piece ?? "");
    const kind = String(request.context?.intakeKind ?? "");
    const base = {
      size: "small",
      size_reason: "It is small.",
      stages_reason: "It needs only these steps.",
      split: [] as unknown[],
      split_reason: "It is one piece.",
    };
    if (piece === "software") {
      call("sizing_submit", {
        ...base,
        stages: ["why", "what", "say-back", "plan", "build", "check", "run", "report", "intake"],
        split: [
          { title: "A page that lists the books", words: "The list." },
          { title: "A command to add a book", words: "Adding." },
        ],
        split_reason: "These parts are completely separate.",
      });
      return;
    }
    if (piece === "intake") {
      const stages =
        kind === "bug"
          ? ["build", "check", "run", "report"]
          : kind === "wish"
            ? ["what", "build", "check", "run", "report"]
            : ["why", "build", "check", "run", "report"];
      call("sizing_submit", { ...base, stages });
      return;
    }
    call("sizing_submit", { ...base, stages: ["build", "check"] });
  },
  end: { outcome: "done" },
};

export function script(...rules: ScriptRule[]): AgentScript {
  return { rules: [...rules, sizer, ...standInScript(0).rules] };
}

export const routed = (kind: string, route: string, extra: Triage = {}): Triage => ({
  kind,
  touches: [],
  size: "small",
  touches_floor: "no",
  route,
  reason: `It reads as ${kind}.`,
  ...extra,
});

/** A software walked to the end of its line, resting at Intake. */
export async function runningSoftware(app: App): Promise<string> {
  const { body } = await app.call("POST", "/api/softwares", { idea: "A reading list" });
  await app.settle();
  const detail = await softwareDetail(app, body.id);
  expect(detail.stage).toBe("intake");
  return body.id as string;
}

export async function softwareDetail(app: App, id: string): Promise<SoftwareDetail> {
  return (await app.call("GET", `/api/softwares/${id}`)).body as SoftwareDetail;
}

export async function intake(app: App, id: string): Promise<IntakeView> {
  const res = await app.call("GET", `/api/softwares/${id}/intake`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as IntakeView;
}

export async function item(app: App, id: string, ref: string): Promise<IntakeItemView> {
  const found = (await intake(app, id)).items.find((i) => i.ref === ref);
  expect(found, ref).toBeDefined();
  return found!;
}

export async function say(app: App, id: string, text: string): Promise<string> {
  const res = await app.call("POST", `/api/softwares/${id}/chat`, { text });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
  return res.body.reply.text as string;
}

export async function openAsks(app: App, id: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${id}&status=open`);
  return (body as AskView[]).filter((a) => a.kind !== "approval");
}

export async function keepAll(app: App, ask: AskView) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

export async function choose(app: App, ask: AskView, text: string) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "text", text },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

export async function chat(app: App, id: string): Promise<string[]> {
  return ((await app.call("GET", `/api/softwares/${id}/chat`)).body as { text: string }[]).map(
    (m) => m.text,
  );
}
