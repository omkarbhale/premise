import type { PremiseConfig } from "../config/settings.js";
import { ancestry, getWorkItem } from "../line/work-items.js";
import type { Job } from "../queue/work-queue.js";
import type {
  BudgetAnswer,
  BudgetInput,
  BudgetView,
  OverrunAnswerInput,
  OverrunView,
  SoftwareUsageView,
  UsageCost,
  OwnFigures,
  UsageMeasured,
  UsageOverview,
  UsageRowView,
} from "../shared/api-types.js";
import { PHASES, stageName } from "../shared/stages.js";
import { ServiceError } from "../server/services.js";
import { type Database, now, recordEvent } from "../storage/database.js";
import { addChatMessage } from "../storage/chat.js";
import {
  getSoftware,
  listSoftwares,
  setSoftwareBudget,
  setSoftwareState,
  type Software,
} from "../storage/softwares.js";
import type {
  Budget,
  BudgetStatus,
  SessionTaskRecord,
  UsageBreakdown,
  UsageFigures,
  UsageLedger,
} from "../usage-ledger/usage-ledger.js";
import { phaseOf } from "../usage-ledger/fold.js";
import { readSessionTasks } from "./session-tasks.js";
import { type OwnSession, readOwnSessions, readWeeklyWindow } from "../storage/session-figures.js";

/**
 * Cost and the spending limit (decisions 0016, 0048, 0064, 0128, 0200, 0330). premise records which
 * task each agent session did and asks usage-ledger what it cost; it counts nothing itself beyond
 * each session's own result (0270). It sets each software's budget in usage-ledger; when
 * usage-ledger says one is overrun, this pauses that software's queue and tells the operator, who
 * answers: raise the budget, finish the change being worked on, or leave it paused. A budget that
 * nothing checks (usage-ledger cannot check one per software yet) never pauses work. A figure that
 * is not known is shown as not known, with why; a scripted demo's made-up figures say so.
 */

const NONE = "none";

interface OverrunRow {
  id: number;
  software_id: string;
  time: string;
  budget: string;
  spent: string;
  answer: BudgetAnswer | null;
  answered: string | null;
  finish_item: number | null;
}

interface SpentLine {
  label: string;
  sessions: number;
  costUsd: number | null;
}

/** What was spent on what when a software overran. Rows from before usage-ledger say mocked. */
interface SpentRecord {
  spentUsd: number | null;
  source?: "ledger" | "demo";
  mocked?: boolean;
  byStage: SpentLine[];
  byChange: SpentLine[];
}

const money = (usd: number | null): string =>
  usd === null ? "an amount not known" : `$${usd.toFixed(2)}`;

/** A ledger group as the page shows it. */
const cost = (g: UsageFigures): UsageCost => ({
  source: g.source,
  sessions: g.sessions,
  priced: g.priced,
  costUsd: g.costUsd,
  inputTokens: g.inputTokens,
  outputTokens: g.outputTokens,
  cacheTokens: g.cacheTokens,
  weeklyShare: g.weeklyShare,
  why: g.why,
  weeklyWhy: g.weeklyWhy,
});

/** The figures behind an overrun were made up: a scripted demo's, or the mock from before 0330. */
const madeUp = (spent: SpentRecord): boolean => spent.mocked === true || spent.source === "demo";

/** premise's own count over some sessions, with what is missing said plainly. */
export function ownFiguresOf(sessions: OwnSession[]): OwnFigures {
  const out: OwnFigures = {
    counted: 0,
    missing: 0,
    missingWhy: null,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    turns: 0,
    unreported: { cost: 0, tokens: 0, turns: 0 },
  };
  let scripted = 0;
  for (const s of sessions) {
    const f = s.figures;
    if (!f) {
      out.missing += 1;
      if (s.runtime === "scripted") scripted += 1;
      continue;
    }
    out.counted += 1;
    if (f.costUsd === null) out.unreported.cost += 1;
    else out.costUsd += f.costUsd;
    if (
      f.inputTokens === null &&
      f.outputTokens === null &&
      f.cacheReadTokens === null &&
      f.cacheWriteTokens === null
    ) {
      out.unreported.tokens += 1;
    } else {
      out.inputTokens += f.inputTokens ?? 0;
      out.outputTokens += f.outputTokens ?? 0;
      out.cacheTokens += (f.cacheReadTokens ?? 0) + (f.cacheWriteTokens ?? 0);
    }
    if (f.turns === null) out.unreported.turns += 1;
    else out.turns += f.turns;
  }
  if (out.missing > 0) {
    out.missingWhy =
      scripted === out.missing
        ? "scripted agents report no figures"
        : scripted > 0
          ? "scripted agents report no figures, and some sessions ended without a result"
          : "these sessions ended without a result, so they reported none";
  }
  out.costUsd = Math.round(out.costUsd * 1e6) / 1e6;
  return out;
}
/** A budget in plain words. */
export function budgetWords(budget: Budget | null): string {
  if (!budget) return "No budget: premise does not limit what it spends on this software.";
  return budget.kind === "share"
    ? `${budget.percent}% of a week's usage`
    : `${money(budget.usd)} a week, at list prices`;
}

