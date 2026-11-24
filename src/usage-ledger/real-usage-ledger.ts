import { type SessionFigure, foldBreakdown, sumFigures } from "./fold.js";
import {
  type LedgerCommandResult,
  LedgerCommandError,
  type LedgerRun,
  ledgerError,
} from "./ledger-command.js";
import type {
  Budget,
  BudgetStatus,
  SessionSource,
  SessionTaskRecord,
  SoftwareUsage,
  UsageBreakdown,
  UsageFigures,
  UsageLedger,
} from "./usage-ledger.js";

/**
 * The real usage-ledger (decision 0330), run as a command. usage-ledger reads Claude Code's own
 * logs for each session's tokens and cost, keeps labels, readings of the week and budgets, and
 * decides when a budget is used up. premise:
 * - labels every real session with its software and task as soon as it has an id;
 * - gives usage-ledger each reading of the week the agents' stream reported, with its time
 *   (usage-ledger's `reading`);
 * - reads every session that ended since it last asked in one `sessions` listing, and keeps the
 *   answers, so a page never waits on the command and a restart does not ask again;
 * - reads this week's totals per software (`report --week --by project`);
 * - sets each software's budget for the week in usage-ledger (`budget set --project`) and reads
 *   whether it is ok, incomplete or used up (`budgets`);
 * - catches up on past sessions usage-ledger has not seen, when it starts.
 * Commands run one at a time in the background, in rounds, however often something changes. When
 * the command cannot be run, work carries on and the page says what to do.
 */

/** What usage-ledger said one session used. */
export interface LedgerSessionFigures {
  /** Estimated at list prices; null when usage-ledger could not price it. */
  costUsd: number | null;
  costWhy: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  models: string[];
  effortLevels: string[];
  /** The session's estimated share of the week, in percent; null when not known. */
  weeklyPercent: number | null;
  weeklyWhy: string | null;
}

export interface LedgerSessionState {
  sessionId: string;
  /** The task label given to usage-ledger, and when; null before it was labelled. */
  label: string | null;
  labelledAt: string | null;
  /** What reading it gave: found, or not in Claude Code's logs; null before it was read. */
  status: "found" | "not-found" | null;
  figures: LedgerSessionFigures | null;
  why: string | null;
  readAt: string | null;
}

/** A reading of the week from an agent's stream, with when premise read it. */
export interface UsageReadingRow {
  id: number;
  usedPercent: number;
  resetsAt: string | null;
  readAt: string;
  sessionId: string | null;
}

/** Where the real ledger keeps what usage-ledger said (premise's database; storage/ledger-sessions.ts). */
export interface LedgerStore {
  states(): Map<string, LedgerSessionState>;
  saveLabel(sessionId: string, label: string, at: string): void;
  saveRead(
    sessionId: string,
    status: "found" | "not-found",
    figures: LedgerSessionFigures | null,
    why: string | null,
    at: string,
  ): void;
  unfedReadings(): UsageReadingRow[];
  markFed(id: number, at: string): void;
  /** The latest reading of the week; null before any real session reported one. */
  week(): { usedPercent: number; resetsAt: string | null; readAt: string } | null;
}

