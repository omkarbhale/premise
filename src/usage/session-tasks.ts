import type { SessionTaskRecord } from "../usage-ledger/usage-ledger.js";
import type { Database } from "../storage/database.js";

interface Row {
  id: number;
  runtime_session_id: string;
  job_id: number;
  software_id: string;
  kind: string;
  stage: string | null;
  items: string;
  payload: string;
  model: string;
  effort: string;
  started: string;
  ended: string | null;
}

/**
 * Which task each agent session did, in the form usage-ledger reads (docs/specs/usage-ledger.md).
 * It is read from what the work queue already stores for every session, real or scripted, so
 * there is one record and nothing to keep in step; it survives a restart with the database.
 */
export function readSessionTasks(db: Database, softwareId?: string): SessionTaskRecord[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.runtime_session_id, s.job_id, j.software_id, j.kind, j.stage, j.items,
              j.payload, s.model, s.effort, s.started, s.ended
       FROM agent_sessions s JOIN jobs j ON j.id = s.job_id
       ${softwareId ? "WHERE j.software_id = ?" : ""}
       ORDER BY s.id`,
    )
    .all(...(softwareId ? [softwareId] : [])) as unknown as Row[];
  return rows.map((row) => {
    let payload: { item?: unknown } = {};
    try {
      payload = JSON.parse(row.payload) as typeof payload;
    } catch {
      // A payload that cannot be read means the session belongs to no piece of work.
    }
    let items: string[] = [];
    try {
      const parsed = JSON.parse(row.items) as unknown;
      if (Array.isArray(parsed)) items = parsed.filter((i): i is string => typeof i === "string");
    } catch {
      // Same: no items named.
    }
    return {
      sessionId: row.runtime_session_id || `local-${row.id}`,
      softwareId: row.software_id,
      workItem: typeof payload.item === "number" ? payload.item : null,
      stage: row.stage,
      taskKind: row.kind,
      items,
      model: row.model,
      effort: row.effort,
      started: row.started,
      ended: row.ended,
      jobId: row.job_id,
    };
  });
}
