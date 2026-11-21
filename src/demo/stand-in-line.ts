import type { AgentOutcome } from "../agents/agent-runner.js";
import type { Job, JobKind, WorkQueue } from "../queue/work-queue.js";
import {
  type AskService,
  type ChatResult,
  type ConversationService,
  type RecordService,
  type ReportService,
  ServiceError,
  type SoftwareService,
  type StartSoftwareInput,
} from "../server/services.js";
import type {
  AskAnswer,
  AskItem,
  AskView,
  ChatMessage,
  ItemAnswer,
  RecordFileView,
  RecordItemView,
  RecordView,
  ReportLine,
  ReportView,
  SoftwareDetail,
  SoftwareSummary,
  StageView,
} from "../shared/api-types.js";
import {
  SIZE_CLASSES,
  STAGES,
  type SizeClass,
  type StageId,
  isStageId,
  stageName,
  stageNumber,
} from "../shared/stages.js";
import { type Ask, closeAsk, createAsk, getAsk, listAsks, setAskItems } from "../storage/asks.js";
import { addChatMessage, countIntakeMessages, listChatMessages } from "../storage/chat.js";
import { type Database, recordEvent, transaction } from "../storage/database.js";
import {
  type Software,
  createSoftware,
  getSoftware,
  listSoftwares,
  setSoftwareSizeClass,
  setSoftwareStage,
  setSoftwareState,
} from "../storage/softwares.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import type { PremiseConfig } from "../config/settings.js";
import {
  EXISTS_CHOICES,
  MILESTONE_CHOICES,
  nameFromIdea,
  repositoryName,
  shortIdea,
  whatDraft,
  whoDraft,
  whyDraft,
} from "./drafts.js";

/**
 * The stand-in line: walks a software through the eleven stages with fixed drafts, so the page can
 * be used end to end before the line engine, record keeper and reporter exist. It writes real asks
 * and chat messages, and queues real (scripted) jobs, so everything the page shows is stored. It
 * calls no AI, creates no repository and starts nothing; the page labels it as a stand-in.
 */

const OPERATOR = "operator";
const MAX_IDEA = 4000;
const MAX_CHAT = 4000;

/** Record files the stand-in keeps, by the stage that writes them. */
const RECORD_FILES: {
  stage: StageId;
  file: string;
  title: string;
  plain: string;
  prefix: string;
}[] = [
  {
    stage: "why",
    file: "why.md",
    title: "Why",
    plain: "The problem, and why to build",
    prefix: "Y",
  },
  {
    stage: "who",
    file: "who.md",
    title: "Who",
    plain: "Who it is for, and the roles it needs",
    prefix: "U",
  },
  {
    stage: "exists",
    file: "exists.md",
    title: "What exists",
    plain: "What already exists, and what was decided about it",
    prefix: "E",
  },
  {
    stage: "what",
    file: "what.md",
    title: "What",
    plain: "What it must, should and could do",
    prefix: "W",
  },
  {
    stage: "plan",
    file: "decisions.md",
    title: "Decisions",
    plain: "Technical choices, each with its reason",
    prefix: "D",
  },
];

const FINISHED = new Set(["done", "stuck", "failed", "stopped"]);

export interface StandInOptions {
  db: Database;
  queue: WorkQueue;
  ledger: UsageLedger;
  config: Pick<PremiseConfig, "agents" | "softwares">;
}

export class StandInLine {
  private readonly db: Database;
  /** Ended jobs already acted on, or stopped on purpose by a send-back. */
  private readonly handledJobs = new Set<number>();

  constructor(private readonly options: StandInOptions) {
    this.db = options.db;
  }

  // ---- Softwares ---------------------------------------------------------------------------

  private require(id: string): Software {
    const software = getSoftware(this.db, id);
    if (!software) {
      throw new ServiceError(
        "NOT_FOUND",
        "That software is not in premise. Pick one from the list, or start a new one.",
      );
    }
    return software;
  }

