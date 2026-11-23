import type { ReportLine, ReportView } from "../shared/api-types.js";
import { ownFiguresWords } from "../shared/own-figures.js";
import { stageName } from "../shared/stages.js";
import { roleWords } from "../shared/roles.js";
import type { Facts } from "./facts.js";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Build a report from recorded facts, and from nothing else (decision 0097). Every line carries
 * the fact it rests on, so a person can follow it. What was not checked is said, not left out.
 * This is a pure function: the same facts always give the same report.
 */

export interface BuildOptions {
  detail: boolean;
  maxLines: number;
  source?: ReportView["source"];
  written?: string | null;
  /** The version (commit) the report is about; the latest commit when not given. */
  commit?: string | undefined;
}

const SHORT = (sha: string) => sha.slice(0, 7);

function sameVersion(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

function checkedAt(verdictCommit: string | null, current: string | undefined): boolean {
  if (!verdictCommit || !current) return true;
  return sameVersion(verdictCommit, current);
}

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function firstLine(text: string | null | undefined): string {
  return (text ?? "").trim().split("\n")[0] ?? "";
}

interface Section {
  title: string;
  plain: string;
  lines: ReportLine[];
  /** Lower is shown first when the short report has to leave lines out. */
  rank: number;
}

export function buildReport(facts: Facts, options: BuildOptions): ReportView {
  const current = options.commit ?? facts.commits[0]?.sha;
  const latest0 = facts.commits[0]?.sha;
  // A verdict on a commit with the same code as the latest holds for the latest version too.
  const verdictOf = new Map(
    facts.verdicts.map((v) => [
      v.item,
      v.sameCodeAsLatest && current && latest0 && sameVersion(current, latest0)
        ? { ...v, commit: current }
        : v,
    ]),
  );
  const itemById = new Map(facts.items.map((i) => [i.id, i]));
  const lastDay = facts.lastReport?.slice(0, 10) ?? null;

  // ---- Decided -----------------------------------------------------------------------------
  // What this milestone changed, people's own words first (decision 0280). premise's own
  // assumptions and choices, and what was decided before, are behind "Show more detail".
  const latestRun = facts.runs[0];
  const startFailed =
    latestRun !== undefined && (latestRun.status === "failed" || latestRun.status === "crashed");
  const decided: ReportLine[] = [];
  if (facts.milestone) {
    const what = facts.milestone.text ? `: ${sentence(facts.milestone.text)}` : ".";
    decided.push({
      text: startFailed
        ? `This milestone is built and checked, but it is not running${what}`
        : `This milestone is reached${what}`,
      evidence: `record item ${facts.milestone.id}`,
    });
  }
  const changedNow = (i: (typeof facts.items)[number]) => !lastDay || i.marks.date >= lastDay;
  // What people decided leads; premise's own assumptions and choices follow, folded on the page.
  const byPeople = (i: (typeof facts.items)[number]) =>
    i.marks.from !== "assumed" && i.marks.from !== "recovered" ? 0 : 1;
  const itemLine = (item: (typeof facts.items)[number], earlier: boolean): ReportLine => {
    const priority = item.marks.priority ? `${item.marks.priority}: ` : "";
    const tag = item.marks.priority ? ` (${item.marks.priority})` : "";
    return {
      ...(byPeople(item) === 1 && { premises: true }),
      ...(earlier && { earlier: true }),
      text: item.marks.leftOut
        ? `Left out, not built: ${item.id}${tag}: ${sentence(item.text)} To build it after all, send the software back to What on the Line tab; premise asks how much to build again.`
        : `${priority}${sentence(item.text)}`,
      evidence: `record item ${item.id}, ${item.file}`,
    };
  };
  const now = [...facts.items.filter(changedNow)].sort((x, y) => byPeople(x) - byPeople(y));
  const before = facts.items.filter((i) => !changedNow(i));
  const ownNow = now.filter((i) => byPeople(i) === 1);
  for (const item of options.detail ? now : now.filter((i) => byPeople(i) === 0)) {
    decided.push(itemLine(item, false));
  }
  if (!options.detail && ownNow.length > 0) {
    decided.push({
      premises: true,
      text: `premise assumed or chose ${plural(ownNow.length, "more thing")} itself. "Show more detail" lists them.`,
      evidence: "the software's record",
    });
  }
  if (options.detail) {
    for (const item of before) decided.push(itemLine(item, true));
  } else if (before.length > 0) {
    decided.push({
      text: `${plural(before.length, "thing")} decided before this report ${before.length === 1 ? "is" : "are"} unchanged. "Show more detail" lists them; the Record tab has them all.`,
      evidence: "the software's record",
    });
  }
  if (!facts.recordAvailable) {
    decided.push({
      text: "Nothing is in this software's record yet, so nothing has been decided that premise can show.",
      evidence: "the software's record",
    });
  }

  // ---- Running -----------------------------------------------------------------------------
  const running: ReportLine[] = [];
  const latest = facts.runs[0];
  let runningBlock: ReportView["running"] = null;
  if (!latest) {
    running.push({
      text: "Nothing has been started yet.",
      evidence: "no run is recorded",
    });
  } else {
    const at = `commit ${SHORT(latest.commit)}`;
    const view = facts.runView;
    switch (latest.status) {
      case "running":
        running.push({
          text: `Running. Open ${latest.link} on this computer.`,
          evidence: `run ${latest.id}, ${at}`,
        });
        runningBlock = {
          how: "Open the link in a browser on this computer.",
          where: latest.link ?? "",
        };
        break;
      case "starting":
        running.push({ text: "Starting up.", evidence: `run ${latest.id}, ${at}` });
        break;
      case "finished":
        running.push({
          text: `A command-line program, run once on a sample. It printed: ${firstLine(view?.output[0] ?? "") || "(nothing)"}`,
          evidence: `run ${latest.id}, ${at}`,
        });
        runningBlock = {
          how: "Type this command in a terminal.",
          where: latest.command ?? "",
          ...(view?.folder && { folder: view.folder }),
        };
        break;
      case "built":
        running.push({
          text: `Built, but premise does not start desktop programs. ${latest.command ?? ""}`.trim(),
          evidence: `run ${latest.id}, ${at}`,
        });
        runningBlock = { how: "Start it on your computer.", where: latest.command ?? "" };
        break;
      case "failed":
        running.push({
          text: 'Not running: it would not start. "Failed or not checked" has its last lines of output.',
          evidence: `run ${latest.id}, ${at}`,
        });
        break;
      case "crashed":
        running.push({
          text: 'Not running: it started, but kept stopping by itself. "Failed or not checked" has its last output.',
          evidence: `run ${latest.id}, ${at}`,
        });
        break;
      default:
        running.push({
          text: `Not running. The last start ended as "${latest.status}".`,
          evidence: `run ${latest.id}, ${at}`,
        });
    }
    if (latest.restarts > 0) {
      running.push({
        text: `It crashed and was started again ${latest.restarts} time${latest.restarts === 1 ? "" : "s"}.`,
        evidence: `run ${latest.id}`,
      });
    }
    if (current && !sameVersion(latest.commit, current)) {
      running.push({
        text: "This report is about a newer version than the one last started.",
        evidence: `run ${latest.id}, this report is about version ${SHORT(current)}, the last start was version ${SHORT(latest.commit)}`,
      });
    }
    const newer = facts.commits.findIndex((c) => c.sha === latest.commit);
    if (newer > 0) {
      running.push({
        text: `${newer} newer change${newer === 1 ? " has" : "s have"} been made since, and ${newer === 1 ? "is" : "are"} not running yet.`,
        evidence: `commit ${SHORT(facts.commits[0]!.sha)}`,
      });
    }
  }
  if (options.detail) {
    for (const commit of facts.commits.slice(0, 20)) {
      running.push({
        text: `Change ${SHORT(commit.sha)}: ${commit.subject}${commit.items.length ? ` (serves ${commit.items.join(", ")})` : ""}`,
        evidence: `commit ${SHORT(commit.sha)}`,
      });
    }
  }

  // ---- Needed ------------------------------------------------------------------------------
  // Grouped by role, each saying exactly what to do; with only the operator, no label at all.
  const onlyOperator = facts.asks.every((a) => a.role === "operator");
  const needed: ReportLine[] = [...facts.asks]
    .sort((x, y) => x.role.localeCompare(y.role) || x.id - y.id)
    .map((a) => ({
      text: `${onlyOperator ? "" : `For the ${roleWords(a.role)}: `}${sentence(a.title)} ${a.instruction}`,
      evidence: `question ${a.id}`,
    }));
  if (!onlyOperator) {
    const counts = new Map<string, number>();
    for (const a of facts.asks) counts.set(a.role, (counts.get(a.role) ?? 0) + 1);
    needed.unshift({
      text: `Waiting on ${[...counts.entries()].map(([role, n]) => `the ${roleWords(role)} (${n})`).join(", ")}. In one session you answer for every role.`,
      evidence: `${plural(facts.asks.length, "open question")}`,
    });
  }

  // ---- Failed or not checked ---------------------------------------------------------------
  const failed: ReportLine[] = [];
  if (latest && (latest.status === "failed" || latest.status === "crashed")) {
    failed.push({
      text:
        latest.status === "crashed"
          ? `It kept crashing and was stopped: ${latest.failure?.trim() || "no reason was recorded"}`
          : `Built and checked, but it would not start: ${latest.failure?.trim() || "no reason was recorded"}`,
      evidence: `run ${latest.id}`,
    });
  }
  // What the operator left out at the scope check is not built, so it is not "not checked"; nor is
  // what the person chose for a later milestone (decision 0280).
  const laterOf = new Map(facts.later.map((l) => [l.item, l.milestone]));
  const asked = facts.items.filter((i) => i.kind === "W" && !i.marks.leftOut);
  const mustCheck = asked.filter((i) => {
    if (!laterOf.has(i.id)) return true;
    const v = verdictOf.get(i.id);
    return v !== undefined && checkedAt(v.commit, current);
  });
  const later = asked.filter((i) => !mustCheck.includes(i));
  for (const item of mustCheck) {
    const verdict = verdictOf.get(item.id);
    if (!verdict) {
      failed.push({
        text: `Not checked: ${sentence(item.text)} No check has looked at it, so it is not known to work.`,
        evidence: `record item ${item.id}`,
      });
    } else if (!checkedAt(verdict.commit, current)) {
      failed.push({
        text: `Not checked at this version: ${sentence(item.text)} It was last checked at an earlier version, and the result there was: ${verdict.verdict === "met" ? "met" : verdict.verdict === "not-met" ? "not met" : "could not be checked"}.`,
        evidence: `check of ${item.id}, version ${SHORT(verdict.commit!)}`,
      });
    } else if (verdict.verdict === "not-met") {
      failed.push({
        text: `Not met: ${sentence(item.text)}${verdict.evidence ? ` ${sentence(verdict.evidence)}` : ""}`,
        evidence: `check of ${item.id}`,
      });
    } else if (verdict.verdict === "could-not-check") {
      failed.push({
        text: `Could not be checked: ${sentence(item.text)}${verdict.evidence ? ` ${sentence(verdict.evidence)}` : ""}`,
        evidence: `check of ${item.id}`,
      });
    } else if (verdict.madeUp !== undefined) {
      failed.push({
        text: `Checked on made-up data only: ${sentence(item.text)} Try it on ${verdict.madeUp} yourself; the check could not. ${sentence(verdict.evidence)}`,
        evidence: `check of ${item.id}`,
      });
    }
  }
  for (const item of later) {
    failed.push({
      text: `Not built yet (you chose later, for milestone ${laterOf.get(item.id)}): ${sentence(item.text)}`,
      evidence: `record item ${item.id}, the plan`,
    });
  }
  for (const verdict of facts.verdicts) {
    if (!itemById.has(verdict.item) && verdict.verdict !== "met") {
      failed.push({
        text: `${verdict.verdict === "not-met" ? "Not met" : "Could not be checked"}: ${verdict.item}. ${sentence(verdict.evidence)}`,
        evidence: `check of ${verdict.item}`,
      });
    }
  }
  // A job that ended badly counts until a later job of the same kind ended well.
  for (const job of facts.jobs) {
    if (job.status !== "stuck" && job.status !== "failed") continue;
    const redone = facts.jobs.some(
      (j) => j.id > job.id && j.kind === job.kind && j.stage === job.stage && j.status === "done",
    );
    if (redone) continue;
    failed.push({
      text: `The ${job.kind} work${job.stage ? ` (${stageName(job.stage)})` : ""} ${job.status === "stuck" ? "got stuck" : "failed"}: ${firstLine(job.result) || "no reason was recorded"}`,
      evidence: `job ${job.id}`,
    });
  }

  // ---- Cost --------------------------------------------------------------------------------
  const limits = [
    "The check is done by the same kind of AI as the build, so it can share its blind spots. A person trying the software is the real test.",
  ];
  let cost: ReportView["cost"];
  if (facts.usage) {
    const budget = facts.usage.budget;
    cost = {
      mocked: facts.usage.mocked,
      ...(facts.usage.own && { own: `premise's own count: ${ownFiguresWords(facts.usage.own)}` }),
      text:
        `${facts.usage.sessions} agent sessions, about $${facts.usage.costUsd.toFixed(2)} at list prices, ${Math.round(facts.usage.weeklyShare * 100)}% of a week's usage.` +
        (budget ? ` Budget: ${budget.words}.` : ""),
      ...(facts.usage.groups && facts.usage.groups.length > 0 && { lines: facts.usage.groups }),
    };
    if (budget?.paused && budget.overrunMessage) {
      needed.unshift({
        text: `${budget.overrunMessage} Choose what to do on the Usage page: raise the budget, let it finish the change it is on, or leave it paused.`,
        evidence: "budget",
      });
    }
  } else {
    cost = { mocked: false, text: "Cost could not be read." };
    if (facts.usageProblem) limits.push(facts.usageProblem);
  }
  if (facts.verdicts.length === 0 && mustCheck.length > 0) {
    limits.push("No check has been recorded for this software yet.");
  }

  // ---- Effort, as premise measured it (decision 0192) ---------------------------------------
  const effort: ReportLine[] = [];
  const m = facts.measures;
  if (m) {
    const minutes = (n: number) =>
      n < 1
        ? "under a minute"
        : n < 90
          ? `${Math.round(n)} minutes`
          : `${Math.round(n / 6) / 10} hours`;
    effort.push(
      m.firstRunning && m.minutesToFirstRunning !== null
        ? {
            text: `From your idea to the first running version: ${minutes(m.minutesToFirstRunning)} and ${plural(m.sessionsToFirstRunning ?? 0, "agent session")}.`,
            evidence: "runs and agent sessions",
          }
        : {
            text: `No version has run yet. ${plural(m.sessions, "agent session")} so far.`,
            evidence: "agent sessions",
          },
    );
    if (m.firstRunning && m.sessions !== m.sessionsToFirstRunning) {
      effort.push({
        text: `${plural(m.sessions, "agent session")} in all so far.`,
        evidence: "agent sessions",
      });
    }
  }

  // ---- Intake -------------------------------------------------------------------------------
  const intake: ReportLine[] = [];
  if (facts.intake && facts.intake.total > 0) {
    intake.push({ text: facts.intake.words, evidence: "intake items" });
    if (facts.intake.sources.length > 1) {
      intake.push({
        text: `They came from ${facts.intake.sources.map((s) => `${s.name} (${s.count})`).join(", ")}.`,
        evidence: "intake items",
      });
    }
  }

  // ---- Short or full -----------------------------------------------------------------------
  const sections: Section[] = [
    {
      title: "Decided",
      plain:
        "What was decided, from this software's record: what people said first, then what premise assumed or chose itself.",
      lines: decided,
      rank: 3,
    },
    {
      title: "Running",
      plain: "What is running, which version of the code, and where to open it.",
      lines: running,
      rank: 2,
    },
    {
      title: "Needed",
      plain: "What is waiting on a person, and exactly what to do.",
      lines: needed,
      rank: 0,
    },
    {
      title: "Effort",
      plain:
        "How much work premise put in, as premise measured it itself (not the usage figures below).",
      lines: effort,
      rank: 1.5,
    },
    {
      title: "Intake",
      plain: "What people asked for or reported, and where each item went.",
      lines: intake,
      rank: 2.5,
    },
    {
      title: "Failed or not checked",
      plain: "Everything not known to work: failed, not checked, or impossible to check.",
      lines: failed,
      rank: 1,
    },
  ];
  let hidden = 0;
  if (!options.detail) {
    let budget = options.maxLines;
    for (const section of [...sections].sort((a, b) => a.rank - b.rank)) {
      const keep = Math.max(0, Math.min(section.lines.length, budget));
      hidden += section.lines.length - keep;
      budget -= keep;
      section.lines = section.lines.slice(0, keep);
    }
  }
  // ---- The first line: a plain verdict a newcomer can act on (decisions 0197, 0280) -----------
  // Never "Works" when the latest start failed, or for what was checked on made-up data only.
  const at = (i: (typeof mustCheck)[number]) => {
    const v = verdictOf.get(i.id);
    return v && checkedAt(v.commit, current) ? v : undefined;
  };
  const madeUp = mustCheck.filter(
    (i) => at(i)?.verdict === "met" && at(i)?.madeUp !== undefined,
  ).length;
  const met = mustCheck.filter((i) => at(i)?.verdict === "met").length - madeUp;
  const notStated = mustCheck.filter(
    (i) => at(i)?.verdict === "met" && at(i)?.notStated === true,
  ).length;
  const notMet = mustCheck.filter((i) => at(i)?.verdict === "not-met").length;
  const unchecked = mustCheck.length - met - madeUp - notMet;
  const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
  const tryIt = runningBlock ? " How to try it is just below." : "";
  const laterWords =
    later.length > 0
      ? ` ${later.length} more ${later.length === 1 ? "is" : "are"} for a later milestone you chose, not built yet.`
      : "";
  const asks = `${things(mustCheck.length)} you asked for${later.length > 0 ? " in this milestone" : ""}`;
  const notStarted =
    latest?.status === "crashed"
      ? `It is not running: it started, but kept stopping by itself. "Failed or not checked" has its last output.`
      : `Built and checked, but it would not start, so there is nothing to try yet. "Failed or not checked" has its last lines of output.`;
  const partly = [
    madeUp > 0 ? `${madeUp} only on made-up data` : "",
    unchecked > 0 ? `${unchecked} could not be checked` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const headline = !latest
    ? mustCheck.length > 0
      ? `Nothing has been built or checked yet. ${things(mustCheck.length)} you asked for ${mustCheck.length === 1 ? "is" : "are"} still to do.${laterWords}`
      : "Nothing has been built or checked yet."
    : mustCheck.length === 0
      ? startFailed
        ? notStarted
        : `Not verified: nothing in the record says what it must do, so premise could not check it.${runningBlock ? " Try it yourself: how is just below." : ""}`
      : notMet > 0
        ? `Does not work yet: ${notMet} of ${asks} failed ${notMet === 1 ? "its" : "their"} check. "Failed or not checked" says what is wrong.${startFailed ? " It is not running either." : tryIt}`
        : startFailed
          ? `${notStarted}${laterWords}`
          : met === mustCheck.length
            ? `Works: all ${asks} ${mustCheck.length === 1 ? "was" : "were"} checked and ${mustCheck.length === 1 ? "is" : "are"} met.${laterWords}${tryIt}`
            : met > 0
              ? `Partly verified: ${met} of ${asks} ${met === 1 ? "was" : "were"} checked and ${met === 1 ? "works" : "work"}; ${partly}. "Failed or not checked" says which, and what is needed to check ${mustCheck.length - met === 1 ? "it" : "them"}.${laterWords}${tryIt}`
              : madeUp > 0 && unchecked === 0
                ? `Not verified on real data: ${madeUp === mustCheck.length && mustCheck.length > 1 ? "all " : ""}${asks} ${mustCheck.length === 1 ? "was" : "were"} checked on made-up data only. "Failed or not checked" says what to try ${mustCheck.length === 1 ? "it" : "them"} on.${laterWords}${tryIt}`
                : `Not verified: premise could not check this, so it does not know whether it works.${laterWords}${runningBlock ? " Try it yourself: how is just below." : ""}`;
  const counts =
    latest && mustCheck.length > 0
      ? `Of the ${asks}: ${met} met, ${madeUp > 0 ? `${madeUp} met on made-up data only, ` : ""}${notMet} not met, ${unchecked} not checked.${notStated > 0 ? ` ${notStated} of the met ${notStated === 1 ? "was" : "were"} judged before premise asked whether real data was used: not stated whether real data was used.` : ""}${later.length > 0 ? ` ${later.length} more for a later milestone, not built yet.` : ""}`
      : null;
  const scripted =
    latest && facts.verdicts.some((v) => v.scripted)
      ? "The checks were made by scripted agents, which cannot judge software: at most they run fixed steps and compare what is printed. Take what they found as a demonstration, not a verdict."
      : null;
  return {
    softwareId: facts.softwareId,
    headline,
    ...(counts && { counts }),
    ...(scripted && { scripted }),
    source: options.source ?? "reporter",
    written: options.written ?? null,
    detail: options.detail,
    hiddenLines: hidden,
    sections: sections.map(({ title, plain, lines }) => ({ title, plain, lines })),
    running: runningBlock,
    cost,
    limits,
    ...(facts.doing && { doing: facts.doing }),
  };
}

/**
 * Release notes for a change that reached running (decision 0123): the record items it served
 * whose check verdict is met, in users' terms. Items not met or not checked are left out here
 * and stay in "Failed or not checked". Returns null when there is nothing to say.
 */
export function draftReleaseNotes(facts: Facts, commit: string): string | null {
  const index = facts.commits.findIndex((c) => c.sha === commit);
  if (index < 0) return null;
  const previous = facts.runs.find(
    (r) => r.commit !== commit && facts.commits.some((c) => c.sha === r.commit),
  );
  const stop = previous
    ? facts.commits.findIndex((c) => c.sha === previous.commit)
    : facts.commits.length;
  const served = new Set(
    facts.commits.slice(index, stop > index ? stop : facts.commits.length).flatMap((c) => c.items),
  );
  const met = facts.items.filter(
    (i) =>
      i.kind === "W" &&
      served.has(i.id) &&
      facts.verdicts.some(
        (v) =>
          v.item === i.id &&
          v.verdict === "met" &&
          (checkedAt(v.commit, commit) ||
            (v.sameCodeAsLatest === true && sameVersion(commit, facts.commits[0]?.sha ?? ""))),
      ),
  );
  if (met.length === 0) return null;
  return [
    `## ${facts.generated.slice(0, 10)} (${SHORT(commit)})`,
    "",
    ...met.map((i) => `- ${sentence(i.text)}`),
    "",
  ].join("\n");
}
