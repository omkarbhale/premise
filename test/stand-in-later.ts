import type { AgentOutcome } from "../src/agents/agent-runner.js";
import type {
  LaterEntry,
  LaterOutcome,
  LaterStages,
  MilestoneRef,
} from "../src/line/later-stages.js";
import type { EnqueueInput } from "../src/queue/work-queue.js";

/**
 * Later stages that do nothing and always say they are done, for tests of the line itself (such as
 * sizing) that are not about what Build, Check and Run do. Build and Check are queued as jobs so
 * the scripted agent runs them; Run ends at once.
 */
export class DoNothingLaterStages implements LaterStages {
  readonly standIn = true;

  jobs(entry: LaterEntry): EnqueueInput[] {
    const { softwareId, stage } = entry;
    const brief = `Stand-in ${stage}: nothing is really done.`;
    switch (stage) {
      case "build":
      case "check":
      case "run":
        return [{ softwareId, kind: stage, stage, payload: { standIn: true, brief } }];
      case "report":
        return [];
    }
  }

  finished(): LaterOutcome {
    return { kind: "next" };
  }

  runServerJob(): Promise<AgentOutcome> {
    return Promise.resolve({ kind: "done", summary: "Stand-in: nothing was started." });
  }

  reportLines(_softwareId: string, milestone: MilestoneRef | null): string[] {
    return [`${milestone ? milestone.id : "The plan"} reached (stand-in).`];
  }
}
