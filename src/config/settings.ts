import { type Check, oneOf, orNone, summarised, text, wholeNumber, yesNo } from "./checks.js";

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
] as const;
export type AgentTaskKind = (typeof AGENT_TASK_KINDS)[number];

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const AGENT_MODES = ["scripted", "claude"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const USAGE_LEDGER_MODES = ["mock-fixed", "mock-random", "real"] as const;
export type UsageLedgerMode = (typeof USAGE_LEDGER_MODES)[number];

export const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"] as const;

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

const STRONGEST: AgentTaskKind[] = [
  "draft",
  "research",
  "review",
  "plan",
  "build",
  "prototype",
  "check",
  "reading",
];
const LONG_TASKS: AgentTaskKind[] = ["build", "prototype", "check"];

function taskSettings(kind: AgentTaskKind): Setting[] {
  const strongest = STRONGEST.includes(kind);
  const long = LONG_TASKS.includes(kind);
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
      default: "medium",
      check: summarised(oneOf(EFFORTS), EFFORTS.join(", ")),
      meaning: `Reasoning effort for ${kind} sessions.`,
      record: "0132",
    },
    {
      key: `agents.tasks.${kind}.max_turns`,
      default: long ? 200 : 60,
      check: summarised(wholeNumber(1, 2000), "1 to 2000"),
      meaning: `Turn limit for one ${kind} session; at the limit the job ends stuck.`,
      record: "0088",
    },
    {
      key: `agents.tasks.${kind}.max_minutes`,
      default: long ? 60 : 20,
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
    key: "agents.mode",
    default: "scripted",
    check: summarised(oneOf(AGENT_MODES), `"scripted" or "claude"`),
    meaning:
      '"scripted": a stand-in agent that follows a script file and calls no AI. "claude": real Claude Code sessions on your login (not built yet).',
    record: "0134",
  },
  {
    key: "agents.claude_config_folder",
    default: null,
    check: summarised(orNone(text), "a folder path, or null"),
    meaning: "Claude Code configuration folder to use. null means your existing Claude Code login.",
    record: "0140",
  },
  {
    key: "agents.scripted.script_file",
    default: null,
    check: summarised(orNone(text), "a file path, or null"),
    meaning:
      "JSON script the scripted agent follows. null means every job finishes at once as done.",
    record: "0148",
  },
  ...AGENT_TASK_KINDS.flatMap(taskSettings),
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
    key: "softwares.default_weekly_share_percent",
    default: null,
    check: summarised(orNone(wholeNumber(1, 100)), "1 to 100, or null"),
    meaning: "Share of weekly usage a new software may use. null means no share is set.",
    record: "0128",
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

/** The whole configuration, as the rest of premise sees it. */
export interface PremiseConfig {
  data: { folder: string; keep_finished_working_copies: boolean };
  server: { host: string; port: number; token_bytes: number };
  queue: {
    max_agent_sessions: number;
    same_failure_limit: number;
    usage_pause_fallback_minutes: number;
  };
  agents: {
    mode: AgentMode;
    claude_config_folder: string | null;
    scripted: { script_file: string | null };
    tasks: Record<AgentTaskKind, TaskSettings>;
  };
  usage_ledger: { mode: UsageLedgerMode; seed: number | null };
  softwares: {
    default_priority: number;
    default_milestone_waits: boolean;
    default_weekly_share_percent: number | null;
  };
  doctor: { command_timeout_seconds: number };
}