  private statusLine(software: Software, openAsks: number, jobs: Job[]): string {
    if (software.state === "ended") return "Ended: you decided not to build it.";
    if (software.state === "waiting-milestone") {
      return "Stopped after a milestone until you say go on.";
    }
    if (software.state === "paused-budget") return "Paused: its effort budget is used up.";
    if (software.state === "paused-usage") return "Paused until the usage limit resets.";
    if (openAsks > 0) {
      return `Waiting on you: ${openAsks === 1 ? "1 thing" : `${openAsks} things`} to answer.`;
    }
    const running = jobs.find((j) => j.status === "running");
    if (running) return `Agents are working: ${running.kind}.`;
    const queued = jobs.find((j) => j.status === "queued");
    if (queued) return `Queued: ${queued.kind} starts when an agent is free.`;
    const stuck = jobs.find((j) => j.status === "stuck" || j.status === "failed");
    if (stuck && software.currentStage === stuck.stage) {
      return `Stuck at ${stageName(stuck.stage ?? "")}: send it back to try again.`;
    }
    if (software.currentStage === "intake") {
      return "Reached the end of the line. Say in chat what to change next.";
    }
    return "Working.";
  }

  private summary(software: Software): SoftwareSummary {
    const openAsks = listAsks(this.db, { softwareId: software.id, status: "open" }).length;
    const jobs = this.options.queue.list().filter((j) => j.softwareId === software.id);
    return {
      id: software.id,
      name: software.name,
      stage: isStageId(software.currentStage) ? software.currentStage : "why",
      state: software.state,
      status: this.statusLine(software, openAsks, jobs),
      sizeClass: (SIZE_CLASSES as readonly string[]).includes(software.sizeClass)
        ? (software.sizeClass as SizeClass)
        : "small",
      priority: software.priority,
      milestoneWaits: software.milestoneWaits,
      openAsks,
      created: software.created,
    };
  }

  async softwareList(): Promise<SoftwareSummary[]> {
    return listSoftwares(this.db).map((s) => this.summary(s));
  }

  async softwareDetail(id: string): Promise<SoftwareDetail> {
    const software = this.require(id);
    const current = stageNumber(software.currentStage);
    const stages: StageView[] = STAGES.map((s, i) => ({
      id: s.id,
      name: s.name,
      plain: s.plain,
      position: i + 1 < current ? "done" : i + 1 === current ? "current" : "ahead",
    }));
    const usage = await this.options.ledger.softwareUsage(id);
    return {
      ...this.summary(software),
      idea: software.idea,
      stages,
      usage: {
        mocked: usage.mocked,
        sessions: usage.sessions,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        weeklyShare: usage.weeklyShare,
      },
    };
  }

