import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultWebRoot, start } from "../../src/server/start.js";
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
    const exists = card(page, /Build it, build on something/);
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
    const approval = card(page, "Allow premise to act in your name outside this machine?");
    await approval.waitFor({ timeout: 15_000 });
    await approval.getByText("What will happen").waitFor();
    // The card says plainly that it is not real in scripted mode, and why it asks now.
    await approval.getByText(/This is a demo, so it is not real/).waitFor();
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
    const reached = card(page, "M-1 reached: go on?");
    await reached.waitFor({ timeout: 20_000 });
    await shot(page, "07b-first-milestone-reached");
    await reached.getByRole("button", { name: "Go on" }).click();
    await reached.getByRole("button", { name: "Answer" }).click();

    await page.getByRole("button", { name: /^Softwares/ }).click();
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
      .getByRole("heading", { name: /^Built and checked|^Nothing has been built/ })
      .waitFor();
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

    // Picking the first software, then refreshing, stays on the first.
    await page.locator("button.software-pick").first().click();
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
