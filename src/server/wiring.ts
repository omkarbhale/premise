import type { AgentRunner } from "../agents/agent-runner.js";
import { ScriptedAgentRunner } from "../agents/scripted-agent.js";
import { BuildCheckRun } from "../build/build-check-run.js";
import type { LaterStages } from "../line/later-stages.js";
import type { AgentToolServer } from "../agents/tool-server.js";
import type { PremiseConfig } from "../config/settings.js";
import { Gate } from "../gate/gate.js";
import { Intake } from "../intake/intake.js";
import { FixtureIssueSource, GhCliIssueSource, type IssueSource } from "../intake/issues.js";
import { Briefs } from "../line/briefs.js";
import { Learning } from "../learning/learning.js";
import { LineEngine } from "../line/line-engine.js";
import { Measures } from "../measures/measures.js";
import { WorkQueue } from "../queue/work-queue.js";
import { RecordKeeper } from "../record/record-keeper.js";
import { Reporter } from "../reporter/reporter.js";
import { Runner } from "../runner/runner.js";
import { RunnerService } from "../runner/service.js";
import { getSoftware } from "../storage/softwares.js";
import type { Database } from "../storage/database.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { RecordWriter } from "../line/record-writer.js";
import { RecordError } from "../record/record-keeper.js";
import { Taste } from "../taste/taste.js";
import { QueueActivity } from "./activity.js";
import { ServiceError } from "./services.js";
import { docsFolder } from "./package-root.js";
import type { FeedbackService, SessionServices } from "./services.js";

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
  /** Takes items in, has them triaged, and routes them (src/intake). */
  intake: Intake;
  /** premise's own return, from recorded events (src/measures). */
  measures: Measures;
  /** Learning from corrections (src/learning). */
  learning: Learning;
  /** Taste claims and their proposals (src/taste). */
  taste: Taste;
  /** The feedback page's own interface: no session behind it (decision 0119). */
  feedback: FeedbackService;
}

