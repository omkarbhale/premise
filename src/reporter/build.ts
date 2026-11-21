import type { ReportLine, ReportView } from "../shared/api-types.js";
import { stageName } from "../shared/stages.js";
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
  const verdictOf = new Map(facts.verdicts.map((v) => [v.item, v]));
  const itemById = new Map(facts.items.map((i) => [i.id, i]));
  const current = options.commit ?? facts.commits[0]?.sha;
  const lastDay = facts.lastReport?.slice(0, 10) ?? null;

  // ---- Decided -----------------------------------------------------------------------------
  const decided: ReportLine[] = [];
  if (facts.milestone) {
    decided.push({
      text: `This milestone is reached${facts.milestone.text ? `: ${sentence(facts.milestone.text)}` : "."}`,
      evidence: `record item ${facts.milestone.id}`,
    });
  }
  const sinceLast = facts.items.filter(
    (i) => options.detail || !lastDay || i.marks.date >= lastDay,
  );
  for (const item of sinceLast) {
    const priority = item.marks.priority ? `${item.marks.priority}: ` : "";
    decided.push({
      text: item.marks.leftOut
        ? `Left out, not built: ${item.id}${priority}: ${sentence(item.text)} You chose to leave it out; bring it back by saying so in chat.`
        : `${priority}${sentence(item.text)}`,
      evidence: `record item ${item.id}, ${item.file}`,
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
  const needed: ReportLine[] = facts.asks.map((a) => ({
    text: `From the ${a.role}: ${a.title}. ${a.instruction}`,
    evidence: `question ${a.id}`,
  }));

  // ---- Failed or not checked ---------------------------------------------------------------
  const failed: ReportLine[] = [];
  // What the operator left out at the scope check is not built, so it is not "not checked".
  const mustCheck = facts.items.filter((i) => i.kind === "W" && !i.marks.leftOut);
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
    }
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
  if (latest && (latest.status === "failed" || latest.status === "crashed")) {
    failed.push({
      text: `It ${latest.status === "crashed" ? "kept crashing and was stopped" : "could not be started"}: ${firstLine(latest.failure) || "no reason was recorded"}`,
      evidence: `run ${latest.id}`,
    });
  }

  // ---- Cost --------------------------------------------------------------------------------
  const limits = [
    "The check is done by the same kind of AI as the build, so it can share its blind spots. A person trying the software is the real test.",
  ];
  let cost: ReportView["cost"];
  if (facts.usage) {
    cost = {
      mocked: facts.usage.mocked,
      text: `${facts.usage.sessions} agent sessions, about $${facts.usage.costUsd.toFixed(2)} at list prices, ${Math.round(facts.usage.weeklyShare * 100)}% of this week's usage.`,
    };
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

  // ---- Short or full -----------------------------------------------------------------------
  const sections: Section[] = [
    {
      title: "Decided",
      plain: "What was decided: the items now in this software's record.",
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
  const met = mustCheck.filter((i) => {
    const v = verdictOf.get(i.id);
    return v?.verdict === "met" && checkedAt(v.commit, current);
  }).length;
  const headline = !latest
    ? mustCheck.length > 0
      ? `Nothing has been built or checked yet. ${mustCheck.length} ${mustCheck.length === 1 ? "thing" : "things"} you asked for ${mustCheck.length === 1 ? "is" : "are"} still to do.`
      : "Nothing has been built or checked yet."
    : mustCheck.length === 0
      ? "Built, but nothing in the record says what it must do, so nothing could be checked against it."
      : met === mustCheck.length
        ? `Built and checked: all ${mustCheck.length} ${mustCheck.length === 1 ? "thing" : "things"} you asked for ${mustCheck.length === 1 ? "is" : "are"} met.`
        : `Built and checked: ${met} of ${mustCheck.length} things you asked for ${met === 1 ? "is" : "are"} met; ${mustCheck.length - met} not met or not checked.`;
  return {
    softwareId: facts.softwareId,
    headline,
    source: options.source ?? "reporter",
    written: options.written ?? null,
    detail: options.detail,
    hiddenLines: hidden,
    sections: sections.map(({ title, plain, lines }) => ({ title, plain, lines })),
    running: runningBlock,
    cost,
    limits,
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
        (v) => v.item === i.id && v.verdict === "met" && checkedAt(v.commit, commit),
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
