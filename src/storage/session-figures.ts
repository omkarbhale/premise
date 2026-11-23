import type { SessionFigures, WindowReading } from "../agents/agent-runner.js";
import { type Database, now } from "./database.js";

/**
 * premise's own count of what real sessions used (decision 0270): the figures each session's
 * result carries, kept on its `agent_sessions` row, and the usage window as the stream last
 * reported it. Real figures, never marked as mocked. A scripted agent, or a session that ended
 * without a result, has none; that is kept as "no figures" and never as zero.
 */

/** Keep what a session ended with: its figures on its row, its windows as the latest reading. */
export function recordSessionFigures(
  db: Database,
  jobId: number,
  outcome: { figures?: SessionFigures; windows?: WindowReading[] },
): void {
  if (outcome.figures) {
    db.prepare(
      "UPDATE agent_sessions SET figures = ?, turns = COALESCE(?, turns) WHERE id = (SELECT MAX(id) FROM agent_sessions WHERE job_id = ?)",
    ).run(JSON.stringify(outcome.figures), outcome.figures.turns, jobId);
  }
  for (const reading of outcome.windows ?? []) {
    db.prepare(
      `INSERT INTO usage_windows (window, used_percent, resets_at, status, read_at, job_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(window) DO UPDATE SET used_percent = excluded.used_percent,
         resets_at = excluded.resets_at, status = excluded.status,
         read_at = excluded.read_at, job_id = excluded.job_id`,
    ).run(reading.window, reading.usedPercent, reading.resetsAt, reading.status, now(), jobId);
  }
}

/** One window as last read, and when. */
export interface StoredWindow {
  window: string;
  usedPercent: number;
  resetsAt: string | null;
  status: string | null;
  readAt: string;
}

/** The weekly window as the stream last reported it; null when no real session has reported one. */
export function readWeeklyWindow(db: Database): StoredWindow | null {
  const row = db
    .prepare(
      `SELECT window, used_percent, resets_at, status, read_at FROM usage_windows
       WHERE window = 'seven_day'`,
    )
    .get() as
    | {
        window: string;
        used_percent: number;
        resets_at: string | null;
        status: string | null;
        read_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    window: row.window,
    usedPercent: row.used_percent,
    resetsAt: row.resets_at,
    status: row.status,
    readAt: row.read_at,
  };
}

/** What one session recorded about itself, with where it ran. */
export interface OwnSession {
  runtime: string;
  figures: SessionFigures | null;
}

/**
 * Every session's own record, in the same order as the session task records of
 * src/usage/session-tasks.ts, so the two are read side by side.
 */
export function readOwnSessions(db: Database, softwareId?: string): OwnSession[] {
  const rows = db
    .prepare(
      `SELECT s.runtime, s.figures
       FROM agent_sessions s JOIN jobs j ON j.id = s.job_id
       ${softwareId ? "WHERE j.software_id = ?" : ""}
       ORDER BY s.id`,
    )
    .all(...(softwareId ? [softwareId] : [])) as { runtime: string; figures: string | null }[];
  return rows.map((row) => {
    let figures: SessionFigures | null = null;
    if (row.figures) {
      try {
        figures = JSON.parse(row.figures) as SessionFigures;
      } catch {
        figures = null;
      }
    }
    return { runtime: row.runtime, figures };
  });
}