export function budgetOf(software: Software): Budget | null {
  if (software.budgetUsd !== null) return { kind: "amount", usd: software.budgetUsd };
  if (software.weeklySharePercent !== null) {
    return { kind: "share", percent: software.weeklySharePercent };
  }
  return null;
}

export interface UsageOptions {
  db: Database;
  config: Pick<PremiseConfig, "usage_ledger">;
  ledger: UsageLedger;
  /** Called when a check ends, so the work queue starts what it was holding back. */
  onSettled?: () => void;
}

const RECHECK_MS = 5 * 60_000;

export class Usage {
  private readonly checking = new Map<string, number>();
  /** Softwares whose jobs the queue was asked to hold back, so it is told to look again. */
  private readonly held = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;
  onSettled: () => void;

  constructor(private readonly options: UsageOptions) {
    this.onSettled = options.onSettled ?? (() => {});
    options.ledger.attach((softwareId) => readSessionTasks(options.db, softwareId));
  }

  private get db(): Database {
    return this.options.db;
  }

  /** Tell usage-ledger each software's budget, then look for any already overrun. At start. */
  async start(): Promise<void> {
    for (const software of listSoftwares(this.db)) {
      try {
        await this.options.ledger.setBudget(software.id, budgetOf(software));
      } catch {
        // usage-ledger cannot be reached: agent work goes on under the turn and time limits.
      }
    }
    await this.checkAll();
    this.options.ledger.start();
    this.timer ??= setInterval(() => void this.recheckPaused(), RECHECK_MS);
    this.timer.unref?.();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.options.ledger.close();
  }

  /** A weekly budget resets with the week: look at what is paused for one, in case it has. */
  private async recheckPaused(): Promise<void> {
    for (const software of listSoftwares(this.db)) {
      if (software.state === "paused-budget") await this.check(software.id).catch(() => {});
    }
  }

  /** Wait for every check in flight. For tests and shutdown. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
    await this.options.ledger.idle();
  }

  /** True while a software's budget is being looked at, so the queue starts nothing for it yet. */
  hold(softwareId: string): boolean {
    const holding = (this.checking.get(softwareId) ?? 0) > 0;
    if (holding) this.held.add(softwareId);
    return holding;
  }

  /**
   * Whether a queued job may start although its software is paused for its budget: only after the
   * operator chose to let the change being worked on finish, and only work on that change.
   */
  allows(job: Job): boolean {
    const row = this.latestOverrun(job.softwareId);
    if (!row || row.answer !== "finish-change" || row.finish_item === null) return false;
    const item = typeof job.payload.item === "number" ? job.payload.item : null;
    if (item === null) return false;
    const work = getWorkItem(this.db, item);
    return work ? ancestry(this.db, work).some((w) => w.id === row.finish_item) : false;
  }

  /** The work queue's callback for any change to a job: look at the budget when a session moved. */
  jobChanged(job: Job): void {
    if (job.kind === "run") return;
    // A job only just queued has used nothing yet; one that ran and came back has.
    if (job.status === "queued" && job.attempts === 0) return;
    // A session started or ended: usage-ledger labels it, reads it, and takes the week's readings.
    this.options.ledger.nudge();
    this.checkInBackground(job.softwareId);
  }

