import type { PremiseConfig } from "../config/settings.js";
import type {
  AttentionShare,
  CheckerMissView,
  MeasureFigure,
  MeasuresOverview,
  MeasuresView,
  ReportLine,
  SessionsShare,
} from "../shared/api-types.js";
import { roleWords } from "../shared/roles.js";
import { intakeCounts } from "../intake/counts.js";
import { type Database, now } from "../storage/database.js";

/**
 * premise's own return (decision 0172, docs/specs/measures.md), worked out from events premise
 * already records, and from two it records for this purpose: when an open page is in front of
 * someone, and when each question was first shown on it. Nothing here calls an agent or reads
 * usage-ledger's figures, so nothing here is mocked. Each figure says what it counts and how many
 * events it rests on; a rate or a typical time says "not enough yet" when it rests on too few.
 */

const MINUTE = 60_000;

interface AskRow {
  id: number;
  software_id: string;
  role: string;
  status: string;
  asked: string;
  answered: string | null;
  shown: string | null;
  /** 1 when the line is waiting on the answer, 0 when everything else goes on without it. */
  blocking: number;
}

interface Span {
  start: number;
  end: number;
}

interface WorkItemRow {
  id: number;
  kind: string;
  title: string | null;
  ref: string | null;
  parent_id: number | null;
}

interface StageRunRow {
  software_id: string;
  work_item_id: number;
  entered: string;
}

/** The attention one question took, after sharing each minute among the questions open in it. */
interface AskAttention {
  ask: AskRow;
  ms: number;
}

