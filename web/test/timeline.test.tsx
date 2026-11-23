// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { Activity } from "../src/components/Activity";
import { Timeline } from "../src/components/Timeline";
import type { TimelineEntry } from "../src/api";
import {
  NO_HISTORY,
  fakeApi,
  inSession,
  overview,
  software,
  timeline,
  timelineEntry,
} from "./fixtures";

/** The timeline of the line (decisions 0320, 0321): each entry state as the page shows it. */

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const building = timelineEntry({
  key: "w2",
  kind: "milestone",
  title: "Milestone 1: the arena and moving",
  step: "Build, task 3 of 7: bots peek corners",
  who: [
    {
      role: "builder",
      status: "running",
      since: "2026-11-24T10:00:00Z",
      progress: "Writing the corner check",
    },
  ],
  steps: [
    {
      text: "Build: 7 tasks",
      mark: "running",
      tasks: [
        { text: "The arena", mark: "done" },
        { text: "Moving", mark: "done" },
        { text: "Bots peek corners", mark: "running" },
        { text: "Shooting", mark: "todo" },
      ],
    },
    { text: "Check against what you asked for", mark: "todo" },
  ],
});

function queued(n: number, change: Partial<TimelineEntry> = {}): TimelineEntry {
  return timelineEntry({
    key: `w${10 + n}`,
    kind: "change",
    title: `Your change I-${n}: change ${n}`,
    ref: `I-${n}`,
    state: "queued",
    step: null,
    place: n,
    why: `${n}th in line, after the work before it: one change at a time.`,
    startsWhen: "Starts when the work before it is done.",
    estimate: {
      wait: { ...NO_HISTORY, words: "not enough history yet to say when it starts" },
      work: NO_HISTORY,
    },
    queue: {
      workItemId: 10 + n,
      priority: "normal",
      canMoveUp: n > 1,
      canMoveDown: true,
      together: [],
      canSplit: false,
      placement: null,
    },
    ...change,
  });
}

