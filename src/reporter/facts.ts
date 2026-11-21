import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PremiseConfig } from "../config/settings.js";
import type { Git } from "../git/git.js";
import type { RecordItem } from "../record/format.js";
import { parseRecord } from "../record/parse.js";
import { readTrailer } from "../record/trace.js";
import type { Runner } from "../runner/runner.js";
import type { ReportCostLine, ReportLine, RunView, UsageRowView } from "../shared/api-types.js";
import { listAsks } from "../storage/asks.js";
import type { Database } from "../storage/database.js";
import type { Usage } from "../usage/usage.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";

/**
 * The recorded facts a report is built from (decision 0097, docs/specs/reporter.md 5.1): record
 * items, commits and their traces, check verdicts, run state, queue history, open asks and
 * (mocked) usage figures. Nothing here comes from what an agent said about its own work.
 */

export type VerdictKind = "met" | "not-met" | "could-not-check";

/**
 * A check verdict, read from the events the checker writes (decision 0164): module "checker", kind
 * "verdict", reference the record item, detail { verdict, evidence, commit? }.
 */
export interface VerdictFact {
  item: string;
  verdict: VerdictKind;
  evidence: string;
  commit: string | null;
  time: string;
}

export interface CommitFact {
  sha: string;
  date: string;
  subject: string;
  items: string[];
}

export interface RunFact {
  id: number;
  commit: string;
  kind: "web" | "command" | "program";
  status: string;
  command: string | null;
  link: string | null;
  restarts: number;
  failure: string | null;
  started: string;
  ended: string | null;
}

export interface JobFact {
  id: number;
  kind: string;
  stage: string | null;
  status: string;
  result: string | null;
  finished: string | null;
}

export interface AskFact {
  id: number;
  role: string;
  title: string;
  instruction: string;
}

export interface UsageFact {
  mocked: boolean;
  sessions: number;
  costUsd: number;
  weeklyShare: number;
  /** Per stage, per change and per record item (src/usage): premise's counts beside the cost. */
  groups?: ReportCostLine[];
  /** The budget in words, and whether the software is paused for it. */
  budget?: { words: string; paused: boolean; overrunMessage: string | null };
}

const minutesWords = (n: number): string =>
  n < 1
    ? "under a minute"
    : n < 90
      ? `${Math.round(n)} minutes`
      : `${Math.round(n / 6) / 10} hours`;

/**
 * Proportion, as premise measures it itself (decision 0192; not usage-ledger's figures): agent
 * sessions, and the time from the idea to the first version that ran.
 */
export interface MeasureFacts {
  /** When the operator started the software. */
  started: string;
  /** When its first version started running; null until one has. */
  firstRunning: string | null;
  minutesToFirstRunning: number | null;
  sessionsToFirstRunning: number | null;
  sessions: number;
}

