import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole } from "../agents/roles.js";

/**
 * Task briefs for the line's agents, loaded from premise's own prompt files (docs/prompts), where
 * each brief is published in full under "## Full text: <name>". The line engine fills the
 * placeholders from the record and the session; a placeholder with no value is left out as "none".
 * The prompt files ship with premise (package.json "files"), so the briefs an agent receives are
 * the ones the documentation shows.
 */

export type BriefName =
  | "Why brief"
  | "Who brief"
  | "What brief"
  | "say-back brief"
  | "chat corrections brief"
  | "record recovery brief"
  | "full look brief"
  | "smaller look brief"
  | "plan brief"
  | "foundation revision brief"
  | "contradiction review brief"
  | "build task brief"
  | "scenario brief"
  | "check brief"
  | "sizing brief"
  | "triage brief"
  | "reading brief";

export const BRIEF_ROLE: Record<BriefName, AgentRole> = {
  "Why brief": "drafter",
  "Who brief": "drafter",
  "What brief": "drafter",
  "say-back brief": "drafter",
  "chat corrections brief": "drafter",
  "record recovery brief": "drafter",
  "full look brief": "researcher",
  "smaller look brief": "researcher",
  "plan brief": "planner",
  "foundation revision brief": "planner",
  "contradiction review brief": "reviewer",
  "sizing brief": "sizer",
  "triage brief": "triager",
  "reading brief": "reader",
  "build task brief": "builder",
  "scenario brief": "checker",
  "check brief": "checker",
};

export class BriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefError";
  }
}

/** The fenced block under "## Full text: <name>". */
export function briefTemplate(markdown: string, name: string, file = "the prompt file"): string {
  const heading = `## Full text: ${name}`;
  const at = markdown.indexOf(heading);
  if (at < 0) throw new BriefError(`${file} has no "${heading}" section.`);
  const after = markdown.slice(at + heading.length);
  const open = /^(`{3,})[^\n]*\n/m.exec(after);
  if (!open) throw new BriefError(`${file} has no fenced text under "${heading}".`);
  const body = after.slice(open.index + open[0].length);
  const close = body.indexOf(`\n${open[1]}`);
  if (close < 0) throw new BriefError(`${file} has a brief "${name}" that is never closed.`);
  return body.slice(0, close).trim();
}

/** Fill {{placeholders}}; an empty or missing value becomes "none". */
export function fill(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined || value.trim() === "" ? "none" : value;
  });
}

export class Briefs {
  private readonly cache = new Map<string, string>();

  constructor(private readonly docsFolder: string) {}

  private file(role: AgentRole): string {
    const path = join(this.docsFolder, "prompts", `${role}.md`);
    let text = this.cache.get(path);
    if (text === undefined) {
      try {
        text = readFileSync(path, "utf8");
      } catch (error) {
        throw new BriefError(
          `premise cannot read its agent brief ${path} (${(error as Error).message}). Is premise's docs folder complete?`,
        );
      }
      this.cache.set(path, text);
    }
    return text;
  }

  /** A filled-in brief for one job. */
  make(name: BriefName, values: Record<string, string | undefined>): string {
    const role = BRIEF_ROLE[name];
    return fill(briefTemplate(this.file(role), name, `docs/prompts/${role}.md`), values);
  }
}