export interface RealLedgerOptions {
  run: LedgerRun;
  store: LedgerStore;
  /** The command as configured, to name it in what the page says. */
  command: string;
  readAfterMs: number;
  recheckMs: number;
  /** How far back to catch up on past sessions; null for all. */
  catchUpDays: number | null;
  clock?: () => Date;
  /** How long to wait after a change before a round of commands, so changes come together. */
  settleMs?: number;
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** usage-ledger's own rule for a session id. */
const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;
const LABEL_MAX = 200;

/** The task label for a session: "<software>|<stage>|<work item>|<items>", within 200 characters. */
export function taskLabel(session: SessionTaskRecord): string {
  const clean = (text: string) => text.replace(/[\s|]+/g, " ").trim();
  const head = `${projectOf(session.softwareId)}|${clean(session.stage ?? "-")}|${session.workItem ?? "-"}|`;
  let items = session.items.map(clean).filter(Boolean).join(",") || "-";
  if (head.length + items.length > LABEL_MAX) {
    items = `${items.slice(0, Math.max(0, LABEL_MAX - head.length - 1))}…`;
  }
  return `${head}${items}`.slice(0, LABEL_MAX);
}

/** The project a software's sessions are labelled with in usage-ledger, and its budget is set for. */
const projectOf = (softwareId: string): string => softwareId.replace(/[\s|]+/g, " ").trim();

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** One session as usage-ledger's `session` or `sessions` answer gives it, as premise keeps it. */
export function readSessionAnswer(session: Record<string, unknown>): LedgerSessionFigures {
  const cost = obj(session.cost);
  const weekly = obj(session.weekly);
  const usd = num(cost.usd);
  const weeklyPercent = num(weekly.weeklyPercent);
  return {
    costUsd: usd,
    costWhy:
      usd === null
        ? typeof cost.reason === "string"
          ? cost.reason
          : "usage-ledger has no price for it"
        : null,
    inputTokens: num(session.inputTokens) ?? 0,
    outputTokens: num(session.outputTokens) ?? 0,
    cacheTokens: (num(session.cacheCreationTokens) ?? 0) + (num(session.cacheReadTokens) ?? 0),
    models: strings(session.models),
    effortLevels: strings(session.effortLevels),
    weeklyPercent,
    weeklyWhy:
      weeklyPercent === null
        ? typeof weekly.reason === "string"
          ? weekly.reason
          : "not known"
        : null,
  };
}

/** A software's figures for this week, from usage-ledger's `report --week --by project`. */
export interface WeekFigures {
  sessions: number;
  costUsd: number | null;
  /** Sessions with no cost, left out of costUsd. */
  unpricedSessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  /** In percent of the week; null when no session's share is known. */
  weeklyPercent: number | null;
  /** Sessions whose share is not known, left out of weeklyPercent. */
  unknownShareSessions: number;
}

/** Where a software's budget stands, as usage-ledger's `budgets` says. */
export interface BudgetStanding {
  status: "ok" | "incomplete" | "used-up";
  used: number | null;
  limit: number;
  unit: string;
  unknownSessions: number;
  reason: string | null;
}

/** One session id and its legs: a session carried on after a pause has a record for each. */
interface SessionLegs {
  id: string;
  first: SessionTaskRecord;
  /** When the last leg ended; null while one is running. */
  ended: string | null;
}

export class RealUsageLedger implements UsageLedger {
  readonly mode = "real";
  readonly source = "ledger" as const;
  private sessionSource: SessionSource = () => [];
  private readonly clock: () => Date;
  private problemText: string | null = null;
  private round: Promise<void> | null = null;
  private again = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private laterTimer: ReturnType<typeof setTimeout> | null = null;
  private recheckTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  /** Something changed since this week's totals and the budgets were last read. */
  private dirty = true;
  /** Budgets as premise last set them, and the ones not given to usage-ledger yet. */
  private readonly budgetFor = new Map<string, Budget | null>();
  private readonly pendingBudgets = new Map<string, Budget | null>();
  /** This week's totals per software, and the budgets' standing, as last read. */
  private weekRead: {
    at: number;
    basis: string | null;
    bySoftware: Map<string, WeekFigures>;
  } | null = null;
  private budgetsRead: { at: number; bySoftware: Map<string, BudgetStanding> } | null = null;

