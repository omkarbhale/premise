import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentScript, ScriptBehaviour } from "../../src/agents/scripted-agent.js";
import { COUNT_DEMO } from "../../src/demo/demo-softwares.js";
import { demoScript } from "../../src/demo/demos.js";
import { readRecord } from "../../src/demo/scripted-work.js";
import { defaultWebRoot, start } from "../../src/server/start.js";
import { commandLineProject, git } from "../fixtures/existing-projects.js";
import { tempFolder, uniquePortRange } from "../helpers.js";

/**
 * The first-run path in a real (headless) browser, against the line engine with scripted agents (no AI):
 * someone who has read nothing opens the link, starts a software, and answers everything premise
 * asks until it reaches the end of the line. Screenshots of each main state are kept as artefacts.
 */

const SHOTS = resolve(process.env.PREMISE_SCREENSHOTS ?? "test-artifacts/screenshots");

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => ok(port));
    });
  });
}

let browser: Browser;
let running: { close: () => Promise<void>; link: string };

beforeAll(async () => {
  if (!existsSync(join(defaultWebRoot(), "index.html"))) {
    throw new Error("The page is not built. Run `npm run build` before the browser test.");
  }
  mkdirSync(SHOTS, { recursive: true });
  const port = await freePort();
  running = await start({
    dataFolder: tempFolder(),
    env: {
      PREMISE_SERVER__PORT: String(port),
      PREMISE_RUNNER__PORT_RANGE: JSON.stringify((await uniquePortRange()).range),
      PREMISE_AGENTS__MODE: "scripted",
      PREMISE_AGENTS__SCRIPTED__STEP_SECONDS: "1",
    },
    print: () => {},
    run: () => Promise.resolve({ ok: true, output: "1.0.0" }),
  });
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await running?.close();
});

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** The open ask card with this heading. */
function card(page: Page, title: string | RegExp) {
  return page.locator("article.ask").filter({ has: page.getByRole("heading", { name: title }) });
}