  private checkInBackground(softwareId: string): void {
    this.checking.set(softwareId, (this.checking.get(softwareId) ?? 0) + 1);
    const work = this.check(softwareId)
      .catch(() => {
        // usage-ledger could not be read: nothing is paused for want of an answer.
      })
      .finally(() => {
        const left = (this.checking.get(softwareId) ?? 1) - 1;
        if (left <= 0) this.checking.delete(softwareId);
        else this.checking.set(softwareId, left);
        this.pending.delete(work);
        // Only a queue that held something back needs telling to look again.
        if (!this.checking.has(softwareId) && this.held.delete(softwareId)) this.onSettled();
      });
    this.pending.add(work);
  }

  async checkAll(): Promise<void> {
    for (const software of listSoftwares(this.db)) await this.check(software.id).catch(() => {});
  }

  /** Ask usage-ledger about one software; pause its queue when its budget is overrun. */
  async check(softwareId: string): Promise<void> {
    const software = getSoftware(this.db, softwareId);
    if (!software || (software.state !== "active" && software.state !== "paused-budget")) return;
    const status = await this.options.ledger.budgetStatus(softwareId, { fresh: true });
    if (software.state === "paused-budget") {
      // Resumed only on a checked answer that it is within, or when there is no budget at all;
      // a budget that could not be checked keeps it paused.
      if (status.checked ? !status.overrun : status.budget === null) {
        this.resumeWithin(softwareId);
      }
      return;
    }
    if (!status.checked || !status.overrun) return;
    const spent = await this.spentRecord(softwareId);
    // Another check may have paused it while this one waited.
    if (getSoftware(this.db, softwareId)?.state !== "active") return;
    this.db
      .prepare("INSERT INTO budget_overruns (software_id, time, budget, spent) VALUES (?, ?, ?, ?)")
      .run(softwareId, now(), JSON.stringify(status.budget), JSON.stringify(spent));
    setSoftwareState(this.db, softwareId, "paused-budget", "its budget is used up");
    recordEvent(this.db, {
      softwareId,
      module: "usage",
      kind: "budget-overrun",
      detail: { budget: status.budget, spentUsd: spent.spentUsd, source: spent.source },
    });
  }

  /**
   * Within its budget again, because the week reset, or because the pause came from made-up
   * figures and usage-ledger's real ones are within it (decision 0330): resume it and say why,
   * unless it was left paused on purpose.
   */
  private resumeWithin(softwareId: string): void {
    const software = getSoftware(this.db, softwareId);
    if (software?.state !== "paused-budget") return;
    const row = this.latestOverrun(softwareId);
    if (row?.answer === "left-paused") return;
    const made =
      this.options.ledger.source === "ledger" && row
        ? madeUp(JSON.parse(row.spent) as SpentRecord)
        : false;
    setSoftwareState(
      this.db,
      softwareId,
      "active",
      made ? "its real figures are within budget" : "the week reset",
    );
    addChatMessage(this.db, {
      softwareId,
      author: "premise",
      text: made
        ? `${software.name} was paused because made-up figures said its budget was used up. usage-ledger's real figures say it is within its budget, so ${software.name} has resumed.`
        : `The week reset; ${software.name} is within its budget again and has resumed`,
    });
    recordEvent(this.db, { softwareId, module: "usage", kind: "budget-reset" });
    this.onSettled();
  }

  private latestOverrun(softwareId: string): OverrunRow | undefined {
    return this.db
      .prepare("SELECT * FROM budget_overruns WHERE software_id = ? ORDER BY id DESC LIMIT 1")
      .get(softwareId) as OverrunRow | undefined;
  }

  // ---- What was spent on what ---------------------------------------------------------------

  private changeLabel(software: Software, key: string): string {
    if (key === NONE) return "Work that was not part of a change";
    const item = getWorkItem(this.db, Number(key));
    if (!item) return `Change ${key}`;
    return item.title ?? `${software.name}, from the idea`;
  }