function ms(time: string): number {
  return Date.parse(time);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A length of time in the words a person would use. */
export function duration(milliseconds: number): string {
  const minutes = milliseconds / MINUTE;
  if (minutes < 1) return "under a minute";
  if (minutes < 120) return plural(Math.round(minutes), "minute");
  const hours = minutes / 60;
  if (hours < 48) return plural(Math.round(hours), "hour");
  return plural(Math.round(hours / 24), "day");
}

function roundMinutes(milliseconds: number): number {
  return Math.round((milliseconds / MINUTE) * 10) / 10;
}

const NOT_ENOUGH = "not enough yet";

export interface MeasuresDeps {
  db: Database;
  config: Pick<PremiseConfig, "measures">;
  /** The time now; tests set it. */
  clock?: () => Date;
}

export class Measures {
  constructor(private readonly deps: MeasuresDeps) {}

  private get db(): Database {
    return this.deps.db;
  }

  private nowIso(): string {
    return this.deps.clock ? this.deps.clock().toISOString() : now();
  }

  private get minEvents(): number {
    return this.deps.config.measures.min_events;
  }

  // ---- What the page tells premise ----------------------------------------------------------

  /**
   * An open page says it is in front of someone (visible) or no longer is. A beat within twice the
   * beat interval of the last one carries the same stretch on; a later one starts a new stretch.
   * Nothing is written to the events table, so beats never wake other pages.
   */
  presence(visible: boolean): void {
    const at = this.nowIso();
    const gapMs = 2 * this.deps.config.measures.presence_seconds * 1000;
    const open = this.db
      .prepare(
        "SELECT id, last_seen FROM page_presence WHERE ended IS NULL ORDER BY id DESC LIMIT 1",
      )
      .get() as { id: number; last_seen: string } | undefined;
    const fresh = open && ms(at) - ms(open.last_seen) <= gapMs;
    if (open && !fresh) {
      this.db.prepare("UPDATE page_presence SET ended = last_seen WHERE id = ?").run(open.id);
    }
    if (visible) {
      if (fresh) {
        this.db.prepare("UPDATE page_presence SET last_seen = ? WHERE id = ?").run(at, open.id);
      } else {
        this.db.prepare("INSERT INTO page_presence (started, last_seen) VALUES (?, ?)").run(at, at);
      }
    } else if (fresh) {
      this.db
        .prepare("UPDATE page_presence SET last_seen = ?, ended = ? WHERE id = ?")
        .run(at, at, open.id);
    }
  }

  /** A question was shown on an open page. Only the first time counts. */
  shown(askId: number): boolean {
    const ask = this.db.prepare("SELECT 1 FROM asks WHERE id = ?").get(askId);
    if (!ask) return false;
    this.db
      .prepare("INSERT OR IGNORE INTO asks_shown (ask_id, shown) VALUES (?, ?)")
      .run(askId, this.nowIso());
    return true;
  }

  // ---- Reading what was recorded -------------------------------------------------------------

  private asks(): AskRow[] {
    return this.db
      .prepare(
        `SELECT a.id, a.software_id, a.role, a.status, a.asked, a.answered, a.blocking, s.shown
         FROM asks a LEFT JOIN asks_shown s ON s.ask_id = a.id ORDER BY a.id`,
      )
      .all() as unknown as AskRow[];
  }

  private presenceSpans(): Span[] {
    const rows = this.db
      .prepare("SELECT started, last_seen, ended FROM page_presence ORDER BY id")
      .all() as { started: string; last_seen: string; ended: string | null }[];
    // A stretch still open counts on to the next beat it is owed, and no further: a page that
    // stopped beating without saying so is counted only until its beat was due.
    const nowMs = ms(this.nowIso());
    const beat = this.deps.config.measures.presence_seconds * 1000;
    return rows
      .map((r) => ({
        start: ms(r.started),
        end: r.ended ? ms(r.ended) : Math.min(nowMs, ms(r.last_seen) + beat),
      }))
      .filter((s) => s.end > s.start);
  }

  /**
   * Each question's share of the person's attention: the time it stood open while a page was in
   * front of someone, with each such minute shared equally among the questions open in it, so the
   * shares add up to the minutes actually spent.
   */
  private attention(asks: AskRow[]): AskAttention[] {
    const nowMs = ms(this.nowIso());
    const spans = this.presenceSpans();
    const open = asks.map((ask) => ({
      ask,
      start: ms(ask.asked),
      end: ask.answered ? ms(ask.answered) : nowMs,
      ms: 0,
    }));
    const points = new Set<number>();
    for (const o of open) {
      points.add(o.start);
      points.add(o.end);
    }
    for (const s of spans) {
      points.add(s.start);
      points.add(s.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (b <= a) continue;
      const mid = (a + b) / 2;
      if (!spans.some((s) => s.start <= mid && s.end >= mid)) continue;
      const during = open.filter((o) => o.start <= a && o.end >= b);
      for (const o of during) o.ms += (b - a) / during.length;
    }
    return open.map((o) => ({ ask: o.ask, ms: o.ms }));
  }

  private names(): Map<string, string> {
    const rows = this.db
      .prepare("SELECT id, name FROM softwares ORDER BY created, rowid")
      .all() as {
      id: string;
      name: string;
    }[];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Which change (piece of work) a software was on at a time, by its stage runs. */
  private changeAt(): (softwareId: string, time: string) => string {
    const items = new Map(
      (
        this.db
          .prepare("SELECT id, kind, title, ref, parent_id FROM work_items")
          .all() as unknown as WorkItemRow[]
      ).map((w) => [w.id, w]),
    );
    const runs = this.db
      .prepare("SELECT software_id, work_item_id, entered FROM stage_runs ORDER BY entered, id")
      .all() as unknown as StageRunRow[];
    const label = (id: number): string => {
      const w = items.get(id);
      if (!w) return "Work since removed";
      if (w.kind === "software") return "The first version";
      if (w.kind === "milestone")
        return `Milestone ${w.ref ?? ""}${w.title ? `: ${w.title}` : ""}`.trim();
      if (w.kind === "intake")
        return `Change ${w.ref ?? ""}${w.title ? `: ${w.title}` : ""}`.trim();
      return `Part: ${w.title ?? `piece ${w.id}`}`;
    };
    return (softwareId, time) => {
      let found: StageRunRow | undefined;
      for (const run of runs) {
        if (run.software_id !== softwareId) continue;
        if (run.entered > time) break;
        found = run;
      }
      return found ? label(found.work_item_id) : "Before work started";
    };
  }

  private firstRunning(): Map<string, string> {
    const rows = this.db
      .prepare(
        "SELECT software_id, MIN(time) AS time FROM events WHERE module = 'runner' AND kind = 'started' AND software_id IS NOT NULL GROUP BY software_id",
      )
      .all() as { software_id: string; time: string }[];
    return new Map(rows.map((r) => [r.software_id, r.time]));
  }

  private latestVerdicts(): { software: string; item: string; verdict: string; time: string }[] {
    const rows = this.db
      .prepare(
        "SELECT software_id, reference, detail, time FROM events WHERE module = 'checker' AND kind = 'verdict' AND reference IS NOT NULL ORDER BY id",
      )
      .all() as { software_id: string; reference: string; detail: string | null; time: string }[];
    return rows.flatMap((r) => {
      try {
        const verdict = (JSON.parse(r.detail ?? "{}") as { verdict?: string }).verdict;
        return verdict
          ? [{ software: r.software_id, item: r.reference, verdict, time: r.time }]
          : [];
      } catch {
        return [];
      }
    });
  }

  /**
   * Things premise reported as working that came back as bugs: an intake item triaged as a bug
   * that touches a record item whose latest check, before the bug was triaged, said "met".
   */
  checkerMisses(): { misses: CheckerMissView[]; reportedWorking: Map<string, Set<string>> } {
    const verdicts = this.latestVerdicts();
    const reportedWorking = new Map<string, Set<string>>();
    for (const v of verdicts) {
      if (v.verdict !== "met") continue;
      const set = reportedWorking.get(v.software) ?? new Set<string>();
      set.add(v.item);
      reportedWorking.set(v.software, set);
    }
    const bugs = this.db
      .prepare(
        "SELECT software_id, number, text, touches, triaged FROM intake_items WHERE kind = 'bug' AND triaged IS NOT NULL ORDER BY id",
      )
      .all() as {
      software_id: string;
      number: number;
      text: string;
      touches: string;
      triaged: string;
    }[];
    const misses: CheckerMissView[] = [];
    for (const bug of bugs) {
      let touches: { id: string }[] = [];
      try {
        touches = JSON.parse(bug.touches) as { id: string }[];
      } catch {
        touches = [];
      }
      for (const touch of touches) {
        let latest: string | undefined;
        for (const v of verdicts) {
          if (v.software === bug.software_id && v.item === touch.id && v.time <= bug.triaged) {
            latest = v.verdict;
          }
        }
        if (latest === "met") {
          misses.push({
            softwareId: bug.software_id,
            intake: `I-${bug.number}`,
            item: touch.id,
            text: bug.text.length > 160 ? `${bug.text.slice(0, 157)}…` : bug.text,
          });
          break;
        }
      }
    }
    return { misses, reportedWorking };
  }

  // ---- The figures ---------------------------------------------------------------------------

  /** Whether a software with this id exists. */
  known(softwareId: string): boolean {
    return this.db.prepare("SELECT 1 FROM softwares WHERE id = ?").get(softwareId) !== undefined;
  }

  /** The measures for one software, or for every software together (null). */
  view(softwareId: string | null): MeasuresView {
    return this.build(softwareId, this.names());
  }

  overview(): MeasuresOverview {
    const names = this.names();
    return {
      overall: this.build(null, names),
      softwares: [...names.keys()].map((id) => this.build(id, names)),
      minEvents: this.minEvents,
    };
  }

  private build(softwareId: string | null, names: Map<string, string>): MeasuresView {
    const mine = (id: string) => softwareId === null || id === softwareId;
    const min = this.minEvents;
    const changeAt = this.changeAt();
    const figures: MeasureFigure[] = [];

    // Attention.
    // Only questions the line was waiting on count as a person's attention; the others are shown
    // apart, and neither set shares its minutes with the other (decision 0270).
    const everyAsk = this.asks();
    const blockingAttention = this.attention(everyAsk.filter((a) => a.blocking === 1)).filter((a) =>
      mine(a.ask.software_id),
    );
    const otherAttention = this.attention(everyAsk.filter((a) => a.blocking !== 1)).filter((a) =>
      mine(a.ask.software_id),
    );
    const attention = [...blockingAttention, ...otherAttention];
    const spent = blockingAttention.filter((a) => a.ms > 0);
    const otherSpent = otherAttention.filter((a) => a.ms > 0 && a.ask.status !== "withdrawn");
    const totalMs = spent.reduce((n, a) => n + a.ms, 0);
    figures.push({
      key: "attention",
      label: "People's attention",
      value: spent.length === 0 ? "none counted yet" : duration(totalMs),
      enough: true,
      events: spent.length,
      counts:
        spent.length === 0
          ? "No question has stood open while premise's page was in front of someone yet."
          : `About ${duration(totalMs)} spent on ${plural(spent.length, "question")} while premise's page was open in front of someone.`,
      how: "Counted from the time each question stood open while the page was in front of someone (the page tells premise every half minute or so while it is visible), for questions the work was actually waiting on. A minute with several such questions open is shared among them, so nothing is counted twice. Questions nothing waited on are shown apart, below. Time spent away from the page, or thinking elsewhere, is not counted.",
    });
    const otherMs = otherSpent.reduce((n, a) => n + a.ms, 0);
    figures.push({
      key: "attention-other",
      label: "Other open questions (nothing waited on them)",
      value: otherSpent.length === 0 ? "none counted" : duration(otherMs),
      enough: true,
      events: otherSpent.length,
      counts:
        otherSpent.length === 0
          ? "No question that nothing waited on stood open while premise's page was in front of someone."
          : `About ${duration(otherMs)} while ${plural(otherSpent.length, "question")} that nothing waited on stood open and premise's page was in front of someone. This is not counted as attention: the work went on without an answer.`,
      how: "Questions such as asking before copying the software to GitHub: the work goes on whatever the answer, so the time they stood open is not a person's attention. Shown so it is not hidden.",
    });
    // Questions asked, by the role each was for (milestone 3): every ask, shown or not.
    const asked = this.asks().filter((a) => mine(a.software_id) && a.status !== "withdrawn");
    const perRole = new Map<string, number>();
    for (const a of asked) perRole.set(a.role, (perRole.get(a.role) ?? 0) + 1);
    const roleList = [...perRole.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .map(([role, n]) => `the ${roleWords(role)} ${n}`)
      .join(", ");
    figures.push({
      key: "asks-by-role",
      label: "Questions asked, by role",
      value: asked.length === 0 ? "none yet" : roleList,
      enough: true,
      events: asked.length,
      counts:
        asked.length === 0
          ? "premise has asked nothing yet."
          : `${plural(asked.length, "question")} asked: ${roleList}.`,
      how: "Every question premise asked in the session, counted under the role it was for; withdrawn questions are not counted. In one session one person answers for every role.",
    });
    const byRole = new Map<string, AttentionShare>();
    const byChange = new Map<string, AttentionShare>();
    for (const a of spent) {
      const roleName = roleWords(a.ask.role);
      const role = byRole.get(roleName) ?? { name: roleName, minutes: 0, asks: 0 };
      role.minutes += a.ms;
      role.asks += 1;
      byRole.set(roleName, role);
      const name = changeAt(a.ask.software_id, a.ask.asked);
      const key = softwareId === null ? `${names.get(a.ask.software_id) ?? "?"}: ${name}` : name;
      const change = byChange.get(key) ?? { name: key, minutes: 0, asks: 0 };
      change.minutes += a.ms;
      change.asks += 1;
      byChange.set(key, change);
    }
    const shares = (m: Map<string, AttentionShare>) =>
      [...m.values()]
        .map((s) => ({ ...s, minutes: roundMinutes(s.minutes) }))
        .sort((x, y) => y.minutes - x.minutes);

    // Time from a question shown to its answer.
    const answered = attention
      .map((a) => a.ask)
      .filter((a) => a.status === "answered" && a.answered);
    const waits = answered
      .map((a) => ms(a.answered!) - ms(a.shown ?? a.asked))
      .filter((w) => w >= 0);
    figures.push({
      key: "answer-time",
      label: "Time to answer a question",
      value: waits.length >= min ? `typically ${duration(median(waits))}` : NOT_ENOUGH,
      enough: waits.length >= min,
      events: waits.length,
      counts:
        waits.length >= min
          ? `Typically ${duration(median(waits))} from a question first being shown to its answer, over ${plural(waits.length, "answered question")}.`
          : `${plural(waits.length, "answered question")} so far; a typical time needs at least ${min}.`,
      how: "The middle value of the times from a question first being shown on the page to its answer. A question answered without being shown on the page counts from when it was asked.",
    });

    // From the idea to the first running version.
    const created = new Map(
      (
        this.db.prepare("SELECT id, created FROM softwares").all() as {
          id: string;
          created: string;
        }[]
      ).map((r) => [r.id, r.created]),
    );
    const brought = new Set(
      (
        this.db.prepare("SELECT software_id FROM existing_softwares").all() as {
          software_id: string;
        }[]
      ).map((r) => r.software_id),
    );
    const firstRunning = this.firstRunning();
    const firsts = [...firstRunning.entries()]
      .filter(([id]) => mine(id) && created.has(id))
      .map(([id, at]) => ms(at) - ms(created.get(id)!));
    if (softwareId !== null) {
      const at = firstRunning.get(softwareId);
      const from = brought.has(softwareId) ? "being brought in" : "the idea";
      figures.push({
        key: "idea-to-running",
        label: brought.has(softwareId)
          ? "From bringing it in to running"
          : "From the idea to running",
        value: at ? duration(firsts[0] ?? 0) : "not running yet",
        enough: Boolean(at),
        events: at ? 1 : 0,
        counts: at
          ? `${duration(firsts[0] ?? 0)} from ${from} to the first version running.`
          : `No version has run yet, so the time from ${from} to running is not known.`,
        how: "From when the software was started in premise to the first time premise started a built version of it. One software has one such time, so it is shown as it is.",
      });
    } else {
      const enough = firsts.length >= min;
      figures.push({
        key: "idea-to-running",
        label: "From the idea to running",
        value: enough ? `typically ${duration(median(firsts))}` : NOT_ENOUGH,
        enough,
        events: firsts.length,
        counts: enough
          ? `Typically ${duration(median(firsts))} from a software being started to its first version running, over ${plural(firsts.length, "software")}.`
          : `${plural(firsts.length, "software")} ${firsts.length === 1 ? "has" : "have"} reached running; a typical time needs at least ${min}.`,
        how: "The middle value, over softwares, of the time from starting a software in premise to the first time premise started a built version of it.",
      });
    }

    // From an intake item to its fix running.
    const fixes = (
      this.db
        .prepare(
          "SELECT software_id, received, fix_running FROM intake_items WHERE fix_running IS NOT NULL",
        )
        .all() as { software_id: string; received: string; fix_running: string }[]
    )
      .filter((r) => mine(r.software_id))
      .map((r) => ms(r.fix_running) - ms(r.received));
    figures.push({
      key: "intake-to-fix",
      label: "From a problem reported to its fix running",
      value: fixes.length >= min ? `typically ${duration(median(fixes))}` : NOT_ENOUGH,
      enough: fixes.length >= min,
      events: fixes.length,
      counts:
        fixes.length >= min
          ? `Typically ${duration(median(fixes))} from an intake item coming in to the change it led to running, over ${plural(fixes.length, "item")}.`
          : `${plural(fixes.length, "intake item")} ${fixes.length === 1 ? "has" : "have"} led to a running change; a typical time needs at least ${min}.`,
      how: "The middle value of the times from an intake item arriving to the change it led to running.",
    });

    // Reported as working, came back as a bug.
    const { misses, reportedWorking } = this.checkerMisses();
    const mineMisses = misses.filter((m) => mine(m.softwareId));
    const missedItems = new Set(mineMisses.map((m) => `${m.softwareId}/${m.item}`)).size;
    const reported = [...reportedWorking.entries()]
      .filter(([id]) => mine(id))
      .reduce((n, [, items]) => n + items.size, 0);
    const missEnough = reported >= min;
    figures.push({
      key: "checker-misses",
      label: "Reported working, came back as a bug",
      value: missEnough
        ? `${missedItems} of ${reported} (${Math.round((missedItems / reported) * 100)}%)`
        : NOT_ENOUGH,
      enough: missEnough,
      events: reported,
      counts: missEnough
        ? `${missedItems} of the ${plural(reported, "thing")} premise's check said were met later came back as a bug.`
        : reported === 0
          ? `No check has said anything works yet; a rate needs at least ${min} things checked as met.`
          : `${missedItems} of ${plural(reported, "thing")} premise's check said ${reported === 1 ? "was" : "were"} met came back as a bug; a rate needs at least ${min}.`,
      how: 'Of the record items whose check said "met", how many an intake item triaged as a bug later touched while that was still the latest check. Each bug is listed as a miss; an item touched by several bugs counts once in the rate.',
    });

    // Agent sessions per change.
    const sessions = (
      this.db
        .prepare(
          "SELECT j.software_id, s.started FROM agent_sessions s JOIN jobs j ON j.id = s.job_id ORDER BY s.id",
        )
        .all() as { software_id: string; started: string }[]
    ).filter((s) => mine(s.software_id));
    const perChange = new Map<string, number>();
    for (const s of sessions) {
      const name = changeAt(s.software_id, s.started);
      const key = softwareId === null ? `${names.get(s.software_id) ?? "?"}: ${name}` : name;
      perChange.set(key, (perChange.get(key) ?? 0) + 1);
    }
    const changes = perChange.size;
    const sessionEnough = changes >= min;
    figures.push({
      key: "sessions",
      label: "Agent sessions per change",
      value: sessionEnough
        ? `${Math.round((sessions.length / changes) * 10) / 10} on average`
        : NOT_ENOUGH,
      enough: sessionEnough,
      events: sessions.length,
      counts:
        changes === 0
          ? "No agent session has run yet."
          : `${plural(sessions.length, "agent session")} over ${plural(changes, "change")}${sessionEnough ? "" : `; an average needs at least ${min} changes`}.`,
      how: "Each agent session premise started, counted against the piece of work the software was on when it started.",
    });

    return {
      softwareId,
      name: softwareId === null ? "Every software" : (names.get(softwareId) ?? softwareId),
      figures,
      attentionByRole: shares(byRole),
      attentionByChange: shares(byChange),
      sessionsByChange: [...perChange.entries()]
        .map(([name, n]): SessionsShare => ({ name, sessions: n }))
        .sort((a, b) => b.sessions - a.sessions),
      misses: mineMisses,
      intakeRoutes: intakeCounts(this.db, softwareId),
    };
  }

  /** The "How premise is doing" block for a report: one line per figure, each with its basis. */
  reportBlock(softwareId: string): { plain: string; lines: ReportLine[] } {
    const view = this.view(softwareId);
    return {
      plain:
        "premise's own return on this software, worked out from what it recorded. These are real figures, not mocked.",
      lines: view.figures.map((f) => ({
        text: `${f.label}: ${f.value}. ${f.counts}`,
        evidence: `${plural(f.events, "event")}. ${f.how}`,
      })),
    };
  }
}
