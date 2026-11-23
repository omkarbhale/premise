// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AskCard } from "../src/components/AskCard";
import { ask, fakeApi, inSession } from "./fixtures";

afterEach(cleanup);

/**
 * The cards behind the judgement fixes from the first real runs (decision 0300): choices at What
 * exists that say what they change, real buttons for a tool the agents lack, and a condition on the
 * milestones question that can be kept, struck or checked first.
 */

describe("What exists: each choice says what it changes", () => {
  const exists = () =>
    ask({
      kind: "question",
      stage: "exists",
      title: "premise recommends not building it: something already does this",
      bestAttempt: "Do not build: use ccusage",
      choices: ["Do not build: use ccusage", "Build it on top of ccusage", "Build it anyway"],
      choiceNotes: {
        "Do not build: use ccusage": "premise stops here and builds nothing.",
        "Build it on top of ccusage": "premise builds only what ccusage lacks.",
        "Build it anyway": "premise builds its own from scratch.",
      },
      items: [],
    });

  it("lists each choice with one line on what it changes, and sends the why with an overrule", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={exists()} />, api);
    const notes = screen.getByRole("list", { name: "What each choice changes" });
    expect(within(notes).getByText(/builds only what ccusage lacks/)).toBeTruthy();
    expect(document.querySelector(".best")!.textContent).toMatch(
      /^premise recommends: Do not build: use ccusage/,
    );
    // The reason box is there without findings too.
    await user.type(screen.getByLabelText(/say why in one line/), "it has no weekly share");
    await user.click(screen.getByRole("button", { name: "Build it anyway" }));
    expect(api.answer).toHaveBeenCalledWith(1, {
      kind: "text",
      text: "Build it anyway",
      reason: "it has no weekly share",
    });
  });
});

describe("a tool the agents lack", () => {
  const card = (host?: string) =>
    ask({
      kind: "needed",
      stage: "build",
      title: "The agents need godot, and it is not here",
      instruction: "The builder needs godot.",
      items: [{ key: "s1", text: "Install Godot 4.", mark: "assumed" }],
      tool: { name: "godot", ...(host && { host }), why: "The game is built with it." },
    });

  it("offers allowing its host for this software, installing it, or going on without it", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={card("downloads.example.org")} />, api);
    expect(screen.queryByRole("button", { name: "It is done" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Allow downloads.example.org for Reading list" }),
    );
    expect(api.answer).toHaveBeenLastCalledWith(1, { kind: "needed", decision: "allow" });
    await user.click(screen.getByRole("button", { name: "I installed it" }));
    expect(api.answer).toHaveBeenLastCalledWith(1, { kind: "needed", decision: "installed" });
    await user.click(screen.getByRole("button", { name: "Go on without it" }));
    expect(api.answer).toHaveBeenLastCalledWith(1, { kind: "needed", decision: "without" });
  });

  it("offers no host to allow when none was named", () => {
    inSession(<AskCard ask={card()} />);
    expect(screen.queryByRole("button", { name: /^Allow / })).toBeNull();
    expect(screen.getByRole("button", { name: "I installed it" })).toBeTruthy();
  });
});

describe("a must that works only under a condition, on the milestones question", () => {
  it("is kept, struck or checked first, and sent as such", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          kind: "draft",
          stage: "plan",
          title: "Milestones: is this the right order?",
          items: [
            { key: "m1", text: "The smallest version that runs.", mark: "assumed", wait: true },
            {
              key: "cond1",
              text: 'W-2 "weekly share per session" works only if: sessions without a terminal run the status line',
              mark: "assumed",
              refs: ["W-2"],
              condition: true,
            },
          ],
        })}
      />,
      api,
    );
    const condition = screen.getByRole("group", { name: /What to do with: W-2/ });
    expect(within(condition).queryByRole("button", { name: "Edit" })).toBeNull();
    await user.click(within(condition).getByRole("button", { name: "Check it first" }));
    await user.click(screen.getByRole("button", { name: "Confirm this list" }));
    expect(api.answer).toHaveBeenCalledWith(1, {
      kind: "items",
      items: [
        { key: "m1", decision: "keep", wait: true },
        { key: "cond1", decision: "check" },
      ],
    });
  });
});