/** premise's own measures of one software's effort (decision 0192). */
export function readMeasures(db: Database, softwareId: string): MeasureFacts | null {
  const software = db.prepare("SELECT created FROM softwares WHERE id = ?").get(softwareId) as
    { created: string } | undefined;
  if (!software) return null;
  const first = db
    .prepare(
      `SELECT started FROM runs WHERE software_id = ? AND status NOT IN ('starting', 'failed')
       ORDER BY id LIMIT 1`,
    )
    .get(softwareId) as { started: string } | undefined;
  const count = (before?: string) =>
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM agent_sessions s JOIN jobs j ON j.id = s.job_id
           WHERE j.software_id = ?${before ? " AND s.started <= ?" : ""}`,
        )
        .get(...(before ? [softwareId, before] : [softwareId])) as { n: number }
    ).n;
  const minutes = first
    ? Math.max(
        0,
        Math.round(((Date.parse(first.started) - Date.parse(software.created)) / 60_000) * 10) / 10,
      )
    : null;
  return {
    started: software.created,
    firstRunning: first?.started ?? null,
    minutesToFirstRunning: minutes,
    sessionsToFirstRunning: first ? count(first.started) : null,
    sessions: count(),
  };
}

export interface Facts {
  softwareId: string;
  softwareName: string;
  generated: string;
  /** False when the software has no record in a repository yet. */
  recordAvailable: boolean;
  items: RecordItem[];
  commits: CommitFact[];
  verdicts: VerdictFact[];
  runs: RunFact[];
  runView: RunView | null;
  jobs: JobFact[];
  asks: AskFact[];
  usage: UsageFact | null;
  usageProblem: string | null;
  /** premise's own measures of effort; null when they could not be read. */
  measures: MeasureFacts | null;
  /** When the last report was written, if one was. */
  lastReport: string | null;
  /** The commit the latest reports covered, to find what is new. */
  milestone: { id: string; text: string } | null;
  /** "How premise is doing": premise's own return, from recorded events (src/measures). */
  doing: { plain: string; lines: ReportLine[] } | null;
}

export interface FactSources {
  db: Database;
  config: PremiseConfig;
  records: {
    repositoryPath(softwareId: string): string;
    git: Git;
    readFiles(softwareId: string): Map<string, string>;
  };
  runner?: Runner | undefined;
  ledger: UsageLedger;
  /** premise's own return (src/measures); the block is left out when not given. */
  measures?: { reportBlock(softwareId: string): { plain: string; lines: ReportLine[] } };
  /** Cost per stage, change and item, and the budget (src/usage); only totals when not given. */
  usage?: Pick<Usage, "view">;
}

interface EventRow {
  reference: string | null;
  detail: string | null;
  time: string;
}

export function readVerdicts(db: Database, softwareId: string): VerdictFact[] {
  const rows = db
    .prepare(
      "SELECT reference, detail, time FROM events WHERE software_id = ? AND module = 'checker' AND kind = 'verdict' ORDER BY id",
    )
    .all(softwareId) as unknown as EventRow[];
  const latest = new Map<string, VerdictFact>();
  for (const row of rows) {
    if (!row.reference || !row.detail) continue;
    let detail: { verdict?: string; evidence?: string; commit?: string };
    try {
      detail = JSON.parse(row.detail) as typeof detail;
    } catch {
      continue;
    }
    if (
      detail.verdict !== "met" &&
      detail.verdict !== "not-met" &&
      detail.verdict !== "could-not-check"
    )
      continue;
    latest.set(row.reference, {
      item: row.reference,
      verdict: detail.verdict,
      evidence: detail.evidence ?? "",
      commit: detail.commit ?? null,
      time: row.time,
    });
  }
  return [...latest.values()];
}

export async function gatherFacts(
  sources: FactSources,
  softwareId: string,
  options: { milestone?: string } = {},
): Promise<Facts> {
  const { db, config, records, runner, ledger } = sources;
  const software = db.prepare("SELECT name FROM softwares WHERE id = ?").get(softwareId) as
    { name: string } | undefined;
  if (!software) throw new Error(`No software has the id ${softwareId}.`);

  let items: RecordItem[] = [];
  let recordAvailable = false;
  try {
    const files = records.readFiles(softwareId);
    if (files.size > 0) {
      recordAvailable = true;
      items = parseRecord(files).items.filter((i) => !i.struck);
    }
  } catch {
    recordAvailable = false;
  }

  const commits: CommitFact[] = [];
  const repo = records.repositoryPath(softwareId);
  if (existsSync(join(repo, ".git")) && records.git.headCommit(repo)) {
    for (const commit of records.git.log(repo)) {
      const trailer = readTrailer(commit.message, config.record.trailer);
      commits.push({
        sha: commit.sha,
        date: commit.date,
        subject: commit.subject,
        items: "ids" in trailer ? trailer.ids : [],
      });
    }
  }

  const jobs = (
    db
      .prepare(
        "SELECT id, kind, stage, status, result, finished FROM jobs WHERE software_id = ? ORDER BY id",
      )
      .all(softwareId) as unknown as JobFact[]
  ).map((j) => ({ ...j }));

  const runs: RunFact[] = (runner?.history(softwareId) ?? []).map((r) => ({
    id: r.id,
    commit: r.commit_sha,
    kind: r.kind,
    status: r.status,
    command: r.command,
    link: r.link,
    restarts: r.restarts,
    failure: r.failure,
    started: r.started,
    ended: r.ended,
  }));

  let usage: UsageFact | null = null;
  let usageProblem: string | null = null;
  try {
    const u = await ledger.softwareUsage(softwareId);
    usage = {
      mocked: u.mocked,
      sessions: u.sessions,
      costUsd: u.costUsd,
      weeklyShare: u.weeklyShare,
    };
    if (sources.usage) {
      const view = await sources.usage.view(softwareId);
      const line = (group: ReportCostLine["group"], row: UsageRowView): ReportCostLine => ({
        group,
        label: row.label,
        measured: `${row.measured.sessions} agent session${row.measured.sessions === 1 ? "" : "s"}, ${minutesWords(row.measured.minutes)}`,
        cost: `about $${row.cost.costUsd.toFixed(2)} at list prices`,
        mocked: row.cost.mocked,
      });
      usage.groups = [
        ...view.byStage.map((r) => line("stage", r)),
        ...view.byChange.map((r) => line("change", r)),
        ...view.byItem.filter((r) => r.key !== "none").map((r) => line("item", r)),
      ];
      usage.budget = {
        words: view.budget.words,
        paused: view.budget.overrun !== null,
        overrunMessage: view.budget.overrun?.message ?? null,
      };
      if (view.problem) usageProblem = view.problem;
    }
  } catch (error) {
    usageProblem = `The cost figures could not be read: ${(error as Error).message}`;
  }

  const lastReport =
    (
      db
        .prepare(
          "SELECT time AS written FROM events WHERE software_id = ? AND module IN ('reporter') AND kind = 'report-written' ORDER BY id DESC LIMIT 1",
        )
        .get(softwareId) as { written: string } | undefined
    )?.written ?? null;

  const milestone = options.milestone
    ? { id: options.milestone, text: items.find((i) => i.id === options.milestone)?.text ?? "" }
    : null;

  return {
    softwareId,
    softwareName: software.name,
    generated: new Date().toISOString(),
    recordAvailable,
    items,
    commits,
    verdicts: readVerdicts(db, softwareId),
    runs,
    runView: runner ? runner.view(softwareId) : null,
    jobs,
    asks: listAsks(db, { softwareId, status: "open" }).map((a) => ({
      id: a.id,
      role: a.role,
      title: a.title,
      instruction: a.instruction,
    })),
    usage,
    usageProblem,
    measures: readMeasures(db, softwareId),
    lastReport,
    milestone,
    doing: sources.measures ? sources.measures.reportBlock(softwareId) : null,
  };
}
