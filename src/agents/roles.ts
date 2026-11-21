import type { AgentTaskKind } from "../config/settings.js";

/**
 * Agent roles (decision 0113) and what each may use: which premise tools (docs/specs/agent-tools.md
 * 3.2), which of Claude Code's own tools, what working copy it gets (agent-runner spec 5.1) and
 * whether it reaches the network (decision 0087).
 */

export const AGENT_ROLES = [
  "drafter",
  "researcher",
  "reviewer",
  "planner",
  "builder",
  "checker",
  "triager",
  "reader",
  "reporter",
  "sizer",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Which role does each type of task. */
export const ROLE_FOR_TASK: Record<AgentTaskKind, AgentRole> = {
  draft: "drafter",
  research: "researcher",
  review: "reviewer",
  plan: "planner",
  build: "builder",
  prototype: "builder",
  check: "checker",
  triage: "triager",
  reading: "reader",
  report: "reporter",
  size: "sizer",
  recover: "drafter",
};

/**
 * What a job's working copy is:
 * - "branch": a clone of the software's repository, on a new branch for the change (builder);
 * - "clone": its own clone of the commit to work from, separate from any other (checker);
 * - "read-only": a clone it may read but not change (planner, drafter, reviewer, sizer);
 * - "scratch": an empty folder (researcher, triager, reader, reporter).
 * Without a repository, every kind falls back to an empty scratch folder.
 */
export type WorkingCopyKind = "branch" | "clone" | "read-only" | "scratch";

export interface TaskAccess {
  role: AgentRole;
  workingCopy: WorkingCopyKind;
  /** Claude Code's own tools the session may use. */
  builtInTools: string[];
  /** The session may write in its working copy. */
  writes: boolean;
  /** The session may run shell commands (always inside the sandbox). */
  shell: boolean;
  /** The session may reach the package registries in agents.network.allowed_domains. */
  registries: boolean;
  /** The session may search and fetch the web (the researcher alone). */
  web: boolean;
}

const READ_TOOLS = ["Read", "Glob", "Grep"];
const CODE_TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep"];

export function accessFor(kind: AgentTaskKind): TaskAccess {
  const role = ROLE_FOR_TASK[kind];
  switch (role) {
    case "builder":
      return {
        role,
        workingCopy: "branch",
        builtInTools: CODE_TOOLS,
        writes: true,
        shell: true,
        registries: true,
        web: false,
      };
    case "checker":
      return {
        role,
        workingCopy: "clone",
        builtInTools: CODE_TOOLS,
        writes: true,
        shell: true,
        registries: true,
        web: false,
      };
    case "researcher":
      return {
        role,
        workingCopy: "scratch",
        builtInTools: ["WebSearch", "WebFetch"],
        writes: false,
        shell: false,
        registries: false,
        web: true,
      };
    case "planner":
    case "drafter":
    case "reviewer":
    case "sizer":
      return {
        role,
        workingCopy: "read-only",
        builtInTools: READ_TOOLS,
        writes: false,
        shell: false,
        registries: false,
        web: false,
      };
    case "triager":
    case "reader":
    case "reporter":
      return {
        role,
        workingCopy: "scratch",
        builtInTools: READ_TOOLS,
        writes: false,
        shell: false,
        registries: false,
        web: false,
      };
  }
}

/** premise's own tools, by role (agent-tools spec 3.2). */
export const PREMISE_TOOLS_BY_ROLE: Record<AgentRole, readonly string[]> = {
  drafter: [
    "record_read",
    "record_propose",
    "draft_submit",
    "recovery_submit",
    "ask",
    "gate_request",
    "progress",
    "task_finish",
  ],
  researcher: [
    "record_read",
    "record_propose",
    "draft_submit",
    "ask",
    "gate_request",
    "progress",
    "task_finish",
  ],
  reviewer: ["record_read", "gate_request", "progress", "task_finish", "review_submit"],
  planner: [
    "record_read",
    "record_propose",
    "draft_submit",
    "ask",
    "gate_request",
    "progress",
    "task_finish",
  ],
  builder: ["record_read", "record_propose", "ask", "gate_request", "progress", "task_finish"],
  checker: ["record_read", "ask", "gate_request", "progress", "scenario_write", "verdict_submit"],
  triager: ["record_read", "gate_request", "progress", "triage_submit", "lesson_submit"],
  reader: ["record_read", "ask", "gate_request", "progress", "task_finish", "reading_submit"],
  reporter: ["record_read", "gate_request", "progress", "facts_read", "report_submit"],
  sizer: ["record_read", "sizing_submit", "progress", "task_finish"],
};
