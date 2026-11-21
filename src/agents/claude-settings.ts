import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Effort } from "../config/settings.js";
import type { TaskAccess } from "./roles.js";

/**
 * What a Claude Code session is started with: its generated settings (sandbox and permission
 * rules), its command-line arguments and its environment. Everything here follows the
 * subscription and sandbox test of 2026-11-21 (docs/record/subscription-sandbox-test-2026-11-21.md):
 *
 * - the sandbox is on, must start or the session fails (failIfUnavailable), and no command may run
 *   outside it (allowUnsandboxedCommands false);
 * - file tools are not covered by the sandbox, so permission rules allow them in the session's own
 *   working copy only, and deny them on every other session's folder and premise's data;
 * - deny rules beat allow rules, so the denied list names the other folders one by one, never a
 *   parent of the session's own working copy;
 * - absolute paths in permission rules take a double slash: Read(//abs/path/**);
 * - permission prompts are denied, never waited on (dontAsk, no prompts);
 * - no settings are read from anywhere but this file, and no MCP server but premise's;
 * - the environment is built from nothing: no API key can reach the session.
 */

/** The server name agents see premise's tools under: mcp__premise__<tool>. */
export const PREMISE_MCP_SERVER = "premise";

/** Files Claude Code's sandbox places in a working copy while a session runs. */
export const SANDBOX_PLACEHOLDERS = [
  ".bashrc",
  ".bash_profile",
  ".profile",
  ".zshrc",
  ".zprofile",
  ".gitconfig",
  ".mcp.json",
  ".claude/",
];

/** Credential files and folders, relative to the home folder, that no agent may read (0087). */
export const CREDENTIAL_PATHS = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".docker",
  ".netrc",
  ".git-credentials",
  ".npmrc",
  ".pypirc",
  ".config/gh",
  ".config/gcloud",
  ".claude",
  ".claude.json",
];

/**
 * A host name that never resolves, used when a session may reach no host at all: an empty list
 * is not what the sandbox test proved, a list with one unreachable host is.
 */
export const NO_NETWORK_PLACEHOLDER = "no-network.invalid";

export interface ConfinementInput {
  /** The session's own working copy: the only folder it may write. */
  workingCopy: string;
  /** premise's data folder; its work/ folder holds every session's working copy. */
  dataFolder: string;
  home: string;
  access: TaskAccess;
  allowedDomains: string[];
  /** The Claude Code configuration folder in use, when it is not the default under home. */
  claudeConfigFolder: string | null;
  extraDeniedPaths: string[];
}

/** Every folder or file the session may not touch: a list of absolute paths. */
export function deniedPaths(input: ConfinementInput): string[] {
  const own = resolve(input.workingCopy);
  const denied = new Set<string>();
  const add = (path: string) => {
    const full = resolve(path);
    // Never deny the session's own working copy or a folder that holds it.
    if (own === full || own.startsWith(`${full}/`)) return;
    denied.add(full);
  };
  const data = resolve(input.dataFolder);
  const work = join(data, "work");
  if (existsSync(data)) {
    for (const entry of readdirSync(data)) {
      if (join(data, entry) !== work) add(join(data, entry));
    }
  }
  // Inside work/, everything but the path down to the session's own working copy.
  if (own.startsWith(`${work}/`)) {
    let folder = work;
    for (const part of own.slice(work.length + 1).split("/")) {
      if (existsSync(folder)) {
        for (const entry of readdirSync(folder)) {
          if (entry !== part) add(join(folder, entry));
        }
      }
      folder = join(folder, part);
    }
  }
  for (const path of CREDENTIAL_PATHS) add(join(input.home, path));
  if (input.claudeConfigFolder) add(input.claudeConfigFolder);
  for (const path of input.extraDeniedPaths) add(path);
  return [...denied].sort();
}

/** A permission rule for an absolute path: Claude Code needs a double slash for those. */
export function pathRule(tool: "Read" | "Edit" | "Write", path: string, folder = true): string {
  return `${tool}(/${resolve(path)}${folder ? "/**" : ""})`;
}

export interface ClaudeSettings {
  sandbox: {
    enabled: true;
    failIfUnavailable: true;
    allowUnsandboxedCommands: false;
    autoAllowBashIfSandboxed: boolean;
    filesystem: { denyRead: string[] };
    network: { allowedDomains: string[] };
  };
  permissions: { allow: string[]; deny: string[] };
}

/** The session's generated settings file. */
export function sessionSettings(input: ConfinementInput): ClaudeSettings {
  const { access } = input;
  const denied = deniedPaths(input);
  const own = resolve(input.workingCopy);
  const deny: string[] = [];
  for (const path of denied) {
    // A path may be a file or a folder; deny both forms.
    for (const tool of ["Read", "Edit", "Write"] as const) {
      deny.push(pathRule(tool, path, false), pathRule(tool, path, true));
    }
  }
  if (!access.web) deny.push("WebFetch", "WebSearch");
  if (!access.writes) deny.push(pathRule("Edit", own), pathRule("Write", own));
  if (!access.shell) deny.push("Bash");

  const allow = [pathRule("Read", own), `mcp__${PREMISE_MCP_SERVER}`];
  if (access.writes) allow.push(pathRule("Edit", own), pathRule("Write", own));
  if (access.shell) allow.push("Bash");
  if (access.web) allow.push("WebFetch", "WebSearch");

  const domains = access.registries ? input.allowedDomains : [];
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: access.shell,
      filesystem: { denyRead: denied },
      network: { allowedDomains: domains.length > 0 ? domains : [NO_NETWORK_PLACEHOLDER] },
    },
    permissions: { allow, deny },
  };
}

/** The MCP configuration that connects the session to premise's tools with its own token. */
export function mcpConfig(url: string, token: string): object {
  return {
    mcpServers: {
      [PREMISE_MCP_SERVER]: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  };
}

export interface ArgumentsInput {
  /** The first message: the task brief, or the note that a cut-off session carries on. */
  prompt: string;
  model: string;
  effort: Effort;
  settingsFile: string;
  mcpConfigFile: string;
  /** The role's prompt and skills. */
  instructions: string;
  builtInTools: string[];
  /** A new session's id, chosen by premise; absent when resuming. */
  sessionId?: string;
  /** An earlier session to carry on. */
  resumeSessionId?: string;
}

/** The command-line arguments for `claude`. */
export function claudeArguments(input: ArgumentsInput): string[] {
  const args = [
    "-p",
    input.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    input.model,
    "--effort",
    input.effort,
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--settings",
    input.settingsFile,
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    input.mcpConfigFile,
    "--tools",
    input.builtInTools.join(","),
    "--append-system-prompt",
    input.instructions,
  ];
  if (input.resumeSessionId) args.push("--resume", input.resumeSessionId);
  else if (input.sessionId) args.push("--session-id", input.sessionId);
  return args;
}

/** Locale and terminal variables passed through; nothing else from premise's environment is. */
const PASSED_THROUGH = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR"];

/**
 * The session's environment, built from nothing (decision 0103): no API key, no inherited
 * Claude Code variables, no tokens. Only what a program needs to run, and the configuration
 * folder when one is set.
 */
export function sessionEnvironment(
  parent: NodeJS.ProcessEnv,
  claudeConfigFolder: string | null,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of PASSED_THROUGH) {
    if (parent[name] !== undefined) env[name] = parent[name];
  }
  env.TERM = "dumb";
  if (claudeConfigFolder) env.CLAUDE_CONFIG_DIR = resolve(claudeConfigFolder);
  return env;
}
