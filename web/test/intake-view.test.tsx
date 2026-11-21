// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IntakeItemView, IntakeView as View } from "../src/api";
import { ApiError } from "../src/api";
import { IntakeView } from "../src/components/IntakeView";
import { fakeApi, inSession } from "./fixtures";

afterEach(() => cleanup());

function item(change: Partial<IntakeItemView> = {}): IntakeItemView {
  return {
    id: 1,
    ref: "I-1",
    source: "session",
    sourceWords: "said in the session",
    sender: "the operator",
    text: "The list forgets the last book",
    kind: "bug",
    kindWords: "a bug",
    status: "working",
    where: "Being built.",
    route: "in-normally",
    reason: "It reads as a bug.",
    routedBy: "triager",
    touches: [{ id: "W-2", reason: "It is about saving the list." }],
    joins: null,
    answer: null,
    workItemId: 4,
    received: "2026-11-21T10:00:00Z",
    minutesToRunning: null,
    canUndo: false,
    senderNote: null,
    ...change,
  };
}

function view(change: Partial<View> = {}): View {
  return {
    softwareId: "s1",
    items: [
      item(),
      item({
        id: 2,
        ref: "I-2",
        text: "lorem ipsum",
        kind: "noise",
        kindWords: "noise",
        status: "closed",
        where: "Closed, because: It says nothing about the software.",
        route: "merged-or-closed",
        canUndo: true,
      }),
      item({
        id: 3,
        ref: "I-3",
        text: "Nobody needs this",
        kind: "opinion",
        kindWords: "an opinion",
        status: "held",
        where: "Held for a reading, because: one opinion.",
        route: "held",
        canUndo: true,
      }),
    ],
    held: 1,
    readingWhen: { heldCount: 10, days: 14 },
    reading: false,
    readings: [],
    counts: { working: 1, closed: 1, held: 1 },
    routes: {
      byRoute: { "in-normally": 1, "merged-or-closed": 1, held: 1 },
      bySource: { session: 3 },
      total: 3,
      words: "3 items came in through intake.",
      sources: [{ source: "session", name: "the session", count: 3 }],
    },
    feedback: { path: "/feedback/abc", created: "2026-11-21T10:00:00Z" },
    github: { repository: null, everyMinutes: 10, lastRead: null, problem: null, taken: 0 },
    ...change,
  };
}

describe("the Intake tab", () => {
  it("shows where each item stands in plain words, and why it went there", async () => {
    inSession(
      <IntakeView softwareId="s1" />,
      fakeApi({ intake: vi.fn(() => Promise.resolve(view())) }),
    );
    const open = await screen.findByRole("region", { name: "Open items" });
    expect(within(open).getByText("Being built.")).toBeTruthy();
    expect(within(open).getByText(/said in the session.*read as a bug/)).toBeTruthy();
    expect(within(open).getByText("Touches W-2: It is about saving the list.")).toBeTruthy();
    // An open item cannot be undone; a closed one and a held one can.
    expect(within(open).queryByRole("button")).toBeNull();
    const all = screen.getByRole("region", { name: "Every item" });
    expect(within(all).getByRole("button", { name: "Undo: take it in after all" })).toBeTruthy();
    expect(within(all).getByRole("button", { name: "Take it in now" })).toBeTruthy();
    expect(screen.getByText("1 item held.")).toBeTruthy();
  });

  it("reports a problem, and says what happens next", async () => {
    const reportIntake = vi.fn(() => Promise.resolve(item({ id: 9, ref: "I-9" })));
    inSession(
      <IntakeView softwareId="s1" />,
      fakeApi({ intake: vi.fn(() => Promise.resolve(view())), reportIntake }),
    );
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Report a problem or a wish");
    expect((screen.getByRole("button", { name: "Report" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.type(box, "The add button is hidden on a phone");
    await user.click(screen.getByRole("button", { name: "Report" }));
    expect(reportIntake).toHaveBeenCalledWith("s1", "The add button is hidden on a phone");
    expect(await screen.findByText(/Taken as I-9\. An agent reads it/)).toBeTruthy();
  });

  it("undoes a close, reads held items on request, and shows a refusal plainly", async () => {
    const undoIntake = vi.fn(() => Promise.resolve(item({ id: 2, ref: "I-2" })));
    const readHeldNow = vi.fn(() =>
      Promise.reject(new ApiError(422, "A reading is already under way.")),
    );
    inSession(
      <IntakeView softwareId="s1" />,
      fakeApi({ intake: vi.fn(() => Promise.resolve(view())), undoIntake, readHeldNow }),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Undo: take it in after all" }));
    expect(undoIntake).toHaveBeenCalledWith(2);
    expect(
      await screen.findByText("I-2 is taken in: it goes onto the line as new work."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Read the held items now" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A reading is already under way.");
  });

  it("says plainly when nothing has come in yet", async () => {
    inSession(
      <IntakeView softwareId="s1" />,
      fakeApi({
        intake: vi.fn(() => Promise.resolve(view({ items: [], held: 0, counts: {} }))),
      }),
    );
    expect(await screen.findByText(/Nothing has come in yet/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Read the held items now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
