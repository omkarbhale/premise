import type { AgentRunner } from "../agents/agent-runner.js";
import { ScriptedAgentRunner } from "../agents/scripted-agent.js";
import type { AgentToolServer } from "../agents/tool-server.js";
import type { PremiseConfig } from "../config/settings.js";
import { Gate } from "../gate/gate.js";
import { Briefs } from "../line/briefs.js";
import { StandInLaterStages } from "../line/later-stages.js";
import { LineEngine } from "../line/line-engine.js";
import { WorkQueue } from "../queue/work-queue.js";
import { RecordKeeper } from "../record/record-keeper.js";
import { Reporter } from "../reporter/reporter.js";
import { Runner } from "../runner/runner.js";
import { RunnerService } from "../runner/service.js";
import { getSoftware } from "../storage/softwares.js";
import type { Database } from "../storage/database.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { QueueActivity } from "./activity.js";
import { docsFolder } from "./package-root.js";
import type { SessionServices } from "./services.js";

/** Whether agents can work, for the page (decision 0180). */
export interface AgentsStatus {
  ready(): boolean;
  /** Why real agents cannot start, or null. */
  unavailable(): string | null;
  /** The operator chose to look around with scripted agents until premise restarts. */
  scriptedDemo(): boolean;
  useScriptedDemo(): void;
}

export interface Session {
  agents: AgentsStatus;
  queue: WorkQueue;
  services: SessionServices;
  line: LineEngine;
  gate: Gate;
  record: RecordKeeper;
  /** Starts built software from a clean copy. */
  runner: Runner;
  /** Writes reports from recorded facts; the line engine has it write each milestone's report. */
  reporter: Reporter;
}

/**
 * Wire the session: the work queue, the record keeper, the gate and the line engine, which answers
 * the page server's interfaces, with the runner and the reporter beside it. Build, Check, Run and
 * Intake are a labelled stand-in until their own modules plug in here (src/line/later-stages.ts);
 * each milestone's report is written by the reporter. When a tool server is given, agents'
 * tool calls reach the line engine, the record keeper and the gate.
 */
export function createSession(options: {
  db: Database;
  config: PremiseConfig;
  ledger: UsageLedger;
  runner: AgentRunner;
  tools?: AgentToolServer;
  record?: RecordKeeper;
  docs?: string;
  agents?: AgentsStatus;
}): Session {
  const { db, config, ledger, runner, tools } = options;
  let line: LineEngine | null = null;
  const queue = new WorkQueue({
    db,
    config,
    runner,
    serverJobs: (job) => line!.runServerJob(job),
    onChange: (job) => line?.jobChanged(job),
  });
  const record = options.record ?? new RecordKeeper({ db, config });
  const agents: AgentsStatus = options.agents ?? {
    ready: () => runner.ready?.() ?? true,
    unavailable: () => null,
    scriptedDemo: () => false,
    useScriptedDemo: () => {},
  };
  const gate = new Gate({ db, config });
  const runs = new Runner({ db, config, repositories: record });
  const reporter = new Reporter({ db, config, records: record, runner: runs, ledger }, config);
  line = new LineEngine({
    db,
    queue,
    ledger,
    config,
    keeper: record,
    gate,
    briefs: new Briefs(options.docs ?? docsFolder()),
    later: new StandInLaterStages(() => config.agents.scripted.step_seconds),
    agentsReady: () => agents.ready(),
    reporter,
  });
  const engine = line;
  if (tools) {
    tools.setHandlers({
      tools: {
        draft_submit: (b, a) => engine.draftSubmit(b, a),
        record_read: (b, a) => engine.recordRead(b, a),
        record_propose: (b, a) => engine.recordPropose(b, a),
        ask: (b, a) => engine.askPerson(b, a),
        gate_request: (b, a) => engine.gateRequest(b, a),
        review_submit: (b, a) => engine.reviewSubmit(b, a),
        sizing_submit: (b, a) => engine.sizingSubmit(b, a),
      },
      onFinish: (b, account) => engine.taskFinished(b, account),
    });
    if (runner instanceof ScriptedAgentRunner) runner.useTools(tools);
  }
  const services: SessionServices = {
    softwares: {
      list: () => engine.softwareList(),
      get: (id) => engine.softwareDetail(id),
      start: (input) => engine.startSoftware(input),
      sendBack: (id, stage) => engine.sendBack(id, stage),
      setSize: (id, size) => engine.setSize(id, size),
      setPriority: (id, priority) => engine.setPriority(id, priority),
      setMilestoneWait: (id, milestone, wait) => engine.setMilestoneWait(id, milestone, wait),
      withdrawApproval: (id) => engine.withdrawApproval(id),
    },
    workItems: {
      setSize: (id, size) => engine.setItemSize(id, size),
      setStages: (id, stages) => engine.setItemStages(id, stages),
      undoSplit: (id) => engine.undoSplit(id),
      softwareOf: (id) => engine.softwareOfItem(id),
    },
    conversation: {
      messages: (id) => engine.chatMessages(id),
      say: (id, text) => engine.chat(id, text),
    },
    asks: {
      list: (filter) => engine.askList(filter),
      answer: (id, answer) => engine.answer(id, answer),
    },
    records: { view: (id) => engine.recordView(id) },
    reports: reporter,
    runs: new RunnerService(runs, (id) => getSoftware(db, id) !== undefined),
    activity: new QueueActivity(db, queue, () => config.queue.max_agent_sessions),
  };
  return { queue, services, line, gate, record, agents, runner: runs, reporter };
}
