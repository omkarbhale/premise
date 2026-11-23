import type {
  ActivityView,
  PauseView,
  AskAnswer,
  AskView,
  ChatMessage,
  ClaimView,
  FeedbackStanding,
  IntakeItemView,
  IntakeView,
  RecordView,
  ReportView,
  RunView,
  SoftwareDetail,
  SoftwareSummary,
  SummaryView,
} from "../shared/api-types.js";
import type { SizeClass, SoftwareEffort, StageId } from "../shared/stages.js";

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
  /** How much effort it gets; the configured default when missing (decision 0191). */
  effort?: SoftwareEffort;
}

/** Bring in software that already exists (decision 0189). */
export interface BringInInput {
  /** A folder on this machine, or a clone address. */
  source: string;
  name?: string;
  /** What the operator says it is for, in their own words; optional. */
  idea?: string;
}

export interface SoftwareService {
  /** The main list, or with archived: true only the archived softwares. Needs-you first. */
  list(options?: { archived?: boolean }): Promise<SoftwareSummary[]>;
  get(id: string): Promise<SoftwareDetail>;
  start(input: StartSoftwareInput): Promise<SoftwareSummary>;
  /** Take on a software that already exists, from a folder or a clone address. */
  bringIn(input: BringInInput): Promise<SoftwareSummary>;
  /** Offer again to add an existing software's record to its repository, through the gate. */
  offerRecord(id: string): Promise<void>;
  sendBack(id: string, stage: StageId): Promise<void>;
  setSize(id: string, size: SizeClass): Promise<void>;
  setPriority(id: string, priority: number): Promise<void>;
  /** How much effort it gets: low, medium or high (decision 0191). */
  setEffort(id: string, effort: SoftwareEffort): Promise<void>;
  /** When premise asks about this software's changes before building them (decision 0274). */
  setChangeQuestions(id: string, value: string): Promise<void>;
  /** Stop, or not, after one of the software's milestones until the operator says go on. */
  setMilestoneWait(id: string, milestoneId: string, wait: boolean): Promise<void>;
  /** Withdraw a standing approval for a kind of floor action. */
  withdrawApproval(id: number): Promise<void>;
  /** Claim an area of a software for a role's taste (decision 0102). */
  claim(id: string, input: { area: string; role?: string }): Promise<ClaimView>;
  /** Release a claim: premise decides the area itself again. */
  releaseClaim(claimId: number): Promise<ClaimView>;
  /** Pause a software: nothing new starts for it, its sessions free up; its asks stay answerable. */
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  /** Archive a finished or abandoned software: kept, hidden, restorable; never deleted. */
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** The short summary across every software (decision 0197). */
export interface SummaryService {
  view(): Promise<SummaryView>;
  /** You looked at the summary up to this event. */
  markSeen(upTo: number): Promise<void>;
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
  /** Add one of premise's suggestions for a change: it comes in as a change of its own. */
  addSuggestion(id: number, key: string): Promise<AskView>;
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
  /** Turn a line of a reading's short list into work, keep its items held, or close them. */
  decideLine(
    readingId: number,
    input: {
      list: "wanted" | "recurring";
      index: number;
      choice: "work" | "keep" | "close";
      reason?: string;
    },
  ): Promise<IntakeView>;
  /** Go back to Why, after a reading says people may not want the software. */
  backToWhy(readingId: number): Promise<IntakeView>;
  /** Replace the software's feedback link; the old one stops working. */
  newFeedbackLink(softwareId: string): Promise<IntakeView>;
  /** Read the software's GitHub issues now. */
  readIssuesNow(softwareId: string): Promise<IntakeView>;
  /** Triage again the items that went in untriaged, whose work has not started. */
  triageAgain(softwareId: string): Promise<IntakeView>;
}

/** The feedback page: reached by its own link, with no session behind it (decision 0119). */
export interface FeedbackService {
  /** What the page says, or null when the link does not work. */
  page(token: string): { softwareName: string; limit: number } | null;
  /** Take feedback in; the receipt opens where it stands. */
  submit(token: string, text: string): { receipt: string };
  /** Where the item behind a receipt stands; null when the receipt or the link is not right. */
  standing(token: string, receipt: string): FeedbackStanding | null;
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

/** Pausing and resuming the whole of premise (decision 0290). */
export interface PauseService {
  view(): Promise<PauseView>;
  /** Pause everything: let what is running finish, or stop it now (its jobs are redone later). */
  pause(mode: "finish" | "stop-now"): Promise<PauseView>;
  resume(): Promise<PauseView>;
}

export interface SessionServices {
  /** Absent in tests that build services by hand. */
  pausing?: PauseService;
  softwares: SoftwareService;
  /** Role labels in use besides the operator; empty when only the operator is asked anything. */
  roles(): string[];
  workItems: WorkItemService;
  conversation: ConversationService;
  asks: AskService;
  records: RecordService;
  intake: IntakeService;
  reports: ReportService;
  /** Absent until the runner is wired in. */
  runs?: RunService;
  activity: ActivityService;
  summary: SummaryService;
}
