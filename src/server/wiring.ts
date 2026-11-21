import type { AgentRunner } from "../agents/agent-runner.js";
import type { PremiseConfig } from "../config/settings.js";
import { StandInLine, standInServices } from "../demo/stand-in-line.js";
import { WorkQueue } from "../queue/work-queue.js";
import type { Database } from "../storage/database.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { QueueActivity } from "./activity.js";
import type { SessionServices } from "./services.js";

export interface Session {
  queue: WorkQueue;
  services: SessionServices;
  line: StandInLine;
}

/**
 * Wire the session's services: the work queue, and the stand-in line in place of the line engine,
 * record keeper and reporter until they exist (decision 0154). Their real versions plug in here.
 */
export function createSession(options: {
  db: Database;
  config: PremiseConfig;
  ledger: UsageLedger;
  runner: AgentRunner;
}): Session {
  const { db, config, ledger, runner } = options;
  let line: StandInLine | null = null;
  const queue = new WorkQueue({
    db,
    config,
    runner,
    serverJobs: () => line!.runServerJob(),
    onChange: (job) => line?.jobChanged(job),
  });
  line = new StandInLine({ db, queue, ledger, config });
  const services: SessionServices = {
    ...standInServices(line),
    activity: new QueueActivity(db, queue, () => config.queue.max_agent_sessions),
  };
  return { queue, services, line };
}
