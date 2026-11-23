import {
  type Check,
  oneOf,
  orNone,
  summarised,
  text,
  textList,
  positiveNumber,
  wholeNumber,
  yesNo,
} from "./checks.js";
import { SOFTWARE_EFFORTS, type SoftwareEffort } from "../shared/stages.js";

/** The kinds of task an agent does. Each has its own model, effort and limits. */
export const AGENT_TASK_KINDS = [
  "draft",
  "research",
  "review",
  "plan",
  "build",
  "prototype",
  "check",
  "triage",
  "reading",
  "report",
  "size",
  "recover",
] as const;
export type AgentTaskKind = (typeof AGENT_TASK_KINDS)[number];

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const AGENT_MODES = ["scripted", "claude"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const USAGE_LEDGER_MODES = ["mock-fixed", "mock-random", "real"] as const;
export type UsageLedgerMode = (typeof USAGE_LEDGER_MODES)[number];

export const PAGE_NOTIFICATIONS = ["offer", "off"] as const;
export type PageNotifications = (typeof PAGE_NOTIFICATIONS)[number];

export const RUNNER_CONFINEMENTS = ["bubblewrap", "none"] as const;
export type RunnerConfinement = (typeof RUNNER_CONFINEMENTS)[number];

export const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"] as const;

/** Floor kinds the gate recognises (decision 0100; docs/specs/gate.md 5.1). */
export const FLOOR_KINDS = [
  "delete-data",
  "credentials",
  "expose",
  "access",
  "spend",
  "make-public",
  "publish",
  "post",
  "write-repository",
  "network",
] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];
/** Always asked one action at a time; never approved as a kind (decision 0101). */
export const NEVER_AS_KIND: readonly FloorKind[] = ["delete-data", "spend"];

/** What premise does when a check could verify nothing that was asked for (decision 0197). */
export const UNVERIFIED_CHOICES = ["ask", "land"] as const;
export type UnverifiedChoice = (typeof UNVERIFIED_CHOICES)[number];

/** Where a software's repository goes besides this machine, once the gate allows it. */
export const REMOTES = ["github", "local", "none"] as const;
export type Remote = (typeof REMOTES)[number];
export const VISIBILITIES = ["private", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Stage groups that share a budget (docs/specs/line-engine.md 6). */
export const BUDGET_GROUPS = ["draft", "exists", "say_back", "plan", "recover"] as const;
export type BudgetGroup = (typeof BUDGET_GROUPS)[number];
const SIZES = ["small", "medium", "large"] as const;
const BUDGET_DEFAULTS: Record<BudgetGroup, Record<(typeof SIZES)[number], [number, number]>> = {
  draft: { small: [15, 10], medium: [30, 20], large: [60, 40] },
  exists: { small: [30, 15], medium: [60, 30], large: [120, 60] },
  say_back: { small: [10, 5], medium: [15, 10], large: [20, 15] },
  plan: { small: [40, 20], medium: [80, 40], large: [160, 80] },
  recover: { small: [40, 20], medium: [80, 40], large: [160, 80] },
};
const BUDGET_STAGES: Record<BudgetGroup, string> = {
  draft: "Why, Who and What (each)",
  exists: "What exists",
  say_back: "Say back",
  plan: "Plan",
  recover: "Recover (an existing software's record, drafted from its code, per part)",
};

function budgetSettings(): Setting[] {
  return BUDGET_GROUPS.flatMap((group) =>
    SIZES.flatMap((size): Setting[] => [
      {
        key: `line.budgets.${group}.${size}.turns`,
        default: BUDGET_DEFAULTS[group][size][0],
        check: summarised(wholeNumber(1, 2000), "1 to 2000"),
        meaning: `Agent turns a ${size} software's ${BUDGET_STAGES[group]} stage may use.`,
        record: "0117",
      },
      {
        key: `line.budgets.${group}.${size}.minutes`,
        default: BUDGET_DEFAULTS[group][size][1],
        check: summarised(wholeNumber(1, 1440), "1 to 1440"),
        meaning: `Minutes a ${size} software's ${BUDGET_STAGES[group]} stage may take.`,
        record: "0117",
      },
    ]),
  );
}

const kindApprovals = summarised((value) => {
  const wrong = textList(value);
  if (wrong) return wrong;
  for (const kind of value as string[]) {
    if (!(FLOOR_KINDS as readonly string[]).includes(kind)) {
      return `names "${kind}", which is not a floor kind (${FLOOR_KINDS.join(", ")})`;
    }
    if ((NEVER_AS_KIND as readonly string[]).includes(kind)) {
      return `names "${kind}", which is always asked one action at a time and can never be approved as a kind (decision 0101)`;
    }
  }
  return null;
}, `a list of floor kinds, without delete-data and spend`);

/** One setting: its dotted key, default, check and meaning. */
export interface Setting {
  key: string;
  default: unknown;
  check: Check;
  meaning: string;
  /** The decision record the setting comes from, if any. */
  record?: string;
}

const loopbackOnly = summarised(
  (value) =>
    typeof value === "string" && (LOOPBACK_HOSTS as readonly string[]).includes(value)
      ? null
      : `must be an address on this machine (${LOOPBACK_HOSTS.join(", ")}); it is ${JSON.stringify(value)}. Reaching premise from other machines is off (decision 0144)`,
  `one of ${LOOPBACK_HOSTS.join(", ")}`,
);

const realLedgerNotBuilt = summarised((value) => {
  const wrong = oneOf(USAGE_LEDGER_MODES)(value);
  if (wrong) return wrong;
  return value === "real"
    ? `is "real", but premise cannot talk to a real usage-ledger yet. Use "mock-fixed" or "mock-random" (decision 0133)`
    : null;
}, `"mock-fixed", "mock-random" or "real" (not built yet)`);

/** "4700-4799": the first and last port, the first not above the last, both usable. */
export function parsePortRange(value: unknown): { first: number; last: number } | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d{1,5})\s*-\s*(\d{1,5})\s*$/.exec(value);
  if (!match) return null;
  const first = Number(match[1]);
  const last = Number(match[2]);
  return first >= 1024 && last <= 65535 && first <= last ? { first, last } : null;
}

