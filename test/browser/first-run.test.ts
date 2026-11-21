import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultWebRoot, start } from "../../src/server/start.js";
import { tempFolder } from "../helpers.js";

/**
 * The first-run path in a real (headless) browser, against the stand-in line and scripted agents:
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
    await page.getByText("This is a trial run").waitFor();
    await shot(page, "02-welcome");

    // Keyboard only: the idea box has focus, Ctrl+Enter starts.
    await page.keyboard.type(
      "A small web page where I keep my reading list, with notes on each book.",
    );
    await page.keyboard.press("Control+Enter");

    const why = card(page, "Why build it: is this right?");
    await why.waitFor();
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
    await who.waitFor();
    await page.getByLabel("Say something to premise").fill("My partner reads it too.");
    await page.getByLabel("Say something to premise").press("Enter");
    await who.getByText("My partner reads it too.").waitFor();
    await who.getByRole("button", { name: "Confirm this list" }).click();

    // What exists: a scripted research job runs, then a question with premise's best guess.
    const exists = card(page, /Build it, build on something/);
    await exists.waitFor({ timeout: 15_000 });
    await exists.getByRole("button", { name: "Use this" }).click();
    await exists.getByRole("button", { name: "Answer" }).click();

    await card(page, "What it must do: is this right?")
      .getByRole("button", { name: "Confirm this list" })
      .click();

    const sayBack = card(page, "Say back: what I understood");
    await sayBack.waitFor();
    await shot(page, "05-say-back");
    await sayBack.getByRole("button", { name: "Confirm what I understood" }).click();

    // Plan: a scripted job, then the gate's approval card.
    const approval = card(page, "Create the software's repository?");
    await approval.waitFor({ timeout: 15_000 });
    await approval.getByText("What will happen").waitFor();
    await shot(page, "06-approval");
    await approval.getByRole("button", { name: "Approve once" }).click();

    // Build, check and run go by themselves; the activity view shows the work.
    await page.getByRole("button", { name: /^Activity/ }).click();
    await page.getByRole("heading", { name: "Activity" }).waitFor();
    await page.getByText(/agent sessions in use/).waitFor();
    await shot(page, "07-activity");

    await page.getByRole("button", { name: /^Softwares/ }).click();
    await page
      .getByText("Running: waiting for what you say next")
      .first()
      .waitFor({ timeout: 20_000 });
    await expect(page.title()).resolves.toBe("premise");
    await shot(page, "08-end-of-line-conversation");

    await page.getByRole("tab", { name: "Line" }).click();
    await shot(page, "09-line");
    await page.getByRole("tab", { name: "Record" }).click();
    await page.getByText("Struck: I do it on paper and like it").waitFor();
    await shot(page, "10-record");
    await page.getByRole("tab", { name: "Report" }).click();
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
    await page.getByRole("button", { name: "Start another" }).click();
    await shot(page, "17-phone-dark-start");
    await page.close();
  }, 30_000);
});
