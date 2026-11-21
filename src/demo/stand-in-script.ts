import type { AgentRequest } from "../agents/agent-runner.js";
import type { AgentScript, ScriptBehaviour, ScriptRule } from "../agents/scripted-agent.js";
import { AGENT_TASK_KINDS, type AgentTaskKind } from "../config/settings.js";
import { shortIdea } from "./drafts.js";

/** What each scripted job says it is doing, so the page's activity reads like real work. */
const PROGRESS: Record<AgentTaskKind, string> = {
  draft: "Drafting the list (scripted)",
  research: "Looking at what already exists (scripted: no search is made)",
  review: "Reviewing the plan's costly choices (scripted)",
  plan: "Planning the work, smallest running version first (scripted)",
  build: "Writing the code (scripted: nothing is written)",
  prototype: "Making a quick prototype (scripted)",
  check: "Checking the build against the record (scripted: nothing is checked)",
  triage: "Reading new items (scripted)",
  reading: "Reading held items together (scripted)",
  report: "Writing the report (scripted)",
  size: "Sizing the work: how big, which steps, whether to split (scripted)",
};

function idea(request: AgentRequest): string {
  return typeof request.context?.idea === "string" ? request.context.idea : "the software";
}

type Call = Parameters<ScriptBehaviour>[1];

/** Submit a draft, leaving out what people struck before (as a real drafter would). */
function submit(call: Call, stage: string, items: ({ text: string } & Record<string, unknown>)[]) {
  const read = call("record_read", { include_struck: true });
  const struck = ((read.result as { lines?: { line: string }[] } | undefined)?.lines ?? [])
    .filter((l) => l.line.startsWith("- ~~"))
    .map((l) => l.line);
  const fresh = items.filter((i) => !struck.some((line) => line.includes(i.text)));
  call("draft_submit", { stage, items: fresh.length ? fresh : items });
}

/** The scripted drafter: fixed templates filled with the operator's own words. No AI writes them. */
const draftWhy: ScriptBehaviour = (request, call) => {
  submit(call, "why", [
    { text: `In your words: ${shortIdea(idea(request))}`, from: "operator" },
    { text: "Doing this by hand today takes time, or gets skipped.", from: "assumed" },
    { text: "It is worth building only if it saves more effort than it costs.", from: "assumed" },
    {
      text: "Size: small. A few screens or commands, and short stages.",
      from: "assumed",
      kind: "size",
    },
  ]);
};

const draftWho: ScriptBehaviour = (_request, call) => {
  submit(call, "who", [
    { kind: "U", text: "You are its first user, on this machine.", from: "assumed" },
    {
      kind: "R",
      text: "Operator: you. Decides what it is for and what matters most.",
      from: "assumed",
    },
    {
      kind: "U",
      text: "Nobody else needs a say yet. Anyone can claim an area later, such as the look of the main screen.",
      from: "assumed",
    },
  ]);
};

const draftWhat: ScriptBehaviour = (request, call) => {
  submit(call, "what", [
    {
      priority: "must",
      text: `It does what you described: ${shortIdea(idea(request), 100)}`,
      from: "operator",
    },
    {
      priority: "must",
      text: "It starts with one command or one link on this machine.",
      from: "assumed",
    },
    {
      priority: "should",
      text: "It explains itself on first use, without a guide.",
      from: "suggestion",
    },
    { priority: "could", text: "It keeps what it needs between uses.", from: "suggestion" },
  ]);
};

/** The scripted say-back: the record's own lines, assumptions first, at most ten. */
const sayBack: ScriptBehaviour = (_request, call) => {
  const read = call("record_read", {});
  const lines = (
    (read.result as { lines?: { id: string; line: string }[] } | undefined)?.lines ?? []
  ).filter((l) => /^[YUWE]-/.test(l.id) && !/Outcome:/.test(l.line));
  const assumed = lines.filter((l) => l.line.includes("from: assumed"));
  const said = lines.filter((l) => !l.line.includes("from: assumed"));
  const picked = [...assumed, ...said].slice(0, 10);
  call("draft_submit", {
    stage: "say-back",
    kind: "say-back",
    items: picked.map((l) => ({
      text: l.line.replace(/^- \[[A-Z]-\d+\]\s*/, "").replace(/\s*\([^()]*\)\s*$/, ""),
      from: l.line.includes("from: assumed") ? "assumed" : "operator",
      kind: l.id[0],
      refs: [l.id],
    })),
  });
};

