import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentRole, PREMISE_TOOLS_BY_ROLE } from "./roles.js";
import { toolExample } from "./tool-server.js";

/**
 * Assembles a session's standing instructions (decision 0114, docs/prompts/README.md "How a prompt
 * is assembled"): the role's system prompt, then every skill the role lists, in full, in the
 * catalog's order. The task brief is given separately, as the session's first message.
 *
 * The prompts and skills are read from premise's own docs/prompts and docs/skills, where they are
 * published in full. After the skills comes one generated section: a complete example call of each
 * premise tool the role has, from the tool server's own examples, so the prompt and the server
 * cannot drift.
 */

const SYSTEM_PROMPT_HEADING = "## Full text: system prompt";
const SKILL_MARKER = "The text below is the skill as the agent receives it.";

export class InstructionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstructionsError";
  }
}

function read(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    throw new InstructionsError(
      `premise cannot read its agent instructions ${file} (${(error as Error).message}). Is premise's docs folder complete?`,
    );
  }
}

/** The first fenced block after a heading: the role's system prompt. */
export function systemPromptOf(markdown: string, file = "the prompt file"): string {
  const at = markdown.indexOf(SYSTEM_PROMPT_HEADING);
  if (at < 0) throw new InstructionsError(`${file} has no "${SYSTEM_PROMPT_HEADING}" section.`);
  const after = markdown.slice(at + SYSTEM_PROMPT_HEADING.length);
  const open = /^(`{3,})[^\n]*\n/m.exec(after);
  if (!open) throw new InstructionsError(`${file} has no fenced system prompt.`);
  const body = after.slice(open.index + open[0].length);
  const close = body.indexOf(`\n${open[1]}`);
  if (close < 0) throw new InstructionsError(`${file} has a system prompt that is never closed.`);
  return body.slice(0, close).trim();
}

/** The skill names a role's prompt file lists, from its "Skills" table row. */
export function skillsOf(markdown: string): string[] {
  const row = markdown.split("\n").find((line) => /^\|\s*Skills\s*\|/.test(line));
  if (!row) return [];
  return [...row.matchAll(/\(\.\.\/skills\/([a-z0-9-]+)\.md\)/g)].map((m) => m[1]!);
}

/** The catalog's order of skills, from docs/skills/README.md. */
export function catalogOrder(readme: string): string[] {
  const start = readme.indexOf("## Catalog");
  const section = start < 0 ? readme : readme.slice(start);
  const names: string[] = [];
  for (const m of section.matchAll(/^\|\s*\[([a-z0-9-]+)\]\(\1\.md\)/gm)) {
    if (!names.includes(m[1]!)) names.push(m[1]!);
  }
  return names;
}

/** The part of a skill file the agent receives. */
export function skillText(markdown: string, file = "the skill file"): string {
  const at = markdown.indexOf(SKILL_MARKER);
  if (at < 0) throw new InstructionsError(`${file} does not mark the text the agent receives.`);
  return markdown.slice(at + SKILL_MARKER.length).trim();
}

/** The prefix of each example line in the generated tools section. */
export const EXAMPLE_CALL = "Example call:";

/** The generated section: one complete, accepted call of each premise tool the role has. */
export function toolExamplesSection(role: AgentRole): string {
  const lines = PREMISE_TOOLS_BY_ROLE[role].map(
    (tool) => `${EXAMPLE_CALL} ${tool} ${JSON.stringify(toolExample(tool, role))}`,
  );
  return [
    "# How to call premise's tools",
    "",
    "Each example is a complete call that premise accepts; copy its shape.",
    "",
    ...lines,
  ].join("\n");
}

/** The role's system prompt followed by its skills and its tool examples, ready for the agent. */
export function assembleInstructions(docsFolder: string, role: AgentRole): string {
  const promptFile = join(docsFolder, "prompts", `${role}.md`);
  const prompt = read(promptFile);
  const listed = skillsOf(prompt);
  const order = catalogOrder(read(join(docsFolder, "skills", "README.md")));
  const rank = (name: string) => {
    const i = order.indexOf(name);
    return i < 0 ? order.length : i;
  };
  const skills = [...listed].sort((a, b) => rank(a) - rank(b));
  const parts = [systemPromptOf(prompt, promptFile)];
  for (const name of skills) {
    const file = join(docsFolder, "skills", `${name}.md`);
    parts.push(`# Skill: ${name}\n\n${skillText(read(file), file)}`);
  }
  parts.push(toolExamplesSection(role));
  return parts.join("\n\n---\n\n");
}
