// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportView, RunView } from "../src/api";
import { ReportView as ReportPage } from "../src/components/ReportView";
import { fakeApi, inSession } from "./fixtures";

afterEach(cleanup);

function run(change: Partial<RunView> = {}): RunView {
  return {
    softwareId: "s1",
    state: "running",
    plain: "It is running. Open the link below; it only works on this computer.",
    kind: "web",
    commit: "abc1234",
    link: "http://127.0.0.1:4700/",
    command: "node server.js",
    output: ["listening on 127.0.0.1:4700"],
    outputIsSample: false,
    restarts: 0,
    confined: true,
    folder: null,
    started: "2026-11-22T10:00:00.000Z",
    ended: null,
    canStart: true,
    canStop: true,
    ...change,
  };
}

function report(change: Partial<ReportView> = {}): ReportView {
  return {
    softwareId: "s1",
    headline: "Built and checked: 1 of 2 things you asked for are met; 1 not met or not checked.",
    source: "reporter",
    written: "2026-11-22T10:00:00.000Z",
    detail: false,
    hiddenLines: 4,
    sections: [
      {
        title: "Failed or not checked",
        plain: "Everything not known to work.",
        lines: [{ text: "Not checked: The page works on a phone.", evidence: "record item W-3" }],
      },
    ],
    running: null,
    cost: { demo: true, text: "3 agent sessions, about $1.20." },
    limits: ["The check is done by the same kind of AI as the build."],
    ...change,
  };
}

describe("the report and run views", () => {
  it("explain where the facts come from, show the link, and say what cannot be known", async () => {
    const api = fakeApi({
      report: vi.fn(() => Promise.resolve(report())),
      run: vi.fn(() => Promise.resolve(run())),
    });
    inSession(<ReportPage softwareId="s1" />, api);
    await screen.findByText(/taken only from what it recorded/);
    expect(await screen.findByRole("link", { name: "http://127.0.0.1:4700/" })).toBeTruthy();
    expect(screen.getByText(/works on this computer only/)).toBeTruthy();
    expect(screen.getByText("Not checked: The page works on a phone.")).toBeTruthy();
    // The headline comes first; ids and versions sit behind "details".
    expect(screen.getByRole("heading", { name: /Built and checked: 1 of 2/ })).toBeTruthy();
    expect(screen.getByText("record item W-3").closest("details")).toBeTruthy();
    expect(screen.getByText(/4 more lines are left out/)).toBeTruthy();
    expect(screen.getByText("The check is done by the same kind of AI as the build.")).toBeTruthy();
    expect(screen.getByText("Demo figures")).toBeTruthy();
  });

  it("asks for the full report when 'Show more detail' is pressed", async () => {
    const user = userEvent.setup();
    const reportCall = vi.fn((_id: string, detail?: boolean) =>
      Promise.resolve(report({ detail: detail === true, hiddenLines: detail ? 0 : 4 })),
    );
    inSession(
      <ReportPage softwareId="s1" />,
      fakeApi({ report: reportCall, run: vi.fn(() => Promise.resolve(run())) }),
    );
    await user.click(await screen.findByRole("button", { name: "Show more detail" }));
    await screen.findByRole("button", { name: "Show the short report" });
    expect(reportCall).toHaveBeenLastCalledWith("s1", true);
  });

  it("starts the software from the page, and shows a refusal in plain words", async () => {
    const user = userEvent.setup();
    const startRun = vi
      .fn()
      .mockRejectedValueOnce(new Error("Nothing has been built for this software yet."));
    inSession(
      <ReportPage softwareId="s1" />,
      fakeApi({
        report: vi.fn(() => Promise.resolve(report())),
        run: vi.fn(() =>
          Promise.resolve(
            run({ state: "stopped", link: null, canStop: false, output: [], commit: null }),
          ),
        ),
        startRun,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Start it again" }));
    await waitFor(() =>
      expect(screen.getByText(/Nothing has been built for this software yet/)).toBeTruthy(),
    );
  });

  it("warns when it ran without confinement", async () => {
    inSession(
      <ReportPage softwareId="s1" />,
      fakeApi({
        report: vi.fn(() => Promise.resolve(report())),
        run: vi.fn(() => Promise.resolve(run({ confined: false }))),
      }),
    );
    await screen.findByText(/ran without confinement/);
  });
});
