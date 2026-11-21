import type {
  ActivityView,
  AskAnswer,
  AskView,
  ChatMessage,
  IntakeItemView,
  IntakeView,
  LearningDestination,
  LearningView,
  MeasuresOverview,
  BudgetInput,
  BudgetView,
  OverrunAnswerInput,
  SoftwareUsageView,
  UsageOverview,
  MeasuresView,
  Overview,
  RecordView,
  ReportView,
  RunView,
  SettingsView,
  ClaimView,
  SoftwareDetail,
  SoftwareSummary,
  SummaryView,
} from "../../src/shared/api-types";
import type { SizeClass, SoftwareEffort, StageId } from "../../src/shared/stages";

export type * from "../../src/shared/api-types";

/** The session token lives in the link's #token=… part: never sent to other sites, never stored. */
export function sessionToken(): string | null {
  const match = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** The link is missing, old, or premise was given a new one. */
export class NotCurrentLink extends Error {}

/** premise refused or failed a request; the message says what to do, in plain words. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const NOT_ANSWERING =
  "premise is not answering. Check that it is still running in its terminal (start it with `npm start`), then try again.";

export interface Api {
  overview(): Promise<Overview>;
  /** The main list, or with archived: true only the archived softwares. */
  softwares(archived?: boolean): Promise<SoftwareSummary[]>;
  software(id: string): Promise<SoftwareDetail>;
  start(idea: string, name?: string, effort?: SoftwareEffort): Promise<SoftwareSummary>;
  bringIn(source: string, name?: string, idea?: string): Promise<SoftwareSummary>;
  offerRecord(id: string): Promise<SoftwareDetail>;
  chat(id: string): Promise<ChatMessage[]>;
  say(id: string, text: string): Promise<{ said: ChatMessage; reply: ChatMessage }>;
  record(id: string): Promise<RecordView>;
  report(id: string, detail?: boolean): Promise<ReportView>;
  intake(id: string): Promise<IntakeView>;
  reportIntake(id: string, text: string): Promise<IntakeItemView>;
  undoIntake(itemId: number): Promise<IntakeItemView>;
  readHeldNow(id: string): Promise<IntakeView>;
  run(id: string): Promise<RunView>;
  startRun(id: string): Promise<RunView>;
  stopRun(id: string): Promise<RunView>;
  sendBack(id: string, stage: StageId): Promise<SoftwareDetail>;
  setSize(id: string, size: SizeClass): Promise<SoftwareDetail>;
  setItemSize(itemId: number, size: SizeClass): Promise<SoftwareDetail>;
  setItemStages(itemId: number, stages: StageId[]): Promise<SoftwareDetail>;
  undoSplit(itemId: number): Promise<SoftwareDetail>;
  setPriority(id: string, priority: number): Promise<SoftwareDetail>;
  setEffort(id: string, effort: SoftwareEffort): Promise<SoftwareDetail>;
  pause(id: string): Promise<SoftwareDetail>;
  resume(id: string): Promise<SoftwareDetail>;
  archive(id: string): Promise<SoftwareDetail>;
  restore(id: string): Promise<SoftwareDetail>;
  /** The short summary across every software. */
  summary(): Promise<SummaryView>;
  summarySeen(upTo: number): Promise<{ ok: true }>;
  setMilestoneWait(id: string, milestone: string, wait: boolean): Promise<SoftwareDetail>;
  withdrawApproval(id: number): Promise<{ ok: true }>;
  claim(id: string, area: string, role?: string): Promise<ClaimView>;
  releaseClaim(id: number): Promise<ClaimView>;
  scriptedDemo(): Promise<{ ok: true }>;
  asks(filter?: { software?: string; status?: "open" | "answered" }): Promise<AskView[]>;
  answer(id: number, answer: AskAnswer): Promise<AskView>;
  activity(): Promise<ActivityView>;
  stopJob(id: number): Promise<ActivityView>;
  settings(): Promise<SettingsView>;
  /** Usage per software, with budgets: figures from usage-ledger (mocked until it exists). */
  usage(): Promise<UsageOverview>;
  softwareUsage(id: string): Promise<SoftwareUsageView>;
  setBudget(id: string, budget: BudgetInput): Promise<BudgetView>;
  answerOverrun(id: string, answer: OverrunAnswerInput): Promise<BudgetView>;
  /** premise's own return: every software together, then each one. */
  measures(): Promise<MeasuresOverview>;
  softwareMeasures(id: string): Promise<MeasuresView>;
  /** The page is (or is no longer) in front of someone; counts attention. Never wakes other pages. */
  presence(visible: boolean): Promise<{ ok: true }>;
  /** A question was shown on the page; the first time counts. */
  shown(askId: number): Promise<{ ok: true }>;
  /** What premise learned from corrections; for one software, or for all when none is given. */
  learning(softwareId?: string): Promise<LearningView>;
  editLesson(id: number, text: string): Promise<{ ok: true }>;
  deleteLesson(id: number): Promise<{ ok: true }>;
  moveCorrection(id: number, destination: LearningDestination): Promise<{ ok: true }>;
  deleteImprovement(topic: string): Promise<{ ok: true }>;
  /** The improvements for premise, as the text of a file to save. */
  improvementsText(): Promise<string>;
  eventsUrl(): string;
}

