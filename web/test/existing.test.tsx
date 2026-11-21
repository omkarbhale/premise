// @vitest-environment jsdom
import { SoftwareView } from "../src/components/SoftwareView";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ExistingView } from "../src/api";
import { AskCard } from "../src/components/AskCard";
import { BringInForm } from "../src/components/BringInForm";
import { ExistingPanel } from "../src/components/ExistingPanel";
import { ask, fakeApi, inSession, software } from "./fixtures";

afterEach(cleanup);

function existing(change: Partial<ExistingView> = {}): ExistingView {
  return {
    source: "/home/someone/projects/wordcount",
    sourceKind: "folder",
    status: "taken-on",
    problem: null,
    commits: 3,
    recovered: 6,
    confirmed: 6,
    struck: 1,
    run: { build: null, start: "node wc.js <file>", check: null, canStart: true },
    couldNotCheck: ["How to check it works was not found."],
    record: { status: "refused", branch: "premise", note: null, canOffer: true },
    ...change,
  };
}

describe("bringing in software you already have", () => {
  it("brings in a folder, and shows a refusal in plain words", async () => {
    const user = userEvent.setup();
    const bringIn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(422, "There is no folder at /nowhere."))
      .mockResolvedValue({ id: "s1" });
    const onStarted = vi.fn();
    inSession(<BringInForm onStarted={onStarted} />, fakeApi({ bringIn }));
    await user.click(screen.getByRole("button", { name: "Bring it in" }));
    expect(screen.getByRole("alert").textContent).toContain("Say where the software is first");
    expect(bringIn).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Where is it?"), "/nowhere");
    await user.click(screen.getByRole("button", { name: "Bring it in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("There is no folder");
    await user.click(screen.getByRole("button", { name: "Bring it in" }));
    expect(bringIn).toHaveBeenLastCalledWith("/nowhere", undefined, undefined);
    expect(onStarted).toHaveBeenCalledWith({ id: "s1" });
    expect(screen.getByText(/it never changes your folder/)).toBeTruthy();
  });

  it("shows where it came from, what could not be checked, and offers the record again", async () => {
    const user = userEvent.setup();
    const offerRecord = vi.fn(() => Promise.resolve({} as never));
    const { session } = inSession(
      <ExistingPanel softwareId="s1" existing={existing()} />,
      fakeApi({ offerRecord }),
    );
    expect(screen.getByText("/home/someone/projects/wordcount")).toBeTruthy();
    expect(screen.getByText("How to check it works was not found.")).toBeTruthy();
    expect(screen.getByText(/you declined adding it to your repository/)).toBeTruthy();
    expect(screen.getByText(/its record will drift from the code/)).toBeTruthy();
    expect(screen.getByText(/A recovered record usually misses things/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Offer it again" }));
    expect(offerRecord).toHaveBeenCalledWith("s1");
    expect(session.refresh).toHaveBeenCalled();
  });

  it("says plainly when it could not be copied", () => {
    inSession(
      <ExistingPanel
        softwareId="s1"
        existing={existing({
          status: "copy-failed",
          problem: "The repository has no commits yet.",
          couldNotCheck: [],
        })}
      />,
    );
    expect(screen.getByText("The repository has no commits yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Offer it again" })).toBeNull();
  });

  it.each(["copying", "copy-failed"] as const)(
    "does not offer Send back or the report box while %s",
    async (status) => {
      const api = fakeApi({
        intake: vi.fn(() =>
          Promise.resolve({
            softwareId: "s1",
            items: [],
            held: 0,
            readingWhen: { heldCount: 5, days: 7 },
            reading: false,
            readings: [],
            counts: {},
          }),
        ),
        software: vi.fn(() =>
          Promise.resolve(software({ existing: existing({ status, couldNotCheck: [] }) })),
        ),
      });
      inSession(<SoftwareView softwareId="s1" tab="line" onTab={() => {}} asks={[]} />, api);
      await screen.findByRole("tab", { name: /Line/ });
      expect(
        screen.queryByRole("button", { name: /Send back here|Start this step again/ }),
      ).toBeNull();
      cleanup();
      inSession(<SoftwareView softwareId="s1" tab="intake" onTab={() => {}} asks={[]} />, api);
      expect(await screen.findByText(/nothing to report/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    },
  );

  it("pages a long recovered list, grouped by file, answered once", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 15 }, (_, i) => ({
      key: `W-${i + 1}`,
      text: `It does thing ${i + 1}.`,
      mark: "recovered" as const,
      group: i < 2 ? "Why" : "What",
    }));
    const api = fakeApi();
    inSession(<AskCard ask={ask({ kind: "say-back", stage: "say-back", items })} />, api);
    expect(screen.getByRole("heading", { name: "Why" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What" })).toBeTruthy();
    expect(screen.getAllByText("recovered from the code")).toHaveLength(12);
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByText(/Items on pages you have not opened are kept/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next" }));
    const row = screen.getByText("It does thing 14.").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Strike" }));
    expect(screen.queryByText(/Items on pages you have not opened/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm: the rest is right" }));
    const sent = (api.answer as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      items: { key: string; decision: string }[];
    };
    expect(sent.items).toHaveLength(15);
    expect(sent.items.filter((i) => i.decision === "strike").map((i) => i.key)).toEqual(["W-14"]);
  });
});
