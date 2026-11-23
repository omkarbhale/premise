import { render } from "@testing-library/react";
import { vi } from "vitest";
import type {
  Api,
  AskView,
  BudgetView,
  Overview,
  PauseView,
  SoftwareDetail,
  OwnFigures,
  SoftwareUsageView,
  UsageOverview,
  UsageRowView,
  WorkItemView,
} from "../src/api";
import { SessionContext, type Session } from "../src/context";
import { STAGES } from "../../src/shared/stages";

export function overview(change: Partial<Overview> = {}): Overview {
  return {
    version: "0.1.0",
    dataFolder: "/data",
    agents: { mode: "scripted", ready: true, unavailable: null, scriptedDemo: false },
    line: { mode: "engine", standInStages: [] },
    page: { notifications: "offer" },
    usage: {
      mode: "mock-fixed",
      mocked: true,
      weekly: {
        mocked: true,
        utilization: 0.42,
        windowStart: "2026-11-16T00:00:00Z",
        resetsAt: "2026-11-23T00:00:00Z",
      },
    },
    softwares: [],
    defaults: { effort: "medium", priority: 3, milestoneWaits: false },
    roles: [],
    softwareUsage: [],
    openAsks: 0,
    activity: { running: 0, queued: 0, waiting: 0, max: 2, paused: false },
    setup: [],
    ...change,
  };
}

export function pauseView(change: Partial<PauseView> = {}): PauseView {
  return {
    paused: false,
    cause: null,
    mode: null,
    reason: null,
    resumeAt: null,
    pausedAt: null,
    stopping: false,
    stillFinishing: [],
    safeToClose: true,
    runningSoftwares: [],
    headline: "Everything is running.",
    ...change,
  };
}

export function ask(change: Partial<AskView> = {}): AskView {
  return {
    id: 1,
    softwareId: "s1",
    softwareName: "Reading list",
    role: "operator",
    kind: "draft",
    stage: "why",
    title: "Why build it: is this right?",
    instruction: "Strike anything wrong.",
    items: [
      { key: "y1", text: "In your words: a reading list", mark: "from-role", from: "operator" },
      { key: "y2", text: "Doing this by hand takes time.", mark: "assumed" },
      { key: "y3", text: "Size: small.", mark: "assumed" },
    ],
    status: "open",
    asked: "2026-11-21T10:00:00Z",
    ...change,
  };
}

export function software(change: Partial<SoftwareDetail> = {}): SoftwareDetail {
  return {
    id: "s1",
    name: "Reading list",
    stage: "what",
    state: "active",
    status: "Waiting on you: 1 thing to answer.",
    sizeClass: "small",
    priority: 3,
    milestoneWaits: false,
    effort: "medium",
    openAsks: 1,
    created: "2026-11-21T10:00:00Z",
    idea: "A reading list",
    build: null,
    stages: STAGES.map((s, i) => ({
      ...s,
      position: i < 3 ? "done" : i === 3 ? "current" : "ahead",
    })),
    usage: {
      mocked: true,
      sessions: 12,
      inputTokens: 480000,
      outputTokens: 96000,
      costUsd: 8.4,
      weeklyShare: 0.15,
    },
    milestones: [],
    approvals: [],
    claims: [],
    changeQuestions: "when-it-matters",
    budget: { turns: 15, minutes: 10, usedMinutes: 1.5 },
    work: [workItem()],
    wholeCheckStandIn: true,
    ...change,
  };
}

/** A piece of work as the page shows it: by default the software itself, sized by the sizer. */
export function workItem(change: Partial<WorkItemView> = {}): WorkItemView {
  return {
    id: 1,
    parentId: null,
    depth: 0,
    kind: "software",
    origin: "start",
    title: "Reading list",
    words: null,
    state: "working",
    current: true,
    stage: "what",
    sizeClass: "small",
    stages: ["why", "what", "say-back", "plan", "build", "check", "run", "report", "intake"],
    skipped: ["who", "exists"],
    allowedStages: STAGES.map((s) => s.id),
    requiredStages: [
      "why",
      "what",
      "say-back",
      "plan",
      "build",
      "check",
      "run",
      "report",
      "intake",
    ],
    sizing: {
      size: { by: "sizer", reason: "A few screens." },
      stages: { by: "sizer", reason: "It is for you alone, and too personal to exist elsewhere." },
      split: { decision: "whole", by: "sizer", reason: "It is one piece." },
    },
    sized: "2026-11-21T10:00:00Z",
    minutesBeforeBuild: null,
    canChange: true,
    canUndoSplit: false,
    ...change,
  };
}

export function ownFigures(change: Partial<OwnFigures> = {}): OwnFigures {
  return {
    counted: 3,
    missing: 0,
    missingWhy: null,
    costUsd: 0.5,
    inputTokens: 1000,
    outputTokens: 2000,
    cacheTokens: 3000,
    turns: 9,
    unreported: { cost: 0, tokens: 0, turns: 0 },
    ...change,
  };
}

export function usageRow(change: Partial<UsageRowView> = {}): UsageRowView {
  return {
    key: "build",
    label: "Build",
    measured: { sessions: 3, minutes: 12, figures: ownFigures() },
    cost: {
      mocked: true,
      inputTokens: 180000,
      outputTokens: 36000,
      costUsd: 1.44,
      weeklyShare: 0.0144,
    },
    ...change,
  };
}

