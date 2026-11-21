import { describe, expect, it } from "vitest";
import { runDemo } from "../src/demo/demos.js";
import { openDatabase } from "../src/storage/database.js";
import { tempFolder, uniquePortRange } from "./helpers.js";

/**
 * The kept demos (decisions 0108-0110), run in the test suite with the scripted agent and a scripted
 * operator, no AI: a command-line utility and a small web app, each from a one-paragraph idea to
 * running software. In each, one assumption is struck at the say-back and the record changes to
 * match, and a defect planted in the build is caught by the check and then fixed.
 */

async function demo(which: "cli" | "web") {
  const dataFolder = tempFolder();
  const { range } = await uniquePortRange(20);
  const result = await runDemo(which, { dataFolder, confinement: "none", portRange: range });
  return { result, dataFolder };
}

function verdictEvents(dataFolder: string, softwareId: string) {
  const { db } = openDatabase(dataFolder);
  try {
    return (
      db
        .prepare(
          "SELECT reference, detail FROM events WHERE software_id = ? AND module = 'checker' AND kind = 'verdict' ORDER BY id",
        )
        .all(softwareId) as { reference: string; detail: string }[]
    ).map((r) => ({
      item: r.reference,
      ...(JSON.parse(r.detail) as { verdict: string; commit: string; round: number }),
    }));
  } finally {
    db.close();
  }
}

describe.each(["cli", "web"] as const)("the %s demo", (which) => {
  it("goes from the idea to running software, striking one assumption and catching a planted defect", async () => {
    const { result, dataFolder } = await demo(which);

    // The whole line, with the struck say-back item's stage redone and said back again.
    expect(result.stage).toBe("intake");
    const sayBacks = result.stages.filter((s) => s === "say-back").length;
    expect(sayBacks).toBe(2);
    expect(result.stages.slice(-5)).toEqual(["build", "check", "run", "report", "intake"]);

    // The struck assumption is struck in the record too, with the operator's reason.
    expect(result.struck).not.toBeNull();
    const struckItems = result.record.files
      .flatMap((f) => f.items)
      .filter(
        (i) =>
          i.status === "struck" &&
          (i.text.includes(result.struck!.text) || result.struck!.text.includes(i.text)),
      );
    expect(struckItems.length).toBeGreaterThan(0);
    expect(struckItems[0]!.reason).toContain(result.struck!.reason);

    // The check caught the planted defect, the builder fixed it, and the second check passed.
    const checks = result.build!.checks;
    expect(checks.map((c) => c.status)).toEqual(["not-passed", "passed"]);
    const caught = checks[0]!.verdicts.filter((v) => v.verdict === "not-met");
    expect(caught).toHaveLength(1);
    expect(caught[0]!.evidence).toMatch(/expected/);
    expect(checks[1]!.verdicts.every((v) => v.verdict === "met")).toBe(true);
    expect(checks[0]!.commit).not.toBe(checks[1]!.commit);
    expect(result.build!.tasks.at(-1)).toMatchObject({ fix: true, status: "built" });

    // Each verdict is recorded against the exact commit it judged.
    const events = verdictEvents(dataFolder, result.softwareId);
    for (const check of checks) {
      const mine = events.filter((e) => e.round === check.round);
      expect(mine.length).toBe(check.verdicts.length);
      expect(new Set(mine.map((e) => e.commit))).toEqual(new Set([check.commit]));
    }

    // Landed by the server, started by the runner, and reported for that commit.
    expect(result.build!.landed).not.toBeNull();
    expect(result.run.commit).toBe(result.build!.landed!.commit.slice(0, 7));
    if (which === "cli") {
      expect(result.run.state).toBe("finished");
      expect(result.run.output.join("\n")).toContain("words: 10");
    } else {
      // The demo stops the software when it ends; it was running until then.
      expect(
        result.said.some((s) => /It is running: open http:\/\/127\.0\.0\.1:\d+\//.test(s)),
      ).toBe(true);
    }
    expect(result.report.written).not.toBeNull();
    expect(result.said).toContain("The report is ready: open the Report tab.");
    // The web demo stops after its milestone until the operator says go on.
    const wait = result.answered.find((a) => a.title.startsWith("Milestone reached:"));
    if (which === "web") expect(wait?.answer).toBe("Go on");
    else expect(wait).toBeUndefined();
  }, 60_000);
});

describe("the budget demo", () => {
  it("overruns a deliberately small budget, pauses the software and says what was spent on what", async () => {
    const dataFolder = tempFolder();
    const { range } = await uniquePortRange(20);
    const result = await runDemo("cli", {
      dataFolder,
      confinement: "none",
      portRange: range,
      smallBudgetUsd: 0.5,
    });
    // It stopped partway, paused for its budget, instead of reaching running software.
    expect(result.stage).not.toBe("intake");
    const overrun = result.usage.budget.overrun!;
    expect(overrun.message).toContain("used up its budget of $0.50 a week");
    expect(overrun.mocked).toBe(true);
    expect(overrun.spentByStage.length).toBeGreaterThan(0);
    expect(result.usage.total.cost.mocked).toBe(true);
    expect(result.usage.total.measured.sessions).toBeGreaterThan(0);
    // The report puts it first under Needed, with every cost line marked mocked.
    const needed = result.report.sections.find((s) => s.title === "Needed")!;
    expect(needed.lines[0]!.text).toContain("used up its budget");
    expect(result.report.cost.lines!.every((l) => l.mocked)).toBe(true);
  }, 60_000);
});