  async startSoftware(input: StartSoftwareInput): Promise<SoftwareSummary> {
    const idea = (input.idea ?? "").trim();
    if (!idea) {
      throw new ServiceError(
        "INVALID",
        "Write a sentence or two about what the software should do, then start it.",
      );
    }
    if (idea.length > MAX_IDEA) {
      throw new ServiceError(
        "INVALID",
        `That is ${idea.length} characters; keep the first description under ${MAX_IDEA}. You can add detail in chat later.`,
      );
    }
    const given = input.name?.trim();
    if (given && given.length > 80) {
      throw new ServiceError("INVALID", "Keep the name under 80 characters.");
    }
    const taken = new Set(listSoftwares(this.db).map((s) => s.name.toLowerCase()));
    if (given && taken.has(given.toLowerCase())) {
      throw new ServiceError(
        "NAME_TAKEN",
        `There is already a software called "${given}". Choose another name, or leave the name empty.`,
      );
    }
    let name = given || nameFromIdea(idea);
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${nameFromIdea(idea)} ${n}`;

    const software = transaction(this.db, () => {
      const created = createSoftware(this.db, { name, idea }, this.options.config.softwares);
      addChatMessage(this.db, {
        softwareId: created.id,
        author: "person",
        text: idea,
        routedTo: "start",
      });
      this.enterStage(created, "why", "started");
      return created;
    });
    this.options.queue.tick();
    return this.summary(getSoftware(this.db, software.id)!);
  }

  async sendBack(id: string, stage: StageId): Promise<void> {
    const software = this.require(id);
    if (!isStageId(stage)) {
      throw new ServiceError(
        "INVALID",
        `"${String(stage)}" is not a stage. The stages are: ${STAGES.map((s) => s.name).join(", ")}.`,
      );
    }
    if (stageNumber(stage) > stageNumber(software.currentStage)) {
      throw new ServiceError(
        "INVALID",
        `${software.name} has not reached ${stageName(stage)} yet; it can only be sent back to ${stageName(software.currentStage)} or an earlier stage.`,
      );
    }
    for (const job of this.options.queue.list()) {
      if (job.softwareId === id && !FINISHED.has(job.status)) {
        this.handledJobs.add(job.id);
        this.options.queue.stop(job.id);
      }
    }
    transaction(this.db, () => {
      for (const ask of listAsks(this.db, { softwareId: id, status: "open" })) {
        closeAsk(
          this.db,
          ask.id,
          "withdrawn",
          null,
          `Withdrawn: sent back to ${stageName(stage)}.`,
        );
      }
      if (software.state !== "active") setSoftwareState(this.db, id, "active", "sent back");
      this.premiseSays(
        id,
        `Sent back to ${stageName(stage)}. The stages after it will be done again.`,
      );
      this.enterStage(getSoftware(this.db, id)!, stage, "sent back");
    });
    this.options.queue.tick();
  }

  async setSize(id: string, size: SizeClass): Promise<void> {
    const software = this.require(id);
    if (!(SIZE_CLASSES as readonly string[]).includes(size)) {
      throw new ServiceError("INVALID", `The size must be small, medium or large.`);
    }
    if (software.sizeClass === size) return;
    transaction(this.db, () => {
      setSoftwareSizeClass(this.db, id, size);
      this.premiseSays(
        id,
        `Size is now ${size}. With the real line, each stage gets a ${size} software's budget; the stand-in does not count budgets.`,
      );
    });
  }

  // ---- The line ----------------------------------------------------------------------------

  private premiseSays(
    softwareId: string,
    text: string,
    routedTo: string | null = null,
  ): ChatMessage {
    return addChatMessage(this.db, { softwareId, author: "premise", text, routedTo });
  }

  private enqueue(software: Software, kind: JobKind, stage: StageId): void {
    this.options.queue.enqueue({
      softwareId: software.id,
      kind,
      stage,
      payload: { standIn: true, brief: `Stand-in ${kind} for ${software.name}.` },
    });
  }

  /** Put a software at a stage and start that stage's work. */
  private enterStage(software: Software, stage: StageId, why: string): void {
    setSoftwareStage(this.db, software.id, stage, why);
    const id = software.id;
    switch (stage) {
      case "why":
        createAsk(this.db, {
          softwareId: id,
          role: OPERATOR,
          kind: "draft",
          stage,
          title: "Why build it: is this right?",
          instruction:
            "Strike anything wrong and edit anything half right. Whatever you leave alone is kept. Then confirm.",
          items: whyDraft(software.idea),
        });
        this.premiseSays(
          id,
          `Started ${software.name}. I drafted why it is worth building as a short list: check it under "Waiting on you". Strike anything wrong; you can also correct it here in chat.`,
        );
        break;
      case "who":
        createAsk(this.db, {
          softwareId: id,
          role: OPERATOR,
          kind: "draft",
          stage,
          title: "Who it is for: is this right?",
          instruction:
            "Strike anyone who does not belong and edit what is half right. Then confirm.",
          items: whoDraft(),
        });
        this.premiseSays(id, "Next, who it is for. I drafted that too.");
        break;
      case "exists":
        this.enqueue(software, "research", stage);
        this.premiseSays(id, "Looking at what already exists, so nothing is built for nothing.");
        break;
      case "what":
        createAsk(this.db, {
          softwareId: id,
          role: OPERATOR,
          kind: "draft",
          stage,
          title: "What it must do: is this right?",
          instruction:
            "Each line says must, should or could. Strike what it should not do, edit what is half right, then confirm. Add anything missing in chat.",
          items: whatDraft(software.idea),
        });
        this.premiseSays(id, "Here is what I think it must do. Add anything missing in chat.");
        break;
      case "say-back":
        createAsk(this.db, {
          softwareId: id,
          role: OPERATOR,
          kind: "say-back",
          stage,
          title: "Say back: what I understood",
          instruction:
            "This is what I understood and assumed, before any code is written. Strike anything wrong; the rest is taken as right.",
          items: this.sayBackItems(id),
        });
        this.premiseSays(id, "Before planning, here is what I understood. Strike anything wrong.");
        break;
      case "plan":
        this.enqueue(software, "plan", stage);
        this.premiseSays(id, "Planning: choosing how to build it, smallest running version first.");
        break;
      case "build":
        this.enqueue(software, "build", stage);
        this.premiseSays(id, "Building. Nobody needs to watch; the page updates as it goes.");
        break;
      case "check":
        this.enqueue(software, "check", stage);
        this.premiseSays(
          id,
          "Checking the build against what you asked for, in a separate session.",
        );
        break;
      case "run":
        this.enqueue(software, "run", stage);
        this.premiseSays(id, "Starting it on this machine.");
        break;
      case "report":
        recordEvent(this.db, { softwareId: id, module: "reporter", kind: "report-written" });
        this.premiseSays(id, `The report is ready: open the Report tab.`);
        if (software.milestoneWaits) {
          setSoftwareState(this.db, id, "waiting-milestone", "milestone reached");
          createAsk(this.db, {
            softwareId: id,
            role: OPERATOR,
            kind: "question",
            stage,
            title: "Milestone reached: go on?",
            instruction:
              "You asked premise to stop after each milestone. Try it, read the report, then say whether to go on.",
            extra: { choices: [...MILESTONE_CHOICES], meta: { milestone: true } },
          });
        } else {
          this.enterStage(getSoftware(this.db, id)!, "intake", "report written");
        }
        break;
      case "intake":
        this.premiseSays(
          id,
          "That is the whole line. Anything you say in chat from now on is taken as new work.",
        );
        break;
    }
  }

  /** A job of the stand-in finished: move its software on. */
  jobChanged(job: Job): void {
    if (!job.payload.standIn || !FINISHED.has(job.status)) return;
    const software = getSoftware(this.db, job.softwareId);
    if (!software || software.currentStage !== job.stage) return;
    // Only the first notice of an ended job moves the line on.
    if (this.handledJobs.has(job.id)) return;
    this.handledJobs.add(job.id);
    transaction(this.db, () => {
      if (job.status !== "done") {
        this.premiseSays(
          software.id,
          `The ${job.kind} job ${job.status === "stopped" ? "was stopped" : "did not finish"}: ${job.result ?? "no reason was given"}. Send ${software.name} back to ${stageName(job.stage ?? "why")} to try again.`,
        );
        return;
      }
      switch (job.stage) {
        case "exists":
          createAsk(this.db, {
            softwareId: software.id,
            role: OPERATOR,
            kind: "question",
            stage: "exists",
            title: "Build it, build on something, or not build it?",
            instruction:
              "premise normally lists what already exists, with sources. The stand-in did not search, so it found nothing. Pick one, or write your own answer.",
            extra: {
              bestAttempt: "Build it: nothing like it was found.",
              choices: [...EXISTS_CHOICES],
            },
          });
          break;
        case "plan":
          createAsk(this.db, {
            softwareId: software.id,
            role: OPERATOR,
            kind: "approval",
            stage: "plan",
            title: "Create the software's repository?",
            instruction:
              "premise always asks before acting outside this machine. In this stand-in, approving creates nothing; it only moves the line on.",
            extra: {
              approval: {
                action: `Create a private repository named ${repositoryName(software.name)} on your GitHub account, and push the first commit to it.`,
                why: "Each software keeps its code and its record in its own repository.",
                floor:
                  "Creating something outside this machine is on the floor: things premise never does without asking.",
              },
            },
          });
          break;
        case "build":
          this.enterStage(software, "check", "build done");
          break;
        case "check":
          this.enterStage(software, "run", "check passed");
          break;
        case "run":
          this.enterStage(software, "report", "running");
          break;
      }
    });
  }

  /** The stand-in's "run" job: the server's part of Run. Nothing is started. */
  runServerJob(): Promise<AgentOutcome> {
    const seconds = this.options.config.agents.scripted.step_seconds;
    return new Promise((resolve) =>
      setTimeout(
        () => resolve({ kind: "done", summary: "Stand-in: nothing was started on this machine." }),
        seconds * 1000,
      ),
    );
  }

  // ---- Conversation ------------------------------------------------------------------------

  async chatMessages(softwareId: string): Promise<ChatMessage[]> {
    this.require(softwareId);
    return listChatMessages(this.db, softwareId);
  }

  async chat(softwareId: string, raw: string): Promise<ChatResult> {
    const software = this.require(softwareId);
    const text = (raw ?? "").trim();
    if (!text) throw new ServiceError("INVALID", "Write something before sending.");
    if (text.length > MAX_CHAT) {
      throw new ServiceError(
        "INVALID",
        `That message is ${text.length} characters; keep it under ${MAX_CHAT}, or send it in parts.`,
      );
    }
    return transaction(this.db, () => {
      const draft = listAsks(this.db, { softwareId, status: "open" }).find(
        (a) => a.kind === "draft",
      );
      if (draft) {
        const key = `c${draft.items.length + 1}-${Date.now().toString(36)}`;
        setAskItems(this.db, draft.id, [
          ...draft.items,
          { key, text, mark: "from-role", from: OPERATOR },
        ]);
        const said = addChatMessage(this.db, {
          softwareId,
          author: "person",
          text,
          routedTo: `draft:${draft.id}`,
          askId: draft.id,
        });
        const reply = this.premiseSays(
          softwareId,
          `Added to the open ${stageName(draft.stage ?? "")} list as a new item. Keep, strike or edit it there.`,
        );
        return { said, reply };
      }
      const number = countIntakeMessages(this.db, softwareId) + 1;
      const said = addChatMessage(this.db, {
        softwareId,
        author: "person",
        text,
        routedTo: `intake:I-${number}`,
      });
      const later =
        software.currentStage === "intake"
          ? "It goes into the line as new work."
          : "It is kept as new work for after this round reaches Intake.";
      const reply = this.premiseSays(softwareId, `Taken as I-${number}. ${later}`);
      return { said, reply };
    });
  }

  // ---- Asks --------------------------------------------------------------------------------

  private askView(ask: Ask, names: Map<string, string>): AskView {
    return {
      id: ask.id,
      softwareId: ask.softwareId,
      softwareName: names.get(ask.softwareId) ?? "a removed software",
      role: ask.role,
      kind: ask.kind,
      stage: ask.stage && isStageId(ask.stage) ? ask.stage : null,
      title: ask.title,
      instruction: ask.instruction,
      items: ask.items,
      ...(ask.extra.bestAttempt !== undefined && { bestAttempt: ask.extra.bestAttempt }),
      ...(ask.extra.choices !== undefined && { choices: ask.extra.choices }),
      ...(ask.extra.approval !== undefined && { approval: ask.extra.approval }),
      status: ask.status,
      ...(ask.answerSummary !== null && { answerSummary: ask.answerSummary }),
      asked: ask.asked,
      ...(ask.answered !== null && { answered: ask.answered }),
    };
  }

  private softwareNames(): Map<string, string> {
    return new Map(listSoftwares(this.db).map((s) => [s.id, s.name]));
  }

  async askList(
    filter: { softwareId?: string; status?: "open" | "answered" } = {},
  ): Promise<AskView[]> {
    const names = this.softwareNames();
    const asks = listAsks(this.db, filter).filter((a) => a.status !== "withdrawn" || filter.status);
    const open = asks.filter((a) => a.status === "open");
    const closed = asks.filter((a) => a.status !== "open").reverse();
    return [...open, ...closed].map((a) => this.askView(a, names));
  }

  async answer(id: number, answer: AskAnswer): Promise<AskView> {
    const ask = getAsk(this.db, id);
    if (!ask) {
      throw new ServiceError(
        "NOT_FOUND",
        "That question is not in premise any more. Reload the page.",
      );
    }
    if (ask.status !== "open") {
      throw new ServiceError(
        "ASK_CLOSED",
        ask.status === "withdrawn"
          ? "This was withdrawn before your answer arrived, because the software was sent back. Nothing was changed."
          : `This was already answered (${ask.answerSummary ?? "answer recorded"}). Nothing was changed.`,
      );
    }
    const summary = validateAnswer(ask, answer);
    const software = this.require(ask.softwareId);
    transaction(this.db, () => {
      if (!closeAsk(this.db, id, "answered", answer, summary)) {
        throw new ServiceError(
          "ASK_CLOSED",
          "This was answered a moment ago. Nothing was changed.",
        );
      }
      this.afterAnswer(software, ask, answer);
    });
    this.options.queue.tick();
    return this.askView(getAsk(this.db, id)!, this.softwareNames());
  }

  private afterAnswer(software: Software, ask: Ask, answer: AskAnswer): void {
    const id = software.id;
    if (ask.extra.meta?.milestone) {
      const text = answer.kind === "text" ? answer.text : "";
      if (text === MILESTONE_CHOICES[0]) {
        setSoftwareState(this.db, id, "active", "operator said go on");
        this.enterStage(getSoftware(this.db, id)!, "intake", "operator said go on");
      } else {
        this.premiseSays(
          id,
          "Stopped here. Send it back to any stage, or say go on when you are ready.",
        );
        createAsk(this.db, {
          softwareId: id,
          role: OPERATOR,
          kind: "question",
          stage: "report",
          title: "Go on when you are ready",
          instruction: "premise waits here until you say go on.",
          extra: { choices: [MILESTONE_CHOICES[0]], meta: { milestone: true } },
        });
      }
      return;
    }
    switch (ask.stage) {
      case "why":
        this.enterStage(software, "who", "why confirmed");
        break;
      case "who":
        this.enterStage(software, "exists", "who confirmed");
        break;
      case "exists": {
        const text = answer.kind === "text" ? answer.text : "";
        if (text === EXISTS_CHOICES[2]) {
          setSoftwareState(this.db, id, "ended", "operator decided not to build");
          setSoftwareStage(this.db, id, "report", "not built");
          this.premiseSays(
            id,
            `${software.name} will not be built. If you change your mind, send it back to any stage.`,
          );
        } else {
          this.enterStage(software, "what", "exists decided");
        }
        break;
      }
      case "what":
        this.enterStage(software, "say-back", "what confirmed");
        break;
      case "say-back": {
        const struck =
          answer.kind === "items" ? answer.items.filter((i) => i.decision === "strike") : [];
        if (struck.length === 0) {
          this.enterStage(software, "plan", "say-back passed");
        } else {
          this.premiseSays(
            id,
            `Struck ${struck.length === 1 ? "1 item" : `${struck.length} items`}. The real line would redo the stage each came from; the stand-in drops them from the record and says back again.`,
          );
          this.enterStage(software, "say-back", "items struck");
        }
        break;
      }
      case "plan":
        if (answer.kind === "approval" && answer.decision === "approve-once") {
          this.enterStage(software, "build", "repository approved");
        } else {
          this.premiseSays(
            id,
            "Nothing was created. premise cannot build without a repository: the request is asked again under Waiting on you. Approve it when you are ready, or send the software back.",
          );
          createAsk(this.db, {
            softwareId: id,
            role: ask.role,
            kind: ask.kind,
            stage: ask.stage,
            title: ask.title,
            instruction: ask.instruction,
            extra: ask.extra,
          });
        }
        break;
    }
  }

  // ---- Record ------------------------------------------------------------------------------

  /** The record as the stand-in keeps it: each stage's latest answered list, with say-back strikes. */
  private recordFiles(softwareId: string): RecordFileView[] {
    const answered = listAsks(this.db, { softwareId, status: "answered" });
    const sayBackStrikes = new Map<string, string>();
    for (const ask of answered.filter((a) => a.kind === "say-back")) {
      if (ask.answer?.kind !== "items") continue;
      for (const item of ask.answer.items) {
        if (item.decision === "strike") {
          sayBackStrikes.set(item.key, item.reason?.trim() || "Struck at say back.");
        }
      }
    }
    const software = getSoftware(this.db, softwareId);
    return RECORD_FILES.map((f) => {
      const latest = [...answered].reverse().find((a) => a.stage === f.stage);
      let items: RecordItemView[] = [];
      if (latest && f.stage === "exists" && latest.answer?.kind === "text") {
        items = [
          {
            id: "E-1",
            text: `Outcome: ${latest.answer.text}`,
            marks: ["from: operator", latest.answered?.slice(0, 10) ?? ""].filter(Boolean),
            status: "live",
          },
          {
            id: "E-2",
            text: "No search was made: the stand-in researcher does not search the web.",
            marks: ["assumed"],
            status: "live",
          },
        ];
      } else if (latest && f.stage === "plan") {
        const approved =
          latest.answer?.kind === "approval" && latest.answer.decision === "approve-once";
        items = [
          {
            id: "D-1",
            text: "The first task is the smallest version that runs.",
            marks: ["assumed"],
            status: "live",
          },
          {
            id: "D-2",
            text: `Code and record live in a private repository named ${repositoryName(software?.name ?? "")}.`,
            marks: [approved ? "approved by operator" : "refused by operator"],
            status: approved ? "live" : "struck",
            ...(!approved && { reason: "Refused at the approval." }),
          },
        ];
      } else if (latest && latest.answer?.kind === "items") {
        items = draftRecordItems(f.prefix, latest, sayBackStrikes);
      }
      return { file: f.file, title: f.title, plain: f.plain, items };
    });
  }

  private sayBackItems(softwareId: string): AskItem[] {
    const out: AskItem[] = [];
    for (const file of this.recordFiles(softwareId)) {
      if (!["why.md", "who.md", "what.md", "exists.md"].includes(file.file)) continue;
      for (const item of file.items) {
        if (item.status !== "live" || out.length >= 10) continue;
        const assumed = item.marks.includes("assumed") || item.marks.includes("suggestion");
        out.push({
          key: item.id,
          text: `${item.id}: ${item.text}`,
          mark: assumed ? "assumed" : "from-role",
          ...(!assumed && { from: OPERATOR }),
        });
      }
    }
    return out;
  }

  async recordView(softwareId: string): Promise<RecordView> {
    this.require(softwareId);
    return { softwareId, source: "stand-in", files: this.recordFiles(softwareId) };
  }

  // ---- Report ------------------------------------------------------------------------------

  async reportView(softwareId: string): Promise<ReportView> {
    const software = this.require(softwareId);
    const reached = stageNumber(software.currentStage) >= stageNumber("report");
    const written = reached
      ? ((
          this.db
            .prepare(
              "SELECT time FROM events WHERE software_id = ? AND kind = 'report-written' ORDER BY id DESC LIMIT 1",
            )
            .get(softwareId) as { time: string } | undefined
        )?.time ?? null)
      : null;
    const decided: ReportLine[] = this.recordFiles(softwareId)
      .flatMap((f) => f.items.filter((i) => i.status === "live").map((i) => ({ i, f })))
      .map(({ i, f }) => ({ text: `${i.id} ${i.text}`, evidence: f.file }));
    const open = listAsks(this.db, { softwareId, status: "open" });
    const needed: ReportLine[] = open.map((a) => ({
      text: `${a.title} (for the ${a.role})`,
    }));
    const jobs = this.options.queue.list().filter((j) => j.softwareId === softwareId);
    const failed: ReportLine[] = jobs
      .filter((j) => j.status === "stuck" || j.status === "failed")
      .map((j) => ({
        text: `${j.kind} (${stageName(j.stage ?? "")}): ${j.result ?? j.status}`,
        evidence: `job ${j.id}`,
      }));
    if (reached && software.state !== "ended") {
      failed.push({
        text: "Nothing was really checked: the stand-in checker checks nothing.",
      });
    }
    const runs = jobs.filter((j) => j.kind === "run" && j.status === "done");
    const usage = await this.options.ledger.softwareUsage(softwareId);
    return {
      softwareId,
      source: "stand-in",
      written,
      sections: [
        { title: "Decided", plain: "What is in the record so far.", lines: decided },
        {
          title: "Running",
          plain: "What runs, and where to open it.",
          lines: runs.length
            ? [
                {
                  text: "The stand-in run finished; nothing was really started.",
                  evidence: `job ${runs.at(-1)!.id}`,
                },
              ]
            : [],
        },
        { title: "Needed", plain: "What is waiting on a person.", lines: needed },
        {
          title: "Failed or not checked",
          plain: "Everything not met, or not checked.",
          lines: failed,
        },
      ],
      running: runs.length
        ? {
            how: "stand-in",
            where:
              "Nothing was really built. With the real line, the link or the command to open it is shown here.",
          }
        : null,
      cost: {
        mocked: usage.mocked,
        text: `${usage.sessions} agent sessions, about $${usage.costUsd.toFixed(2)} at list prices, ${Math.round(usage.weeklyShare * 100)}% of this week's usage.`,
      },
    };
  }
}

