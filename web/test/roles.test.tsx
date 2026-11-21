// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClaimView, ReportView } from "../src/api";
import { AskCard } from "../src/components/AskCard";
import { Claims } from "../src/components/Claims";
import { Needed } from "../src/components/Needed";
import { ReportView as ReportPage } from "../src/components/ReportView";
import { SoftwareView } from "../src/components/SoftwareView";
import { ask, fakeApi, inSession, software } from "./fixtures";

/**
 * Roles and taste on the page (decisions 0065, 0102, 0196): role labels only when there is more than
 * the operator, said once; claims made and released in plain words; proposals kept or corrected;
 * real-world acts as steps; and the polish from the page review.
 */

afterEach(() => cleanup());

const designer = ask({
  id: 7,
  role: "designer",
  kind: "proposal",
  stage: "build",
  title: "How the look of the main screen should be",
  instruction: "You claimed the look of the main screen, so premise shows you 2 ways.",
  items: [
    { key: "o1", text: "Light: White background.", mark: "suggestion" },
    { key: "o2", text: "Cards: Each book as a card.", mark: "suggestion" },
  ],
  claim: { id: 1, area: "the look of the main screen" },
});

describe("role labels", () => {
  it("shows no role label at all when only the operator is asked anything", () => {
    inSession(<AskCard ask={ask()} />, fakeApi(), { roles: [] });
    expect(screen.queryByText(/For the/)).toBeNull();
  });

  it("labels every ask with its role once another role is in use", () => {
    inSession(<AskCard ask={ask()} />, fakeApi(), { roles: ["designer"] });
    expect(screen.getByText("For the operator")).toBeTruthy();
  });

  it("groups Waiting on you by role and says once that one person answers for all", () => {
    inSession(<Needed asks={[ask(), designer]} notifications="off" />, fakeApi(), {
      roles: ["designer"],
    });
    expect(screen.getByRole("heading", { name: /For the operator/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /For the designer/ })).toBeTruthy();
    const notes = screen.getAllByText(/in this session you answer for all of them/);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toContain("the operator and the designer");
  });

  it("lists asks plainly, with no role headings, when only the operator is asked", () => {
    inSession(<Needed asks={[ask()]} notifications="off" />, fakeApi(), { roles: [] });
    expect(screen.queryByRole("heading", { name: /For the/ })).toBeNull();
    expect(screen.queryByText(/answer for all of them/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Why build it: is this right?" })).toBeTruthy();
  });

  it("names roles only when something waiting is for another role, not because a claim exists", () => {
    inSession(<Needed asks={[ask()]} notifications="off" />, fakeApi(), {
      roles: ["designer"],
    });
    expect(screen.queryByText(/Questions are for different roles/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /For the/ })).toBeNull();
  });
});

describe("a proposal for a claimed area", () => {
  it("keeps the option picked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={designer} />, api, { roles: ["designer"] });
    const keep = screen.getByRole("button", { name: "Pick one to keep" });
    expect((keep as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("radio", { name: /Cards/ }));
    await user.click(screen.getByRole("button", { name: "Keep this one" }));
    expect(api.answer).toHaveBeenCalledWith(7, {
      kind: "proposal",
      decision: "accept",
      choice: "o2",
    });
  });

  it("takes the claimer's own words instead", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(<AskCard ask={designer} />, api, { roles: ["designer"] });
    await user.click(screen.getByRole("button", { name: "Change something…" }));
    await user.type(screen.getByLabelText("What to change"), "Dark, large type");
    await user.click(screen.getByRole("button", { name: "Build it this way" }));
    expect(api.answer).toHaveBeenCalledWith(7, {
      kind: "proposal",
      decision: "change",
      text: "Dark, large type",
    });
  });
});

