import type {
  LedgerSessionFigures,
  LedgerSessionState,
  LedgerStore,
  UsageReadingRow,
} from "../usage-ledger/real-usage-ledger.js";
import type { Database } from "./database.js";
import { readWeeklyWindow } from "./session-figures.js";

/**
 * What usage-ledger said of each real session, kept so the page never waits on the command and a
 * restart does not ask again (decision 0330); and the readings of the week not yet given to it.
 */
export function ledgerStore(db: Database): LedgerStore {
  return {
    states() {
      const rows = db
        .prepare(
          "SELECT session_id, label, labelled_at, status, figures, why, read_at FROM ledger_sessions",
        )
        .all() as {
        session_id: string;
        label: string | null;
        labelled_at: string | null;
        status: string | null;
        figures: string | null;
        why: string | null;
        read_at: string | null;
      }[];
      const out = new Map<string, LedgerSessionState>();
      for (const row of rows) {
        let figures: LedgerSessionFigures | null = null;
        try {
          figures = row.figures ? (JSON.parse(row.figures) as LedgerSessionFigures) : null;
        } catch {
          figures = null;
        }
        out.set(row.session_id, {
          sessionId: row.session_id,
          label: row.label,
          labelledAt: row.labelled_at,
          status: row.status === "found" || row.status === "not-found" ? row.status : null,
          figures,
          why: row.why,
          readAt: row.read_at,
        });
      }
      return out;
    },
    saveLabel(sessionId, label, at) {
      db.prepare(
        `INSERT INTO ledger_sessions (session_id, label, labelled_at) VALUES (?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET label = excluded.label, labelled_at = excluded.labelled_at`,
      ).run(sessionId, label, at);
    },
    saveRead(sessionId, status, figures, why, at) {
      db.prepare(
        `INSERT INTO ledger_sessions (session_id, status, figures, why, read_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET status = excluded.status, figures = excluded.figures,
           why = excluded.why, read_at = excluded.read_at`,
      ).run(sessionId, status, figures ? JSON.stringify(figures) : null, why, at);
    },
    unfedReadings() {
      return (
        db
          .prepare(
            `SELECT id, used_percent, resets_at, read_at, session_id FROM usage_readings
             WHERE fed_at IS NULL AND window = 'seven_day' ORDER BY read_at, id`,
          )
          .all() as {
          id: number;
          used_percent: number;
          resets_at: string | null;
          read_at: string;
          session_id: string | null;
        }[]
      ).map((r): UsageReadingRow => ({
        id: r.id,
        usedPercent: r.used_percent,
        resetsAt: r.resets_at,
        readAt: r.read_at,
        sessionId: r.session_id,
      }));
    },
    markFed(id, at) {
      db.prepare("UPDATE usage_readings SET fed_at = ? WHERE id = ?").run(at, id);
    },
    week() {
      const w = readWeeklyWindow(db);
      return w ? { usedPercent: w.usedPercent, resetsAt: w.resetsAt, readAt: w.readAt } : null;
    },
  };
}
