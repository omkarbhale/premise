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
import { readSessionTasks } from "./session-tasks.js";

/**
 * Cost and the spending limit (decisions 0016, 0048, 0064, 0128, 0133, 0200). premise records which
 * task each agent session did and asks usage-ledger what it cost; it counts nothing itself. It sets
 * each software's budget in usage-ledger; when usage-ledger says one is overrun, this pauses that
 * software's queue and tells the operator, who answers: raise the budget, finish the change being
 * worked on, or leave it paused. Every figure from usage-ledger is marked as mocked while it is a
 * mock; premise's own counts of sessions and minutes sit beside them and are not.
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
  costUsd: number;
}

interface SpentRecord {
  spentUsd: number;
  mocked: boolean;
  byStage: SpentLine[];
  byChange: SpentLine[];
}

const money = (usd: number): string => `$${usd.toFixed(2)}`;
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
    this.timer ??= setInterval(() => void this.recheckPaused(), RECHECK_MS);
    this.timer.unref?.();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
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
    const status = await this.options.ledger.budgetStatus(softwareId);
    if (software.state === "paused-budget") {
      if (!status.overrun) this.resumeAfterReset(softwareId);
      return;
    }
    if (!status.overrun) return;
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
      detail: { budget: status.budget, spentUsd: spent.spentUsd, mocked: spent.mocked },
    });
  }

  /** The week reset and the software is within budget again: resume it unless it was left paused on purpose. */
  private resumeAfterReset(softwareId: string): void {
    const software = getSoftware(this.db, softwareId);
    if (software?.state !== "paused-budget") return;
    if (this.latestOverrun(softwareId)?.answer === "left-paused") return;
    setSoftwareState(this.db, softwareId, "active", "the week reset");
    addChatMessage(this.db, {
      softwareId,
      author: "premise",
      text: `The week reset; ${software.name} is within its budget again and has resumed`,
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
    const measure = (match: (s: SessionTaskRecord) => boolean): UsageMeasured => {
      const some = sessions.filter(match);
      const minutes = some.reduce((n, s) => {
        const end = s.ended ? Date.parse(s.ended) : Date.now();
        return n + Math.max(0, end - Date.parse(s.started)) / 60_000;
      }, 0);
      return { sessions: some.length, minutes: Math.round(minutes * 10) / 10 };
    };
    const cost = (f: UsageFigures): UsageCost => ({
      mocked: f.mocked,
      inputTokens: f.inputTokens,
      outputTokens: f.outputTokens,
      costUsd: f.costUsd,
      weeklyShare: f.weeklyShare,
    });
    const byStage: UsageRowView[] = breakdown.byStage.map((g) => ({
      key: g.key,
      label: g.key === NONE ? "Other work" : stageName(g.key),
      measured: measure((s) => (s.stage ?? NONE) === g.key),
      cost: cost(g),
    }));
    const phases: { id: string; name: string; stages: readonly string[] }[] = PHASES.map((p) => ({
      id: p.id,
      name: p.name,
      stages: p.stages,
    }));
    phases.push({ id: NONE, name: "Other work", stages: [] });
    const byPhase: UsageRowView[] = [];
    for (const phase of phases) {
      const inPhase = (stage: string | null) =>
        phase.id === NONE
          ? !phases.some((p) => stage && p.stages.includes(stage))
          : !!stage && phase.stages.includes(stage);
      const groups = breakdown.byStage.filter((g) => inPhase(g.key === NONE ? null : g.key));
      if (groups.length === 0) continue;
      const total = groups.reduce(
        (n, g) => ({
          inputTokens: n.inputTokens + g.inputTokens,
          outputTokens: n.outputTokens + g.outputTokens,
          costUsd: n.costUsd + g.costUsd,
          weeklyShare: n.weeklyShare + g.weeklyShare,
        }),
        { inputTokens: 0, outputTokens: 0, costUsd: 0, weeklyShare: 0 },
      );
      byPhase.push({
        key: phase.id,
        label: phase.name,
        measured: measure((s) => inPhase(s.stage)),
        cost: { mocked: breakdown.mocked, ...total },
      });
    }
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
      mocked: breakdown.mocked,
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
    const mocked = spent.mocked;
    const top = spent.byStage
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
        `${mocked ? " (mocked figure)" : ""} so far${top ? `, mostly on ${top}` : ""}. ${consequence}`,
      spentByStage: spent.byStage,
      spentByChange: spent.byChange,
      spentUsd: spent.spentUsd,
      mocked,
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
      spentUsd: status?.spentUsd ?? 0,
      spentShare: status?.spentShare ?? 0,
      mocked: this.options.ledger.mocked,
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
          measured: { sessions: sessions.length, minutes: Math.round(minutes * 10) / 10 },
          cost: {
            mocked: breakdown.mocked,
            inputTokens: breakdown.total.inputTokens,
            outputTokens: breakdown.total.outputTokens,
            costUsd: breakdown.total.costUsd,
            weeklyShare: breakdown.total.weeklyShare,
          },
        },
        ...rows,
        budget,
        problem: null,
      };
    } catch (error) {
      return {
        softwareId,
        name: software.name,
        total: {
          key: "total",
          label: "All of it",
          measured: { sessions: sessions.length, minutes: 0 },
          cost: {
            mocked: this.options.ledger.mocked,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            weeklyShare: 0,
          },
        },
        byPhase: [],
        byStage: [],
        byChange: [],
        byItem: [],
        budget,
        problem: `The cost figures could not be read: ${(error as Error).message}. Agent work carries on under its turn and time limits.`,
      };
    }
  }

  async overview(): Promise<UsageOverview> {
    const weekly = await this.options.ledger.weeklyUsage();
    const softwares = await Promise.all(listSoftwares(this.db).map((s) => this.view(s.id)));
    return {
      mode: this.options.ledger.mode,
      mocked: this.options.ledger.mocked,
      weekly,
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
      const status = await this.options.ledger.budgetStatus(softwareId);
      if (after === null || !status.overrun) {
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
          `That is not more than what ${software.name} has already used this week (${money(status.spentUsd)}${status.spentUsd > 0 && this.options.ledger.mocked ? ", a mocked figure" : ""}). Choose a bigger budget, or let it finish what it is on.`,
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
