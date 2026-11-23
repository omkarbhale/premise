// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { AskCard } from "../src/components/AskCard";
import { Conversation } from "../src/components/Conversation";
import { Define } from "../src/components/Badges";
import { RecordView } from "../src/components/RecordView";
import { SoftwareView } from "../src/components/SoftwareView";
import { StartForm } from "../src/components/StartForm";
import { ask, fakeApi, inSession, overview, software } from "./fixtures";
import { SessionContext, type Session } from "../src/context";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("an item that rests on the person's words", () => {
  it("shows what they said under the item", () => {
    inSession(
      <AskCard
        ask={ask({
          items: [
            {
              key: "k1",
              text: "Keep a reading list.",
              mark: "from-role",
              from: "operator",
              quote: "I keep my reading list",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("you said: “I keep my reading list”")).toBeTruthy();
  });
});

describe("answering", () => {
  const exists = () =>
    ask({
      kind: "question",
      items: [],
      bestAttempt: "Build it",
      choices: ["Build it", "Do not build it"],
    });

  it("answers a choice in one click", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={exists()} />, api);
    await user.click(screen.getByRole("button", { name: "Build it" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "text", text: "Build it" });
  });

  it("asks once before declining to build, and can be cancelled", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={exists()} />, api);
    await user.click(screen.getByRole("button", { name: "Do not build it" }));
    expect(api.answer).not.toHaveBeenCalled();
    expect(screen.getByText(/premise stops here and builds nothing/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Do not build it" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Do not build it" }));
    await user.click(screen.getByRole("button", { name: "Yes, do not build it" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "text", text: "Do not build it" });
  });

  it("says in the card what really happens if approved, in every mode, and where the work is now", () => {
    const session: Partial<Session> = {
      agentsMode: "scripted",
      softwares: [
        {
          id: "s1",
          name: "Reading list",
          stage: "build",
          state: "active",
          status: "x",
          sizeClass: "small",
          effort: "medium",
          priority: 3,
          milestoneWaits: false,
          openAsks: 1,
          created: "2026-11-21T10:00:00Z",
        },
      ],
    };
    const api = fakeApi();
    const full: Session = {
      api,
      version: 0,
      notCurrent: vi.fn(),
      report: vi.fn(),
      refresh: vi.fn(),
      ...session,
    };
    render(
      <SessionContext.Provider value={full}>
        <AskCard
          ask={ask({
            kind: "approval",
            stage: "plan",
            items: [],
            approval: {
              action: "Create a private repository.",
              why: "To keep the code.",
              floor: "On the floor.",
              waiting: "copying the software to GitHub",
              real: false,
              reality: "Nothing is created on GitHub whichever you choose.",
            },
          })}
        />
      </SessionContext.Provider>,
    );
    // The card's truth comes from the server, per kind of action, not from the agents' mode.
    expect(screen.getByText("Nothing happens yet.")).toBeTruthy();
    expect(screen.getByText(/Nothing is created on GitHub whichever you choose/)).toBeTruthy();
    expect(screen.queryByText(/This is a demo, so it is not real/)).toBeNull();
    expect(screen.getByText(/Now: Building it/)).toBeTruthy();
    expect(screen.getByText(/Waiting on your answer: copying the software to GitHub/)).toBeTruthy();
    expect(screen.getByText("Why premise asks now")).toBeTruthy();
  });

  it("says a write to the person's own repository is real, even with scripted agents", () => {
    inSession(
      <AskCard
        ask={ask({
          kind: "approval",
          title: "Add premise's record to your repository?",
          items: [],
          approval: {
            action: "Create a branch named premise in your repository.",
            why: "So the record lives with the code.",
            floor: "On the floor.",
            real: true,
            reality: "Even when the agents are scripted, approving writes a branch.",
            kindLabel: "adding and updating premise's record in your repository",
          },
        })}
      />,
    );
    expect(screen.getByText("This is real.")).toBeTruthy();
    expect(screen.getByText(/Even when the agents are scripted/)).toBeTruthy();
    expect(screen.queryByText(/not real/)).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Approve adding and updating premise's record in your repository for Reading list from now on",
      }),
    ).toBeTruthy();
  });

  it("shows what you struck and why on the redone list", () => {
    inSession(
      <AskCard
        ask={ask({
          struckBefore: [{ text: "Nobody else needs a say yet.", reason: "my sister too" }],
        })}
      />,
    );
    expect(screen.getByText(/Nobody else needs a say yet\./)).toBeTruthy();
    expect(screen.getByText(/my sister too/)).toBeTruthy();
    expect(screen.getByText("You struck:")).toBeTruthy();
  });

  it("offers Open it on a milestone's card only when there is a link to open", async () => {
    const api = fakeApi({ run: vi.fn(() => Promise.resolve(runView("http://127.0.0.1:4100/"))) });
    inSession(
      <AskCard
        ask={ask({
          kind: "question",
          items: [],
          title: "Milestone reached: A page that greets people. Go on?",
          milestone: { id: "M-1", title: "A page that greets people" },
          choices: ["Go on", "Go back to Why"],
        })}
      />,
      api,
    );
    expect(await screen.findByRole("link", { name: "Open it" })).toBeTruthy();
    expect(screen.queryByText(/type this in a terminal/)).toBeNull();
  });

  it("shows how to try command-line software on a milestone's card, with Go on as the main answer", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    const api = fakeApi({ run: vi.fn(() => Promise.resolve(runView(null))) });
    const full: Session = {
      api,
      version: 0,
      notCurrent: vi.fn(),
      report: vi.fn(),
      refresh: vi.fn(),
      go,
    };
    render(
      <SessionContext.Provider value={full}>
        <AskCard
          ask={ask({
            kind: "question",
            items: [],
            title: "Milestone reached: A page that greets people. Go on?",
            milestone: { id: "M-1", title: "A page that greets people" },
            choices: ["Go on", "Go back to Why"],
          })}
        />
      </SessionContext.Provider>,
    );
    // Command-line software has nothing to open: the card shows the command instead.
    expect(await screen.findByText("node x.mjs")).toBeTruthy();
    expect(screen.getByText(/type this in a terminal/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open it" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "See the report" }));
    expect(go).toHaveBeenCalledWith("s1", "report");
    expect(screen.queryByText(/M-1/)).toBeNull();
    // Going on is the main answer; going back is the quiet one; no free text to mis-send.
    expect(screen.getByRole("button", { name: "Go on" }).className).toContain("primary");
    expect(screen.getByRole("button", { name: "Go back to Why" }).className).not.toContain(
      "primary",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

function runView(link: string | null) {
  return {
    softwareId: "s1",
    state: link ? ("running" as const) : ("finished" as const),
    plain: "",
    kind: link ? ("web" as const) : ("command" as const),
    commit: "abc1234",
    link,
    command: "node x.mjs",
    folder: null,
    output: [],
    outputIsSample: false,
    restarts: 0,
    confined: true,
    started: null,
    ended: null,
    canStart: false,
    canStop: false,
  };
}

describe("the message box", () => {
  it("says whether what you type corrects the open list or asks for a change", async () => {
    const draft = ask();
    const { unmount } = inSession(<Conversation softwareId="s1" asks={[draft]} />);
    expect(screen.getByLabelText("Add a correction to the open list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add correction" })).toBeTruthy();
    unmount();
    const { unmount: unmount2 } = inSession(<Conversation softwareId="s1" asks={[]} />);
    expect(screen.getByLabelText("Ask premise for a change")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask for this change" })).toBeTruthy();
    unmount2();
    // Before anything is built, there is no change to ask for.
    inSession(<Conversation softwareId="s1" asks={[]} />, fakeApi(), {
      softwares: [{ ...software(), stage: "why" }],
    });
    expect(screen.getByLabelText("Tell premise something")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask for this change" })).toBeNull();
  });

  it("shows no 'waiting on you' pointer where the ask itself is", () => {
    inSession(<Conversation softwareId="s1" asks={[ask()]} />);
    expect(screen.getByRole("heading", { name: "Your turn" })).toBeTruthy();
    expect(screen.queryByText(/under Waiting on you/)).toBeNull();
  });
});

describe("one software", () => {
  it("says it is your turn, hides the made-up usage line, and shows only the tabs a newcomer needs", async () => {
    const user = userEvent.setup();
    inSession(<SoftwareView softwareId="s1" tab="conversation" onTab={vi.fn()} asks={[ask()]} />);
    await screen.findByText("Your turn: answer below.");
    expect(screen.queryByText(/Usage:/)).toBeNull();
    expect(screen.getByRole("tab", { name: /Conversation/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Report" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Record" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More views" }));
    expect(screen.getByRole("tab", { name: "Record" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Line" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Intake" })).toBeTruthy();
  });

  it("says an ended software ended, not that it is running", async () => {
    inSession(
      <SoftwareView softwareId="s1" tab="conversation" onTab={vi.fn()} asks={[]} />,
      fakeApi({
        software: vi.fn(() =>
          Promise.resolve(
            software({ state: "ended", stage: "report", status: "Ended: nothing was built." }),
          ),
        ),
      }),
    );
    await screen.findByText("Ended: you decided not to build it");
    expect(screen.queryByText(/Running/)).toBeNull();
  });
});

describe("the record", () => {
  it("marks an earlier outcome as superseded by the later one", async () => {
    const item = (id: string, text: string) => ({
      id,
      text,
      marks: ["from: operator"],
      status: "live" as const,
    });
    inSession(
      <RecordView softwareId="s1" />,
      fakeApi({
        record: vi.fn(() =>
          Promise.resolve({
            softwareId: "s1",
            source: "record" as const,
            files: [
              {
                file: "exists.md",
                title: "What exists",
                plain: "",
                items: [item("E-2", "Outcome: Do not build it"), item("E-4", "Outcome: Build it")],
              },
            ],
          }),
        ),
      }),
    );
    await screen.findByText("Superseded by E-4");
    expect(screen.getAllByText(/Superseded by/)).toHaveLength(1);
  });
});

describe("premise words", () => {
  it("are explained in place the first time they appear, and not again", () => {
    inSession(
      <>
        <Define term="milestone">milestone</Define>
        <Define term="milestone">milestone</Define>
      </>,
    );
    // Only the first carries its meaning in the text.
    expect(screen.getAllByText(/a stopping point that ends with running software/)).toHaveLength(1);
  });
});

describe("the page's links", () => {
  function stubApi(softwares: { id: string; name: string; openAsks: number }[]) {
    const summary = (s: (typeof softwares)[number]) => ({
      ...software({ id: s.id, name: s.name, openAsks: s.openAsks }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: { headers?: Record<string, string> }) => {
        const token = init?.headers?.["x-premise-token"];
        const reply = (status: number, body: unknown) =>
          Promise.resolve({
            ok: status < 400,
            status,
            text: () => Promise.resolve(JSON.stringify(body)),
          });
        if (token !== "good")
          return reply(401, { error: "This link is not current.", code: "NOT_CURRENT" });
        if (url === "/api/overview") {
          return reply(
            200,
            overview({
              softwares: softwares.map(summary),
              openAsks: softwares.reduce((n, s) => n + s.openAsks, 0),
            }),
          );
        }
        if (url.startsWith("/api/asks")) return reply(200, []);
        const id = /\/api\/softwares\/([^/]+)/.exec(url)?.[1];
        const found = softwares.find((s) => s.id === id);
        if (url.endsWith("/chat")) return reply(200, []);
        if (/\/api\/softwares\/[^/?]+\/[^?]/.test(url))
          return reply(404, { error: "not in this stub" });
        if (found) return reply(200, summary(found));
        return reply(404, { error: "no" });
      }),
    );
  }

  it("come back to the software you were on after a refresh", async () => {
    stubApi([
      { id: "a", name: "First one", openAsks: 0 },
      { id: "b", name: "Second one", openAsks: 0 },
    ]);
    window.location.hash = "#token=good&software=b";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Second one", level: 1 })).toBeTruthy();
  });

  it("open the software waiting on you when the link names none", async () => {
    stubApi([
      { id: "a", name: "First one", openAsks: 0 },
      { id: "b", name: "Second one", openAsks: 1 },
    ]);
    window.location.hash = "#token=good";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Second one", level: 1 })).toBeTruthy();
  });

  it("remember the open software in the link, keeping the token", async () => {
    const user = userEvent.setup();
    stubApi([
      { id: "a", name: "First one", openAsks: 0 },
      { id: "b", name: "Second one", openAsks: 0 },
    ]);
    window.location.hash = "#token=good";
    render(<App />);
    await screen.findByRole("heading", { name: "First one", level: 1 });
    await user.click(screen.getByRole("button", { name: /Second one/ }));
    expect(window.location.hash).toBe("#token=good&software=b");
    // The tab is kept too, so a refresh comes back to it.
    await user.click(await screen.findByRole("tab", { name: "Report" }));
    expect(window.location.hash).toBe("#token=good&software=b&tab=report");
  });

  it("come back to the tab you were on after a refresh", async () => {
    stubApi([{ id: "a", name: "First one", openAsks: 0 }]);
    window.location.hash = "#token=good&software=a&tab=record";
    render(<App />);
    expect(await screen.findByRole("tab", { name: "Record", selected: true })).toBeTruthy();
  });

  it("say plainly that an old link is old, and recover when a new one is pasted in", async () => {
    stubApi([{ id: "a", name: "First one", openAsks: 0 }]);
    window.location.hash = "#token=old";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "This link is old" })).toBeTruthy();
    // A new link pasted into the same tab only changes the part after #.
    act(() => {
      window.location.hash = "#token=good";
    });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "This link is old" })).toBeNull(),
    );
    expect(await screen.findByRole("heading", { name: "First one", level: 1 })).toBeTruthy();
  });

  it("show the real address in the example link when there is no link at all", () => {
    render(<App />);
    expect(screen.getByText(`${window.location.origin}/#token=…`)).toBeTruthy();
  });

  it("show a first visit only the pages it needs, with the rest under More", async () => {
    const user = userEvent.setup();
    render(<App api={fakeApi()} />);
    await screen.findByRole("heading", { name: "Welcome to premise" });
    const nav = screen.getByRole("navigation", { name: "premise" });
    expect(within(nav).getByRole("button", { name: /Softwares/ })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /Help/ })).toBeTruthy();
    expect(within(nav).queryByRole("button", { name: /^Activity/ })).toBeNull();
    expect(within(nav).queryByRole("button", { name: /^Settings/ })).toBeNull();
    await user.click(within(nav).getByRole("button", { name: "More" }));
    expect(within(nav).getByRole("button", { name: /^Activity/ })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /^Usage/ })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /^Settings/ })).toBeTruthy();
  });
});

describe("plain words instead of setting names", () => {
  it("offers to let premise decide how much to build, naming its usual effort", () => {
    inSession(<StartForm onStarted={vi.fn()} />, fakeApi(), {
      defaults: { effort: "medium", priority: 3, milestoneWaits: false },
    });
    expect(screen.getByRole("option", { name: "Let premise decide (medium)" })).toBeTruthy();
    expect(screen.queryByText(/default_effort/)).toBeNull();
  });

  it("links the assumption about claiming an area to the claim form", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    inSession(
      <AskCard
        ask={ask({
          stage: "who",
          items: [
            {
              key: "u1",
              text: "Nobody else needs a say yet. Anyone can claim an area later, such as the look of the main screen.",
              mark: "assumed",
            },
          ],
        })}
      />,
      fakeApi(),
      { go },
    );
    await user.click(screen.getByRole("button", { name: "Claim an area" }));
    expect(go).toHaveBeenCalledWith("s1", "line");
  });
});
