// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverrunNotice } from "../src/components/Budget";
import { Usage } from "../src/components/Usage";
import {
  budgetView,
  fakeApi,
  inSession,
  overview,
  ownFigures,
  softwareUsage,
  usageOverview,
  usageRow,
} from "./fixtures";

afterEach(cleanup);

const overrun = (answer: "raised" | "finish-change" | "left-paused" | null = null) =>
  budgetView({
    kind: "amount",
    usd: 1,
    words: "$1.00 a week, at list prices",
    state: "paused-budget",
    overrun: {
      id: 1,
      time: "2026-11-21T10:00:00Z",
      message:
        "Reading list used up its budget of $1.00 a week, at list prices: $1.44 (mocked figure) so far, mostly on Build $1.44. Nothing new starts for it until you choose what to do. Other softwares carry on.",
      spentByStage: [{ label: "Build", sessions: 3, costUsd: 1.44 }],
      spentByChange: [{ label: "Reading list, from the idea", sessions: 3, costUsd: 1.44 }],
      spentUsd: 1.44,
      mocked: true,
      answer,
      finishing: null,
      canFinish: true,
    },
  });

describe("the Usage page", () => {
  it("labels every ledger figure Mocked and shows premise's own counts without the label", async () => {
    inSession(<Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />);
    const all = await screen.findByText(/All of it/);
    expect(all.closest("p")!.textContent).toContain("3 agent sessions");
    expect(
      within(screen.getByText(/usage-ledger:/).closest("p")!).getByText("Mocked"),
    ).toBeTruthy();
    // Each row: premise's own count comes first and is real; the dollar figure and the share carry
    // the label; sessions and time do not.
    const row = screen.getAllByRole("row", { name: /^Build/ })[0]!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]!.textContent).toBe("3");
    expect(within(cells[0]!).queryByText("Mocked")).toBeNull();
    expect(within(cells[1]!).queryByText("Mocked")).toBeNull();
    expect(cells[2]!.textContent).toContain("$0.50 at list prices");
    expect(within(cells[2]!).queryByText("Mocked")).toBeNull();
    expect(within(cells[3]!).getByText("Mocked")).toBeTruthy();
    expect(within(cells[4]!).getByText("Mocked")).toBeTruthy();
  });

  it("shows premise's own count before the mocked figure, and says where one is missing", async () => {
    inSession(
      <Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />,
      fakeApi({
        usage: () =>
          Promise.resolve(
            usageOverview({
              softwares: [
                softwareUsage({
                  total: usageRow({
                    key: "total",
                    measured: {
                      sessions: 4,
                      minutes: 9,
                      figures: ownFigures({
                        counted: 3,
                        missing: 1,
                        missingWhy: "scripted agents report no figures",
                      }),
                    },
                  }),
                }),
              ],
            }),
          ),
      }),
    );
    const own = await screen.findByText(/premise's own count:/);
    const mocked = screen.getByText(/usage-ledger:/);
    expect(own.closest("p")!.textContent).toContain(
      "no figures for 1 session: scripted agents report no figures",
    );
    // The real figure is first in the page, the mocked one after it.
    expect(own.compareDocumentPosition(mocked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(own.closest("p")!).queryByText("Mocked")).toBeNull();
  });

  it("shows the weekly window as the agents last reported it, with its age, apart from the mock", async () => {
    inSession(
      <Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />,
      fakeApi({
        usage: () =>
          Promise.resolve(
            usageOverview({
              ownWindow: {
                usedPercent: 2,
                resetsAt: "2026-11-30T00:00:00Z",
                readAt: new Date(Date.now() - 30 * 60_000).toISOString(),
                status: "allowed",
              },
            }),
          ),
      }),
    );
    const card = (await screen.findByText(/as the agents last reported it/)).closest("section")!;
    expect(card.textContent).toContain("2% of the subscription's weekly usage");
    expect(card.textContent).toContain("30 minutes ago");
    expect(within(card).queryByText("Mocked")).toBeNull();
  });

  it("says no real session has reported the window yet when there is no reading", async () => {
    inSession(<Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />);
    expect(await screen.findByText(/No real agent session has reported this yet/)).toBeTruthy();
  });

  it("saves a budget as a share of the week's usage, in plain words", async () => {
    const setBudget = vi.fn(() => Promise.resolve(budgetView()));
    const { session } = inSession(
      <Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />,
      fakeApi({ setBudget }),
    );
    await screen.findByText(/All of it/);
    await userEvent.click(screen.getByLabelText(/Percent of the week's usage/));
    await userEvent.type(screen.getByLabelText("Budget"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Save budget" }));
    expect(setBudget).toHaveBeenCalledWith("s1", { kind: "share", percent: 25 });
    await waitFor(() => expect(session.refresh).toHaveBeenCalled());
  });

  it("says what to type when the budget is not a number", async () => {
    inSession(<Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />);
    await screen.findByText(/All of it/);
    await userEvent.click(screen.getByLabelText(/Dollars a week/));
    await userEvent.type(screen.getByLabelText("Budget"), "lots");
    await userEvent.click(screen.getByRole("button", { name: "Save budget" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Type an amount in dollars");
  });

  it("shows the overrun notice for a paused software, with its three answers", async () => {
    const api = fakeApi({
      usage: vi.fn(() =>
        Promise.resolve(usageOverview({ softwares: [softwareUsage({ budget: overrun() })] })),
      ),
    });
    inSession(<Usage overview={overview({ softwares: [{ id: "s1" } as never] })} />, api);
    const notice = await screen.findByRole("status", { name: "Budget used up" });
    expect(notice.textContent).toContain("used up its budget");
    expect(within(notice).getByText("Mocked")).toBeTruthy();
    expect(within(notice).getByRole("button", { name: "Raise and carry on" })).toBeTruthy();
    expect(
      within(notice).getByRole("button", { name: "Let it finish the current change" }),
    ).toBeTruthy();
    expect(within(notice).getByRole("button", { name: "Leave it paused" })).toBeTruthy();
  });
});

describe("answering an overrun", () => {
  it("sends each of the three answers", async () => {
    const answerOverrun = vi.fn(() => Promise.resolve(budgetView()));
    const { session } = inSession(
      <OverrunNotice softwareId="s1" budget={overrun()} />,
      fakeApi({ answerOverrun }),
    );
    await userEvent.type(screen.getByLabelText("New budget"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Raise and carry on" }));
    expect(answerOverrun).toHaveBeenLastCalledWith("s1", {
      answer: "raise",
      budget: { kind: "amount", usd: 10 },
    });
    await userEvent.click(screen.getByRole("button", { name: "Let it finish the current change" }));
    expect(answerOverrun).toHaveBeenLastCalledWith("s1", { answer: "finish-change" });
    await userEvent.click(screen.getByRole("button", { name: "Leave it paused" }));
    expect(answerOverrun).toHaveBeenLastCalledWith("s1", { answer: "leave-paused" });
    await waitFor(() => expect(session.refresh).toHaveBeenCalledTimes(3));
  });

  it("shows premise's refusal when the raised budget is too small", async () => {
    const answerOverrun = vi.fn(() =>
      Promise.reject(new Error("That is not more than what Reading list has already used.")),
    );
    inSession(<OverrunNotice softwareId="s1" budget={overrun()} />, fakeApi({ answerOverrun }));
    await userEvent.type(screen.getByLabelText("New budget"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Raise and carry on" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not more than");
  });

  it("cannot finish a change when nothing is being worked on", () => {
    const b = overrun();
    b.overrun!.canFinish = false;
    inSession(<OverrunNotice softwareId="s1" budget={b} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Let it finish the current change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