  constructor(private readonly options: RealLedgerOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  attach(source: SessionSource): void {
    this.sessionSource = source;
  }

  start(): void {
    this.closed = false;
    this.nudge();
    this.recheckTimer ??= setInterval(() => this.nudge(), this.options.recheckMs);
    this.recheckTimer.unref?.();
  }

  close(): void {
    this.closed = true;
    for (const timer of [this.settleTimer, this.laterTimer]) if (timer) clearTimeout(timer);
    if (this.recheckTimer) clearInterval(this.recheckTimer);
    this.settleTimer = this.laterTimer = this.recheckTimer = null;
  }

  nudge(): void {
    if (this.closed) return;
    this.dirty = true;
    if (this.round) {
      this.again = true;
      return;
    }
    if (this.settleTimer) return;
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      void this.runRounds();
    }, this.options.settleMs ?? 500);
    this.settleTimer.unref?.();
  }

  /** Run a round now and wait for it (and any asked for meanwhile). */
  async sync(): Promise<void> {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    if (this.round) {
      this.again = true;
      await this.idle();
      return;
    }
    await this.runRounds();
  }

  async idle(): Promise<void> {
    while (this.round) await this.round;
  }

  problem(): string | null {
    return this.problemText;
  }

  private runRounds(): Promise<void> {
    this.round = (async () => {
      do {
        this.again = false;
        await this.oneRound();
      } while (this.again && !this.closed);
    })().finally(() => {
      this.round = null;
    });
    return this.round;
  }

  // ---- One round of commands ------------------------------------------------------------------

  private now(): string {
    return this.clock().toISOString();
  }

  /** Run one command; a command that could not run sets the problem and ends the round. */
  private async run(args: string[], input?: string): Promise<LedgerCommandResult> {
    try {
      const result = await this.options.run(args, input);
      if (result.json === null && result.code !== 0) {
        throw new LedgerCommandError(
          `it stopped with exit code ${result.code ?? "none"}${result.stderr ? ` (${result.stderr.split("\n")[0]})` : ""}`,
          "failed",
        );
      }
      const error = ledgerError(result);
      if (error?.code === "usage") {
        // An older usage-ledger that does not know a command premise needs.
        throw new LedgerCommandError(
          `this usage-ledger does not know "${args[0]}" (${error.message}); update usage-ledger to its latest version`,
          "failed",
        );
      }
      if (error?.code === "logs-not-found") {
        throw new LedgerCommandError(
          `usage-ledger did not find Claude Code's log folder (${error.message}). If Claude Code keeps its data somewhere else, set agents.claude_config_folder`,
          "failed",
        );
      }
      return result;
    } catch (error) {
      const e =
        error instanceof LedgerCommandError
          ? error
          : new LedgerCommandError((error as Error).message, "failed");
      this.problemText =
        e.kind === "missing"
          ? `premise could not run usage-ledger: ${e.message}. Cost figures of new sessions wait until it can, and budgets are not checked. Install usage-ledger, or set usage_ledger.command to where it is (the Settings page says how), then restart premise. Agent work carries on.`
          : `premise could not read usage-ledger just now: ${e.message}. It tries again every few minutes; the figures below are from before, and budgets are not checked meanwhile. Agent work carries on. If this stays, run usage-ledger --help in a terminal to see whether it works, and check usage_ledger.command in Settings.`;
      throw new RoundEnded();
    }
  }

  private async oneRound(): Promise<void> {
    try {
      await this.feedReadings();
      await this.giveBudgets();
      const legs = this.legs();
      await this.label(legs);
      const read = await this.read(legs);
      const stale =
        this.weekRead === null ||
        this.clock().getTime() - this.weekRead.at >= this.options.recheckMs;
      if (this.dirty || read || stale) {
        this.dirty = false;
        await this.readWeek();
        await this.readBudgets();
      }
      this.problemText = null;
    } catch (error) {
      if (!(error instanceof RoundEnded)) {
        this.problemText = `premise could not read usage-ledger just now: ${(error as Error).message}. It tries again every few minutes. Agent work carries on.`;
      }
      // What was read before a failure is not current: budgets are not checked until it is.
      this.budgetsRead = null;
      this.dirty = true;
    }
  }