describe("something only a person can do", () => {
  it("shows the exact steps, the file for the secret, and that premise never takes it", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    inSession(
      <AskCard
        ask={ask({
          kind: "needed",
          role: "account holder",
          title: "Create an account with Postbox",
          items: [
            { key: "s1", text: "Sign up on Postbox.", mark: "assumed" },
            { key: "s2", text: "Make an API key.", mark: "assumed" },
          ],
          secret: { key: "POSTBOX_KEY", file: "/data/secrets/s1.env" },
        })}
      />,
      api,
      { roles: ["account holder"] },
    );
    expect(screen.getByText("For the account holder")).toBeTruthy();
    const steps = screen.getByRole("list");
    expect(
      within(steps)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Sign up on Postbox.", "Make an API key."]);
    expect(screen.getByText(/never takes the secret on this page/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "It is done" }));
    expect(api.answer).toHaveBeenCalledWith(1, { kind: "needed", decision: "done" });
  });
});

describe("claims", () => {
  const claim = (change: Partial<ClaimView> = {}): ClaimView => ({
    id: 3,
    softwareId: "s1",
    role: "designer",
    area: "the look of the main screen",
    state: "proposal-open",
    created: "2026-11-21T10:00:00Z",
    ...change,
  });

  it("claims a part in plain words, under a role, and releases it", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      claim: vi.fn(() => Promise.resolve(claim())),
      releaseClaim: vi.fn(() => Promise.resolve(claim({ state: "released" }))),
    });
    const { session } = inSession(<Claims software={software({ claims: [claim()] })} />, api);
    expect(screen.getByText("the look of the main screen")).toBeTruthy();
    expect(screen.getByText(/for the designer/)).toBeTruthy();
    expect(screen.getByText(/a proposal is waiting for an answer/)).toBeTruthy();
    await user.type(screen.getByLabelText(/Which part/), "the wording of errors");
    await user.type(screen.getByLabelText(/Who decides it/), "writer");
    await user.click(screen.getByRole("button", { name: "Claim it" }));
    expect(api.claim).toHaveBeenCalledWith("s1", "the wording of errors", "writer");
    await user.click(screen.getByRole("button", { name: "Release" }));
    expect(api.releaseClaim).toHaveBeenCalledWith(3);
    expect(session.refresh).toHaveBeenCalled();
  });

  it("says what went wrong next to the form", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      claim: vi.fn(() => Promise.reject(new Error('"x" is already claimed by the writer.'))),
    });
    inSession(<Claims software={software()} />, api);
    await user.type(screen.getByLabelText(/Which part/), "the colours");
    await user.click(screen.getByRole("button", { name: "Claim it" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/already claimed/)).toBeTruthy();
  });
});

describe("polish from the page review", () => {
  it("explains a step in place without brackets inside brackets", async () => {
    inSession(<SoftwareView softwareId="s1" tab="conversation" onTab={vi.fn()} asks={[]} />);
    const where = (await screen.findByText(/the What/)).closest("p")!;
    expect(where.textContent).not.toMatch(/\([^)]*\(/);
    expect(where.textContent).toContain("one of the eleven stages of the work");
  });

  it("leads Decided with what the person decided and folds premise's own assumptions", async () => {
    const page: ReportView = {
      softwareId: "s1",
      headline: "Built and checked.",
      source: "reporter",
      written: "2026-11-22T10:00:00.000Z",
      detail: false,
      hiddenLines: 0,
      sections: [
        {
          title: "Decided",
          plain: "What was decided.",
          lines: [
            { text: "must: Titles can be added.", evidence: "record item W-1" },
            { text: "It runs on Node.js.", evidence: "record item D-1", premises: true },
          ],
        },
      ],
      running: null,
      cost: { mocked: true, text: "3 agent sessions." },
      limits: [],
    };
    inSession(
      <ReportPage softwareId="s1" />,
      fakeApi({ report: vi.fn(() => Promise.resolve(page)) }),
    );
    const decided = await screen.findByRole("region", { name: "Decided" });
    const first = within(decided).getAllByRole("listitem")[0]!;
    expect(first.textContent).toContain("Titles can be added.");
    const folded = within(decided).getByText(/What premise assumed or chose itself \(1\)/);
    const details = folded.closest("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("It runs on Node.js.")).toBeTruthy();
  });
});
