// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AskCard } from "../src/components/AskCard";
import { ask, fakeApi, inSession } from "./fixtures";

afterEach(cleanup);

/**
 * What exists: each finding is one short line with its source and whether it was read, can be
 * struck on its own, and shows its details only on request. Choosing something other than premise's
 * best guess has a place for a reason (decision 0270).
 */

const exists = () =>
  ask({
    kind: "question",
    stage: "exists",
    bestAttempt: "Build it",
    choices: ["Build it", "Do not build it"],
    items: [
      {
        key: "k1",
        text: "A hosted reading-list service",
        mark: "found",
        checked: "read",
        source: "https://example.test/list",
        detail: "A hosted reading-list service that leaves out offline use and exports.",
      },
      { key: "k2", text: "A browser extension", mark: "found", checked: "summary" },
      { key: "k3", text: "A note-taking app", mark: "found", checked: "not-read" },
    ],
  });

describe("What exists findings", () => {
  it("shows one short line each, with its source and whether it was read, none called assumed", () => {
    inSession(<AskCard ask={exists()} />);
    expect(screen.getByText("A hosted reading-list service")).toBeTruthy();
    expect(screen.getByText("page read")).toBeTruthy();
    expect(screen.getByText("only a summary read")).toBeTruthy();
    expect(screen.getByText("not read")).toBeTruthy();
    expect(screen.getByText(/example\.test\/list/)).toBeTruthy();
    expect(screen.queryByText("premise assumed")).toBeNull();
    // The details are one click away, not shown by default.
    const details = screen.getByText("Details").closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText(/leaves out offline use/)).toBeTruthy();
  });

  it("strikes a finding on its own, with an optional reason, and sends only what was struck", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={exists()} />, api);
    await user.click(screen.getByRole("button", { name: "Strike: A browser extension" }));
    await user.type(screen.getByLabelText("Why strike: A browser extension"), "Only a rumour");
    await user.click(screen.getByRole("button", { name: "Go with this" }));
    expect(api.answer).toHaveBeenCalledWith(1, {
      kind: "text",
      text: "Build it",
      struck: [{ key: "k2", reason: "Only a rumour" }],
    });
  });

  it("can take a strike back", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={exists()} />, api);
    await user.click(screen.getByRole("button", { name: "Strike: A note-taking app" }));
    await user.click(screen.getByRole("button", { name: "Keep: A note-taking app" }));
    await user.click(screen.getByRole("button", { name: "Go with this" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "text", text: "Build it" });
  });

  it("asks for a reason only when the choice differs from premise's best guess", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={exists()} />, api);
    await user.type(screen.getByLabelText(/say why in one line/), "I want my own");
    await user.click(screen.getByRole("button", { name: "Go with this" }));
    // The same as the recommendation: the reason is not sent.
    expect(api.answer).toHaveBeenLastCalledWith(1, { kind: "text", text: "Build it" });
    cleanup();
    const other = fakeApi();
    inSession(<AskCard ask={exists()} />, other);
    await user.type(screen.getByLabelText(/say why in one line/), "I want my own");
    await user.click(screen.getByRole("button", { name: "Do not build it" }));
    await user.click(screen.getByRole("button", { name: "Yes, do not build it" }));
    expect(other.answer).toHaveBeenCalledWith(1, {
      kind: "text",
      text: "Do not build it",
      reason: "I want my own",
    });
  });
});