/**
 * Wire the session: the work queue, the record keeper, the gate and the line engine, which answers
 * the page server's interfaces, with the runner, the reporter and intake beside it. Build, Check
 * and Run are src/build, behind the line engine's hand-off (src/line/later-stages.ts);
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
  /** Other later stages than Build, Check and Run (tests of the line itself use a stand-in). */
  later?: LaterStages;
  /** Where GitHub issues are read from; the local fixture when agents are scripted. */
  issues?: IssueSource;
}): Session {
  const { db, config, ledger, runner, tools } = options;
  let line: LineEngine | null = null;
  let intake: Intake | null = null;
  let learning: Learning | null = null;
  const queue = new WorkQueue({
    db,
    config,
    runner,
    serverJobs: (job) => line!.runServerJob(job),
    onChange: (job) => {
      intake?.jobChanged(job);
      line?.jobChanged(job);
      learning?.jobChanged(job);
    },
  });
  const record = options.record ?? new RecordKeeper({ db, config });
  const agents: AgentsStatus = options.agents ?? {
    ready: () => runner.ready?.() ?? true,
    unavailable: () => null,
    scriptedDemo: () => false,
    useScriptedDemo: () => {},
  };
  const gate = new Gate({ db, config });
  const briefs = new Briefs(options.docs ?? docsFolder());
  const issues =
    options.issues ??
    (config.agents.mode === "scripted" ? new FixtureIssueSource() : new GhCliIssueSource());
  intake = new Intake({ db, config, queue, keeper: record, briefs, gate, issues });
  const taker = intake;
  const runs = new Runner({
    db,
    config,
    repositories: record,
    // A run that keeps crashing is something premise raises as intake (docs/specs/intake.md 5.1).
    onGaveUp: (softwareId, failure) => taker.raise(softwareId, failure),
  });
  const measures = new Measures({ db, config });
  learning = new Learning({
    db,
    config,
    queue,
    briefs,
    agentsReady: () => agents.ready(),
    checkerMisses: () => measures.checkerMisses().misses,
  });
  const learner = learning;
  const reporter = new Reporter(
    { db, config, records: record, runner: runs, ledger, measures },
    config,
  );
  const writer = new RecordWriter(record);
  const taste = new Taste({
    db,
    config,
    land: (softwareId, operations, reason) => {
      let landed;
      try {
        landed = writer.land(softwareId, operations, reason);
      } catch (error) {
        if (error instanceof RecordError) {
          throw new ServiceError(
            "INVALID",
            `premise could not put this into the record: ${error.message}`,
          );
        }
        throw error;
      }
      if (!landed.ok) {
        throw new ServiceError(
          "INVALID",
          `premise could not put this into the record: ${landed.diagnostics.map((d) => d.message).join(" ")} Say it again in other words.`,
        );
      }
    },
  });
  const build = new BuildCheckRun({
    db,
    queue,
    config,
    keeper: record,
    briefs,
    runner: runs,
    taste,
  });
  const later: LaterStages = options.later ?? build;
  line = new LineEngine({
    db,
    queue,
    ledger,
    config,
    keeper: record,
    gate,
    briefs,
    later,
    intake: taker,
    taste,
    agentsReady: () => agents.ready(),
    reporter,
  });
  const engine = line;
  taker.useLine(engine);
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
        proposal_submit: (b, a) => engine.proposalSubmit(b, a),
        recovery_submit: (b, a) => engine.recoverySubmit(b, a),
        triage_submit: (b, a) => taker.triageSubmit(b, a),
        lesson_submit: (b, a) => learner.lessonSubmit(b, a),
        reading_submit: (b, a) => taker.readingSubmit(b, a),
        scenario_write: (b, a) => build.scenarioWrite(b, a),
        verdict_submit: (b, a) => build.verdictSubmit(b, a),
      },
      onFinish: (b, account) => engine.taskFinished(b, account),
    });
    if (runner instanceof ScriptedAgentRunner) runner.useTools(tools);
  }
  if (runner instanceof ScriptedAgentRunner) {
    runner.useWorkingCopies(config.data.folder, config.data.keep_finished_working_copies);
  }
  const services: SessionServices = {
    softwares: {
      list: () => engine.softwareList(),
      get: (id) => engine.softwareDetail(id),
      start: (input) => engine.startSoftware(input),
      bringIn: (input) => engine.bringIn(input),
      offerRecord: (id) => engine.offerRecord(id),
      sendBack: (id, stage) => engine.sendBack(id, stage),
      setSize: (id, size) => engine.setSize(id, size),
      setPriority: (id, priority) => engine.setPriority(id, priority),
      setEffort: (id, effort) => engine.setEffort(id, effort),
      setMilestoneWait: (id, milestone, wait) => engine.setMilestoneWait(id, milestone, wait),
      withdrawApproval: (id) => engine.withdrawApproval(id),
      claim: (id, input) => engine.claimArea(id, input),
      releaseClaim: (id) => engine.releaseClaim(id),
    },
    roles: () => engine.rolesInUse(),
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
    intake: {
      view: (id) => taker.view(id),
      report: (id, text) => taker.report(id, text),
      undo: (id) => taker.undo(id),
      readNow: (id) => taker.readNow(id),
      decideLine: (id, input) => taker.decideLine(id, input),
      backToWhy: (id) => taker.backToWhy(id),
      newFeedbackLink: (id) => taker.newFeedbackLink(id),
      readIssuesNow: (id) => taker.readIssuesNow(id),
    },
    reports: reporter,
    runs: new RunnerService(runs, (id) => getSoftware(db, id) !== undefined),
    activity: new QueueActivity(db, queue, () => config.queue.max_agent_sessions),
  };
  return {
    queue,
    services,
    line,
    gate,
    record,
    agents,
    runner: runs,
    reporter,
    intake: taker,
    measures,
    learning: learner,
    taste,
    feedback: {
      page: (token) => taker.feedbackPage(token),
      submit: (token, text) => taker.submitFeedback(token, text),
      standing: (token, receipt) => taker.feedbackStanding(token, receipt),
    },
  };
}
