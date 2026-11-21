/**
 * The eleven stages of the line (docs/architecture/the-line.md), with the plain words the page uses
 * for each. Shared by the server and the page, so it imports nothing.
 */
export const STAGES = [
  { id: "why", name: "Why", plain: "What the software is for, in your words." },
  { id: "who", name: "Who", plain: "Who will use it, and who decides what." },
  {
    id: "exists",
    name: "What exists",
    plain: "Whether something already does this, so nothing is built for nothing.",
  },
  { id: "what", name: "What", plain: "What it must do, should do and could do." },
  {
    id: "say-back",
    name: "Say back",
    plain: "premise repeats what it understood and assumed; you strike anything wrong.",
  },
  { id: "plan", name: "Plan", plain: "The technical choices and the order of the work." },
  { id: "build", name: "Build", plain: "Agents write the code. Nobody needs to watch." },
  {
    id: "check",
    name: "Check",
    plain: "A separate agent checks the result against what you asked for.",
  },
  { id: "run", name: "Run", plain: "The software starts on this machine, ready to try." },
  { id: "report", name: "Report", plain: "What was done, what failed, and what is needed." },
  {
    id: "intake",
    name: "Intake",
    plain: "What you say after it runs goes back into the line as new work.",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS: readonly StageId[] = STAGES.map((s) => s.id);

export function isStageId(value: unknown): value is StageId {
  return typeof value === "string" && (STAGE_IDS as readonly string[]).includes(value);
}

export function stageNumber(id: string): number {
  return STAGE_IDS.indexOf(id as StageId) + 1;
}

export function stageName(id: string): string {
  return STAGES.find((s) => s.id === id)?.name ?? id;
}

export const SIZE_CLASSES = ["small", "medium", "large"] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];
