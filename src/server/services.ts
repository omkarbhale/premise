import type {
  ActivityView,
  AskAnswer,
  AskView,
  ChatMessage,
  IntakeItemView,
  IntakeView,
  RecordView,
  ReportView,
  RunView,
  SoftwareDetail,
  SoftwareSummary,
} from "../shared/api-types.js";
import type { SizeClass, StageId } from "../shared/stages.js";

/**
 * What the page server needs from the rest of premise, as small interfaces (docs/specs/page-server.md
 * 2: the server hands actions on; it does not decide what they mean). The line engine (src/line)
 * answers them, with the record keeper and the gate behind it; activity comes from the work queue.
 */

export type ServiceErrorCode = "NOT_FOUND" | "ASK_CLOSED" | "INVALID" | "NAME_TAKEN";

/** A refusal the page can show as it is: the message says what happened and what to do. */
export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface StartSoftwareInput {
  /** What the software is for, in the person's own words. */
  idea: string;
  /** Optional; made from the idea when missing. */
  name?: string;
}

export interface SoftwareService {
  list(): Promise<SoftwareSummary[]>;
  get(id: string): Promise<SoftwareDetail>;
  start(input: StartSoftwareInput): Promise<SoftwareSummary>;
  sendBack(id: string, stage: StageId): Promise<void>;
  setSize(id: string, size: SizeClass): Promise<void>;
  setPriority(id: string, priority: number): Promise<void>;
  /** Stop, or not, after one of the software's milestones until the operator says go on. */
  setMilestoneWait(id: string, milestoneId: string, wait: boolean): Promise<void>;
  /** Withdraw a standing approval for a kind of floor action. */
  withdrawApproval(id: number): Promise<void>;
}

/** The operator's say over one piece of work's sizing (decision 0184). */
export interface WorkItemService {
  setSize(itemId: number, size: SizeClass): Promise<void>;
  setStages(itemId: number, stages: StageId[]): Promise<void>;
  undoSplit(itemId: number): Promise<void>;
  /** The software the piece belongs to. */
  softwareOf(itemId: number): Promise<string>;
}

export interface ChatResult {
  said: ChatMessage;
  /** premise's one-line acknowledgement, such as "Taken as I-3". */
  reply: ChatMessage;
}

export interface ConversationService {
  messages(softwareId: string): Promise<ChatMessage[]>;
  say(softwareId: string, text: string): Promise<ChatResult>;
}

export interface AskService {
  /** Every ask, open ones first; or only one software's. */
  list(filter?: { softwareId?: string; status?: "open" | "answered" }): Promise<AskView[]>;
  answer(id: number, answer: AskAnswer): Promise<AskView>;
}

/** Intake (docs/specs/intake.md): a software's items, the page's report box, and the operator's say. */
export interface IntakeService {
  view(softwareId: string): Promise<IntakeView>;
  /** "Report a problem or a wish" on the page. */
  report(softwareId: string, text: string): Promise<IntakeItemView>;
  /** Take a merged, closed or held item in after all. */
  undo(itemId: number): Promise<IntakeItemView>;
  /** Read the held items together now. */
  readNow(softwareId: string): Promise<IntakeView>;
}

export interface RecordService {
  view(softwareId: string): Promise<RecordView>;
}

export interface ReportService {
  /** The report, always current. With detail, every line; without, the short default. */
  view(softwareId: string, options?: { detail?: boolean }): Promise<ReportView>;
}

/** The software's running copy: what the page shows, and the two things a person can do to it. */
export interface RunService {
  view(softwareId: string): Promise<RunView>;
  /** Start the latest built commit (or start it again). */
  start(softwareId: string): Promise<RunView>;
  stop(softwareId: string): Promise<RunView>;
}

export interface ActivityService {
  view(): Promise<ActivityView>;
  stopJob(id: number): Promise<void>;
}

export interface SessionServices {
  softwares: SoftwareService;
  workItems: WorkItemService;
  conversation: ConversationService;
  asks: AskService;
  records: RecordService;
  intake: IntakeService;
  reports: ReportService;
  /** Absent until the runner is wired in. */
  runs?: RunService;
  activity: ActivityService;
}
