import {
  type Check,
  oneOf,
  orNone,
  summarised,
  text,
  textList,
  wholeNumber,
  yesNo,
} from "./checks.js";

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

export const PAGE_NOTIFICATIONS = ["offer", "off"] as const;
export type PageNotifications = (typeof PAGE_NOTIFICATIONS)[number];

export const RUNNER_CONFINEMENTS = ["bubblewrap", "none"] as const;
export type RunnerConfinement = (typeof RUNNER_CONFINEMENTS)[number];

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
      '"scripted": a stand-in agent that follows a script file and calls no AI. "claude": real Claude Code sessions on your Claude Code login, each confined by Claude Code\'s sandbox (needs bubblewrap and socat on Linux).',
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
      "Extra folders running software may read but not change, such as where Node.js or Python is installed when that is under your home folder.",
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
    claude: { command: string; stop_grace_seconds: number };
    network: { allowed_domains: string[] };
    confinement: { extra_denied_paths: string[] };
    scripted: { script_file: string | null; step_seconds: number };
    tasks: Record<AgentTaskKind, TaskSettings>;
  };
  tools: { progress_max_chars: number; ask_max_items: number };
  usage_ledger: { mode: UsageLedgerMode; seed: number | null };
  softwares: {
    default_priority: number;
    default_milestone_waits: boolean;
    default_weekly_share_percent: number | null;
  };
  page: { notifications: PageNotifications };
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
    sample_timeout_seconds: number;
    stop_grace_seconds: number;
    output_lines: number;
    confinement: RunnerConfinement;
    read_only_paths: string[];
  };
  reports: { max_lines: number };
  doctor: { command_timeout_seconds: number };
}