  private rows(
    software: Software,
    breakdown: UsageBreakdown,
    sessions: SessionTaskRecord[],
  ): Pick<SoftwareUsageView, "byPhase" | "byStage" | "byChange" | "byItem"> {
    const owns = readOwnSessions(this.db, software.id);
    const ownOf = new Map<SessionTaskRecord, OwnSession>();
    sessions.forEach((s, i) => {
      const own = owns[i];
      if (own) ownOf.set(s, own);
    });
    const measure = (match: (s: SessionTaskRecord) => boolean): UsageMeasured => {
      const some = sessions.filter(match);
      const figures = ownFiguresOf(some.map((s) => ownOf.get(s) ?? { runtime: "", figures: null }));
      const minutes = some.reduce((n, s) => {
        const end = s.ended ? Date.parse(s.ended) : Date.now();
        return n + Math.max(0, end - Date.parse(s.started)) / 60_000;
      }, 0);
      return { sessions: some.length, minutes: Math.round(minutes * 10) / 10, figures };
    };
    const byStage: UsageRowView[] = breakdown.byStage.map((g) => ({
      key: g.key,
      label: g.key === NONE ? "Other work" : stageName(g.key),
      measured: measure((s) => (s.stage ?? NONE) === g.key),
      cost: cost(g),
    }));
    const order = [...PHASES.map((p) => p.id as string), NONE];
    const byPhase: UsageRowView[] = [...breakdown.byPhase]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((g) => {
        const phase = PHASES.find((p) => p.id === g.key);
        return {
          key: g.key,
          label: phase?.name ?? "Other work",
          measured: measure((s) => phaseOf(s.stage) === g.key),
          cost: cost(g),
        };
      });
    return {
      byPhase,
      byStage,
      byChange: breakdown.byChange.map((g) => ({
        key: g.key,
        label: this.changeLabel(software, g.key),
        measured: measure((s) => (s.workItem === null ? NONE : String(s.workItem)) === g.key),
        cost: cost(g),
      })),
      byItem: breakdown.byItem.map((g) => ({
        key: g.key,
        label: g.key === NONE ? "Work that named no record item" : g.key,
        measured: measure((s) => (s.items.length === 0 ? [NONE] : s.items).includes(g.key)),
        cost: cost(g),
      })),
    };
  }

  private async spentRecord(softwareId: string): Promise<SpentRecord> {
    const software = getSoftware(this.db, softwareId)!;
    const breakdown = await this.options.ledger.usageBreakdown(softwareId);
    const view = this.rows(software, breakdown, readSessionTasks(this.db, softwareId));
    const lines = (rows: UsageRowView[]): SpentLine[] =>
      rows.slice(0, 6).map((r) => ({
        label: r.label,
        sessions: r.measured.sessions,
        costUsd: r.cost.costUsd,
      }));
    return {
      spentUsd: breakdown.total.costUsd,
      source: breakdown.source,
      byStage: lines(view.byStage),
      byChange: lines(view.byChange),
    };
  }

  // ---- What the page shows ------------------------------------------------------------------

  private overrunView(software: Software): OverrunView | null {
    if (software.state !== "paused-budget") return null;
    const row = this.latestOverrun(software.id);
    if (!row) return null;
    const spent = JSON.parse(row.spent) as SpentRecord;
    const budget = JSON.parse(row.budget) as Budget | null;
    const finishing =
      row.answer === "finish-change" && row.finish_item !== null
        ? this.changeLabel(software, String(row.finish_item))
        : null;
    const made = madeUp(spent);
    const top = spent.byStage
      .filter((l) => l.costUsd !== null)
      .slice(0, 3)
      .map((l) => `${l.label} ${money(l.costUsd)}`)
      .join(", ");
    const consequence =
      row.answer === "finish-change"
        ? `You let it finish "${finishing}"; it stops again after that.`
        : row.answer === "left-paused"
          ? "You chose to leave it paused. Nothing new starts for it until you raise the budget."
          : "Nothing new starts for it until you choose what to do. Other softwares carry on.";
    return {
      id: row.id,
      time: row.time,
      message:
        `${software.name} used up its budget${budget ? ` of ${budgetWords(budget)}` : ""}: ${money(spent.spentUsd)}` +
        `${made ? " (a made-up figure)" : ""} so far${top ? `, mostly on ${top}` : ""}. ${consequence}`,
      spentByStage: spent.byStage,
      spentByChange: spent.byChange,
      spentUsd: spent.spentUsd,
      madeUp: made,
      answer: row.answer,
      finishing,
      canFinish: this.inProgressItem(software.id) !== null,
    };
  }