  /** Give usage-ledger each reading of the week, at the time it was read. */
  private async feedReadings(): Promise<void> {
    for (const reading of this.options.store.unfedReadings()) {
      if (this.closed) return;
      // A reading with no reset time, or one usage-ledger refuses, is set aside, not given again.
      if (reading.resetsAt) {
        await this.run([
          "reading",
          "--percent",
          String(Math.min(100, Math.max(0, reading.usedPercent))),
          "--resets-at",
          reading.resetsAt,
          "--at",
          reading.readAt,
        ]);
        this.dirty = true;
      }
      this.options.store.markFed(reading.id, this.now());
    }
  }

  /** Give usage-ledger the budgets set since the last round. */
  private async giveBudgets(): Promise<void> {
    for (const [softwareId, budget] of [...this.pendingBudgets]) {
      if (this.closed) return;
      const project = `--project=${projectOf(softwareId)}`;
      // Removing first, since a budget in dollars and one in percent would both stand otherwise.
      await this.run(["budget", "remove", project]);
      if (budget) {
        const limit =
          budget.kind === "amount"
            ? ["--dollars", String(budget.usd)]
            : ["--percent", String(budget.percent)];
        const result = await this.run(["budget", "set", project, ...limit]);
        const error = ledgerError(result);
        if (error)
          throw new LedgerCommandError(`it refused the budget (${error.message})`, "failed");
      }
      this.pendingBudgets.delete(softwareId);
      this.dirty = true;
    }
  }

  /** Real sessions with an id usage-ledger accepts, within the catch-up window, by session id. */
  private legs(): SessionLegs[] {
    const since =
      this.options.catchUpDays === null
        ? null
        : this.clock().getTime() - this.options.catchUpDays * DAY;
    const states = this.options.store.states();
    const byId = new Map<string, SessionLegs>();
    for (const session of this.sessionSource()) {
      if (session.runtime === "scripted" || !VALID_ID.test(session.sessionId)) continue;
      const at = byId.get(session.sessionId);
      if (at) {
        at.ended =
          at.ended === null || session.ended === null ? null : maxIso(at.ended, session.ended);
        continue;
      }
      byId.set(session.sessionId, { id: session.sessionId, first: session, ended: session.ended });
    }
    return [...byId.values()]
      .filter((l) => {
        if (since === null || states.has(l.id)) return true;
        // A session still running, or one that ended within the window, is wanted.
        return l.ended === null || Date.parse(l.ended) >= since;
      })
      .sort((a, b) => b.first.started.localeCompare(a.first.started));
  }

  private async label(legs: SessionLegs[]): Promise<void> {
    const states = this.options.store.states();
    for (const l of legs) {
      if (this.closed) return;
      const label = taskLabel(l.first);
      if (states.get(l.id)?.label === label) continue;
      // A label usage-ledger refuses is not asked again; the session is still read by its id.
      await this.run([
        "label",
        l.id,
        "--task",
        label,
        `--project=${projectOf(l.first.softwareId)}`,
      ]);
      this.options.store.saveLabel(l.id, label, this.now());
    }
  }