export function createApi(token: string): Api {
  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    as: "json" | "text" = "json",
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers: {
          "x-premise-token": token,
          ...(body !== undefined && { "content-type": "application/json" }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError(0, NOT_ANSWERING);
    }
    if (response.status === 401) throw new NotCurrentLink();
    const text = await response.text();
    if (as === "text" && response.ok) return text as T;
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = parsed as { error?: string; code?: string } | null;
      throw new ApiError(
        response.status,
        error?.error ?? `premise answered with an error (${response.status}). Try again.`,
        error?.code,
      );
    }
    return parsed as T;
  }
  const get = <T>(path: string) => request<T>("GET", path);
  const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
  const enc = encodeURIComponent;
  return {
    overview: () => get("/api/overview"),
    softwares: (archived) => get(`/api/softwares${archived ? "?archived=1" : ""}`),
    software: (id) => get(`/api/softwares/${enc(id)}`),
    start: (idea, name, effort) =>
      post("/api/softwares", { idea, ...(name && { name }), ...(effort && { effort }) }),
    bringIn: (source, name, idea) =>
      post("/api/softwares/existing", {
        source,
        ...(name ? { name } : {}),
        ...(idea ? { idea } : {}),
      }),
    offerRecord: (id) => post(`/api/softwares/${enc(id)}/existing/offer-record`),
    chat: (id) => get(`/api/softwares/${enc(id)}/chat`),
    say: (id, text) => post(`/api/softwares/${enc(id)}/chat`, { text }),
    record: (id) => get(`/api/softwares/${enc(id)}/record`),
    report: (id, detail = false) =>
      get(`/api/softwares/${enc(id)}/report${detail ? "?detail=1" : ""}`),
    intake: (id) => get(`/api/softwares/${enc(id)}/intake`),
    reportIntake: (id, text) => post(`/api/softwares/${enc(id)}/intake`, { text }),
    undoIntake: (itemId) => post(`/api/intake/${itemId}/undo`),
    readHeldNow: (id) => post(`/api/softwares/${enc(id)}/intake/read-now`),
    run: (id) => get(`/api/softwares/${enc(id)}/run`),
    startRun: (id) => post(`/api/softwares/${enc(id)}/run/start`),
    stopRun: (id) => post(`/api/softwares/${enc(id)}/run/stop`),
    sendBack: (id, stage) => post(`/api/softwares/${enc(id)}/send-back`, { stage }),
    setSize: (id, size) => post(`/api/softwares/${enc(id)}/size`, { size }),
    setItemSize: (itemId, size) => post(`/api/work-items/${itemId}/size`, { size }),
    setItemStages: (itemId, stages) => post(`/api/work-items/${itemId}/stages`, { stages }),
    undoSplit: (itemId) => post(`/api/work-items/${itemId}/undo-split`),
    setPriority: (id, priority) => post(`/api/softwares/${enc(id)}/priority`, { priority }),
    setEffort: (id, effort) => post(`/api/softwares/${enc(id)}/effort`, { effort }),
    pause: (id) => post(`/api/softwares/${enc(id)}/pause`),
    resume: (id) => post(`/api/softwares/${enc(id)}/resume`),
    archive: (id) => post(`/api/softwares/${enc(id)}/archive`),
    restore: (id) => post(`/api/softwares/${enc(id)}/restore`),
    summary: () => get("/api/summary"),
    summarySeen: (upTo) => post("/api/summary/seen", { upTo }),
    setMilestoneWait: (id, milestone, wait) =>
      post(`/api/softwares/${enc(id)}/milestones/${enc(milestone)}/wait`, { wait }),
    withdrawApproval: (id) => post(`/api/approvals/${id}/withdraw`),
    claim: (id, area, role) =>
      post(`/api/softwares/${encodeURIComponent(id)}/claims`, {
        area,
        ...(role?.trim() && { role: role.trim() }),
      }),
    releaseClaim: (id) => post(`/api/claims/${id}/release`),
    scriptedDemo: () => post("/api/agents/scripted-demo"),
    asks: (filter = {}) => {
      const query = new URLSearchParams();
      if (filter.software) query.set("software", filter.software);
      if (filter.status) query.set("status", filter.status);
      const qs = query.toString();
      return get(`/api/asks${qs ? `?${qs}` : ""}`);
    },
    answer: (id, answer) => post(`/api/asks/${id}/answer`, { answer }),
    activity: () => get("/api/activity"),
    stopJob: (id) => post(`/api/jobs/${id}/stop`),
    settings: () => get("/api/settings"),
    usage: () => get("/api/usage"),
    softwareUsage: (id) => get(`/api/softwares/${enc(id)}/usage`),
    setBudget: (id, budget) => post(`/api/softwares/${enc(id)}/budget`, budget),
    answerOverrun: (id, answer) => post(`/api/softwares/${enc(id)}/budget/answer`, answer),
    measures: () => get("/api/measures"),
    softwareMeasures: (id) => get(`/api/softwares/${enc(id)}/measures`),
    presence: (visible) => post("/api/presence", { visible }),
    shown: (askId) => post(`/api/asks/${askId}/shown`),
    learning: (softwareId) =>
      get(`/api/learning${softwareId ? `?software=${enc(softwareId)}` : ""}`),
    editLesson: (id, text) => post(`/api/lessons/${id}/edit`, { text }),
    deleteLesson: (id) => post(`/api/lessons/${id}/delete`),
    moveCorrection: (id, destination) => post(`/api/corrections/${id}/move`, { destination }),
    deleteImprovement: (topic) => post("/api/improvements/delete", { topic }),
    improvementsText: () => request("GET", "/api/improvements.txt", undefined, "text"),
    eventsUrl: () => `/api/events?token=${enc(token)}`,
  };
}
