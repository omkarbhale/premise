// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoftwareSummary, SummaryView } from "../src/api";
import { App } from "../src/App";
import { SoftwareView } from "../src/components/SoftwareView";
import { Summary } from "../src/components/Summary";
import { fakeApi, inSession, overview, software } from "./fixtures";

/** The page with several softwares (decision 0197). */

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function summaryOf(
  change: Partial<SoftwareSummary> & { id: string; name: string },
): SoftwareSummary {
  return {
    stage: "build",
    state: "active",
    status: "Agents are working: building.",
    sizeClass: "small",
    priority: 3,
    milestoneWaits: false,
    effort: "medium",
    openAsks: 0,
    created: "2026-11-21T10:00:00Z",
    paused: false,
    archived: false,
    ...change,
  };
}

const THREE = [
  summaryOf({
    id: "a",
    name: "Lending tracker",
    stage: "what",
    status: "Waiting on you: 1 thing to answer.",
    openAsks: 1,
    priority: 1,
  }),
  summaryOf({ id: "b", name: "Meal planner", priority: 3 }),
  summaryOf({
    id: "c",
    name: "Reading notes",
    priority: 5,
    paused: true,
    status: "Paused by you. Nothing new starts for it until you resume it.",
  }),
];

const SUMMARY: SummaryView = {
  headline: "3 softwares, 1 waiting on you, 1 working or running, 1 paused.",
  softwares: [
    {
      id: "a",
      name: "Lending tracker",
      phase: "Deciding what to build: what it must do",
      doing: "Waiting on you: 1 thing to answer.",
      needsYou: "1 thing to answer.",
      priority: 1,
      paused: false,
      runningAt: null,
    },
    {
      id: "b",
      name: "Meal planner",
      phase: "Building: writing the code",
      doing: "Agents are working: building.",
      needsYou: null,
      priority: 3,
      paused: false,
      runningAt: "http://127.0.0.1:4701/",
    },
  ],
  needsYou: [],
  running: [],
  changes: [
    { softwareId: "b", name: "Meal planner", lines: ["A change passed its check and landed."] },
  ],
  since: "2026-11-21T09:00:00Z",
  upTo: 42,
  sessions: { running: 1, max: 2 },
  archived: 1,
};
SUMMARY.needsYou = [SUMMARY.softwares[0]!];
SUMMARY.running = [SUMMARY.softwares[1]!];

describe("several softwares on the page", () => {
  it("lists each software's phase, what it is doing and whether it waits on you, what needs you first", async () => {
    window.location.hash = "#token=t";
    const api = fakeApi({
      overview: vi.fn(() =>
        Promise.resolve(overview({ softwares: THREE, openAsks: 1, archivedSoftwares: 2 })),
      ),
      software: vi.fn((id: string) =>
        Promise.resolve(software({ ...THREE.find((s) => s.id === id)! })),
      ),
    });
    render(<App api={api} />);
    const list = await screen.findByRole("complementary", { name: "Softwares" });
    const picks = within(list).getAllByRole("button", { name: /tracker|planner|notes/ });
    expect(picks.map((p) => p.querySelector(".name")!.textContent)).toEqual([
      "Lending tracker",
      "Meal planner",
      "Reading notes",
    ]);
    expect(within(picks[0]!).getByText("Waiting on you")).toBeTruthy();
    expect(within(picks[1]!).getByText(/Agents are working/)).toBeTruthy();
    expect(within(picks[2]!).getByText("Paused")).toBeTruthy();
    // The archive is out of the way but there.
    expect(within(list).getByText("Archived (2)")).toBeTruthy();
    // With several softwares, the summary is one click away.
    expect(screen.getByRole("button", { name: "Summary" })).toBeTruthy();
  });

  it("keeps your place when the page is refreshed: the software, the view and the tab", async () => {
    const user = userEvent.setup();
    window.location.hash = "#token=t";
    const api = fakeApi({
      overview: vi.fn(() => Promise.resolve(overview({ softwares: THREE }))),
      software: vi.fn((id: string) =>
        Promise.resolve(software({ ...THREE.find((s) => s.id === id)! })),
      ),
      report: vi.fn(() => new Promise<never>(() => {})),
    });
    const first = render(<App api={api} />);
    const list = await screen.findByRole("complementary", { name: "Softwares" });
    await user.click(within(list).getByRole("button", { name: /Meal planner/ }));
    await user.click(await screen.findByRole("tab", { name: "Report" }));
    expect(window.location.hash).toContain("token=t");
    expect(window.location.hash).toContain("software=b");
    expect(window.location.hash).toContain("tab=report");
    first.unmount();

    // A refresh: the same link opens the same place.
    render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "Meal planner" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Report" }).getAttribute("aria-selected")).toBe("true");
    cleanup();

    window.location.hash = "#token=t&view=summary";
    render(<App api={{ ...api, summary: vi.fn(() => Promise.resolve(SUMMARY)) }} />);
    expect(await screen.findByRole("heading", { name: "Summary of every software" })).toBeTruthy();
  });

  it("shows the summary across softwares and marks it seen when you leave it", async () => {
    const api = fakeApi({ summary: vi.fn(() => Promise.resolve(SUMMARY)) });
    const view = inSession(<Summary />, api);
    expect(await screen.findByText(SUMMARY.headline)).toBeTruthy();
    expect(screen.getByText(/not written by an AI/)).toBeTruthy();
    expect(screen.getByText("1 thing to answer.")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /What changed since you last looked/ }),
    ).toBeTruthy();
    expect(screen.getByText("A change passed its check and landed.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "http://127.0.0.1:4701/" })).toBeTruthy();
    expect(screen.getByText(/1 software archived/)).toBeTruthy();
    view.unmount();
    expect(api.summarySeen).toHaveBeenCalledWith(42);
  });

  it("pauses and resumes a software, and archives only after a confirm", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      software: vi.fn(() =>
        Promise.resolve(
          software({ paused: false, archivable: { ok: true, why: "It is paused." } }),
        ),
      ),
      pause: vi.fn(() => Promise.resolve(software({ paused: true }))),
      archive: vi.fn(() => Promise.resolve(software({ archived: true }))),
    });
    inSession(<SoftwareView softwareId="s1" tab="conversation" onTab={() => {}} asks={[]} />, api);
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    expect(api.pause).toHaveBeenCalledWith("s1");
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(api.archive).not.toHaveBeenCalled();
    expect(screen.getByText(/It is kept and can be restored; nothing is deleted/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledWith("s1"));
  });

  it("does not offer to archive a software still being worked on, and says why", async () => {
    const api = fakeApi({
      software: vi.fn(() =>
        Promise.resolve(
          software({
            paused: false,
            archivable: { ok: false, why: "It is still being worked on. Pause it first." },
          }),
        ),
      ),
    });
    inSession(<SoftwareView softwareId="s1" tab="conversation" onTab={() => {}} asks={[]} />, api);
    const archive = await screen.findByRole("button", { name: "Archive" });
    expect((archive as HTMLButtonElement).disabled).toBe(true);
    expect(archive.getAttribute("title")).toMatch(/Pause it first/);
  });

  it("restores an archived software from its page", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      software: vi.fn(() => Promise.resolve(software({ archived: true }))),
      restore: vi.fn(() => Promise.resolve(software({ archived: false }))),
    });
    inSession(<SoftwareView softwareId="s1" tab="conversation" onTab={() => {}} asks={[]} />, api);
    await user.click(await screen.findByRole("button", { name: "Restore it" }));
    expect(api.restore).toHaveBeenCalledWith("s1");
  });
});