  /** Read every session due in one listing. True when any was read. */
  private async read(legs: SessionLegs[]): Promise<boolean> {
    const now = this.clock().getTime();
    const week = this.options.store.week();
    const states = this.options.store.states();
    let soonest: number | null = null;
    const due: SessionLegs[] = [];
    for (const l of legs) {
      if (l.ended === null) continue;
      const state = states.get(l.id);
      const ended = Date.parse(l.ended);
      const readAt = state?.readAt ? Date.parse(state.readAt) : null;
      const after = ended + this.options.readAfterMs;
      if (readAt === null || readAt < ended) {
        // Never read since it ended: once Claude Code has had time to finish its log.
        if (now >= after) due.push(l);
        else soonest = Math.min(soonest ?? after, after);
      } else if (now - readAt >= this.options.recheckMs) {
        if (state?.status === "not-found") {
          // The log may have come late: look again for a day.
          if (now - ended < DAY) due.push(l);
        } else if (
          state?.figures?.weeklyPercent === null &&
          now - ended < WEEK + DAY &&
          week !== null &&
          Date.parse(week.readAt) > ended &&
          Date.parse(week.readAt) > readAt
        ) {
          // Its share of the week needs a reading after it ended; ask again once there is one.
          due.push(l);
        }
      }
    }
    if (due.length > 0 && !this.closed) {
      const since = due.reduce(
        (min, l) => Math.min(min, Date.parse(l.first.started)),
        Number.POSITIVE_INFINITY,
      );
      // An hour's margin, in case the log's clock and premise's differ.
      const result = await this.run([
        "sessions",
        "--since",
        new Date(since - 60 * 60_000).toISOString(),
      ]);
      const error = ledgerError(result);
      if (error) throw new LedgerCommandError(error.message, "failed");
      const listing = obj(obj(result.json).listing);
      if (!Array.isArray(listing.sessions)) {
        throw new LedgerCommandError("its list of sessions could not be read", "failed");
      }
      const found = new Map<string, Record<string, unknown>>();
      for (const s of listing.sessions) {
        const session = obj(s);
        if (typeof session.sessionId === "string") found.set(session.sessionId, session);
      }
      const at = this.now();
      for (const l of due) {
        const session = found.get(l.id);
        if (session)
          this.options.store.saveRead(l.id, "found", readSessionAnswer(session), null, at);
        else this.options.store.saveRead(l.id, "not-found", null, "not in Claude Code's logs", at);
      }
    }
    if (soonest !== null && !this.closed) {
      if (this.laterTimer) clearTimeout(this.laterTimer);
      this.laterTimer = setTimeout(
        () => {
          this.laterTimer = null;
          this.nudge();
        },
        Math.max(0, soonest - now) + 50,
      );
      this.laterTimer.unref?.();
    }
    return due.length > 0;
  }

  /** This week's totals per software. */
  private async readWeek(): Promise<void> {
    const result = await this.run(["report", "--week", "--by", "project"]);
    const error = ledgerError(result);
    if (error) throw new LedgerCommandError(error.message, "failed");
    const report = obj(obj(result.json).report);
    const window = obj(report.window);
    const bySoftware = new Map<string, WeekFigures>();
    for (const g of Array.isArray(report.groups) ? report.groups : []) {
      const group = obj(g);
      if (typeof group.project !== "string") continue;
      const cost = obj(group.cost);
      const weekly = obj(group.weekly);
      bySoftware.set(group.project, {
        sessions: num(group.sessions) ?? 0,
        costUsd: num(cost.usd),
        unpricedSessions: num(cost.unknownSessions) ?? 0,
        inputTokens: num(group.inputTokens) ?? 0,
        outputTokens: num(group.outputTokens) ?? 0,
        cacheTokens: (num(group.cacheCreationTokens) ?? 0) + (num(group.cacheReadTokens) ?? 0),
        weeklyPercent: num(weekly.weeklyPercent),
        unknownShareSessions: num(weekly.unknownSessions) ?? 0,
      });
    }
    this.weekRead = {
      at: this.clock().getTime(),
      basis: typeof window.basis === "string" ? window.basis : null,
      bySoftware,
    };
  }