export function budgetView(change: Partial<BudgetView> = {}): BudgetView {
  return {
    kind: "none",
    percent: null,
    usd: null,
    words: "No budget: premise does not limit what it spends on this software.",
    state: "active",
    spentUsd: 0,
    spentShare: 0,
    mocked: true,
    overrun: null,
    ...change,
  };
}

export function softwareUsage(change: Partial<SoftwareUsageView> = {}): SoftwareUsageView {
  return {
    softwareId: "s1",
    name: "Reading list",
    total: usageRow({ key: "total", label: "All of it" }),
    byPhase: [usageRow({ key: "build", label: "Build" })],
    byStage: [
      usageRow({ key: "build", label: "Build" }),
      usageRow({
        key: "check",
        label: "Check",
        measured: { sessions: 1, minutes: 2, figures: ownFigures({ counted: 1 }) },
      }),
    ],
    byChange: [usageRow({ key: "1", label: "Reading list, from the idea" })],
    byItem: [usageRow({ key: "W-1", label: "W-1" })],
    budget: budgetView(),
    problem: null,
    ...change,
  };
}

export function usageOverview(change: Partial<UsageOverview> = {}): UsageOverview {
  return {
    mode: "mock-fixed",
    mocked: true,
    ownWindow: null,
    weekly: {
      mocked: true,
      utilization: 0.42,
      windowStart: "2026-11-16T00:00:00Z",
      resetsAt: "2026-11-23T00:00:00Z",
    },
    softwares: [softwareUsage()],
    ...change,
  };
}

/** An Api whose every call is a mock; tests set what they need. */
export function fakeApi(change: Partial<Api> = {}): Api {
  const fail = () => Promise.reject(new Error("not set in this test"));
  return {
    overview: vi.fn(() => Promise.resolve(overview())),
    softwares: vi.fn(() => Promise.resolve([])),
    software: vi.fn(() => Promise.resolve(software())),
    start: vi.fn(fail),
    bringIn: vi.fn(fail),
    offerRecord: vi.fn(fail),
    chat: vi.fn(() => Promise.resolve([])),
    say: vi.fn(fail),
    record: vi.fn(fail),
    report: vi.fn(fail),
    intake: vi.fn(fail),
    reportIntake: vi.fn(fail),
    undoIntake: vi.fn(fail),
    readHeldNow: vi.fn(fail),
    decideLine: vi.fn(fail),
    backToWhy: vi.fn(fail),
    newFeedbackLink: vi.fn(fail),
    readIssuesNow: vi.fn(fail),
    run: vi.fn(fail),
    startRun: vi.fn(fail),
    stopRun: vi.fn(fail),
    pauseEverything: vi.fn(fail),
    resumeEverything: vi.fn(fail),
    sendBack: vi.fn(fail),
    setSize: vi.fn(fail),
    setItemSize: vi.fn(fail),
    setItemStages: vi.fn(fail),
    undoSplit: vi.fn(fail),
    setPriority: vi.fn(fail),
    setEffort: vi.fn(fail),
    setChangeQuestions: vi.fn(fail),
    pause: vi.fn(fail),
    resume: vi.fn(fail),
    archive: vi.fn(fail),
    restore: vi.fn(fail),
    summary: vi.fn(fail),
    summarySeen: vi.fn(() => Promise.resolve({ ok: true as const })),
    setMilestoneWait: vi.fn(fail),
    withdrawApproval: vi.fn(fail),
    claim: vi.fn(fail),
    releaseClaim: vi.fn(fail),
    scriptedDemo: vi.fn(fail),
    asks: vi.fn(() => Promise.resolve([])),
    answer: vi.fn((id: number) => Promise.resolve(ask({ id, status: "answered" }))),
    addSuggestion: vi.fn(fail),
    activity: vi.fn(fail),
    stopJob: vi.fn(fail),
    settings: vi.fn(fail),
    usage: vi.fn(() => Promise.resolve(usageOverview())),
    softwareUsage: vi.fn(() => Promise.resolve(softwareUsage())),
    setBudget: vi.fn(fail),
    answerOverrun: vi.fn(fail),
    measures: vi.fn(fail),
    softwareMeasures: vi.fn(fail),
    presence: vi.fn(() => Promise.resolve({ ok: true as const })),
    shown: vi.fn(() => Promise.resolve({ ok: true as const })),
    learning: vi.fn(fail),
    editLesson: vi.fn(fail),
    deleteLesson: vi.fn(fail),
    moveCorrection: vi.fn(fail),
    deleteImprovement: vi.fn(fail),
    improvementsText: vi.fn(fail),
    eventsUrl: () => "/api/events?token=t",
    ...change,
  };
}

export function inSession(
  ui: React.ReactNode,
  api: Api = fakeApi(),
  change: Partial<Session> = {},
) {
  const session: Session = {
    api,
    version: 0,
    notCurrent: vi.fn(),
    report: vi.fn(),
    refresh: vi.fn(),
    explained: new Set<string>(),
    ...change,
  };
  return {
    session,
    ...render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>),
  };
}
