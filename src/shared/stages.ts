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

/** The three phases a person sees; the eleven stages are the detail under each. */
export const PHASES = [
  {
    id: "understand",
    name: "Understand",
    now: "Understanding what you want",
    plain: "premise works out what you want: why, for whom, what exists already, and the plan.",
    stages: ["why", "who", "exists", "what", "say-back", "plan"],
  },
  {
    id: "build",
    name: "Build",
    now: "Building it",
    plain: "Agents write the software and a separate agent checks it. Nobody needs to watch.",
    stages: ["build", "check"],
  },
  {
    id: "running",
    name: "Running",
    now: "Running",
    plain:
      "The software runs on this machine, with a report, and what you say next becomes new work.",
    stages: ["run", "report", "intake"],
  },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

/** Which phase a stage belongs to. Unknown stage names fall back to the first phase. */
export function phaseOf(stage: string): PhaseId {
  return PHASES.find((p) => (p.stages as readonly string[]).includes(stage))?.id ?? "understand";
}

export function phaseName(id: PhaseId): string {
  return PHASES.find((p) => p.id === id)?.name ?? id;
}

/** What is happening at a stage, in a few plain words that follow "Understanding what you want:". */
const DOING: Record<StageId, string> = {
  why: "drafting why it is worth building",
  who: "drafting who it is for",
  exists: "looking at what already exists",
  what: "drafting what it must do",
  "say-back": "checking what it understood with you",
  plan: "planning the work",
  build: "writing the software",
  check: "checking it against what you asked for",
  run: "starting the software",
  report: "writing the report",
  intake: "waiting for what you say next",
};

/** "Understanding what you want: drafting who it is for". Stage names are not needed to read it. */
export function whereNow(stage: string): string {
  const phase = PHASES.find((p) => p.id === phaseOf(stage))!;
  const doing = DOING[stage as StageId];
  return doing ? `${phase.now}: ${doing}` : phase.now;
}