const research: ScriptBehaviour = (_request, call) => {
  call("draft_submit", {
    stage: "exists",
    items: [
      {
        text: "No search was made: the scripted researcher does not search the web, so nothing was found.",
        from: "assumed",
      },
    ],
    outcome: "Build it",
    reason: "Nothing like it was found, because nothing was searched.",
  });
};

const plan: ScriptBehaviour = (_request, call) => {
  const read = call("record_read", { items: ["what.md"] });
  const firstMust = (
    (read.result as { lines?: { id: string; line: string }[] } | undefined)?.lines ?? []
  ).find((l) => l.line.includes("must"));
  call("draft_submit", {
    stage: "plan",
    items: [
      {
        kind: "D",
        foundation: true,
        text: "It runs as a small program on this machine. Reason: one user, nothing to host. Rejected: a hosted service, which costs money and needs a lock.",
      },
      {
        kind: "D",
        foundation: true,
        text: "It keeps its data in one local file. Reason: easy to back up and move. Rejected: a database server, more than one user needs.",
      },
      {
        kind: "D",
        text: "Anything that listens on a network binds to this machine only. Reason: premise's security defaults. Rejected: open to the network.",
      },
    ],
    milestones: [
      { text: "The smallest version that runs and does the first must item." },
      { text: "Everything else the record says it must do." },
    ],
    tasks: [
      {
        title: "The smallest version that runs, with run.md",
        items: firstMust ? [firstMust.id] : [],
      },
      { title: "The remaining must items, one at a time", items: [] },
    ],
  });
};

const review: ScriptBehaviour = (request, call) => {
  const decisions = Array.isArray(request.context?.decisions) ? request.context.decisions : [];
  call("review_submit", {
    reviews: (decisions.length ? decisions : ["the plan"]).map((d) => ({
      decision: String(d).slice(0, 60),
      verdict: "agree",
      reasons: "Scripted review: no objection.",
    })),
  });
};

/**
 * The scripted sizer: every piece is small, goes through every stage it may have, and stays whole.
 * A real sizer leaves out what a piece does not need; this one never guesses.
 */
const size: ScriptBehaviour = (request, call) => {
  const allowed = Array.isArray(request.context?.allowed) ? request.context.allowed : [];
  call("sizing_submit", {
    size: "small",
    size_reason: "Scripted sizer: every piece is taken as small.",
    stages: allowed,
    stages_reason: "Scripted sizer: it goes through every step this kind of work can have.",
    split: [],
    split_reason: "Scripted sizer: it never splits work.",
  });
};

/**
 * The scripted agent's script when no script file is set: every job says what it is doing, takes
 * `stepSeconds`, and ends done (decision 0154). Sizing, drafting, research, planning and review jobs submit
 * fixed drafts through premise's tools, exactly as a real agent would, so the line engine runs for
 * real without any AI. The page labels the whole run as a trial with scripted agents.
 */
export function standInScript(stepSeconds: number): AgentScript {
  const rule = (task: AgentTaskKind, extra: Partial<ScriptRule> = {}): ScriptRule => ({
    when: { task, ...extra.when },
    progress: [PROGRESS[task]],
    delay_ms: stepSeconds * 1000,
    ...(extra.behave && { behave: extra.behave }),
    end: { outcome: "done" as const, summary: `Scripted ${task} finished.` },
  });
  return {
    rules: [
      rule("draft", { when: { purpose: "correction" } }),
      rule("draft", { when: { stage: "why" }, behave: draftWhy }),
      rule("draft", { when: { stage: "who" }, behave: draftWho }),
      rule("draft", { when: { stage: "what" }, behave: draftWhat }),
      rule("draft", { when: { stage: "say-back" }, behave: sayBack }),
      rule("research", { behave: research }),
      rule("plan", { when: { purpose: "draft" }, behave: plan }),
      rule("review", { behave: review }),
      rule("size", { behave: size }),
      ...AGENT_TASK_KINDS.map((task) => rule(task)),
    ],
  };
}
