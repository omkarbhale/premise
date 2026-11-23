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
  | "change plan brief"
  | "proposal brief"
  | "foundation revision brief"
  | "contradiction review brief"
  | "build task brief"
  | "scenario brief"
  | "check brief"
  | "sizing brief"
  | "triage brief"
  | "learning brief"
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
  "change plan brief": "planner",
  "proposal brief": "planner",
  "foundation revision brief": "planner",
  "contradiction review brief": "reviewer",
  "sizing brief": "sizer",
  "triage brief": "triager",
  "learning brief": "triager",
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

/**
 * Where lessons from corrections come from (src/learning). A brief for a role that reads them gets
 * the software's lessons and the operator's taste after its own text (docs/specs/learning.md 4).
 */
export interface LessonSource {
  /** The lines for one role's brief on one software, or null when there are none for it. */
  section(role: AgentRole, softwareId: string): string | null;
  /** A live lesson's words by its label ("L-3"), for a draft item that says it follows it. */
  text(label: string): string | null;
}

export class Briefs {
  private readonly cache = new Map<string, string>();
  private lessons: LessonSource | null = null;

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

  /** Give briefs the lessons from corrections. */
  useLessons(source: LessonSource): void {
    this.lessons = source;
  }

  /** A lesson's words by its label, or null when it is not a live lesson. */
  lessonText(label: string): string | null {
    return this.lessons?.text(label) ?? null;
  }

  /**
   * A filled-in brief for one job. With the software it is for, a role that reads lessons gets them
   * after the brief's own text.
   */
  make(name: BriefName, values: Record<string, string | undefined>, softwareId?: string): string {
    const role = BRIEF_ROLE[name];
    const brief = fill(briefTemplate(this.file(role), name, `docs/prompts/${role}.md`), values);
    const lessons = softwareId ? this.lessons?.section(role, softwareId) : null;
    return lessons ? `${brief}\n\n${lessons}` : brief;
  }
}