const portRange: Check = (value) =>
  parsePortRange(value)
    ? null
    : `must be two ports from 1024 to 65535 joined by a dash, the first not above the last, such as "4700-4799"; it is ${JSON.stringify(value)}`;

const folderName: Check = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    ? null
    : `must be a folder name with letters, digits, dots, dashes or underscores; it is ${JSON.stringify(value)}`;

const trailerName: Check = (value) =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9-]*$/.test(value)
    ? null
    : `must be letters, digits and dashes, starting with a letter; it is ${JSON.stringify(value)}`;

const branchName: Check = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.includes("..")
    ? null
    : `must be a branch name with letters, digits, dots, dashes, underscores or slashes; it is ${JSON.stringify(value)}`;

const STRONGEST: AgentTaskKind[] = [
  "draft",
  "research",
  "review",
  "plan",
  "build",
  "prototype",
  "check",
  "reading",
  "recover",
];
const LONG_TASKS: AgentTaskKind[] = ["build", "prototype", "check"];
/** Short tasks: sizing and triage must keep small fixes quick (decisions 0184, 0185). */
const SHORT_TASKS: AgentTaskKind[] = ["size", "triage"];

function taskSettings(kind: AgentTaskKind): Setting[] {
  const strongest = STRONGEST.includes(kind);
  const long = LONG_TASKS.includes(kind);
  const short = SHORT_TASKS.includes(kind);
  return [
    {
      key: `agents.tasks.${kind}.model`,
      default: strongest ? "opus" : "sonnet",
      check: summarised(text, "a model alias (opus, sonnet, haiku) or a full model name"),
      meaning: `Model for ${kind} sessions. ${strongest ? "Strongest tier" : "Fast tier"} by default.`,
      record: "0104",
    },
    {
      key: `agents.tasks.${kind}.effort`,
      default: short ? "low" : "medium",
      check: summarised(oneOf(EFFORTS), EFFORTS.join(", ")),
      meaning: `Reasoning effort for ${kind} sessions.`,
      record: "0132",
    },
    {
      key: `agents.tasks.${kind}.max_turns`,
      default: long ? 200 : short ? 20 : 60,
      check: summarised(wholeNumber(1, 2000), "1 to 2000"),
      meaning: `Turn limit for one ${kind} session; at the limit the job ends stuck.`,
      record: "0088",
    },
    {
      key: `agents.tasks.${kind}.max_minutes`,
      default: long ? 60 : short ? 5 : 20,
      check: summarised(wholeNumber(1, 1440), "1 to 1440"),
      meaning: `Time limit in minutes for one ${kind} session.`,
      record: "0088",
    },
  ];
}

