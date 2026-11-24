import { PHASES } from "../shared/stages.js";
import {
  type FigureSource,
  type SessionTaskRecord,
  type UsageBreakdown,
  type UsageFigures,
  type UsageGroup,
  roundUsd,
} from "./usage-ledger.js";

/**
 * Folding each session's figures into a software's total and its groups by stage, change and
 * record item. Both ledgers use it, so the groupings add up the same way: a session on several
 * record items shares its figures equally among them; a figure that is not known stays out of the
 * sums and is counted, with why, instead of being added as zero.
 */

/** One session's figures, as a ledger knows them. */
export interface SessionFigure {
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheTokens: number | null;
  /** The session's share of the week, from 0 up; null when not known. */
  weeklyShare: number | null;
  /** Why the cost is not known, in a few plain words; null when it is. */
  why: string | null;
  /** False for a later leg of a session carried on: its session is counted once, at its first leg. */
  counts?: boolean;
}

const sessions = (n: number): string => `${n} session${n === 1 ? "" : "s"}`;

/** "no figures yet for 2 sessions (not read yet), 1 session (scripted agent)". */
export function missingWords(reasons: Map<string, number>): string | null {
  if (reasons.size === 0) return null;
  const parts = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([why, n]) => `${sessions(n)}: ${why}`);
  return `no cost for ${parts.join("; ")}`;
}

/** Add up sessions' figures; weight shares a session among several groups. */
export function sumFigures(
  source: FigureSource,
  entries: { figure: SessionFigure; weight: number; counts: boolean }[],
  weeklyWhy: string | null = null,
): UsageFigures {
  const sum = (pick: (f: SessionFigure) => number | null): number | null => {
    let total: number | null = null;
    for (const { figure, weight } of entries) {
      const value = pick(figure);
      if (value !== null) total = (total ?? 0) + value * weight;
    }
    return total;
  };
  const reasons = new Map<string, number>();
  let priced = 0;
  const counted = entries.filter((e) => e.counts && e.figure.counts !== false);
  for (const { figure } of counted) {
    if (figure.costUsd === null) {
      const why = figure.why ?? "not known";
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
    } else priced += 1;
  }
  const round = (n: number | null) => (n === null ? null : Math.round(n));
  const weekly = sum((f) => f.weeklyShare);
  return {
    source,
    sessions: counted.length,
    priced,
    costUsd: roundUsd(sum((f) => f.costUsd)),
    inputTokens: round(sum((f) => f.inputTokens)),
    outputTokens: round(sum((f) => f.outputTokens)),
    cacheTokens: round(sum((f) => f.cacheTokens)),
    weeklyShare: weekly,
    why: missingWords(reasons),
    weeklyWhy,
  };
}

/** The phase a stage belongs to; "none" for work on no stage of a phase. */
export function phaseOf(stage: string | null): string {
  if (!stage) return "none";
  return PHASES.find((p) => (p.stages as readonly string[]).includes(stage))?.id ?? "none";
}

/**
 * Group a software's sessions by stage, change and record item, and total them. rowWeekly says
 * whether the groups carry a share of the week (the demo's do; real ones are not known per row).
 */
export function foldBreakdown(
  source: FigureSource,
  softwareId: string,
  each: { session: SessionTaskRecord; figure: SessionFigure }[],
  options: { rowWeeklyWhy: string | null; total: UsageFigures },
): UsageBreakdown {
  const rowFigure = (f: SessionFigure): SessionFigure =>
    options.rowWeeklyWhy === null ? f : { ...f, weeklyShare: null };
  const group = (
    entries: { key: string; figure: SessionFigure; weight: number }[],
  ): UsageGroup[] => {
    const groups = new Map<string, { figure: SessionFigure; weight: number; counts: boolean }[]>();
    for (const entry of entries) {
      const at = groups.get(entry.key) ?? [];
      at.push({ figure: rowFigure(entry.figure), weight: entry.weight, counts: true });
      groups.set(entry.key, at);
    }
    return [...groups.entries()]
      .map(([key, at]) => ({ key, ...sumFigures(source, at, options.rowWeeklyWhy) }))
      .sort(
        (a, b) =>
          (b.costUsd ?? -1) - (a.costUsd ?? -1) ||
          b.sessions - a.sessions ||
          a.key.localeCompare(b.key),
      );
  };
  return {
    source,
    softwareId,
    total: { softwareId, ...options.total },
    byPhase: group(
      each.map((e) => ({ key: phaseOf(e.session.stage), figure: e.figure, weight: 1 })),
    ),
    byStage: group(
      each.map((e) => ({ key: e.session.stage ?? "none", figure: e.figure, weight: 1 })),
    ),
    byChange: group(
      each.map((e) => ({
        key: e.session.workItem === null ? "none" : String(e.session.workItem),
        figure: e.figure,
        weight: 1,
      })),
    ),
    byItem: group(
      each.flatMap(({ session, figure }) => {
        const keys = session.items.length > 0 ? session.items : ["none"];
        return keys.map((key) => ({ key, figure, weight: 1 / keys.length }));
      }),
    ),
  };
}