/** The stand-in line as the page server's service interfaces. */
export function standInServices(line: StandInLine): {
  softwares: SoftwareService;
  conversation: ConversationService;
  asks: AskService;
  records: RecordService;
  reports: ReportService;
} {
  return {
    softwares: {
      list: () => line.softwareList(),
      get: (id) => line.softwareDetail(id),
      start: (input) => line.startSoftware(input),
      sendBack: (id, stage) => line.sendBack(id, stage),
      setSize: (id, size) => line.setSize(id, size),
    },
    conversation: {
      messages: (id) => line.chatMessages(id),
      say: (id, text) => line.chat(id, text),
    },
    asks: {
      list: (filter) => line.askList(filter),
      answer: (id, answer) => line.answer(id, answer),
    },
    records: { view: (id) => line.recordView(id) },
    reports: { view: (id) => line.reportView(id) },
  };
}

/** Check an answer against its ask, and say plainly what is wrong. Returns a one-line summary. */
export function validateAnswer(ask: Ask, answer: AskAnswer): string {
  const invalid = (why: string): never => {
    throw new ServiceError("INVALID", why);
  };
  if (!answer || typeof answer !== "object") invalid("The answer is empty. Answer again.");
  switch (ask.kind) {
    case "draft":
    case "say-back": {
      if (answer.kind !== "items" || !Array.isArray(answer.items)) {
        return invalid("Answer this list item by item: keep, strike or edit each one.");
      }
      const keys = new Set(ask.items.map((i) => i.key));
      const seen = new Set<string>();
      for (const item of answer.items as ItemAnswer[]) {
        if (!keys.has(item.key))
          invalid("One answer names an item that is not on this list. Reload the page.");
        if (seen.has(item.key)) invalid("One item was answered twice. Reload the page.");
        seen.add(item.key);
        if (!["keep", "strike", "edit"].includes(item.decision))
          invalid("Each item can be kept, struck or edited.");
        if (item.decision === "edit") {
          if (ask.kind === "say-back")
            invalid("A say-back item can only be kept or struck. Say more in chat.");
          if (!item.text?.trim()) invalid("An edited item cannot be empty. Strike it instead.");
        }
      }
      const count = (d: string) => answer.items.filter((i) => i.decision === d).length;
      const kept = ask.items.length - count("strike") - count("edit");
      return `Kept ${kept}, struck ${count("strike")}, edited ${count("edit")}.`;
    }
    case "question":
      if (answer.kind !== "text" || !answer.text?.trim()) {
        return invalid("Write an answer, or pick one of the choices.");
      }
      return `Answered: ${shortIdea(answer.text, 80)}`;
    case "approval":
      if (answer.kind !== "approval" || !["approve-once", "refuse"].includes(answer.decision)) {
        return invalid("Approve once, or refuse.");
      }
      return answer.decision === "approve-once" ? "Approved once." : "Refused.";
    case "needed":
      if (answer.kind !== "needed" || !["done", "cannot"].includes(answer.decision)) {
        return invalid("Mark it done, or say why it cannot be done.");
      }
      return answer.decision === "done" ? "Marked done." : "Cannot be done.";
    case "proposal":
      if (answer.kind !== "proposal" || !["accept", "change"].includes(answer.decision)) {
        return invalid("Accept the proposal, or say what to change.");
      }
      if (answer.decision === "change" && !answer.text?.trim()) {
        return invalid("Say what to change.");
      }
      return answer.decision === "accept" ? "Accepted." : "Asked for changes.";
  }
}

function draftRecordItems(
  prefix: string,
  ask: Ask,
  sayBackStrikes: Map<string, string>,
): RecordItemView[] {
  const answers = new Map(
    (ask.answer?.kind === "items" ? ask.answer.items : []).map((a) => [a.key, a]),
  );
  const date = ask.answered?.slice(0, 10) ?? "";
  return ask.items.map((item, index) => {
    const id = `${prefix}-${index + 1}`;
    const answer = answers.get(item.key);
    const marks = [
      item.mark === "from-role" ? `from: ${item.from ?? OPERATOR}` : item.mark,
      answer?.decision === "edit" ? "edited by operator" : "seen by operator",
      date,
    ].filter(Boolean);
    const text = answer?.decision === "edit" ? answer.text.trim() : item.text;
    if (answer?.decision === "strike") {
      return {
        id,
        text,
        marks,
        status: "struck",
        reason: answer.reason?.trim() || "Struck by the operator.",
      };
    }
    const struckLater = sayBackStrikes.get(id);
    if (struckLater) return { id, text, marks, status: "struck", reason: struckLater };
    return { id, text, marks, status: "live" };
  });
}
