import type { AgentScript } from "../agents/scripted-agent.js";
import { AGENT_TASK_KINDS, type AgentTaskKind } from "../config/settings.js";

/** What each scripted job says it is doing, so the page's activity reads like real work. */
const PROGRESS: Record<AgentTaskKind, string> = {
  draft: "Drafting the list (scripted)",
  research: "Looking at what already exists (scripted: no search is made)",
  review: "Reviewing the change (scripted)",
  plan: "Planning the work, smallest running version first (scripted)",
  build: "Writing the code (scripted: nothing is written)",
  prototype: "Making a quick prototype (scripted)",
  check: "Checking the build against the record (scripted: nothing is checked)",
  triage: "Reading new items (scripted)",
  reading: "Reading held items together (scripted)",
  report: "Writing the report (scripted)",
};

/**
 * The scripted agent's script when no script file is set: every job says what it is doing, takes
 * `stepSeconds`, and ends done (decision 0154).
 */
export function standInScript(stepSeconds: number): AgentScript {
  return {
    rules: AGENT_TASK_KINDS.map((task) => ({
      when: { task },
      progress: [PROGRESS[task]],
      delay_ms: stepSeconds * 1000,
      end: { outcome: "done" as const, summary: `Scripted ${task} finished.` },
    })),
  };
}
