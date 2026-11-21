// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api";
import { App } from "../src/App";
import { AgentsBanner } from "../src/components/AgentsBanner";
import { AskCard } from "../src/components/AskCard";
import { Line } from "../src/components/Line";
import { Needed } from "../src/components/Needed";
import { RecordView } from "../src/components/RecordView";
import { Settings } from "../src/components/Settings";
import { Usage } from "../src/components/Usage";
import { ask, fakeApi, inSession, overview, software, workItem } from "./fixtures";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("first run", () => {
  it("says to open premise from its link when the link has no token", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Open premise from its link" })).toBeTruthy();
    expect(screen.getAllByText("npm run new-link").length).toBeGreaterThan(0);
  });

  it("welcomes someone new: what premise is, what to type, what happens next", async () => {
    render(<App api={fakeApi()} />);
    await screen.findByRole("heading", { name: "Welcome to premise" });
    expect(screen.getByLabelText("What should the software do, and for whom?")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "This is a trial run" })).toBeTruthy();
    expect(document.title).toBe("premise");
  });

  it("starts a software from the idea, and shows a refusal in plain words", async () => {
    const user = userEvent.setup();
    const start = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(422, "Write a sentence or two about it."))
      .mockResolvedValue({ id: "s1" });
    render(<App api={fakeApi({ start })} />);
    const box = await screen.findByLabelText("What should the software do, and for whom?");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("alert").textContent).toContain("Write a sentence or two");
    expect(start).not.toHaveBeenCalled();
    await user.type(box, "A reading list");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Write a sentence or two about it.",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(start).toHaveBeenLastCalledWith("A reading list", undefined);
  });

  it("shows the open asks in the tab title", async () => {
    const api = fakeApi({
      overview: vi.fn(() => Promise.resolve(overview({ openAsks: 2 }))),
      asks: vi.fn(() => Promise.resolve([ask({ id: 1 }), ask({ id: 2 })])),
    });
    render(<App api={api} />);
    await waitFor(() => expect(document.title).toBe("(2) premise"));
  });
});

describe("answering an ask in place", () => {
  it("keeps, strikes with a reason, and edits items one at a time", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    const { session } = inSession(<AskCard ask={ask()} />, api);
    const rows = screen.getAllByRole("listitem");
    await user.click(within(rows[1]!).getByRole("button", { name: "Strike" }));
    await user.type(within(rows[1]!).getByPlaceholderText("Why is it wrong? (optional)"), "Not so");
    await user.click(within(rows[2]!).getByRole("button", { name: "Edit" }));
    const edit = within(rows[2]!).getByRole("textbox");
    await user.clear(edit);
    await user.type(edit, "Size: medium.");
    expect(screen.getByText("1 kept, 1 struck, 1 edited")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm this list" }));
    expect(api.answer).toHaveBeenCalledWith(1, {
      kind: "items",
      items: [
        { key: "y1", decision: "keep" },
        { key: "y2", decision: "strike", reason: "Not so" },
        { key: "y3", decision: "edit", text: "Size: medium." },
      ],
    });
    expect(session.refresh).toHaveBeenCalled();
  });

  it("offers only keep and strike on a say back, and explains it", () => {
    inSession(<AskCard ask={ask({ kind: "say-back", title: "Say back" })} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("What is a say back?")).toBeTruthy();
  });

  it("answers a question with premise's best guess", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          kind: "question",
          items: [],
          bestAttempt: "Build it",
          choices: ["Build it", "Do not build it"],
        })}
      />,
      api,
    );
    await user.click(screen.getByRole("button", { name: "Use this" }));
    await user.click(screen.getByRole("button", { name: "Answer" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "text", text: "Build it" });
  });

  it("shows the gate's card and approves once", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          kind: "approval",
          items: [],
          approval: {
            action: "Create a repository.",
            why: "To keep the code.",
            floor: "On the floor.",
          },
        })}
      />,
      api,
    );
    expect(screen.getByText("What will happen")).toBeTruthy();
    expect(screen.getByText("Create a repository.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve once" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "approval", decision: "approve-once" });
  });

  it("offers to approve a kind of action for the software, when the gate allows it", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          kind: "approval",
          items: [],
          approval: {
            action: "Post a comment.",
            why: "To answer a user.",
            floor: "On the floor.",
            kindLabel: "posting comments and messages",
          },
        })}
      />,
      api,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Approve posting comments and messages for Reading list",
      }),
    );
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "approval", decision: "approve-kind" });
  });

  it("lets the operator choose which milestones to stop after", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          stage: "plan",
          title: "Milestones: is this the right order?",
          items: [
            { key: "m1", text: "The smallest version that runs.", mark: "assumed", wait: false },
            { key: "m2", text: "Everything else.", mark: "assumed", wait: false },
          ],
        })}
      />,
      api,
    );
    const boxes = screen.getAllByRole("checkbox", {
      name: "Stop after this milestone until I say go on",
    });
    await user.click(boxes[0]!);
    await user.click(screen.getByRole("button", { name: "Confirm this list" }));
    expect(api.answer).toHaveBeenCalledWith(1, {
      kind: "items",
      items: [
        { key: "m1", decision: "keep", wait: true },
        { key: "m2", decision: "keep", wait: false },
      ],
    });
  });

  it("says when an ask was already answered elsewhere, and refreshes", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      answer: vi.fn(() =>
        Promise.reject(
          new ApiError(409, "This was already answered (Kept 3). Nothing was changed."),
        ),
      ),
    });
    const { session } = inSession(<AskCard ask={ask()} />, api);
    await user.click(screen.getByRole("button", { name: "Confirm this list" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already answered");
    expect(session.refresh).toHaveBeenCalled();
  });

  it("marks something only a person can do as done", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={ask({ kind: "needed", items: [] })} />, api);
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "needed", decision: "done" });
  });
});