/** Every setting premise has. The configuration reference is generated from this list. */
export const SETTINGS: readonly Setting[] = [
  {
    key: "server.host",
    default: "127.0.0.1",
    check: loopbackOnly,
    meaning: "Address the page and API listen on. Only this machine.",
    record: "0144",
  },
  {
    key: "server.port",
    default: 4610,
    check: summarised(wholeNumber(1, 65535), "1 to 65535"),
    meaning: "Port for the page and API.",
  },
  {
    key: "server.token_bytes",
    default: 32,
    check: summarised(wholeNumber(16, 128), "16 to 128"),
    meaning: "Length in bytes of the random token in the session link.",
    record: "0078",
  },
  {
    key: "server.keep_link",
    default: false,
    check: summarised(yesNo, "true or false"),
    meaning:
      "false: premise makes a new link each time it starts, and older links stop working. true: premise keeps the same link across restarts, so a bookmark keeps working. The risk: the link is a password to premise on this computer, and keeping it means it is stored in the data folder (readable only by you) and stays valid for ever, so one left in a browser history, a bookmark or a shared screen still works. Turn it on only if you work alone on your own machine. `npm run new-link` replaces it at any time.",
    record: "0290",
  },
  {
    key: "data.keep_finished_working_copies",
    default: false,
    check: summarised(yesNo, "true or false"),
    meaning: "Keep agents' working copies after their job ends, for inspection.",
  },
  {
    key: "queue.max_agent_sessions",
    default: 2,
    check: summarised(wholeNumber(1, 16), "1 to 16"),
    meaning: "How many agent sessions run at once.",
    record: "0074",
  },
  {
    key: "queue.start_paused",
    default: false,
    check: summarised(yesNo, "true or false"),
    meaning:
      "true: premise always starts paused, so nothing runs until you press Resume on the page. Useful when you want to look around, or change settings, before agents start spending your usage. false: premise starts the way you left it (paused if you paused everything before stopping).",
    record: "0290",
  },
  {
    key: "queue.suspend_gap_seconds",
    default: 90,
    check: summarised(wholeNumber(10, 86400), "10 to 86400"),
    meaning:
      "If premise finds that the clock jumped forward by more than this many seconds (usually because the computer slept), it checks the agent sessions that were running, and restarts the ones that died.",
    record: "0290",
  },
  {
    key: "queue.same_failure_limit",
    default: 3,
    check: summarised(wholeNumber(1, 20), "1 to 20"),
    meaning: "How many times the same failure may happen before a job ends stuck.",
    record: "0088",
  },
  {
    key: "queue.usage_pause_fallback_minutes",
    default: 60,
    check: summarised(wholeNumber(1, 1440), "1 to 1440"),
    meaning: "How long agent work pauses after a usage-limit event that gives no reset time.",
  },
  {
    key: "queue.fair_wait_minutes",
    default: 30,
    check: summarised(wholeNumber(1, 1440), "1 to 1440"),
    meaning:
      "With several softwares, the most important goes first; a software that has waited this many minutes for an agent, behind more important ones, gets the next free one.",
    record: "0197",
  },
  {
    key: "agents.mode",
    default: "claude",
    check: summarised(oneOf(AGENT_MODES), `"claude" or "scripted"`),
    meaning:
      '"claude": real Claude Code sessions on your Claude Code login, each confined by Claude Code\'s sandbox (needs bubblewrap and socat on Linux). If they cannot start, premise starts anyway and the page says what is missing. "scripted": a stand-in agent that follows a script and calls no AI, for tests and demos.',
    record: "0180",
  },
  {
    key: "agents.claude_config_folder",
    default: null,
    check: summarised(orNone(text), "a folder path, or null"),
    meaning: "Claude Code configuration folder to use. null means your existing Claude Code login.",
    record: "0140",
  },
  {
    key: "agents.claude.command",
    default: "claude",
    check: summarised(text, "a program name or path"),
    meaning:
      'The Claude Code program to run for real agents. "claude" means the one found on your PATH.',
    record: "0071",
  },
  {
    key: "agents.claude.stop_grace_seconds",
    default: 10,
    check: summarised(wholeNumber(1, 300), "1 to 300"),
    meaning:
      "When a real agent session is stopped, how long it gets to end by itself before it is ended forcibly.",
  },
  {
    key: "agents.network.allowed_domains",
    default: [
      "registry.npmjs.org",
      "pypi.org",
      "files.pythonhosted.org",
      "crates.io",
      "static.crates.io",
      "index.crates.io",
      "proxy.golang.org",
      "sum.golang.org",
    ],
    check: summarised(textList, "a list of host names"),
    meaning:
      "Hosts that build, prototype and check sessions may reach (package registries). Other sessions reach no host.",
    record: "0087",
  },
  {
    key: "agents.confinement.extra_denied_paths",
    default: [],
    check: summarised(textList, "a list of folder or file paths"),
    meaning:
      "More folders or files real agents may never read or write, besides premise's data folder and the usual credential files (SSH keys, GitHub and Claude Code logins, cloud credentials).",
    record: "0087",
  },
  {
    key: "agents.scripted.script_file",
    default: null,
    check: summarised(orNone(text), "a file path, or null"),
    meaning:
      "JSON script the scripted agent follows. null means every job ends done after agents.scripted.step_seconds.",
    record: "0148",
  },
  {
    key: "agents.scripted.step_seconds",
    default: 2,
    check: summarised(wholeNumber(0, 600), "0 to 600"),
    meaning:
      "When no script file is set: how long each scripted job takes, so you can watch work move on the page. 0 finishes every job at once.",
    record: "0154",
  },
  ...AGENT_TASK_KINDS.flatMap(taskSettings),
  {
    key: "tools.progress_max_chars",
    default: 200,
    check: summarised(wholeNumber(20, 2000), "20 to 2000"),
    meaning: "Longest progress line an agent may send; longer lines are cut.",
  },
  {
    key: "tools.ask_max_items",
    default: 10,
    check: summarised(wholeNumber(1, 50), "1 to 50"),
    meaning: "Most items an agent may put in one question to a person.",
  },
  {
    key: "tools.page_part_chars",
    default: 12000,
    check: summarised(wholeNumber(1000, 100000), "1000 to 100000"),
    meaning:
      "How many characters of a web page the researcher reads at a time, when it reads a long page in parts.",
    record: "0300",
  },
  {
    key: "usage_ledger.mode",
    default: "mock-fixed",
    check: realLedgerNotBuilt,
    meaning:
      'Where usage figures come from. "mock-fixed": the same made-up figures every time. "mock-random": made-up figures from a seed. Mocked figures are labelled on the page.',
    record: "0133",
  },
  {
    key: "usage_ledger.seed",
    default: null,
    check: summarised(orNone(wholeNumber(0, 2 ** 31 - 1)), "a whole number, or null"),
    meaning: 'Seed for "mock-random". null means a new seed each time premise starts.',
    record: "0133",
  },
  {
    key: "usage_ledger.mock_weekly_allowance_usd",
    default: 100,
    check: summarised(positiveNumber(1, 1_000_000), "1 to 1000000"),
    meaning:
      "In the mock only: what a whole week's usage is worth in dollars. A budget set as a share of the week's usage is a share of this. The figures stay marked as mocked.",
    record: "0200",
  },
  {
    key: "usage_ledger.mock_cost_scale",
    default: 1,
    check: summarised(positiveNumber(0.001, 100_000), "0.001 to 100000"),
    meaning:
      "In the mock only: makes every agent session cost this many times more (or less) than the mock would say. A large number reaches a budget overrun quickly, to see what premise does then.",
    record: "0200",
  },
  {
    key: "softwares.default_weekly_budget_usd",
    default: null,
    check: summarised(orNone(positiveNumber(0.01, 1_000_000)), "a number of dollars, or null"),
    meaning:
      "Amount in dollars a new software may use in a week, at list prices. null means none is set. When a software uses it up, its queue pauses and you are asked what to do. A share of the week's usage (softwares.default_weekly_share_percent) is the other way to set it; if both are set, the amount is used.",
    record: "0200",
  },
  {
    key: "softwares.default_priority",
    default: 3,
    check: summarised(wholeNumber(1, 5), "1 (most important) to 5"),
    meaning: "Priority a new software gets. The work queue starts the most important first.",
    record: "0138",
  },
  {
    key: "softwares.default_milestone_waits",
    default: false,
    check: summarised(yesNo, "true or false"),
    meaning: "Whether a new software stops after each of its milestones until you say go on.",
    record: "0129",
  },
  {
    key: "softwares.default_effort",
    default: "medium",
    check: summarised(oneOf(SOFTWARE_EFFORTS), "low, medium or high"),
    meaning:
      "How much effort a new software gets, unless you choose when you start it. low: only what you asked for. medium: what you asked for, plus what premise recommends. high: everything premise could add. It sets which choice the scope check starts on, and how long the stages before building may take. You can change it for each software at any time.",
    record: "0191",
  },
  {
    key: "softwares.default_weekly_share_percent",
    default: null,
    check: summarised(orNone(wholeNumber(1, 100)), "1 to 100, or null"),
    meaning: "Share of weekly usage a new software may use. null means no share is set.",
    record: "0128",
  },
  {
    key: "line.say_back_max_items",
    default: 10,
    check: summarised(wholeNumber(1, 30), "1 to 30"),
    meaning: "Most items in a say-back: what premise understood and assumed, for you to strike.",
    record: "0028",
  },
  {
    key: "line.why_items_min",
    default: 3,
    check: summarised(wholeNumber(1, 20), "1 to 20"),
    meaning: "Fewest items the Why draft should have. The drafter is told the range.",
  },
  {
    key: "line.why_items_max",
    default: 7,
    check: summarised(wholeNumber(1, 30), "1 to 30"),
    meaning: "Most items the Why draft may have; a longer draft is sent back to the drafter.",
  },
  {
    key: "line.check_rounds_before_stop",
    default: 3,
    check: summarised(wholeNumber(1, 20), "1 to 20"),
    meaning:
      "How many check rounds a must item may fail before premise stops building it and asks you what to do. Each failed round sends the change back to the builder with the checker's evidence.",
    record: "0186",
  },
  {
    key: "line.start_send_backs",
    default: 1,
    check: summarised(wholeNumber(0, 5), "0 to 5"),
    meaning:
      "When a software was built and checked but would not start, how many times premise sends it back to Build by itself, with the start's output, before it asks you what to do. 0 asks you at once.",
    record: "0280",
  },
  {
    key: "line.when_nothing_verified",
    default: "ask",
    check: summarised(oneOf(UNVERIFIED_CHOICES), '"ask" or "land"'),
    meaning:
      '"ask": when the check could verify none of the things you asked for (nothing failed, but nothing could be checked either), premise does not land the change silently: it asks you once whether to land it unverified, tell the checker what it needs, or stop. "land": it lands such a change unverified without asking and says so, for unattended use. A change where some things were verified and others could not be checked always lands, marked not fully verified.',
    record: "0220",
  },
  {
    key: "line.remote",
    default: "github",
    check: summarised(oneOf(REMOTES), `"github", "local" or "none"`),
    meaning:
      '"github": at the end of Plan, premise asks you (through the gate) before creating the software\'s repository on your GitHub account, with the GitHub CLI you are logged in with; once you approve, it creates the repository, pushes to it, and pushes again after every change lands. With scripted agents (a demo) nothing is created on GitHub. "local": a second copy in the data folder\'s remotes folder, no question asked. "none": the software stays on this machine only.',
    record: "0260",
  },
  {
    key: "line.splitting",
    default: true,
    check: summarised(yesNo, "true or false"),
    meaning:
      "Whether the sizer may split a piece of work into parts that go through the line one after another. Only parts that are completely separate, or a part that is very long, are split. false keeps every piece whole.",
    record: "0170",
  },
  {
    key: "line.split_max_parts",
    default: 5,
    check: summarised(wholeNumber(2, 20), "2 to 20"),
    meaning: "Most parts the sizer may split one piece of work into.",
    record: "0184",
  },
  {
    key: "line.agents_per_stage",
    default: 1,
    check: summarised(wholeNumber(1, 8), "1 to 8"),
    meaning:
      "How many agents one stage of one piece of work may use at once. premise uses one per stage today; higher values are kept for later and change nothing yet.",
    record: "0181",
  },
  ...budgetSettings(),
  {
    key: "line.low_effort_budget_percent",
    default: 50,
    check: summarised(wholeNumber(10, 100), "10 to 100"),
    meaning:
      "For a software at low effort, the stages before building get this percent of their usual budget.",
    record: "0191",
  },
  {
    key: "line.high_effort_budget_percent",
    default: 150,
    check: summarised(wholeNumber(100, 400), "100 to 400"),
    meaning:
      "For a software at high effort, the stages before building get this percent of their usual budget.",
    record: "0191",
  },
  {
    key: "line.scope_check",
    default: true,
    check: summarised(yesNo, "true or false"),
    meaning:
      "Whether premise asks, once after What, how much to build: only what you asked for, plus what premise recommends, or everything. It is skipped when premise has nothing to add. false builds everything that is on the What list.",
    record: "0191",
  },
  {
    key: "line.wait_after_asked",
    default: true,
    check: summarised(yesNo, "true or false"),
    meaning:
      "Whether premise stops after the first milestone (what you asked for) when what follows is only premise's own additions, so you try the software before more is built. You can untick the stop on the milestone list, or say go on at once.",
    record: "0191",
  },
  {
    key: "line.change_questions",
    default: null,
    check: summarised(
      orNone(oneOf(["every-change", "when-it-matters", "never"])),
      "every-change, when-it-matters, never, or null",
    ),
    meaning:
      "When premise asks you about a change you sent (a wish or a change to a finished software) before building it. every-change: always, once. when-it-matters: only when it replaces a foundation decision or is otherwise costly to undo, or your words left a real choice open; otherwise premise builds it at once and tells you what it understood and assumed, and you can still strike any line. never: never asks, only tells. null follows each software's effort: high effort asks about every change, low and medium only when it matters. A bug is never asked about. You can choose per software on its Line tab.",
    record: "0274",
  },
  {
    key: "line.change_max_tasks",
    default: 3,
    check: summarised(wholeNumber(1, 20), "1 to 20"),
    meaning:
      "The most tasks the planner may give one change. A change is planned as a change, never as the software's whole plan again; a larger change is split by the sizer into steps of the change.",
    record: "0273",
  },
  {
    key: "line.native_dependencies",
    default: [
      "better-sqlite3",
      "sqlite3",
      "bcrypt",
      "argon2",
      "sharp",
      "canvas",
      "node-gyp",
      "node-sass",
      "re2",
      "psycopg2",
      "mysqlclient",
      "lxml",
      "pycairo",
    ],
    check: summarised(textList, "a list of package names"),
    meaning:
      "Packages that build native code when installed. A plan decision naming one must say how it installs without a compiler (for example prebuilt binaries), or the planner picks a built-in instead: in the first real runs such a build failed in every sandbox.",
    record: "0300",
  },
  {
    key: "line.estimate_minutes_per_session",
    default: 3,
    check: summarised(wholeNumber(1, 120), "1 to 120"),
    meaning:
      "For the scope check's rough estimate: the minutes one agent session is taken to last, until premise has measured its own.",
    record: "0191",
  },
  {
    key: "line.estimate_items_per_build",
    default: 3,
    check: summarised(wholeNumber(1, 20), "1 to 20"),
    meaning:
      "For the scope check's rough estimate: how many items of the What list one builder session is taken to cover.",
    record: "0191",
  },
  {
    key: "intake.reading_held_count",
    default: 10,
    check: summarised(wholeNumber(1, 500), "1 to 500"),
    meaning: "How many held items of one software start a reading, where they are read together.",
    record: "0096",
  },
  {
    key: "intake.reading_max_days",
    default: 14,
    check: summarised(wholeNumber(1, 365), "1 to 365"),
    meaning:
      "Days an item may stay held before a reading starts, even with fewer held than the count above.",
    record: "0096",
  },
  {
    key: "intake.max_text_chars",
    default: 4000,
    check: summarised(wholeNumber(100, 20000), "100 to 20000"),
    meaning: "Longest problem or wish the page's report box takes, in characters.",
    record: "0185",
  },
  {
    key: "intake.recent_items_in_brief",
    default: 30,
    check: summarised(wholeNumber(0, 500), "0 to 500"),
    meaning: "How many of a software's other open items the triager is shown, to spot duplicates.",
    record: "0185",
  },
  {
    key: "intake.issue_poll_minutes",
    default: 10,
    check: summarised(wholeNumber(1, 1440), "1 to 1440"),
    meaning:
      "How often premise reads a software's GitHub issues as intake, in minutes. Only a software that has a GitHub repository is read.",
    record: "0240",
  },
  {
    key: "intake.feedback_per_hour",
    default: 30,
    check: summarised(wholeNumber(1, 10000), "1 to 10000"),
    meaning:
      "Most items one software's feedback page takes in an hour. More than that is refused until the hour is over, so a flood cannot bury everything else.",
    record: "0241",
  },
  {
    key: "intake.feedback_page",
    default: true,
    check: summarised(yesNo, "true or false"),
    meaning:
      "Whether each software has a feedback page for its users. Turn it off to refuse every feedback link.",
    record: "0241",
  },
  {
    key: "existing.record_branch",
    default: "premise",
    check: summarised(branchName, "a branch name"),
    meaning:
      "When you bring in software you already have and approve adding its record to your repository, premise pushes its record and later changes to this branch there. Your own branches and working folder are never touched; merge the branch when you want.",
    record: "0189",
  },
  {
    key: "existing.history_commits",
    default: 200,
    check: summarised(wholeNumber(0, 5000), "0 to 5000"),
    meaning:
      "How many of an existing software's latest commits (their first lines) the drafter reads when recovering its record. 0 reads no history.",
    record: "0189",
  },
  {
    key: "existing.clone_timeout_minutes",
    default: 10,
    check: summarised(wholeNumber(1, 240), "1 to 240"),
    meaning:
      "How long premise waits for a copy of an existing software's repository before it gives up and says so.",
    record: "0189",
  },
  {
    key: "github.command",
    default: "gh",
    check: summarised(text, "a program name or path"),
    meaning:
      'The GitHub CLI program the server runs to create repositories and read issues, logged in as you. "gh" means the one found on your PATH.',
    record: "0260",
  },
  {
    key: "github.timeout_minutes",
    default: 10,
    check: summarised(wholeNumber(1, 120), "1 to 120"),
    meaning:
      "How long premise waits for GitHub (creating a repository, or a push to it) before it gives up and says so.",
    record: "0260",
  },
  {
    key: "runner.default_visibility",
    default: "private",
    check: summarised(oneOf(VISIBILITIES), `"private" or "public"`),
    meaning:
      "Visibility of a new software's repository on GitHub. Public is acting publicly in your name, so the gate asks first.",
    record: "0059",
  },
  {
    key: "gate.kind_approvals_allowed",
    default: [
      "credentials",
      "expose",
      "access",
      "make-public",
      "publish",
      "post",
      "write-repository",
    ],
    check: kindApprovals,
    meaning:
      "Floor kinds you may approve for one software as a whole kind, so later requests of that kind go through without asking. A standing approval covers only the one kind of action it was given for, such as adding premise's record to your repository, never other actions of the same floor kind. Deleting data and spending money are always asked one at a time.",
    record: "0101",
  },
  {
    key: "page.notifications",
    default: "offer",
    check: summarised(oneOf(PAGE_NOTIFICATIONS), `"offer" or "off"`),
    meaning:
      '"offer": the page offers browser notifications for new questions, and asks the browser only when you accept. "off": it never offers them.',
    record: "0157",
  },
  {
    key: "record.folder",
    default: "premise",
    check: summarised(
      folderName,
      "a folder name with letters, digits, dots, dashes or underscores",
    ),
    meaning: "Name of the folder at the root of each software's repository that holds its record.",
    record: "0080",
  },
  {
    key: "record.trailer",
    default: "Premise-Trace",
    check: summarised(trailerName, "letters, digits and dashes, starting with a letter"),
    meaning:
      "Name of the line every commit premise makes carries, naming the record items the commit serves.",
    record: "0083",
  },
  {
    key: "record.default_branch",
    default: "main",
    check: summarised(
      branchName,
      "a branch name with letters, digits, dots, dashes, underscores or slashes",
    ),
    meaning: "Branch name a new software's repository starts on.",
    record: "0159",
  },
  {
    key: "record.commit_author_name",
    default: "premise",
    check: summarised(text, "a name"),
    meaning: "Name on the commits premise makes in a software's repository.",
    record: "0159",
  },
  {
    key: "record.commit_author_email",
    default: "premise@localhost",
    check: summarised(text, "an address"),
    meaning:
      "Address on the commits premise makes in a software's repository. The repository may be public, so keep it free of personal addresses.",
    record: "0159",
  },
  {
    key: "runner.restart_limit",
    default: 3,
    check: summarised(wholeNumber(0, 50), "0 to 50"),
    meaning:
      "How many times a crashed software is started again within the window below before premise stops trying and reports it. 0 never restarts.",
    record: "0162",
  },
  {
    key: "runner.restart_window_minutes",
    default: 10,
    check: summarised(wholeNumber(1, 1440), "1 to 1440"),
    meaning: "The window, in minutes, in which restarts count towards the limit.",
    record: "0162",
  },
  {
    key: "runner.restart_delay_seconds",
    default: 2,
    check: summarised(wholeNumber(0, 600), "0 to 600"),
    meaning: "How long to wait before starting a crashed software again.",
    record: "0162",
  },
  {
    key: "runner.port_range",
    default: "4700-4799",
    check: summarised(portRange, 'two ports joined by a dash, such as "4700-4799"'),
    meaning:
      "Ports on this machine that running web software may use. Software is only ever reachable from this machine.",
    record: "0162",
  },
  {
    key: "runner.start_timeout_seconds",
    default: 30,
    check: summarised(wholeNumber(1, 600), "1 to 600"),
    meaning: "How long a web software has to start answering before the start is called failed.",
    record: "0162",
  },
  {
    key: "runner.build_timeout_seconds",
    default: 600,
    check: summarised(wholeNumber(10, 7200), "10 to 7200"),
    meaning:
      "How long the build steps in a software's run.md may take, all together, before premise stops them and says the build did not finish. They run in a clean copy before every start.",
    record: "0280",
  },
  {
    key: "runner.build_network",
    default: true,
    check: summarised(yesNo, "true or false"),
    meaning:
      "Whether the build steps in run.md may use the network, to install what the software depends on. The software itself still runs as before: a command-line software without any network.",
    record: "0280",
  },
  {
    key: "runner.max_running_softwares",
    default: 5,
    check: summarised(wholeNumber(1, 50), "1 to 50"),
    meaning:
      "How many softwares may be running on this machine at once, each on its own port. Starting one more says to stop another first.",
    record: "0197",
  },
  {
    key: "runner.min_free_memory_mb",
    default: 256,
    check: summarised(wholeNumber(0, 65536), "0 to 65536"),
    meaning:
      "A software is not started when this machine has less free memory than this, in megabytes; premise says so. 0 never checks.",
    record: "0197",
  },
  {
    key: "runner.sample_timeout_seconds",
    default: 30,
    check: summarised(wholeNumber(1, 600), "1 to 600"),
    meaning: "How long a command-line software's sample run may take.",
    record: "0162",
  },
  {
    key: "runner.stop_grace_seconds",
    default: 5,
    check: summarised(wholeNumber(0, 120), "0 to 120"),
    meaning:
      "When running software is stopped, how long it gets to end by itself before it is ended forcibly.",
    record: "0162",
  },
  {
    key: "runner.output_lines",
    default: 200,
    check: summarised(wholeNumber(10, 5000), "10 to 5000"),
    meaning: "How many of the latest lines of a running software's output the page can show.",
    record: "0162",
  },
  {
    key: "runner.confinement",
    default: "bubblewrap",
    check: summarised(oneOf(RUNNER_CONFINEMENTS), `"bubblewrap" or "none"`),
    meaning:
      '"bubblewrap": running software sees only its own copy of the code, not your files or premise\'s data. "none": no confinement, only for a machine where bubblewrap cannot work; premise says so on the page.',
    record: "0163",
  },
  {
    key: "runner.read_only_paths",
    default: [],
    check: summarised(textList, "a list of folder paths"),
    meaning:
      "Extra folders running software may read but not change, such as where Python is installed when that is under your home folder. The Node.js premise runs on is normally included; when it is installed in your home folder or above it, add its folder here yourself.",
    record: "0163",
  },
  {
    key: "reports.max_lines",
    default: 15,
    check: summarised(wholeNumber(3, 200), "3 to 200"),
    meaning:
      "How many lines a short report holds before the rest is behind the page's 'Show more detail' control.",
    record: "0164",
  },
  {
    key: "measures.min_events",
    default: 5,
    check: summarised(wholeNumber(2, 1000), "2 to 1000"),
    meaning:
      'How many events a rate or a typical time needs before premise shows it; with fewer, the page and the reports say "not enough yet" and how many there are.',
    record: "0193",
  },
  {
    key: "measures.presence_seconds",
    default: 30,
    check: summarised(wholeNumber(5, 600), "5 to 600"),
    meaning:
      "How often an open page tells premise it is still being looked at. Minutes of attention count only while the page is in front of someone; a page silent for twice this long counts as closed.",
    record: "0193",
  },
  {
    key: "learning.software_lines_max",
    default: 10,
    check: summarised(wholeNumber(1, 100), "1 to 100"),
    meaning:
      "The most lessons kept for one software. When a new one would go over, the least-used line is dropped, with a note.",
    record: "0194",
  },
  {
    key: "learning.taste_lines_max",
    default: 10,
    check: summarised(wholeNumber(1, 100), "1 to 100"),
    meaning:
      "The most lines kept in the operator's taste, which every software's agents read. When a new one would go over, the least-used line is dropped, with a note.",
    record: "0194",
  },
  {
    key: "learning.line_max_chars",
    default: 200,
    check: summarised(wholeNumber(40, 1000), "40 to 1000"),
    meaning: "The longest a lesson line may be. Longer lines are cut at a word.",
    record: "0194",
  },
  {
    key: "learning.read_with_agent",
    default: true,
    check: summarised(yesNo, "true or false"),
    meaning:
      "Whether an agent (the triager, on the triage task's model) reads each correction to say what kind of mistake it was and propose a lesson. When false, or when the agent gives no answer, premise's fixed rules decide.",
    record: "0194",
  },
  {
    key: "taste.options_max",
    default: 2,
    check: summarised(wholeNumber(1, 5), "1 to 5"),
    meaning:
      "The most options a proposal for a claimed area offers. One or two keeps it quick to judge: the role keeps one, or says what to change.",
    record: "0196",
  },
  {
    key: "taste.claims_max",
    default: 10,
    check: summarised(wholeNumber(1, 100), "1 to 100"),
    meaning:
      "The most areas that can be claimed at once for one software. Each claim adds a proposal to look at before building, so a long list slows every build.",
    record: "0196",
  },
  {
    key: "doctor.command_timeout_seconds",
    default: 10,
    check: summarised(wholeNumber(1, 120), "1 to 120"),
    meaning: "How long the setup check waits for each program to answer.",
  },
];

