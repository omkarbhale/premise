// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { PauseBanner, PauseControl, SleepNotice, StartupNotice } from "../src/components/Pausing";
import { fakeApi, inSession, overview, pauseView } from "./fixtures";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  window.sessionStorage.clear();
});

describe("Pause everything and Resume", () => {
  it("shows Pause everything in the top bar and asks one thing: finish or stop now", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      overview: vi.fn(() => Promise.resolve(overview({ pause: pauseView() }))),
    });
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: "Pause everything" }));
    expect(screen.getByText("Let what is running finish")).toBeTruthy();
    expect(screen.getByText(/unfinished work is redone later/)).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: /Let what is running finish/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("pauses with 'let it finish' by default", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      pauseEverything: vi.fn(() => Promise.resolve(pauseView({ paused: true }))),
    });
    inSession(<PauseControl pause={pauseView()} />, api);
    await user.click(screen.getByRole("button", { name: "Pause everything" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(api.pauseEverything).toHaveBeenCalledWith("finish");
  });

  it("pauses and stops running sessions when asked to stop now", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      pauseEverything: vi.fn(() => Promise.resolve(pauseView({ paused: true }))),
    });
    inSession(<PauseControl pause={pauseView()} />, api);
    await user.click(screen.getByRole("button", { name: "Pause everything" }));
    await user.click(screen.getByRole("radio", { name: /Stop it now/ }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(api.pauseEverything).toHaveBeenCalledWith("stop-now");
  });

  it("shows Resume instead while paused, and resumes", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ resumeEverything: vi.fn(() => Promise.resolve(pauseView())) });
    inSession(<PauseControl pause={pauseView({ paused: true, cause: "person" })} />, api);
    expect(screen.queryByRole("button", { name: "Pause everything" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(api.resumeEverything).toHaveBeenCalled();
  });

  it("says when premise is stopping, instead of offering to pause", () => {
    inSession(<PauseControl pause={pauseView({ stopping: true })} />);
    expect(screen.getByText("premise is stopping…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause everything" })).toBeNull();
  });
});

describe("the paused banner", () => {
  it("says what is paused, what is still finishing, and that it is not safe to close yet", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ pauseEverything: vi.fn(() => Promise.resolve(pauseView())) });
    inSession(
      <PauseBanner
        pause={pauseView({
          paused: true,
          cause: "person",
          mode: "finish",
          safeToClose: false,
          headline:
            "Everything is paused. Nothing new starts in any software. 1 job still finishing.",
          stillFinishing: [
            {
              id: 4,
              softwareId: "s1",
              softwareName: "Reading list",
              kind: "build",
              stage: "build",
              status: "running",
              line: "Writing the first screen",
              waitingOn: null,
              attempts: 1,
              started: null,
              finished: null,
            },
          ],
          runningSoftwares: [{ softwareId: "s2", name: "Notes" }],
        })}
      />,
      api,
    );
    expect(screen.getByText(/Everything is paused\. Nothing new starts/)).toBeTruthy();
    expect(screen.getByText(/Writing the first screen/)).toBeTruthy();
    expect(screen.getByText("Not safe to close yet:")).toBeTruthy();
    expect(screen.getByText(/Notes\) stops when premise stops/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Stop what is still running now" }));
    expect(api.pauseEverything).toHaveBeenCalledWith("stop-now");
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("says it is safe to close when nothing is running, and shows nothing when running", () => {
    const { unmount } = inSession(
      <PauseBanner pause={pauseView({ paused: true, cause: "person" })} />,
    );
    expect(screen.getByText("It is safe to close premise now.")).toBeTruthy();
    unmount();
    const { container } = inSession(<PauseBanner pause={pauseView()} />);
    expect(container.textContent).toBe("");
  });

  it("is in the page, under the top bar, while paused", async () => {
    const api = fakeApi({
      overview: vi.fn(() =>
        Promise.resolve(
          overview({
            pause: pauseView({
              paused: true,
              cause: "setting",
              headline: "premise started paused.",
            }),
          }),
        ),
      ),
    });
    render(<App api={api} />);
    await waitFor(() => expect(screen.getByRole("status", { name: "Paused" })).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Resume" }).length).toBeGreaterThan(0);
  });
});

describe("what the start picked up", () => {
  const startup = {
    line: "Picked up where premise stopped: 1 job was cut off and put back to start again.",
    startedAt: "2026-11-23T10:00:00Z",
    cutOff: 1,
    waitingOnYou: 0,
    paused: false,
    stoppedSoftwares: [{ softwareId: "s1", name: "Reading list" }],
  };

  it("says it in one line and offers to start stopped software again", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ startRun: vi.fn(() => Promise.resolve({} as never)) });
    inSession(<StartupNotice overview={overview({ startup })} />, api);
    expect(screen.getByText(/Picked up where premise stopped/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start Reading list again" }));
    expect(api.startRun).toHaveBeenCalledWith("s1");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Start Reading list again/ })).toBeNull(),
    );
  });

  it("can be dismissed, and stays dismissed after a reload", async () => {
    const user = userEvent.setup();
    const first = inSession(<StartupNotice overview={overview({ startup })} />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Picked up/)).toBeNull();
    first.unmount();
    inSession(<StartupNotice overview={overview({ startup })} />);
    expect(screen.queryByText(/Picked up/)).toBeNull();
  });

  it("shows nothing on a first start", () => {
    const { container } = inSession(<StartupNotice overview={overview({ startup: null })} />);
    expect(container.textContent).toBe("");
  });

  it("says when the computer slept and what was done", () => {
    inSession(
      <SleepNotice
        overview={overview({
          sleep: {
            noticedAt: "2026-11-23T10:00:00Z",
            asleepMinutes: 90,
            checked: 2,
            restarted: 1,
            line: "The computer was asleep for about 90 minute(s). 1 had died; it was started again.",
          },
        })}
      />,
    );
    expect(screen.getByText(/asleep for about 90 minute/)).toBeTruthy();
  });
});

describe("help", () => {
  it("has a short Stopping and coming back section", async () => {
    window.location.hash = "#view=help";
    const api = fakeApi();
    render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "Stopping and coming back" })).toBeTruthy();
    expect(screen.getAllByText(/npm run stop/).length).toBeGreaterThan(0);
  });
});