describe("first run, in a browser", () => {
  it("explains a missing link", async () => {
    const page = await browser.newPage();
    await page.goto(running.link.split("#")[0]!);
    await expect(
      page.getByRole("heading", { name: "Open premise from its link" }).isVisible(),
    ).resolves.toBe(true);
    await expect(page.getByText("npm run new-link").first().isVisible()).resolves.toBe(true);
    await shot(page, "01-no-link");
    await page.close();
  });

  it("goes from the welcome page to the end of the line", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(running.link);

    // Welcome: what premise is, what to type, what happens next, and that this is a trial.
    await page.getByRole("heading", { name: "Welcome to premise" }).waitFor();
    await page.getByText("What happens next").waitFor();
    await page.getByText("What is real here, and what is not").waitFor();
    await shot(page, "02-welcome");

    // Keyboard only: the idea box has focus, Ctrl+Enter starts.
    await page.keyboard.type(
      "A small web page where I keep my reading list, with notes on each book.",
    );
    await page.keyboard.press("Control+Enter");

    const why = card(page, "Why build it: is this right?");
    await why.waitFor({ timeout: 15_000 });
    await expect(page.title()).resolves.toBe("(1) premise");
    await page
      .getByText("Understanding what you want: drafting why it is worth building")
      .first()
      .waitFor();
    await shot(page, "03-first-draft");

    // Strike one item, edit another, keep the rest.
    const items = why.locator("li.item");
    await items.nth(1).getByRole("button", { name: "Strike" }).click();
    await items
      .nth(1)
      .getByPlaceholder("Why is it wrong? (optional)")
      .fill("I do it on paper and like it");
    await items.nth(2).getByRole("button", { name: "Edit" }).click();
    await items.nth(2).locator("textarea").fill("It must take less effort than paper.");
    await shot(page, "04-draft-being-corrected");
    await why.getByRole("button", { name: "Confirm this list" }).click();

    // A correction in chat goes to the open list.
    const who = card(page, "Who it is for: is this right?");
    await who.waitFor({ timeout: 15_000 });
    await page.getByLabel("Add a correction to the open list").fill("My partner reads it too.");
    await page.getByLabel("Add a correction to the open list").press("Enter");
    await who.getByText("My partner reads it too.").waitFor();
    await who.getByRole("button", { name: "Confirm this list" }).click();

    // What exists: a scripted research job runs, then a question with premise's best guess.
    const exists = card(page, /Build it, or not build it\?/);
    await exists.waitFor({ timeout: 15_000 });
    // One click answers: no second "Answer" press. Declining to build asks once more.
    await exists.getByRole("button", { name: "Do not build it" }).click();
    await exists.getByText(/premise stops here and builds nothing/).waitFor();
    await shot(page, "05a-confirm-do-not-build");
    await exists.getByRole("button", { name: "Cancel" }).click();
    await exists.getByRole("button", { name: "Go with this" }).click();

    const what = card(page, "What it must do: is this right?");
    await what.waitFor({ timeout: 15_000 });
    await what.getByRole("button", { name: "Confirm this list" }).click();

    // One ask on how much to build: three choices with a rough cost; the effort's is picked.
    const scope = card(page, "How much to build?");
    await scope.waitFor({ timeout: 15_000 });
    await scope.getByText(/rough estimate/).waitFor();
    await expect(
      scope.getByRole("radio", { name: /Plus what premise recommends/ }).isChecked(),
    ).resolves.toBe(true);
    await shot(page, "05a-scope");
    await scope.getByRole("button", { name: "Build this much" }).click();

    const sayBack = card(page, "Say back: what I understood");
    await sayBack.waitFor({ timeout: 15_000 });
    await shot(page, "05-say-back");
    await sayBack.getByRole("button", { name: "Confirm what I understood" }).click();

    // Plan: the planner and the reviewer (scripted), then the milestones to confirm.
    const milestones = card(page, "Milestones: is this the right order?");
    await milestones.waitFor({ timeout: 20_000 });
    await milestones
      .getByRole("checkbox", { name: "Stop after this milestone until I say go on" })
      .first()
      .waitFor();
    await shot(page, "06-milestones");
    await milestones.getByRole("button", { name: "Confirm this list" }).click();

    // The gate asks before anything outside this machine; building goes on meanwhile.
    const approval = card(page, /^Create a private repository on GitHub for /);
    await approval.waitFor({ timeout: 15_000 });
    await approval.getByText("What will happen").waitFor();
    // The card says plainly what really happens (nothing, for this step), and why it asks now.
    await approval.getByText(/Nothing happens yet\./).waitFor();
    await approval.getByText(/Nothing is created on GitHub whichever you choose/).waitFor();
    await approval.getByText("Why premise asks now").waitFor();
    await shot(page, "06b-approval");
    await approval.getByRole("button", { name: "Approve once" }).click();

    // Build, check and run go by themselves; the activity view shows the work (under "More").
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /^Activity/ }).click();
    await page.getByRole("heading", { name: "Activity" }).waitFor();
    await page.getByText(/agent sessions in use/).waitFor();
    await shot(page, "07-activity");

    // premise stops after what was asked for: what follows is only its own additions.
    await page.getByRole("button", { name: /^Waiting on you/ }).click();
    // The scripted checker can judge nothing, so premise asks before landing it unverified.
    const unverified = card(page, "Nothing could be checked: land it anyway?");
    await unverified.waitFor({ timeout: 20_000 });
    await unverified.getByText(/cannot judge software/).waitFor();
    await unverified.getByText(/To try it yourself:/).waitFor();
    await shot(page, "07a-nothing-verified");
    await unverified.getByRole("button", { name: "Land it unverified" }).click();
    const reached = card(page, /^Milestone reached: .+Go on\?$/);
    await reached.waitFor({ timeout: 20_000 });
    await shot(page, "07b-first-milestone-reached");
    await reached.getByRole("button", { name: "Go on" }).click();
    // The next milestone is checked the same way: land it unverified too.
    const again = card(page, "Nothing could be checked: land it anyway?");
    await again.waitFor({ timeout: 20_000 });
    await again.getByRole("button", { name: "Land it unverified" }).click();

    await page.getByRole("button", { name: /^Softwares/ }).click();
    await page
      .getByText("Running: waiting for what you say next")
      .first()
      .waitFor({ timeout: 20_000 });
    // The answer is echoed in the conversation, with what happens next (among earlier messages).
    await page.getByRole("button", { name: /^Show \d+ earlier messages/ }).click();
    await page
      .getByText(/You said go on\./)
      .first()
      .waitFor({ timeout: 20_000 });
    await page
      .getByText("Running: waiting for what you say next")
      .first()
      .waitFor({ timeout: 20_000 });
    await expect(page.title()).resolves.toBe("premise");
    await shot(page, "08-end-of-line-conversation");

    // A newcomer sees Conversation and Report; Line, Record and Intake are under "More views".
    await expect(page.getByRole("tab", { name: "Record" }).count()).resolves.toBe(0);
    await page.getByRole("button", { name: "More views" }).click();
    await page.getByRole("tab", { name: "Line" }).click();
    await shot(page, "09-line");
    await page.getByRole("tab", { name: "Record" }).click();
    await page.getByText("Struck: I do it on paper and like it").waitFor();
    await shot(page, "10-record");
    await page.getByRole("tab", { name: "Report" }).click();
    await page
      .getByRole("heading", { name: /^Not verified: premise could not check this/ })
      .waitFor();
    // Never "passed" or "met" first when nothing was verified; scripted checks are said to judge nothing.
    await page.getByText(/scripted agents, which cannot judge software/).waitFor();
    await page.getByRole("heading", { name: "Failed or not checked" }).waitFor();
    await expect(page.locator(".badge-mocked").first().isVisible()).resolves.toBe(true);
    await shot(page, "11-report");

    await page.getByRole("button", { name: /^Waiting on you/ }).click();
    await page.getByText("Nothing is waiting on you.").waitFor();
    await shot(page, "12-nothing-waiting");

    await page.getByRole("button", { name: /^Usage/ }).click();
    await page
      .getByText(/made up/)
      .first()
      .waitFor();
    await shot(page, "13-usage-mocked");

    await page.getByRole("button", { name: /^Settings/ }).click();
    await page.getByText("How to change a setting").waitFor();
    await page.getByText("queue.max_agent_sessions").first().waitFor();
    await shot(page, "14-settings");

    await page.getByRole("button", { name: /^Help/ }).click();
    await shot(page, "15-help");
    await page.close();
  }, 90_000);

  it("is readable at phone width and in dark mode", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
    });
    await page.goto(running.link);
    await page.getByText("Running: waiting for what you say next").first().waitFor();
    // Runs in the page; written as text because this file is type-checked for Node, not a browser.
    const overflow = (await page.evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    )) as number;
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, "16-phone-dark");
    await page.getByRole("button", { name: "Start or bring in" }).click();
    await shot(page, "17-phone-dark-start");
    await page.close();
  }, 30_000);

  it("comes back to the software you were on after a refresh, or the one waiting on you", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(running.link);
    await page.getByRole("button", { name: "Start or bring in" }).click();
    await page.keyboard.type("A tiny tool that counts the words in a file.");
    await page.keyboard.press("Control+Enter");
    const second = card(page, "Why build it: is this right?");
    await second.waitFor({ timeout: 15_000 });
    const secondName = (await page.getByRole("heading", { level: 1 }).first().textContent())!;
    await shot(page, "18-second-software-waiting");

    // A refresh lands on the software that was open, with its question still there.
    await page.reload();
    await card(page, "Why build it: is this right?").waitFor({ timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 }).first().textContent()).resolves.toBe(
      secondName,
    );

    // Picking the other software, then refreshing, stays on it. (What waits on you is listed
    // first, so the other one is not necessarily first in the list.)
    await page.locator('button.software-pick:not([aria-current="true"])').first().click();
    const firstName = (await page.getByRole("heading", { level: 1 }).first().textContent())!;
    expect(firstName).not.toBe(secondName);
    await page.reload();
    await page.getByRole("heading", { level: 1, name: firstName }).waitFor();

    // A link with no software named opens the one that is waiting on you.
    await page.close();
    const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await fresh.goto(running.link);
    await fresh.getByRole("heading", { level: 1, name: secondName }).waitFor();
    await fresh.close();
  }, 60_000);

  it("shows the question before the list of softwares at phone width, with nothing overflowing", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(running.link);
    await card(page, "Why build it: is this right?").waitFor({ timeout: 15_000 });
    const overflow = (await page.evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    )) as number;
    expect(overflow).toBeLessThanOrEqual(0);
    const order = (await page.evaluate(
      `(() => {
        const ask = document.querySelector("article.ask").getBoundingClientRect().top;
        const list = document.querySelector("aside.softwares").getBoundingClientRect().top;
        return ask - list;
      })()`,
    )) as number;
    expect(order).toBeLessThan(0);
    await shot(page, "19-phone-question-first");
    await page.close();
  }, 30_000);

  it("pastes a new link into the same tab and carries on, and says plainly when a link is old", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const base = running.link.split("#")[0]!;
    await page.goto(`${base}#token=not-the-real-one`);
    await page.getByRole("heading", { name: "This link is old" }).waitFor();
    await shot(page, "20-old-link");
    // Only the part after # changes: the page follows it without a reload.
    await page.evaluate(`window.location.hash = ${JSON.stringify(running.link.split("#")[1])}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await expect(page.getByRole("heading", { name: "This link is old" }).count()).resolves.toBe(0);
    await page.close();
  }, 30_000);

  it("says plainly that adding the record to your own repository is real, and then does it", async () => {
    const folder = commandLineProject(join(tempFolder(), "wordcount"));
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(running.link);
    // The welcome page holds the form when nothing is in premise yet; otherwise it is one click away.
    const where = page.getByLabel("Where is it?");
    const startOrBring = page.getByRole("button", { name: "Start or bring in" });
    await Promise.race([where.waitFor(), startOrBring.waitFor()]);
    if (!(await where.isVisible())) await startOrBring.click();
    await where.fill(folder);
    await page.getByRole("button", { name: "Bring it in" }).click();
    // Go through what premise asks, keeping what it says, until it asks to add the record.
    const record = card(page, "Add premise's record to your repository?");
    for (let n = 0; n < 12 && !(await record.isVisible()); n++) {
      const next = page.locator("article.ask").first();
      await Promise.race([
        next.waitFor({ timeout: 20_000 }),
        record.waitFor({ timeout: 20_000 }),
      ]).catch(() => undefined);
      if (await record.isVisible()) break;
      // premise's best guess where there is one; otherwise the card's main button.
      const guess = next.getByRole("button", { name: "Go with this" });
      const go = next.locator("button.primary:enabled").first();
      // A card can change or go while it is clicked; a missed click is tried again on the next turn.
      if (await guess.isVisible()) await guess.click({ timeout: 5_000 }).catch(() => undefined);
      else if (await go.isVisible()) await go.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
    await record.waitFor({ timeout: 20_000 });
    // Its own card: real even with scripted agents, a branch in your repository, nothing leaves.
    await record.getByText("This is real.").waitFor();
    await record.getByText(/Even when the agents are scripted/).waitFor();
    await record.getByText(/Create a branch named premise/).waitFor();
    await expect(record.getByText(/not real|Nothing will be created/).count()).resolves.toBe(0);
    await record
      .getByRole("button", {
        name: /^Approve adding and updating premise's record in your repository for .+ from now on$/,
      })
      .waitFor();
    await shot(page, "21-record-to-your-repository");
    await record.getByRole("button", { name: "Approve once" }).click();
    await page
      .getByText(/^Approved and done: /)
      .first()
      .waitFor({ timeout: 20_000 });
    await shot(page, "22-record-added");
    expect(git(folder, ["branch", "--list", "premise"])).toContain("premise");
    await page.close();
  }, 120_000);

  it("prints help and starts nothing when --help is given to start", () => {
    const folder = join(tempFolder(), "data-folder");
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "server", "cli.js"), "start", "--help", "--data", folder],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(existsSync(folder)).toBe(false);
    const unknown = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "server", "cli.js"), "start", "--hepl", "--data", folder],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(unknown.status).toBe(2);
    expect(existsSync(folder)).toBe(false);
  });
});

const base = demoScript(COUNT_DEMO).rules;

/** Two milestones; the planner writes the first one's wait into its text, as real ones have. */
const twoMilestones: ScriptBehaviour = (_request, call) => {
  const record = readRecord(call);
  const id = (pattern: RegExp) => record.filter((l) => pattern.test(l.line)).map((l) => l.id);
  call("draft_submit", {
    stage: "plan",
    items: COUNT_DEMO.decisions,
    milestones: [
      { text: "It counts lines and characters. (wait)" },
      { text: "It counts words and says plainly when it cannot read a file." },
    ],
    tasks: COUNT_DEMO.tasks.map((t, i) => ({
      title: t.title,
      items: t.serves.flatMap((p) => id(p)),
      check: t.check,
      milestone: i < 2 ? 1 : 2,
    })),
    kind: COUNT_DEMO.kind,
    how_to_run: COUNT_DEMO.howToRun,
  });
};

let triaged = 0;
const script: AgentScript = {
  rules: [
    {
      // The first item taken in is a wish about what milestone 2 builds; the second a bug.
      when: { task: "triage" },
      behave: (_request, call) => {
        const bug = ++triaged > 1;
        call("triage_submit", {
          kind: bug ? "bug" : "wish",
          touches: [
            {
              id: readRecord(call).find((l) =>
                bug ? /lines and characters/.test(l.line) : /cannot be read/.test(l.line),
              )!.id,
              reason: "It is what it is about.",
            },
          ],
          size: "small",
          touches_floor: "no",
          changes_what: bug ? "no" : "yes",
          route: "in-normally",
          reason: bug ? "Something built does not work." : "It asks for something new.",
        });
      },
      end: { outcome: "done" },
    },
    {
      when: { task: "plan", purpose: "draft" },
      behave: twoMilestones,
      end: { outcome: "done" },
    },
    // Slow enough to be seen on the page.
    { ...base.find((r) => r.when?.task === "build")!, delay_ms: 1500 },
    {
      ...base.find((r) => r.when?.task === "check" && r.when?.purpose === "check")!,
      delay_ms: 1500,
    },
    ...base,
  ],
};

function timeline(page: Page) {
  return page.locator("section.timeline");
}

/**
 * Answer each open card with its main choice until `done` is true. A card whose text matches
 * `hold` is left open: answering it is the next step's to do.
 */
async function answerUntil(
  page: Page,
  done: () => Promise<boolean>,
  hold: RegExp | null = null,
  rounds = 120,
) {
  for (let n = 0; n < rounds && !(await done()); n++) {
    const card = page.locator("article.ask").first();
    if (await card.isVisible().catch(() => false)) {
      const text = (await card.textContent().catch(() => "")) ?? "";
      if (!hold || !hold.test(text)) {
        const guess = card.getByRole("button", { name: "Go with this" });
        const main = card.locator("button.primary:enabled").first();
        if (await guess.isVisible().catch(() => false)) {
          await guess.click({ timeout: 3_000 }).catch(() => undefined);
        } else if (await main.isVisible().catch(() => false)) {
          await main.click({ timeout: 3_000 }).catch(() => undefined);
        }
      }
    }
    await page.waitForTimeout(300);
  }
  if (!(await done())) throw new Error("The page did not get there.");
}

async function say(page: Page, text: string) {
  const box = page.getByLabel(/^(Tell premise something|Ask premise for a change)$/);
  await box.fill(text);
  await box.press("Enter");
}

describe("the timeline, in a browser", () => {
  let running: { close: () => Promise<void>; link: string };

  beforeAll(async () => {
    const port = await freePort();
    running = await start({
      dataFolder: tempFolder(),
      env: {
        PREMISE_SERVER__PORT: String(port),
        PREMISE_RUNNER__PORT_RANGE: JSON.stringify((await uniquePortRange()).range),
        PREMISE_RUNNER__CONFINEMENT: "none",
        PREMISE_AGENTS__MODE: "scripted",
        PREMISE_LINE__REMOTE: "local",
        PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: "false",
      },
      print: () => {},
      run: () => Promise.resolve({ ok: true, output: "1.0.0" }),
      script,
    });
  }, 30_000);

  afterAll(async () => {
    await running?.close();
  });
  it("shows the plan, build tasks, a check, a fix round, intake queued and a milestone wait", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(running.link);
    await page.getByRole("heading", { name: "Welcome to premise" }).waitFor();
    await page.keyboard.type(COUNT_DEMO.idea);
    await page.keyboard.press("Control+Enter");

    // Understanding: running now, with the build waiting for the plan.
    const t = timeline(page);
    await t.getByText("Understanding what you want").first().waitFor({ timeout: 15_000 });
    await t.getByText("Build it: the milestones the plan makes", { exact: true }).waitFor();
    await t.getByText("Starts when you confirm the plan.").waitFor();
    await shot(page, "timeline-01-understanding");

    // The plan: the milestones card waits on you, at the point in the timeline where work waits.
    const milestones = page
      .locator("article.ask")
      .filter({ hasText: "Milestones: is this the right order?" });
    await answerUntil(page, () => milestones.isVisible(), /Milestones: is this the right order\?/);
    await t.getByText(/^Plan: /).waitFor();
    await t.getByRole("button", { name: "Answer it" }).first().waitFor();
    await shot(page, "timeline-02-plan-waits-on-you");

    // Build: task 2 of 2 of milestone 1, with its checklist and who is working.
    await answerUntil(page, () => t.getByText(/^Build, task 2 of 2: /).isVisible());
    const m1 = t.getByRole("listitem", { name: "Milestone 1: It counts lines and characters" });
    await m1.getByText(/^Build, task 2 of 2: /).waitFor();
    await m1.getByText(/The builder is working/).waitFor();
    await m1.getByText("Stops after it for you").waitFor();
    await expect(m1.getByText("done:").count()).resolves.toBeGreaterThan(0);
    // A wish while it builds: it shows in the queue at once, with its place and why.
    await say(page, "Also give a clear message when the file is empty or unreadable.");
    await t
      .getByText(/Your change I-1: /)
      .first()
      .waitFor({ timeout: 15_000 });
    await t
      .getByText(/It asks for something new, so it goes after the software's milestones\./)
      .waitFor();
    // A bug too: nothing has landed yet, so for now it waits after the milestones.
    await say(page, "It crashes on an empty file.");
    await t
      .getByText(/Your fix I-2: /)
      .first()
      .waitFor({ timeout: 15_000 });
    await shot(page, "timeline-03-build-task-and-intake-queued");

    // The check of milestone 1; a bug reported meanwhile is feedback on what has landed.
    await t
      .getByText(/^Check, round 1/)
      .first()
      .waitFor({ timeout: 30_000 });
    await shot(page, "timeline-04-check");

    // The stop after milestone 1: waiting on you; the bug goes before milestone 2.
    await answerUntil(
      page,
      () =>
        t
          .getByText("Stopped after this milestone: try it, then say go on", { exact: true })
          .isVisible(),
      /Milestone reached/,
    );
    await t
      .getByText(/Your fix I-2: /)
      .first()
      .waitFor({ timeout: 20_000 });
    await t
      .getByText(/feedback on what has already landed, so it goes before the milestones/)
      .waitFor();
    const order = await t
      .locator('ol[aria-label="Running now and next"] > li .tl-title strong')
      .allTextContents();
    expect(order.map((o) => o.replace(/:.*/, ""))).toEqual([
      "Milestone 1",
      "Your fix I-2",
      "Milestone 2",
      "Your change I-1",
    ]);
    // The wish and milestone 2 change the same part: premise proposes one piece.
    await t.getByText(/I-1 and milestone 2: .* both change/).waitFor();
    await shot(page, "timeline-05-milestone-wait");

    // The same at phone width: readable, nothing overflowing.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(page.url());
    await timeline(phone)
      .getByText(/Your fix I-2: /)
      .first()
      .waitFor();
    const overflow = (await phone.evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    )) as number;
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(phone, "timeline-06-phone-milestone-wait");
    await phone.close();

    await t.getByRole("button", { name: "Build it as part of the milestone" }).click();
    await t
      .getByText(/One change|I-1 and milestone 2/)
      .waitFor({ state: "detached" })
      .catch(() => undefined);
    // Go on: the bug first, then milestone 2, whose check fails once and is fixed.
    await answerUntil(page, () =>
      t
        .getByText(/^Fixing what the check found/)
        .first()
        .isVisible(),
    );
    const fixing = t.locator("li.tl-live").first();
    await fixing.getByText(/^Check, round 1/).waitFor();
    await fixing
      .getByText(/not passed/)
      .first()
      .waitFor();
    await shot(page, "timeline-07-fix-round");

    // The end: everything done, collapsed; nothing running.
    await answerUntil(page, () => t.getByText("Nothing is running right now.").isVisible());
    await t.getByText(/pieces done/).waitFor();
    await shot(page, "timeline-08-done");

    // Activity: one line per software with what runs and what is next.
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /^Activity/ }).click();
    await page.getByRole("heading", { name: "Activity" }).waitFor();
    await shot(page, "timeline-09-activity");
    await page.close();
  }, 300_000);
});
