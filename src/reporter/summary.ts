import type {
  RunView,
  SoftwareSummary,
  SummaryChange,
  SummarySoftware,
  SummaryView,
} from "../shared/api-types.js";
import { stageName, whereNow } from "../shared/stages.js";
import { type Database, now } from "../storage/database.js";

/**
 * The short summary across every software (docs/specs/reporter.md 5.6; decision 0197): what is
 * running, what changed since you last looked, and what needs you. Built only from recorded facts:
 * each software's state as the line keeps it, its open asks, its running copy, and the events.
 * No agent writes it.
 */

export interface SummarySources {
  db: Database;
  /** The software list as the page shows it (archived ones left out), in its order. */
  softwares: () => Promise<SoftwareSummary[]>;
  /** A software's running copy, when the runner is wired in. */
  run?: (softwareId: string) => Promise<RunView>;
  /** Agent sessions running now, and the limit. */
  sessions: () => { running: number; max: number };
  /** How many softwares are archived. */
  archived: () => number;
  /** At most this many change lines per software. */
  maxLines: number;
}

const SEEN_KEY = "summary.seen";

function plural(n: number, one: string): string {
  return `${n} ${n === 1 ? one : `${one}s`}`;
}

interface Seen {
  upTo: number;
  time: string;
}

interface EventRow {
  id: number;
  time: string;
  software_id: string;
  module: string;
  kind: string;
  reference: string | null;
  detail: string | null;
}

/** One event as a plain line, or null when it is not worth saying in a summary. */
function eventLine(event: EventRow): string | null {
  const detail = event.detail ? (JSON.parse(event.detail) as Record<string, unknown>) : {};
  const key = `${event.module}/${event.kind}`;
  switch (key) {
    case "softwares/software-added":
      return "Started.";
    case "softwares/stage-entered":
      return typeof detail.stage === "string"
        ? `Moved on to ${stageName(detail.stage)} (${whereNow(detail.stage).split(":")[0]}).`
        : null;
    case "softwares/priority-changed":
      return `Priority set to ${String(detail.priority)}.`;
    case "softwares/software-paused":
      return "Paused.";
    case "softwares/software-resumed":
      return "Resumed.";
    case "softwares/software-restored":
      return "Restored from the archive.";
    case "softwares/state-ended":
      return "Ended.";
    case "softwares/state-waiting-milestone":
      return "Stopped after a milestone for you to try it.";
    case "line/milestone-reached":
      return `Reached milestone ${event.reference ?? ""}.`.replace(" .", ".");
    case "asks/ask-opened":
      return "Asked you something.";
    case "build/landed":
      return "A change passed its check and landed.";
    case "reporter/report-written":
      return "A new report was written.";
    case "runner/started":
      return "Started running.";
    case "runner/crashed":
      return "Its running copy crashed.";
    case "runner/gave-up":
      return "Kept crashing, so premise stopped starting it.";
    case "runner/no-room":
      return detail.reason === "memory"
        ? "Could not start: too little free memory on this machine."
        : "Could not start: as many softwares as allowed are already running.";
    case "queue/job-stuck":
      return "Some work got stuck and needs a look.";
    case "queue/fair-turn":
      return "Got an agent after waiting its turn behind more important softwares.";
    default:
      return null;
  }
}

/** The same line said several times becomes one line with a count. */
function collapse(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return [...counts.entries()].map(([line, n]) => {
    if (n === 1) return line;
    if (line === "Asked you something.") return `Asked you ${plural(n, "thing")}.`;
    return `${line.replace(/\.$/, "")} (${n} times).`;
  });
}

export class Summary {
  constructor(private readonly sources: SummarySources) {}

  private get db(): Database {
    return this.sources.db;
  }

  private seen(): Seen | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(SEEN_KEY) as
      { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Seen) : null;
  }

  /** You looked at the summary up to this event: the next one says what changed after it. */
  markSeen(upTo: number): void {
    const latest = this.latestEvent();
    const value: Seen = { upTo: Math.max(0, Math.min(upTo, latest)), time: now() };
    const before = this.seen();
    if (before && before.upTo >= value.upTo) return;
    this.db
      .prepare(
        `INSERT INTO settings (key, value, changed) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, changed = excluded.changed`,
      )
      .run(SEEN_KEY, JSON.stringify(value), now());
  }

  private latestEvent(): number {
    return (
      (this.db.prepare("SELECT MAX(id) AS id FROM events").get() as { id: number | null }).id ?? 0
    );
  }

  async view(): Promise<SummaryView> {
    const upTo = this.latestEvent();
    const seen = this.seen();
    const list = await this.sources.softwares();
    const softwares: SummarySoftware[] = await Promise.all(
      list.map(async (s) => {
        const run = this.sources.run ? await this.sources.run(s.id).catch(() => null) : null;
        const needsYou =
          s.openAsks > 0
            ? `${plural(s.openAsks, "thing")} to answer.`
            : s.state === "waiting-milestone"
              ? "Stopped after a milestone: try it, then say go on."
              : null;
        return {
          id: s.id,
          name: s.name,
          phase: s.state === "ended" ? "Ended" : whereNow(s.stage, s.takingOn),
          doing: s.status,
          needsYou,
          priority: s.priority,
          paused: s.paused === true,
          runningAt: run && run.state === "running" ? run.link : null,
        };
      }),
    );
    const names = new Map(list.map((s) => [s.id, s.name]));
    const events = this.db
      .prepare(
        "SELECT id, time, software_id, module, kind, reference, detail FROM events WHERE id > ? AND id <= ? AND software_id IS NOT NULL ORDER BY id",
      )
      .all(seen?.upTo ?? 0, upTo) as unknown as EventRow[];
    const bySoftware = new Map<string, string[]>();
    for (const event of events) {
      if (!names.has(event.software_id)) continue;
      const line = eventLine(event);
      if (!line) continue;
      const lines = bySoftware.get(event.software_id) ?? [];
      lines.push(line);
      bySoftware.set(event.software_id, lines);
    }
    const changes: SummaryChange[] = list
      .filter((s) => bySoftware.has(s.id))
      .map((s) => {
        const lines = collapse(bySoftware.get(s.id)!);
        const max = this.sources.maxLines;
        return {
          softwareId: s.id,
          name: s.name,
          lines:
            lines.length > max
              ? [
                  ...lines.slice(-(max - 1)),
                  `And ${plural(lines.length - max + 1, "earlier change")}.`,
                ]
              : lines,
        };
      });
    const needsYou = softwares.filter((s) => s.needsYou !== null);
    const running = softwares.filter(
      (s) => s.runningAt !== null || /^Agents are working/.test(s.doing),
    );
    const sessions = this.sources.sessions();
    const parts = [
      plural(softwares.length, "software"),
      needsYou.length > 0 ? `${needsYou.length} waiting on you` : "none waiting on you",
      `${running.length} working or running`,
    ];
    const paused = softwares.filter((s) => s.paused).length;
    if (paused > 0) parts.push(`${paused} paused`);
    return {
      headline: `${parts.join(", ")}.`,
      softwares,
      needsYou,
      running,
      changes,
      since: seen?.time ?? null,
      upTo,
      sessions,
      archived: this.sources.archived(),
    };
  }
}
