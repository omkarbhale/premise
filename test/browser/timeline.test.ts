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
import { tempFolder, uniquePortRange } from "../helpers.js";

/**
 * The timeline of the line in a real (headless) browser (decisions 0320, 0321), against the line
 * engine with scripted agents (no AI): the command-line demo is planned in two milestones, built
 * task by task, checked, sent back for a fix, and stopped after milestone 1; a wish and a bug are
 * taken in while it builds. The timeline is read on the page at each point, at laptop and phone
 * width; screenshots are kept as artefacts.
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
      PREMISE_RUNNER__CONFINEMENT: "none",
      PREMISE_AGENTS__MODE: "scripted",
      PREMISE_LINE__REMOTE: "local",
      PREMISE_SOFTWARES__DEFAULT_MILESTONE_WAITS: "false",
    },
    print: () => {},
    run: () => Promise.resolve({ ok: true, output: "1.0.0" }),
    script,
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