export const SETTINGS_BY_KEY: ReadonlyMap<string, Setting> = new Map(
  SETTINGS.map((s) => [s.key, s]),
);

export interface TaskSettings {
  model: string;
  effort: Effort;
  max_turns: number;
  max_minutes: number;
}

/** One stage's effort budget (decision 0085). */
export interface StageBudget {
  turns: number;
  minutes: number;
}

/** The whole configuration, as the rest of premise sees it. */
export interface PremiseConfig {
  data: { folder: string; keep_finished_working_copies: boolean };
  server: { host: string; port: number; token_bytes: number; keep_link: boolean };
  queue: {
    start_paused: boolean;
    suspend_gap_seconds: number;
    max_agent_sessions: number;
    same_failure_limit: number;
    usage_pause_fallback_minutes: number;
    fair_wait_minutes: number;
  };
  agents: {
    mode: AgentMode;
    claude_config_folder: string | null;
    claude: { command: string; stop_grace_seconds: number };
    network: { allowed_domains: string[] };
    confinement: { extra_denied_paths: string[] };
    scripted: { script_file: string | null; step_seconds: number };
    tasks: Record<AgentTaskKind, TaskSettings>;
  };
  tools: { progress_max_chars: number; ask_max_items: number; page_part_chars: number };
  usage_ledger: {
    mode: UsageLedgerMode;
    seed: number | null;
    mock_weekly_allowance_usd: number;
    mock_cost_scale: number;
  };
  softwares: {
    default_priority: number;
    default_milestone_waits: boolean;
    default_effort: SoftwareEffort;
    default_weekly_share_percent: number | null;
    default_weekly_budget_usd: number | null;
  };
  page: { notifications: PageNotifications };
  line: {
    say_back_max_items: number;
    why_items_min: number;
    why_items_max: number;
    check_rounds_before_stop: number;
    start_send_backs: number;
    remote: Remote;
    when_nothing_verified: UnverifiedChoice;
    splitting: boolean;
    split_max_parts: number;
    agents_per_stage: number;
    low_effort_budget_percent: number;
    high_effort_budget_percent: number;
    scope_check: boolean;
    wait_after_asked: boolean;
    change_questions: "every-change" | "when-it-matters" | "never" | null;
    change_max_tasks: number;
    native_dependencies: string[];
    estimate_minutes_per_session: number;
    estimate_items_per_build: number;
    budgets: Record<BudgetGroup, Record<"small" | "medium" | "large", StageBudget>>;
  };
  github: { command: string; timeout_minutes: number };
  existing: {
    record_branch: string;
    history_commits: number;
    clone_timeout_minutes: number;
  };
  intake: {
    reading_held_count: number;
    reading_max_days: number;
    max_text_chars: number;
    recent_items_in_brief: number;
    issue_poll_minutes: number;
    feedback_per_hour: number;
    feedback_page: boolean;
  };
  gate: { kind_approvals_allowed: FloorKind[] };
  record: {
    folder: string;
    trailer: string;
    default_branch: string;
    commit_author_name: string;
    commit_author_email: string;
  };
  runner: {
    restart_limit: number;
    restart_window_minutes: number;
    restart_delay_seconds: number;
    port_range: string;
    start_timeout_seconds: number;
    build_timeout_seconds: number;
    build_network: boolean;
    max_running_softwares: number;
    min_free_memory_mb: number;
    sample_timeout_seconds: number;
    stop_grace_seconds: number;
    output_lines: number;
    confinement: RunnerConfinement;
    read_only_paths: string[];
    default_visibility: Visibility;
  };
  reports: { max_lines: number };
  measures: { min_events: number; presence_seconds: number };
  learning: {
    software_lines_max: number;
    taste_lines_max: number;
    line_max_chars: number;
    read_with_agent: boolean;
  };
  taste: { options_max: number; claims_max: number };
  doctor: { command_timeout_seconds: number };
}
