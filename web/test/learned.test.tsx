// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearningView, LessonView, MeasuresOverview, MeasuresView } from "../src/api";
import { AskCard } from "../src/components/AskCard";
import { Doing } from "../src/components/Doing";
import { Learned } from "../src/components/Learned";
import { ask, fakeApi, inSession } from "./fixtures";

afterEach(cleanup);

function lesson(change: Partial<LessonView> = {}): LessonView {
  return {
    id: 1,
    label: "L-1",
    destination: "software",
    softwareId: "s1",
    softwareName: "Reading list",
    text: "Do not assume the person skips it.",
    source: "You struck “Doing this by hand gets skipped” at Why, 2026-11-21",
    correctionId: 4,
    uses: 2,
    lastUsed: "2026-11-21T10:00:00Z",
    created: "2026-11-21T09:00:00Z",
    edited: null,
    ...change,
  };
}

function learning(change: Partial<LearningView> = {}): LearningView {
  return {
    softwareId: "s1",
    explain: {
      adapting: "When you strike something, premise writes down one short lesson.",
      improving: "These never change how premise works on their own.",
    },
    software: { lines: [lesson()], max: 10 },
    taste: { lines: [], max: 10 },
    improvements: [
      {
        topic: "checker-miss",
        text: "The check said W-2 was met, but a bug came back against it.",
        seen: 2,
        softwares: ["Reading list"],
        lessons: [lesson({ id: 7, label: "L-7", destination: "premise" })],
        lastSeen: "2026-11-21T11:00:00Z",
      },
    ],
    corrections: [
      {
        id: 4,
        softwareId: "s1",
        softwareName: "Reading list",
        kind: "strike",
        what: "You struck “Doing this by hand gets skipped” at Why",
        said: "I never skip it",
        status: "read",
        mistake: "premise assumed something that was wrong",
        destination: "software",
        reason: "A struck item says what is wrong about this software.",
        decidedBy: "agent",
        lessonId: 1,
        created: "2026-11-21T09:00:00Z",
      },
    ],
    ended: [],
    ...change,
  };
}

describe("the Learned view", () => {
  it("explains both kinds, shows each line with its source and use, and deletes in one click", async () => {
    const api = fakeApi({
      learning: vi.fn(() => Promise.resolve(learning())),
      deleteLesson: vi.fn(() => Promise.resolve({ ok: true as const })),
    });
    inSession(<Learned softwareId="s1" />, api);
    expect(await screen.findByText(/premise writes down one short lesson/)).toBeTruthy();
    expect(screen.getByText(/never change how premise works/)).toBeTruthy();
    expect(screen.getByText(/For this software \(1 of at most 10\)/)).toBeTruthy();
    expect(screen.getByText(/Given to agents 2 times/)).toBeTruthy();
    expect(screen.getAllByText(/From: You struck/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Seen 2 times/)).toBeTruthy();
    expect(screen.getByText(/premise will ask you first/)).toBeTruthy();

    const line = screen.getByText("Do not assume the person skips it.").closest("li")!;
    await userEvent.click(within(line).getByRole("button", { name: "Delete" }));
    expect(api.deleteLesson).toHaveBeenCalledWith(1);
  });

  it("moves a correction to another place in one click", async () => {
    const api = fakeApi({
      learning: vi.fn(() => Promise.resolve(learning())),
      moveCorrection: vi.fn(() => Promise.resolve({ ok: true as const })),
    });
    inSession(<Learned softwareId="s1" />, api);
    const group = await screen.findByRole("group", { name: /Move: You struck/ });
    expect(within(group).queryByRole("button", { name: "This software" })).toBeNull();
    await userEvent.click(within(group).getByRole("button", { name: "Your taste" }));
    expect(api.moveCorrection).toHaveBeenCalledWith(4, "taste");
  });

  it("says it is premise's notebook, and marks a correction whose lesson was deleted", async () => {
    const view = learning();
    const api = fakeApi({
      learning: vi.fn(() =>
        Promise.resolve({
          ...view,
          software: { lines: [], max: 10 },
          corrections: [
            {
              ...view.corrections[0]!,
              lessonId: null,
              lessonEnded: { label: "L-1", note: "Deleted by you." },
            },
          ],
        }),
      ),
    });
    inSession(<Learned softwareId="s1" />, api);
    expect(await screen.findByText(/premise's notebook/)).toBeTruthy();
    expect(screen.getByText(/its lesson L-1 is no longer followed/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: /Move: You struck/ })).toBeNull();
  });

  it("edits a line", async () => {
    const api = fakeApi({
      learning: vi.fn(() => Promise.resolve(learning())),
      editLesson: vi.fn(() => Promise.resolve({ ok: true as const })),
    });
    inSession(<Learned softwareId="s1" />, api);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Edit L-1" });
    await userEvent.clear(box);
    await userEvent.type(box, "Ask before assuming.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.editLesson).toHaveBeenCalledWith(1, "Ask before assuming.");
  });
});

describe("a draft that follows a lesson", () => {
  it("says so, and the card tells premise it was shown", async () => {
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          items: [
            {
              key: "y2",
              text: "Doing this by hand takes time.",
              mark: "assumed",
              follows: { label: "L-1", text: "Do not assume the person skips it." },
            },
          ],
        })}
      />,
      api,
    );
    expect(
      screen.getByText(
        /Follows what you taught premise \(L-1\): Do not assume the person skips it/,
      ),
    ).toBeTruthy();
    expect(api.shown).toHaveBeenCalledWith(1);
  });
});

describe("How premise is doing", () => {
  it("shows each figure with what it rests on, and says not enough yet when thin", async () => {
    const view: MeasuresView = {
      softwareId: null,
      name: "Every software",
      figures: [
        {
          key: "checker-misses",
          label: "Reported working, came back as a bug",
          value: "not enough yet",
          enough: false,
          events: 2,
          counts: "0 of 2 things premise's check said were met came back as a bug.",
          how: "Of the record items whose check said met…",
        },
        {
          key: "attention",
          label: "People's attention",
          value: "15 minutes",
          enough: true,
          events: 2,
          counts: "About 15 minutes spent on 2 questions.",
          how: "Counted while the page was in front of someone.",
        },
      ],
      intakeRoutes: { byRoute: {}, bySource: {}, total: 0, words: "", sources: [] },
      attentionByRole: [{ name: "operator", minutes: 15, asks: 2 }],
      attentionByChange: [],
      sessionsByChange: [],
      misses: [],
    };
    const overview: MeasuresOverview = { overall: view, softwares: [], minEvents: 5 };
    const api = fakeApi({
      measures: vi.fn(() => Promise.resolve(overview)),
      learning: vi.fn(() => Promise.resolve(learning({ softwareId: null, software: null }))),
    });
    inSession(<Doing />, api);
    expect(await screen.findByText("not enough yet")).toBeTruthy();
    expect(screen.getByText(/0 of 2 things/)).toBeTruthy();
    expect(screen.getByText("15 minutes")).toBeTruthy();
    expect(screen.getByText(/these figures are real\./)).toBeTruthy();
    expect(screen.getByText(/operator: about 15 min, on 2 questions/)).toBeTruthy();
    expect(await screen.findByText(/Your taste, for every software/)).toBeTruthy();
  });
});
