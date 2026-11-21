import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { Api, AskView, Overview, SoftwareDetail } from "../src/api";
import { SessionContext, type Session } from "../src/context";
import { STAGES } from "../../src/shared/stages";

export function overview(change: Partial<Overview> = {}): Overview {
  return {
    version: "0.1.0",
    dataFolder: "/data",
    agents: { mode: "scripted" },
    line: { mode: "stand-in" },
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
    softwareUsage: [],
    openAsks: 0,
    activity: { running: 0, queued: 0, waiting: 0, max: 2, paused: false },
    setup: [],
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
    openAsks: 1,
    created: "2026-11-21T10:00:00Z",
    idea: "A reading list",
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
    chat: vi.fn(() => Promise.resolve([])),
    say: vi.fn(fail),
    record: vi.fn(fail),
    report: vi.fn(fail),
    sendBack: vi.fn(fail),
    setSize: vi.fn(fail),
    asks: vi.fn(() => Promise.resolve([])),
    answer: vi.fn((id: number) => Promise.resolve(ask({ id, status: "answered" }))),
    activity: vi.fn(fail),
    stopJob: vi.fn(fail),
    settings: vi.fn(fail),
    eventsUrl: () => "/api/events?token=t",
    ...change,
  };
}

export function inSession(ui: React.ReactNode, api: Api = fakeApi()) {
  const session: Session = {
    api,
    version: 0,
    notCurrent: vi.fn(),
    report: vi.fn(),
    refresh: vi.fn(),
  };
  return {
    session,
    ...render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>),
  };
}