  /** The piece of work being worked on: the item of the running job, else of the oldest waiting or queued one. */
  private inProgressItem(softwareId: string): number | null {
    const jobs = this.db
      .prepare(
        `SELECT payload FROM jobs WHERE software_id = ? AND status IN ('running', 'queued', 'waiting')
         ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, id`,
      )
      .all(softwareId) as { payload: string }[];
    for (const job of jobs) {
      try {
        const item = (JSON.parse(job.payload) as { item?: unknown }).item;
        if (typeof item === "number") return item;
      } catch {
        // A payload that cannot be read names no item.
      }
    }
    return null;
  }

  async budgetView(softwareId: string): Promise<BudgetView> {
    const software = this.require(softwareId);
    const budget = budgetOf(software);
    let status: BudgetStatus | null = null;
    try {
      status = await this.options.ledger.budgetStatus(softwareId);
    } catch {
      status = null;
    }
    return {
      kind: budget?.kind ?? "none",
      percent: budget?.kind === "share" ? budget.percent : null,
      usd: budget?.kind === "amount" ? budget.usd : null,
      words: budgetWords(budget),
      state: software.state,
      spentUsd: status?.spentUsd ?? null,
      spentShare: status?.spentShare ?? null,
      source: this.options.ledger.source,
      checked: status?.checked ?? false,
      incomplete: status?.incomplete ?? false,
      checkWhy: status
        ? status.why
        : budget
          ? "usage-ledger could not be read, so the budget was not checked; work carries on"
          : null,
      overrun: this.overrunView(software),
    };
  }

  async view(softwareId: string): Promise<SoftwareUsageView> {
    const software = this.require(softwareId);
    const sessions = readSessionTasks(this.db, softwareId);
    const budget = await this.budgetView(softwareId);
    try {
      const breakdown = await this.options.ledger.usageBreakdown(softwareId);
      const rows = this.rows(software, breakdown, sessions);
      const minutes = rows.byStage.reduce((n, r) => n + r.measured.minutes, 0);
      return {
        softwareId,
        name: software.name,
        total: {
          key: "total",
          label: "All of it",
          measured: {
            sessions: sessions.length,
            minutes: Math.round(minutes * 10) / 10,
            figures: ownFiguresOf(readOwnSessions(this.db, softwareId)),
          },
          cost: cost(breakdown.total),
        },
        ...rows,
        budget,
        problem: this.options.ledger.problem(),
      };
    } catch (error) {
      return {
        softwareId,
        name: software.name,
        total: {
          key: "total",
          label: "All of it",
          measured: {
            sessions: sessions.length,
            minutes: 0,
            figures: ownFiguresOf(readOwnSessions(this.db, softwareId)),
          },
          cost: {
            source: this.options.ledger.source,
            sessions: sessions.length,
            priced: 0,
            costUsd: null,
            inputTokens: null,
            outputTokens: null,
            cacheTokens: null,
            weeklyShare: null,
            why: "the cost figures could not be read",
            weeklyWhy: null,
          },
        },
        byPhase: [],
        byStage: [],
        byChange: [],
        byItem: [],
        budget,
        problem: `The cost figures could not be read: ${(error as Error).message}. Agent work carries on under its turn and time limits.${this.options.ledger.source === "ledger" ? " Check usage_ledger.command in Settings." : ""}`,
      };
    }
  }

  async overview(): Promise<UsageOverview> {
    const weekly = await this.options.ledger.weeklyUsage().catch(() => null);
    const softwares = await Promise.all(listSoftwares(this.db).map((s) => this.view(s.id)));
    const window = readWeeklyWindow(this.db);
    return {
      mode: this.options.ledger.mode,
      source: this.options.ledger.source,
      problem: this.options.ledger.problem(),
      command: this.options.config.usage_ledger.command,
      ownWindow: window && {
        usedPercent: window.usedPercent,
        resetsAt: window.resetsAt,
        readAt: window.readAt,
        status: window.status,
      },
      demoWeekly:
        weekly && weekly.source === "demo"
          ? {
              utilization: weekly.utilization,
              windowStart: weekly.windowStart,
              resetsAt: weekly.resetsAt,
            }
          : null,
      softwares,
    };
  }

  // ---- What the operator decides --------------------------------------------------------------