  /** Where every software's budget stands. Only asked when a budget is set. */
  private async readBudgets(): Promise<void> {
    if (![...this.budgetFor.values()].some(Boolean)) {
      this.budgetsRead = { at: this.clock().getTime(), bySoftware: new Map() };
      return;
    }
    // Exit 1 (a budget used up) and 3 (one incomplete) come with the answer; only an error does not.
    const result = await this.run(["budgets"]);
    const error = ledgerError(result);
    if (error) throw new LedgerCommandError(error.message, "failed");
    const answer = obj(result.json);
    if (!Array.isArray(answer.budgets)) {
      throw new LedgerCommandError("its budgets could not be read", "failed");
    }
    const bySoftware = new Map<string, BudgetStanding>();
    for (const b of answer.budgets) {
      const budget = obj(b);
      if (budget.scope !== "project" || typeof budget.project !== "string") continue;
      const status =
        budget.status === "used-up" || budget.usedUp === true
          ? "used-up"
          : budget.status === "incomplete"
            ? "incomplete"
            : "ok";
      bySoftware.set(budget.project, {
        status,
        used: num(budget.used),
        limit: num(budget.limit) ?? 0,
        unit: typeof budget.unit === "string" ? budget.unit : "",
        unknownSessions: num(budget.unknownSessions) ?? 0,
        reason: typeof budget.reason === "string" ? budget.reason : null,
      });
    }
    this.budgetsRead = { at: this.clock().getTime(), bySoftware };
  }

  // ---- Answers, from what usage-ledger said --------------------------------------------------

  /** Each session's figure as usage-ledger gave it, or why there is none. */
  private figures(
    sessions: SessionTaskRecord[],
  ): { session: SessionTaskRecord; figure: SessionFigure }[] {
    const states = this.options.store.states();
    const seen = new Set<string>();
    return sessions.map((session) => {
      const none = (why: string): SessionFigure => ({
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        cacheTokens: null,
        weeklyShare: null,
        why,
      });
      if (session.runtime === "scripted")
        return { session, figure: none("scripted agent, uses nothing") };
      if (!VALID_ID.test(session.sessionId)) return { session, figure: none("no session id") };
      if (seen.has(session.sessionId)) {
        // A later leg of a session carried on: usage-ledger counts the whole session once.
        return {
          session,
          figure: {
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheTokens: 0,
            weeklyShare: 0,
            why: null,
            counts: false,
          },
        };
      }
      seen.add(session.sessionId);
      const state = states.get(session.sessionId);
      if (!state?.status) {
        return {
          session,
          figure: none(
            session.ended === null
              ? "still running"
              : this.problemText
                ? "usage-ledger could not be read"
                : "not read from usage-ledger yet",
          ),
        };
      }
      if (state.status === "not-found" || !state.figures) {
        return { session, figure: none(state.why ?? "not in Claude Code's logs") };
      }
      const f = state.figures;
      return {
        session,
        figure: {
          costUsd: f.costUsd,
          inputTokens: f.inputTokens,
          outputTokens: f.outputTokens,
          cacheTokens: f.cacheTokens,
          weeklyShare: f.weeklyPercent === null ? null : f.weeklyPercent / 100,
          why: f.costUsd === null ? (f.costWhy ?? "no price") : null,
        },
      };
    });
  }

  /** This week's figures for a software, from usage-ledger's report; null before it was read. */
  private thisWeek(softwareId: string): WeekFigures | null {
    if (!this.weekRead) return null;
    return (
      this.weekRead.bySoftware.get(projectOf(softwareId)) ?? {
        sessions: 0,
        costUsd: 0,
        unpricedSessions: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        weeklyPercent: 0,
        unknownShareSessions: 0,
      }
    );
  }

  /** The software's share of this week, in words. */
  private weekly(softwareId: string): { share: number | null; why: string | null } {
    const week = this.thisWeek(softwareId);
    if (!week) {
      return {
        share: null,
        why: this.problemText
          ? "not known: usage-ledger could not be read"
          : "not read from usage-ledger yet",
      };
    }
    if (week.sessions === 0) return { share: 0, why: "no session this week" };
    const span =
      this.weekRead?.basis === "last-seven-days"
        ? "over the last seven days (no reading of when the week resets yet)"
        : "this week";
    const rough = `estimated by usage-ledger ${span} from the week's readings, which move in steps of 1%, and shared with any other work done at the same time`;
    if (week.weeklyPercent === null || week.unknownShareSessions >= week.sessions) {
      return {
        share: null,
        why: `not known yet for the ${week.sessions === 1 ? "session" : `${week.sessions} sessions`} ${span}: usage-ledger works it out from readings of the week taken before and after each session, and the reading after one comes with the next real session`,
      };
    }
    const unknown = week.unknownShareSessions;
    return {
      share: week.weeklyPercent / 100,
      why:
        unknown > 0
          ? `${rough}; ${unknown} session${unknown === 1 ? "" : "s"} not known yet, so it is at least this`
          : rough,
    };
  }

