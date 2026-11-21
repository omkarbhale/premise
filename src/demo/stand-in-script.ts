import type { AgentRequest } from "../agents/agent-runner.js";
import type { AgentScript, ScriptBehaviour, ScriptRule } from "../agents/scripted-agent.js";
import { AGENT_TASK_KINDS, type AgentTaskKind } from "../config/settings.js";
import { ruleReading } from "../learning/rules.js";
import type { CorrectionKind } from "../shared/api-types.js";
import { shortIdea } from "./drafts.js";
import {
  commitAll,
  itemsOf,
  readRecord,
  runScenario,
  taskOf,
  writeFiles,
} from "./scripted-work.js";

/** What each scripted job says it is doing, so the page's activity reads like real work. */
const PROGRESS: Record<AgentTaskKind, string> = {
  draft: "Drafting the list (scripted)",
  research: "Looking at what already exists (scripted: no search is made)",
  review: "Reviewing the plan's costly choices (scripted)",
  plan: "Planning the work, smallest running version first (scripted)",
  build: "Writing a placeholder program (scripted: no real code is written)",
  prototype: "Writing a proposal for a claimed area (scripted)",
  check: "Checking the build against the record (scripted: it only starts the program)",
  triage: "Reading new items (scripted)",
  reading: "Reading held items together (scripted)",
  report: "Writing the report (scripted)",
  size: "Sizing the work: how big, which steps, whether to split (scripted)",
  recover: "Reading the code, its documents and history (scripted: only file names are read)",
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

/**
 * The scripted proposal for a claimed area: two fixed options in the area's own words, holding every
 * task. No AI writes them; they only show where a real proposal appears and how it is answered.
 */
const propose: ScriptBehaviour = (request, call) => {
  const claim = (request.context?.claim ?? {}) as { area?: string };
  const area = claim.area ?? "the claimed area";
  call("proposal_submit", {
    options: [
      {
        title: "Plain and quiet",
        description: `${area}, kept plain: light background, one column, the main action first (scripted).`,
      },
      {
        title: "Bold",
        description: `${area}, with stronger colours and larger type (scripted).`,
      },
    ],
    note: "Scripted: a fixed pair of options, so the proposal can be tried without AI.",
  });
};

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
  const piece = typeof request.context?.piece === "string" ? request.context.piece : null;
  if (piece) {
    // A piece of work, such as an intake item: one item in its own words.
    submit(call, "what", [
      {
        priority: "must",
        text: `It does what this asks: ${shortIdea(piece.replace(/^I-\d+:\s*/, ""), 100)}`,
        from: "operator",
      },
    ]);
    return;
  }
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
  ).filter(
    (l) => /^[YUWE]-/.test(l.id) && !/Outcome:/.test(l.line) && !l.line.includes("left-out"),
  );
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
  const lines = (
    (read.result as { lines?: { id: string; line: string }[] } | undefined)?.lines ?? []
  ).filter((l) => l.id.startsWith("W-") && !l.line.includes("left-out"));
  // Milestone 1 is what was asked for (the musts); premise's additions the operator kept come in
  // milestone 2 (decision 0191). Each task serves outcomes of its own.
  const first = lines.filter((l) => /\(must;/.test(l.line)).map((l) => l.id);
  const later = lines.filter((l) => !/\(must;/.test(l.line)).map((l) => l.id);
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
      { text: "What you asked for: the smallest version that runs." },
      ...(later.length ? [{ text: "What premise recommended and you kept." }] : []),
    ],
    tasks: [
      { title: "The smallest version that runs, with run.md", items: first, milestone: 1 },
      ...(later.length
        ? [{ title: "premise's additions you kept", items: later, milestone: 2 }]
        : []),
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

/** The run instructions the scripted builder writes: a command premise runs once as a sample. */
const TRIAL_RUN = [
  "# How to run it",
  "",
  "This is a scripted trial: the program only says so. A real builder writes real instructions here.",
  "",
  "```premise-run",
  "kind: command",
  "command: node trial.mjs",
  "```",
  "",
  "## How to check",
  "",
  "Run `node trial.mjs`; it prints one line saying it is a scripted trial.",
  "",
].join("\n");

/**
 * The scripted builder of a trial: it writes a placeholder program that says it is a trial, and
 * run.md, and commits them naming the task's items. It writes no real code.
 */
const trialBuild: ScriptBehaviour = (request, call) => {
  const copy = request.workingCopy;
  if (!copy) return;
  const task = taskOf(request);
  const items = task.items.length
    ? task.items
    : readRecord(call)
        .slice(0, 1)
        .map((l) => l.id);
  const name = typeof request.context?.name === "string" ? request.context.name : "this software";
  writeFiles(copy, {
    "trial.mjs": `// A scripted trial of premise: no real code was written for this software.\nconsole.log(${JSON.stringify(`${name}: a scripted trial. Task ${task.number} (${task.title}) was walked through; nothing real was built.`)});\n`,
    "premise/run.md": TRIAL_RUN,
  });
  commitAll(copy, `Task ${task.number}: ${task.title} (scripted trial)`, items);
};

/** The scripted checker of a trial writes one scenario per item, from the record's words. */
const trialScenarios: ScriptBehaviour = (request, call) => {
  const record = readRecord(call);
  for (const item of itemsOf(request)) {
    const line = record.find((l) => l.id === item)?.line ?? item;
    call("scenario_write", {
      name: `Use it for ${item}`,
      items: [item],
      steps: ["Use the software as a user would, for what the item asks."],
      expected: line.replace(/^- \[[A-Z]-\d+\]\s*/, ""),
    });
  }
};

/**
 * The scripted checker of a trial starts the placeholder program, and says honestly that it could
 * not check any item: nothing real was built, and a scripted checker judges nothing.
 */
const trialJudge: ScriptBehaviour = async (request, call) => {
  const copy = request.workingCopy;
  const started = copy
    ? await runScenario(copy, { steps: ["run: node trial.mjs"], expected: "scripted trial" })
    : { met: false, seen: "no working copy", problem: null };
  call("verdict_submit", {
    verdicts: itemsOf(request).map((item) => ({
      item,
      verdict: "could-not-check",
      evidence: `This is a scripted trial, so nothing real was built and nothing was judged. The placeholder program ${started.met ? `ran and printed: ${started.seen}` : `did not run: ${started.seen}`}`,
    })),
  });
};

/**
 * The scripted recovery: fixed templates filled with what premise read without AI (the file names,
 * the README's first line, how many commits). Every item says it is a scripted guess, so the say-back
 * has something real to strike; nothing here reads or understands the code.
 */
const recover: ScriptBehaviour = (request, call) => {
  const context = request.context ?? {};
  const name = typeof context.name === "string" ? context.name : "the software";
  const readme = typeof context.readme === "string" ? context.readme : "";
  const files = Array.isArray(context.files) ? (context.files as string[]) : [];
  const commits = typeof context.commits === "number" ? context.commits : 0;
  const shown = files.slice(0, 6);
  call("recovery_submit", {
    items: [
      {
        kind: "Y",
        text: readme
          ? `Its README says: ${readme.slice(0, 200)}`
          : `Guess: ${name} exists to save its users effort; its documents do not say why.`,
      },
      { kind: "U", text: "Guess: its users are the people who wrote it.", assumed: true },
      { kind: "R", text: "Operator: you. Decides what it is for and what matters most." },
      {
        kind: "W",
        priority: "must",
        text: `Keep doing what it does today${shown.length ? ` (its top folder holds ${shown.join(", ")})` : ""}.`,
        files: shown,
      },
      {
        kind: "D",
        text: `Its history has ${commits === 1 ? "1 commit" : `${commits} commits`}; the scripted drafter read none of it.`,
      },
    ],
    run: {},
    could_not_check: [
      "The scripted drafter does not read code, so how to build, start and check it is not known.",
    ],
    summary: "Scripted recovery: templates filled from file names only.",
  });
};

/**
 * The scripted sizer: every piece is small, goes through every stage it may have, and stays whole.
 * A real sizer leaves out what a piece does not need; this one never guesses.
 */
const size: ScriptBehaviour = (request, call) => {
  const allowed = Array.isArray(request.context?.allowed) ? request.context.allowed : [];
  const intakeKind =
    typeof request.context?.intakeKind === "string" ? request.context.intakeKind : null;
  call("sizing_submit", {
    size: "small",
    size_reason: "Scripted sizer: every piece is taken as small.",
    stages: intakeKind ? intakeStages(intakeKind, allowed) : allowed,
    stages_reason:
      intakeKind === "bug"
        ? "Scripted sizer: a bug goes straight to building."
        : intakeKind === "wish"
          ? "Scripted sizer: a wish is first drafted at What."
          : "Scripted sizer: it goes through every step this kind of work can have.",
    split: [],
    split_reason: "Scripted sizer: it never splits work.",
  });
};

/**
 * The scripted triager: a few fixed words decide the kind, and everything else is a wish that goes
 * in normally (premise's default). No AI reads the item; the page labels the run as scripted.
 */
const triage: ScriptBehaviour = (request, call) => {
  const text = String(request.context?.text ?? "").toLowerCase();
  const kind = /\b(bug|broken|error|crash|fails?|wrong)\b/.test(text)
    ? "bug"
    : /\?\s*$/.test(text)
      ? "question"
      : "wish";
  call("triage_submit", {
    kind,
    touches: [],
    size: "small",
    touches_floor: "no",
    route: "in-normally",
    reason: `Scripted triager: read as ${kind === "bug" ? "a bug" : kind === "question" ? "a question" : "a wish"} from its words alone.`,
    ...(kind === "question" && {
      answer:
        "Scripted triager: it cannot answer questions; read the Record tab, or ask again with real agents.",
    }),
  });
};

/**
 * The scripted triager reading a correction: premise's fixed rules give the reading, submitted
 * through lesson_submit exactly as a real triager would. No AI judges the correction.
 */
const learn: ScriptBehaviour = (request, call) => {
  const c = request.context ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const reading = ruleReading({
    kind: String(c.kind) as CorrectionKind,
    what: String(c.what ?? ""),
    said: text(c.said),
    subject: text(c.subject),
    replacement: text(c.replacement),
    stage: null,
  });
  call("lesson_submit", {
    mistake: reading.mistake,
    destination: reading.destination,
    reason: `Scripted triager, using premise's fixed rule: ${reading.reason}`,
    ...(reading.line && { line: reading.line }),
    ...(reading.topic && { topic: reading.topic }),
  });
};

/** The scripted reader: lists the held items as they are. It reads no pattern into them. */
const reading: ScriptBehaviour = (request, call) => {
  const held = Array.isArray(request.context?.held)
    ? (request.context.held as { number: number; text: string }[])
    : [];
  call("reading_submit", {
    wanted: held
      .slice(0, 10)
      .map((h) => ({ line: h.text.slice(0, 120), items: [`I-${h.number}`] })),
    recurring: [],
    purpose: "Scripted reader: it reads no pattern into the items, so it suggests no change.",
    back_to_why: "no",
  });
};

/**
 * The scripted sizer for an intake item: a bug goes straight to Build; a wish is first drafted at
 * What and said back. Every other piece is small, goes through every stage it may have, and stays
 * whole.
 */
const intakeStages = (kind: string, allowed: unknown[]): unknown[] =>
  kind === "bug"
    ? ["build", "check", "run", "report"]
    : kind === "wish"
      ? ["what", "say-back", "build", "check", "run", "report"]
      : allowed;

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
      rule("recover", { behave: recover }),
      rule("triage", { when: { purpose: "learn" }, behave: learn }),
      rule("triage", { behave: triage }),
      rule("reading", { behave: reading }),
      rule("prototype", { behave: propose }),
      rule("build", { behave: trialBuild }),
      rule("check", { when: { purpose: "scenarios" }, behave: trialScenarios }),
      rule("check", { when: { purpose: "check" }, behave: trialJudge }),
      ...AGENT_TASK_KINDS.map((task) => rule(task)),
    ],
  };
}