  private require(softwareId: string): Software {
    const software = getSoftware(this.db, softwareId);
    if (!software) throw new ServiceError("NOT_FOUND", "There is no software with that id.");
    return software;
  }

  private toSetting(input: BudgetInput): { percent: number } | { usd: number } | null {
    if (input.kind === "none") return null;
    if (input.kind === "share") {
      if (!Number.isInteger(input.percent) || input.percent < 1 || input.percent > 100) {
        throw new ServiceError(
          "INVALID",
          "A share of the week's usage is a whole number from 1 to 100, such as 20.",
        );
      }
      return { percent: input.percent };
    }
    if (!(input.usd >= 0.01) || !Number.isFinite(input.usd) || input.usd > 1_000_000) {
      throw new ServiceError("INVALID", "An amount is at least 1 cent (0.01 dollars), such as 5.");
    }
    return { usd: input.usd };
  }

  /**
   * Set a software's budget from the page. When its queue was paused for an overrun, the new budget
   * must be above what was used: otherwise it stays paused and says so.
   */
  async setBudget(softwareId: string, input: BudgetInput): Promise<BudgetView> {
    const software = this.require(softwareId);
    const before = budgetOf(software);
    const setting = this.toSetting(input);
    setSoftwareBudget(this.db, softwareId, setting);
    const after = budgetOf(this.require(softwareId));
    await this.options.ledger.setBudget(softwareId, after);
    if (software.state === "paused-budget") {
      const status = await this.options.ledger.budgetStatus(softwareId, { fresh: true });
      if (after === null || !status.checked || !status.overrun) {
        const row = this.latestOverrun(softwareId);
        if (row) {
          this.db
            .prepare("UPDATE budget_overruns SET answer = 'raised', answered = ? WHERE id = ?")
            .run(now(), row.id);
        }
        setSoftwareState(this.db, softwareId, "active", "its budget was raised");
        recordEvent(this.db, {
          softwareId,
          module: "usage",
          kind: "budget-answered",
          detail: { answer: "raised", budget: after },
        });
        this.onSettled();
      } else {
        // Still not enough: put the old budget back and say so.
        setSoftwareBudget(
          this.db,
          softwareId,
          before
            ? before.kind === "share"
              ? { percent: before.percent }
              : { usd: before.usd }
            : null,
        );
        await this.options.ledger.setBudget(softwareId, before);
        throw new ServiceError(
          "INVALID",
          `That is not more than what ${software.name} has already used this week (${money(status.spentUsd)}${status.source === "demo" ? ", a made-up demo figure" : ""}). Choose a bigger budget, or let it finish what it is on.`,
        );
      }
    } else {
      recordEvent(this.db, {
        softwareId,
        module: "usage",
        kind: "budget-set",
        detail: { budget: after },
      });
      this.checkInBackground(softwareId);
    }
    return this.budgetView(softwareId);
  }

  /** The operator's answer to a budget overrun. */
  async answer(softwareId: string, input: OverrunAnswerInput): Promise<BudgetView> {
    const software = this.require(softwareId);
    if (input.answer === "raise") return this.setBudget(softwareId, input.budget);
    const row = this.latestOverrun(softwareId);
    if (software.state !== "paused-budget" || !row) {
      throw new ServiceError(
        "INVALID",
        `${software.name} is not paused for its budget, so there is nothing to answer.`,
      );
    }
    if (input.answer === "finish-change") {
      const item = this.inProgressItem(softwareId);
      if (item === null) {
        throw new ServiceError(
          "INVALID",
          "Nothing is being worked on right now, so there is no change to finish. Raise the budget, or leave it paused.",
        );
      }
      this.db
        .prepare(
          "UPDATE budget_overruns SET answer = 'finish-change', answered = ?, finish_item = ? WHERE id = ?",
        )
        .run(now(), item, row.id);
    } else {
      this.db
        .prepare(
          "UPDATE budget_overruns SET answer = 'left-paused', answered = ?, finish_item = NULL WHERE id = ?",
        )
        .run(now(), row.id);
    }
    recordEvent(this.db, {
      softwareId,
      module: "usage",
      kind: "budget-answered",
      detail: { answer: input.answer },
    });
    this.onSettled();
    return this.budgetView(softwareId);
  }
}