describe("the timeline", () => {
  it("shows the running piece expanded: its step, who works on it, and a checklist", () => {
    inSession(<Timeline timeline={timeline({ now: [building] })} onAnswer={vi.fn()} />);
    const entry = screen.getByRole("listitem", { name: "Milestone 1: the arena and moving" });
    expect(within(entry).getByText("Running now")).toBeTruthy();
    expect(within(entry).getByText("Build, task 3 of 7: bots peek corners")).toBeTruthy();
    expect(within(entry).getByText(/The builder is working/)).toBeTruthy();
    expect(within(entry).getByText(/Writing the corner check/)).toBeTruthy();
    const tasks = within(entry).getByRole("list", { name: "Tasks of Build: 7 tasks" });
    expect(within(tasks).getAllByRole("listitem")).toHaveLength(4);
    expect(within(tasks).getAllByText("done:")).toHaveLength(2);
    expect(within(tasks).getByText("running now:")).toBeTruthy();
    expect(within(tasks).getByText("to do:")).toBeTruthy();
  });

  it("keeps finished work collapsed, with how it ended", () => {
    inSession(
      <Timeline
        timeline={timeline({
          done: [
            timelineEntry({
              key: "understand",
              state: "done",
              step: null,
              outcome: "Done: what you want is in the record, with the plan.",
            }),
          ],
          now: [building],
        })}
        onAnswer={vi.fn()}
      />,
    );
    const done = screen.getByText("1 piece done").closest("details")!;
    expect(done.open).toBe(false);
    expect(within(done).getByText(/what you want is in the record/)).toBeTruthy();
  });

  it("shows a question where the work waits for it, with a link to answer it", async () => {
    const onAnswer = vi.fn();
    const waiting = timelineEntry({
      ...building,
      state: "waiting-on-you",
      step: "Stopped after this milestone: try it, then say go on",
      asks: [{ id: 7, title: "Milestone reached: the arena. Go on?", notice: false }],
    });
    inSession(<Timeline timeline={timeline({ now: [waiting] })} onAnswer={onAnswer} />);
    const entry = screen.getByRole("listitem", { name: waiting.title });
    expect(within(entry).getByText("Waiting on you")).toBeTruthy();
    expect(within(entry).getByText(/Milestone reached: the arena. Go on\?/)).toBeTruthy();
    await userEvent.click(within(entry).getByRole("button", { name: "Answer it" }));
    expect(onAnswer).toHaveBeenCalledWith(7);
  });

  it("shows each queued piece's place, why it waits, what starts it and a rough estimate", () => {
    const waitsForGoOn = timelineEntry({
      key: "w3",
      kind: "milestone",
      title: "Milestone 2: bots",
      state: "queued",
      step: null,
      why: "Waits for you to say go on after milestone 1: the arena and moving.",
      startsWhen: "Starts when you say go on.",
    });
    const change = queued(1, {
      estimate: {
        wait: { enough: true, minutes: 120, sessions: 6, words: "starts in about 2 hours" },
        work: {
          enough: true,
          minutes: 30,
          sessions: 2,
          words: "about 30 minutes, 2 agent sessions",
        },
      },
    });
    inSession(
      <Timeline
        timeline={timeline({ now: [building], next: [waitsForGoOn, change] })}
        onAnswer={vi.fn()}
      />,
    );
    const milestone = screen.getByRole("listitem", { name: "Milestone 2: bots" });
    expect(
      within(milestone).getByText(/Waits for you to say go on after milestone 1/),
    ).toBeTruthy();
    expect(within(milestone).getByText("Starts when you say go on.")).toBeTruthy();
    const queuedChange = screen.getByRole("listitem", { name: change.title });
    expect(within(queuedChange).getByText("1st in line")).toBeTruthy();
    expect(
      within(queuedChange).getByText(
        /starts in about 2 hours; its own work, about 30 minutes, 2 agent sessions/,
      ),
    ).toBeTruthy();
    expect(within(queuedChange).getByText(/Rough estimate/)).toBeTruthy();
  });

  it("says when there is not enough history for an estimate", () => {
    inSession(<Timeline timeline={timeline({ next: [queued(2)] })} onAnswer={vi.fn()} />);
    expect(
      screen.getByText(
        /not enough history yet to say when it starts; its own work, not enough history yet/,
      ),
    ).toBeTruthy();
  });

  it("shows an item being read, before it is on the line", () => {
    const reading = timelineEntry({
      key: "i4",
      kind: "intake",
      title: "I-4: the HUD is too small",
      ref: "I-4",
      state: "being-read",
      step: null,
      why: "Being read: an agent is working out what it is and what it touches.",
      startsWhen: "Joins the queue once it is read, in its turn.",
    });
    inSession(<Timeline timeline={timeline({ next: [reading] })} onAnswer={vi.fn()} />);
    const entry = screen.getByRole("listitem", { name: reading.title });
    expect(within(entry).getByText("Being read")).toBeTruthy();
    expect(within(entry).getByText(/Joins the queue once it is read/)).toBeTruthy();
  });

  it("lets the person move a queued change and set its priority", async () => {
    const api = fakeApi({
      moveQueued: vi.fn(() => Promise.resolve(software())),
      setQueuedPriority: vi.fn(() => Promise.resolve(software())),
    });
    const { session } = inSession(
      <Timeline timeline={timeline({ next: [queued(1), queued(2)] })} onAnswer={vi.fn()} />,
      api,
    );
    expect(
      (screen.getByRole("button", { name: "Move I-1 up" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Move I-2 up" }));
    expect(api.moveQueued).toHaveBeenCalledWith(12, "up");
    const second = screen.getByRole("listitem", { name: "Your change I-2: change 2" });
    await userEvent.selectOptions(within(second).getByLabelText("Priority"), "first");
    expect(api.setQueuedPriority).toHaveBeenCalledWith(12, "first");
    await waitFor(() => expect(session.refresh).toHaveBeenCalled());
  });

  it("shows only the first few queued pieces until asked for all", async () => {
    const next = [1, 2, 3, 4, 5, 6].map((n) => queued(n));
    inSession(<Timeline timeline={timeline({ next })} onAnswer={vi.fn()} />);
    expect(screen.queryByRole("listitem", { name: "Your change I-6: change 6" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show all 6 queued" }));
    expect(screen.getByRole("listitem", { name: "Your change I-6: change 6" })).toBeTruthy();
  });

  it("proposes related changes as one, to accept or keep apart", async () => {
    const api = fakeApi({ decideGroup: vi.fn(() => Promise.resolve(software())) });
    inSession(
      <Timeline
        timeline={timeline({
          next: [queued(1), queued(2)],
          groups: [{ workItemIds: [11, 12], refs: ["I-1", "I-2"], about: "the HUD" }],
        })}
        onAnswer={vi.fn()}
      />,
      api,
    );
    expect(screen.getByText("2 changes are about the HUD.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Make them one change" }));
    expect(api.decideGroup).toHaveBeenCalledWith("s1", [11, 12], true);
    await userEvent.click(screen.getByRole("button", { name: "Keep them apart" }));
    expect(api.decideGroup).toHaveBeenCalledWith("s1", [11, 12], false);
  });

  it("lets a change made of several be split again", async () => {
    const api = fakeApi({ splitChange: vi.fn(() => Promise.resolve(software())) });
    const together = queued(1, {
      queue: {
        workItemId: 11,
        priority: "normal",
        canMoveUp: false,
        canMoveDown: false,
        together: ["I-1", "I-3"],
        canSplit: true,
        placement: null,
      },
    });
    inSession(<Timeline timeline={timeline({ next: [together] })} onAnswer={vi.fn()} />, api);
    expect(screen.getByText(/One change made of I-1, I-3/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Split it again" }));
    expect(api.splitChange).toHaveBeenCalledWith(11);
  });

  it("says once when the queue is long, and offers what to do about it", async () => {
    const api = fakeApi({ answerQueueNotice: vi.fn(() => Promise.resolve(software())) });
    const show = vi.fn();
    inSession(
      <Timeline
        timeline={timeline({
          notice: {
            items: 9,
            total: NO_HISTORY,
            holdCount: 4,
            words: "9 changes are waiting for Arena, one after another.",
          },
        })}
        onAnswer={vi.fn()}
      />,
      api,
      { show },
    );
    expect(screen.getByText(/9 changes are waiting for Arena/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Raise its budget" }));
    expect(api.answerQueueNotice).toHaveBeenCalledWith("s1", "budget");
    await waitFor(() => expect(show).toHaveBeenCalledWith("usage"));
    await userEvent.click(screen.getByRole("button", { name: "Hold the 4 lowest-value ones" }));
    expect(api.answerQueueNotice).toHaveBeenCalledWith("s1", "hold");
  });
});

describe("the order around milestones", () => {
  it("shows whether premise stops after a milestone, and lets the person change it", async () => {
    const api = fakeApi({ setMilestoneWait: vi.fn(() => Promise.resolve(software())) });
    const m2 = timelineEntry({
      key: "w3",
      kind: "milestone",
      title: "Milestone 2: bots",
      state: "queued",
      step: null,
      milestone: { id: "M-2", wait: false },
    });
    inSession(<Timeline timeline={timeline({ next: [m2] })} onAnswer={vi.fn()} />, api);
    const entry = screen.getByRole("listitem", { name: "Milestone 2: bots" });
    expect(within(entry).getByText("Goes straight on after it")).toBeTruthy();
    await userEvent.click(
      within(entry).getByRole("button", { name: "Stop after it until I say go on" }),
    );
    expect(api.setMilestoneWait).toHaveBeenCalledWith("s1", "M-2", true);
  });

  it("says why a change goes before the milestones, and lets the person put it after", async () => {
    const api = fakeApi({ setPlacement: vi.fn(() => Promise.resolve(software())) });
    const bug = queued(1, {
      title: "Your fix I-1: shields too strong",
      why: "1st in line, after milestone 1. It is feedback on what has already landed, so it goes before the milestones not started yet.",
      queue: {
        workItemId: 11,
        priority: "normal",
        canMoveUp: false,
        canMoveDown: true,
        together: [],
        canSplit: false,
        placement: { before: true, by: "feedback" },
      },
    });
    inSession(<Timeline timeline={timeline({ next: [bug] })} onAnswer={vi.fn()} />, api);
    expect(screen.getByText(/feedback on what has already landed/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Do it after the milestones" }));
    expect(api.setPlacement).toHaveBeenCalledWith(11, false);
  });

  it("proposes building a change as part of a milestone that changes the same parts", async () => {
    const api = fakeApi({ decideOverlap: vi.fn(() => Promise.resolve(software())) });
    inSession(
      <Timeline
        timeline={timeline({
          overlaps: [
            {
              milestoneItemId: 3,
              milestoneTitle: "Milestone 2: sounds and the HUD",
              workItemId: 12,
              ref: "I-2",
              about: "the crosshair",
            },
          ],
        })}
        onAnswer={vi.fn()}
      />,
      api,
    );
    expect(
      screen.getByText(/I-2 and milestone 2: sounds and the HUD both change the crosshair/),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Build it as part of the milestone" }),
    );
    expect(api.decideOverlap).toHaveBeenCalledWith("s1", 3, 12, true);
    await userEvent.click(screen.getByRole("button", { name: "Keep them apart" }));
    expect(api.decideOverlap).toHaveBeenCalledWith("s1", 3, 12, false);
  });
});

describe("the timeline elsewhere", () => {
  it("is on each software's page", async () => {
    const api = fakeApi({
      overview: vi.fn(() =>
        Promise.resolve(overview({ softwares: [software({ openAsks: 0 })], openAsks: 0 })),
      ),
      software: vi.fn(() =>
        Promise.resolve(software({ openAsks: 0, timeline: timeline({ now: [building] }) })),
      ),
    });
    window.location.hash = "#token=t";
    const { render } = await import("@testing-library/react");
    render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeTruthy();
    expect(screen.getByText("Build, task 3 of 7: bots peek corners")).toBeTruthy();
  });

  it("shows each software's now and next in the list, with its queue", async () => {
    const api = fakeApi({
      overview: vi.fn(() =>
        Promise.resolve(
          overview({
            softwares: [
              software({
                openAsks: 0,
                glance: {
                  now: "Milestone 1: the arena: build, task 3 of 7",
                  next: "Milestone 2: bots (waits for you)",
                  queue: 3,
                  total: "about 2 hours, 6 agent sessions",
                },
              }),
            ],
          }),
        ),
      ),
    });
    window.location.hash = "#token=t";
    const { render } = await import("@testing-library/react");
    render(<App api={api} />);
    const list = await screen.findByRole("complementary", { name: "Softwares" });
    expect(within(list).getByText("Milestone 1: the arena: build, task 3 of 7")).toBeTruthy();
    expect(within(list).getByText("Next: Milestone 2: bots (waits for you)")).toBeTruthy();
    expect(
      within(list).getByText(
        /3 changes queued, about 2 hours, 6 agent sessions \(rough estimate\)/,
      ),
    ).toBeTruthy();
  });

  it("gives Activity one line per software: what runs and what is next up", async () => {
    const api = fakeApi({
      activity: vi.fn(() =>
        Promise.resolve({
          maxAgentSessions: 2,
          runningAgentSessions: 1,
          paused: false,
          pausedReason: null,
          resumeAt: null,
          running: [],
          waiting: [],
          queued: [],
          recent: [],
          lines: [
            {
              softwareId: "s1",
              name: "Arena",
              now: "Milestone 1: build, task 3 of 7",
              next: "Your change I-2: crosshair",
              queue: 1,
              total: "not enough history yet",
            },
          ],
        }),
      ),
    });
    inSession(<Activity />, api);
    const lines = await screen.findByRole("heading", { name: "Each software now" });
    const section = lines.closest("section")!;
    expect(within(section).getByText("Milestone 1: build, task 3 of 7")).toBeTruthy();
    expect(within(section).getByText("Next up: Your change I-2: crosshair")).toBeTruthy();
    expect(within(section).getByText("1 change queued")).toBeTruthy();
  });
});