describe("the other views", () => {
  it("groups what is waiting by role, and explains an empty list", () => {
    const { unmount } = inSession(
      <Needed
        asks={[
          ask({ id: 1, role: "operator" }),
          ask({ id: 2, role: "designer", title: "Pick a look" }),
        ]}
        notifications="off"
      />,
    );
    expect(screen.getByRole("region", { name: "For the designer" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "For the operator" })).toBeTruthy();
    unmount();
    inSession(<Needed asks={[]} notifications="off" />);
    expect(screen.getByText("Nothing is waiting on you.")).toBeTruthy();
  });

  it("shows three phases with the steps under them, and asks before sending back", async () => {
    const user = userEvent.setup();
    const sendBack = vi.fn(() => Promise.resolve(software()));
    inSession(<Line software={software()} />, fakeApi({ sendBack }));
    expect(screen.getByText("Understanding what you want: drafting what it must do")).toBeTruthy();
    for (const name of ["Understand", "Build", "Running"]) {
      expect(screen.getAllByText(name, { selector: ".phase summary strong" })).toBeTruthy();
    }
    expect(
      screen.getAllByRole("listitem").filter((li) => li.className.startsWith("stage ")).length,
    ).toBe(11);
    expect(screen.getAllByText("Here now", { selector: ".phase .chip" }).length).toBe(2);
    await user.click(screen.getAllByRole("button", { name: "Send back here" })[0]!);
    expect(sendBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send back" }));
    expect(sendBack).toHaveBeenCalledWith("s1", "why");
  });

  it("shows what is being built and checked, with each verdict's evidence and what waits on you", async () => {
    const user = userEvent.setup();
    const stages = software().stages.map((st, i) => ({
      ...st,
      position: i < 7 ? ("done" as const) : i === 7 ? ("current" as const) : ("ahead" as const),
    }));
    inSession(
      <Line
        software={software({
          stage: "check",
          stages,
          build: {
            milestone: { id: "M-1", text: "A command that counts words" },
            round: 2,
            roundsAllowed: 3,
            scenarios: 3,
            tasks: [
              {
                number: 1,
                title: "Fix what the check found",
                items: ["W-2"],
                status: "built",
                commit: "abcdef1234",
                note: null,
                fix: true,
              },
            ],
            checks: [
              {
                round: 1,
                commit: "1234567890",
                status: "not-passed",
                when: "2026-11-21T10:00:00Z",
                verdicts: [
                  { item: "W-1", text: "It counts lines.", verdict: "met", evidence: "lines: 3" },
                  {
                    item: "W-2",
                    text: "It counts words.",
                    verdict: "not-met",
                    evidence: 'expected "words: 4", saw: words: 7',
                  },
                ],
                findings: [],
              },
              {
                round: 2,
                commit: "abcdef1234",
                status: "checking",
                when: "2026-11-21T10:05:00Z",
                verdicts: [],
                findings: [],
              },
            ],
            landed: null,
            waiting: ["Should a hyphenated word count as one?"],
          },
        })}
      />,
    );
    expect(screen.getByText("M-1: A command that counts words")).toBeTruthy();
    expect(screen.getByText("Tasks (round 2 of 3)")).toBeTruthy();
    expect(screen.getByText("Built")).toBeTruthy();
    expect(screen.getByText("Should a hyphenated word count as one?")).toBeTruthy();
    expect(screen.getByText(/3 check scenarios were written from your record/)).toBeTruthy();
    expect(screen.getByText("Not passed: back to the builder with what was wrong")).toBeTruthy();
    expect(screen.getByText("Being checked now")).toBeTruthy();
    expect(screen.getByText("Not met")).toBeTruthy();
    await user.click(screen.getAllByText("What the checker saw")[1]!);
    expect(screen.getByText('expected "words: 4", saw: words: 7')).toBeTruthy();
  });

  it("never shows a step that is not reached as failed or pending", () => {
    inSession(<Line software={software()} />);
    const labels = [...document.querySelectorAll(".chip, .sr-only")].map((e) => e.textContent);
    expect(labels.join(" ")).not.toMatch(/pending|failed|skipped/i);
    expect(screen.getAllByText("Comes later").length).toBe(2);
  });

  it("marks steps the work does not need as not needed, with the reason, and no way to send back there", () => {
    const stages = software().stages.map((s) =>
      s.id === "who" || s.id === "exists"
        ? { ...s, position: "skipped" as const, why: "It is for you alone." }
        : s,
    );
    inSession(<Line software={software({ stages })} />);
    expect(screen.getAllByText("Not needed", { selector: ".stage .chip" }).length).toBe(2);
    expect(screen.getAllByText("Not needed here: It is for you alone.").length).toBe(2);
    // Why is done and What is current: two send-back buttons, none on the skipped steps.
    expect(
      screen.getAllByRole("button", { name: /Send back here|Start this step again/ }),
    ).toHaveLength(2);
  });

  it("shows each piece of work's size and steps with their reasons, and lets the operator change them", async () => {
    const user = userEvent.setup();
    const setItemSize = vi.fn(() => Promise.resolve(software()));
    const setItemStages = vi.fn(() => Promise.resolve(software()));
    const undoSplit = vi.fn(() => Promise.resolve(software()));
    const parts = [
      workItem({
        state: "waiting-on-parts",
        current: false,
        canUndoSplit: true,
        sizing: {
          size: { by: "sizer", reason: "Two small things." },
          stages: { by: "sizer", reason: "It is for you alone." },
          split: {
            decision: "split",
            by: "sizer",
            reason: "The two parts are completely separate.",
          },
        },
      }),
      workItem({
        id: 2,
        parentId: 1,
        depth: 1,
        kind: "module",
        origin: "split",
        title: "Fix the title",
        words: "The title has a typo.",
        stages: ["build", "check"],
        skipped: ["why", "who", "exists", "what", "say-back", "plan"],
        allowedStages: ["why", "who", "exists", "what", "say-back", "plan", "build", "check"],
        requiredStages: ["build", "check"],
        sizing: {
          size: { by: "operator", reason: "You changed it from small to medium." },
          stages: { by: "sizer", reason: "A small fix needs building and checking only." },
          split: { decision: "whole", by: "sizer", reason: "It is one line." },
        },
      }),
    ];
    inSession(
      <Line software={software({ work: parts })} />,
      fakeApi({ setItemSize, setItemStages, undoSplit }),
    );
    expect(
      screen.getByText(/Split into parts: The two parts are completely separate./),
    ).toBeTruthy();
    expect(screen.getByText(/A small fix needs building and checking only./)).toBeTruthy();
    expect(screen.getByText(/You changed it from small to medium./)).toBeTruthy();
    expect(screen.getByText("Waiting for its parts")).toBeTruthy();

    const fix = screen.getByText("Fix the title").closest("li")!;
    await user.selectOptions(within(fix as HTMLElement).getByRole("combobox"), "large");
    expect(setItemSize).toHaveBeenCalledWith(2, "large");

    await user.click(within(fix as HTMLElement).getByRole("button", { name: "Change steps" }));
    expect(within(fix as HTMLElement).getByRole("checkbox", { name: /Build/ })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(within(fix as HTMLElement).getByRole("checkbox", { name: "What" }));
    await user.click(within(fix as HTMLElement).getByRole("button", { name: "Save steps" }));
    expect(setItemStages).toHaveBeenCalledWith(2, ["build", "check", "what"]);

    await user.click(screen.getByRole("button", { name: "Undo the split" }));
    expect(undoSplit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Undo split" }));
    expect(undoSplit).toHaveBeenCalledWith(1);
  });

  it("shows milestones with their stops, and standing approvals to withdraw", async () => {
    const user = userEvent.setup();
    const setMilestoneWait = vi.fn(() => Promise.resolve(software()));
    const withdrawApproval = vi.fn(() => Promise.resolve({ ok: true as const }));
    inSession(
      <Line
        software={software({
          milestones: [
            { id: "M-1", text: "Smallest version", wait: true, position: "reached" },
            { id: "M-2", text: "The rest", wait: false, position: "ahead" },
          ],
          approvals: [
            {
              id: 7,
              softwareId: "s1",
              kind: "post",
              label: "posting comments and messages",
              role: "operator",
              given: "2026-11-21T10:00:00Z",
            },
          ],
        })}
      />,
      fakeApi({ setMilestoneWait, withdrawApproval }),
    );
    expect(screen.getByText("(reached)")).toBeTruthy();
    await user.click(screen.getAllByRole("checkbox", { name: "Stop after it" })[1]!);
    expect(setMilestoneWait).toHaveBeenCalledWith("s1", "M-2", true);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(withdrawApproval).toHaveBeenCalledWith(7);
  });

  it("says plainly when real agents cannot start, and offers the scripted look-around", async () => {
    const user = userEvent.setup();
    const scriptedDemo = vi.fn(() => Promise.resolve({ ok: true as const }));
    const o = overview({
      agents: {
        mode: "claude",
        ready: false,
        unavailable: "Real agents cannot start on this machine: Claude Code is missing.",
        scriptedDemo: false,
      },
      setup: [
        {
          name: "Claude Code",
          status: "missing",
          detail: "not found",
          fix: "Install Claude Code, then run `claude` once to log in.",
        },
      ],
    });
    inSession(<AgentsBanner overview={o} />, fakeApi({ scriptedDemo }));
    expect(screen.getByText(/Claude Code is missing/)).toBeTruthy();
    expect(screen.getByText(/run `claude` once to log in/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Look around with scripted agents (not real)" }),
    );
    expect(scriptedDemo).toHaveBeenCalled();
  });

  it("shows struck record items with their reason", async () => {
    const record = vi.fn(() =>
      Promise.resolve({
        softwareId: "s1",
        source: "stand-in" as const,
        files: [
          {
            file: "why.md",
            title: "Why",
            plain: "The problem",
            items: [
              { id: "Y-1", text: "Kept", marks: ["assumed"], status: "live" as const },
              {
                id: "Y-2",
                text: "Gone",
                marks: ["assumed"],
                status: "struck" as const,
                reason: "Wrong",
              },
            ],
          },
          { file: "who.md", title: "Who", plain: "Users", items: [] },
        ],
      }),
    );
    inSession(<RecordView softwareId="s1" />, fakeApi({ record }));
    expect(await screen.findByText("Struck: Wrong")).toBeTruthy();
    expect(screen.getByText("Nothing yet. Written when the Who stage is confirmed.")).toBeTruthy();
  });

  it("labels usage as mocked", () => {
    inSession(<Usage overview={overview()} />);
    expect(screen.getAllByText("Mocked").length).toBeGreaterThan(1);
    expect(screen.getByText(/42% of the subscription's weekly usage used \(mocked\)/)).toBeTruthy();
  });

  it("shows settings read only, with where to change them", async () => {
    const settings = vi.fn(() =>
      Promise.resolve({
        configFile: "/data/config.json",
        dataFolder: "/data",
        settings: [
          {
            key: "queue.max_agent_sessions",
            value: 3,
            default: 2,
            changed: true,
            meaning: "How many agent sessions run at once.",
            allowed: "1 to 16",
            envName: "PREMISE_QUEUE__MAX_AGENT_SESSIONS",
          },
          {
            key: "agents.tasks.build.model",
            value: "opus",
            default: "opus",
            changed: false,
            meaning: "Model.",
            allowed: "a model",
            envName: "PREMISE_AGENTS__TASKS__BUILD__MODEL",
          },
        ],
      }),
    );
    inSession(<Settings overview={overview()} />, fakeApi({ settings }));
    expect(await screen.findByText("/data/config.json")).toBeTruthy();
    expect(screen.getByText("changed; default 2")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "build" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