  private total(
    softwareId: string,
    each: { session: SessionTaskRecord; figure: SessionFigure }[],
  ): UsageFigures {
    const weekly = this.weekly(softwareId);
    return {
      ...sumFigures(
        "ledger",
        each.map((e) => ({ figure: e.figure, weight: 1, counts: true })),
      ),
      weeklyShare: weekly.share,
      weeklyWhy: weekly.why,
    };
  }

  weeklyUsage(): Promise<null> {
    // premise's own reading of the stream is the week's figure; usage-ledger has the same one.
    return Promise.resolve(null);
  }

  softwareUsage(softwareId: string): Promise<SoftwareUsage> {
    return Promise.resolve({
      softwareId,
      ...this.total(softwareId, this.figures(this.sessionSource(softwareId))),
    });
  }

  usageBreakdown(softwareId: string): Promise<UsageBreakdown> {
    const each = this.figures(this.sessionSource(softwareId));
    return Promise.resolve(
      foldBreakdown("ledger", softwareId, each, {
        rowWeeklyWhy:
          "not known for one step, change or item: the week's figure moves in steps of 1%, too coarse to share out",
        total: this.total(softwareId, each),
      }),
    );
  }

  setBudget(softwareId: string, budget: Budget | null): Promise<void> {
    const before = this.budgetFor.get(softwareId);
    this.budgetFor.set(softwareId, budget);
    // premise sets every budget again at start. A software with none, and none before, needs no
    // command, except at start (before === undefined), to remove one left in usage-ledger earlier.
    if (budget || before !== null) {
      this.pendingBudgets.set(softwareId, budget);
      this.nudge();
    }
    return Promise.resolve();
  }

  async budgetStatus(softwareId: string, options?: { fresh?: boolean }): Promise<BudgetStatus> {
    const budget = this.budgetFor.get(softwareId) ?? null;
    // Before deciding anything, read usage-ledger again; for the page, what was read is enough.
    if (options?.fresh && (budget || this.pendingBudgets.has(softwareId))) await this.sync();
    const week = this.thisWeek(softwareId);
    const weekly = this.weekly(softwareId);
    const base = {
      source: "ledger" as const,
      softwareId,
      budget,
      spentUsd: week ? week.costUsd : null,
      spentShare: weekly.share,
    };
    if (!budget) return { ...base, checked: false, incomplete: false, overrun: false, why: null };
    const standing = this.pendingBudgets.has(softwareId)
      ? undefined
      : this.budgetsRead?.bySoftware.get(projectOf(softwareId));
    if (!standing) {
      return {
        ...base,
        checked: false,
        incomplete: false,
        overrun: false,
        why: this.problemText
          ? "usage-ledger could not be read, so the budget is not checked and work carries on"
          : "not checked yet: premise is giving it to usage-ledger",
      };
    }
    if (standing.status === "incomplete") {
      return {
        ...base,
        checked: true,
        incomplete: true,
        overrun: false,
        why: `usage-ledger could not count ${standing.unknownSessions === 1 ? "one session" : `${standing.unknownSessions} sessions`} this week${standing.reason ? ` (${standing.reason})` : ""}, so what it counted is at least what was used. Nothing is known to have used the budget up, so work carries on`,
      };
    }
    return {
      ...base,
      checked: true,
      incomplete: false,
      overrun: standing.status === "used-up",
      why: null,
    };
  }
}

class RoundEnded extends Error {}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}
