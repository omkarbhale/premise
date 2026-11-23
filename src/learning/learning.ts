import type { AgentRole } from "../agents/roles.js";
import type { ToolBinding, ToolEnvelope } from "../agents/tool-server.js";
import { toolFail, toolOk } from "../agents/tool-server.js";
import type { PremiseConfig } from "../config/settings.js";
import type { Briefs, LessonSource } from "../line/briefs.js";
import type { Job, WorkQueue } from "../queue/work-queue.js";
import { ServiceError } from "../server/services.js";
import type {
  CorrectionKind,
  CorrectionView,
  EndedLessonView,
  ImprovementView,
  LearningDestination,
  LearningView,
  LessonView,
} from "../shared/api-types.js";
import { stageName } from "../shared/stages.js";
import { isUnsure, keepsHedge } from "../shared/hedges.js";
import { type Ask, getAsk } from "../storage/asks.js";
import { addChatMessage } from "../storage/chat.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import {
  type CorrectionFacts,
  RULE_ONLY,
  TASTE_CORRECTION,
  type Reading,
  cut,
  ruleReading,
  topicOf,
} from "./rules.js";

/**
 * Learning from corrections (decisions 0173 and 0195, docs/specs/learning.md).
 *
 * Two kinds of learning are kept apart in code, storage and on the page:
 * - premise adapting: lessons for one software, and the operator's taste across softwares. These
 *   take effect at once, through the briefs of the drafter, planner, builder and checker;
 * - improvements for premise itself: what a correction says about premise's own procedure,
 *   prompts or defaults. These never change how premise works; they are kept to be read and
 *   exported.
 *
 * Corrections are found in the events table, which every module already writes, so no module has
 * to remember to tell this one. Each is read once (by the triager where judgement is needed, by
 * fixed rules otherwise) into exactly one destination, with its reason; the person can move it.
 */

export type ListDestination = "software" | "taste" | "premise";
const DESTINATIONS: readonly LearningDestination[] = ["software", "taste", "premise", "none"];
/** The roles whose briefs carry the lessons (docs/specs/learning.md 4). */
export const LESSON_ROLES: readonly AgentRole[] = ["drafter", "planner", "builder", "checker"];
const FINISHED = new Set(["done", "stuck", "failed", "stopped"]);

interface CorrectionRow {
  id: number;
  software_id: string;
  kind: CorrectionKind;
  source: string;
  what: string;
  said: string | null;
  touches: string;
  status: "reading" | "read";
  mistake: string | null;
  destination: LearningDestination | null;
  reason: string | null;
  line: string | null;
  topic: string | null;
  decided_by: "agent" | "rule" | "operator" | null;
  job_id: number | null;
  created: string;
  read: string | null;
}

interface RefusedAnswerRow {
  id: number;
  software_id: string;
  job_id: number;
  tool: string;
  role: string;
  text: string;
  topic: string;
  created: string;
}

interface LessonRow {
  id: number;
  correction_id: number;
  software_id: string;
  destination: ListDestination;
  topic: string | null;
  text: string;
  state: "live" | "deleted" | "dropped";
  uses: number;
  last_used: string | null;
  created: string;
  edited: string | null;
  ended: string | null;
  end_note: string | null;
}

interface EventRow {
  id: number;
  software_id: string | null;
  module: string;
  kind: string;
  reference: string | null;
  detail: string | null;
}

/** A correction found in the events, before it is stored. */
interface Found {
  softwareId: string;
  kind: CorrectionKind;
  source: string;
  what: string;
  said: string | null;
  touches: string[];
  subject: string | null;
  replacement: string | null;
  stage: string | null;
}

export interface LearningDeps {
  db: Database;
  config: PremiseConfig;
  queue: WorkQueue;
  briefs: Briefs;
  /** False while no agent can start; corrections are then read by premise's rules. */
  agentsReady?: () => boolean;
  /** Things premise reported as working that came back as bugs (from the measures). */
  checkerMisses?: () => { softwareId: string; intake: string; item: string; text: string }[];
}

export const label = (id: number): string => `L-${id}`;

export class Learning implements LessonSource {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: LearningDeps) {
    deps.briefs.useLessons(this);
  }

  private get db(): Database {
    return this.deps.db;
  }

  private get config(): PremiseConfig {
    return this.deps.config;
  }

  // ---- Running --------------------------------------------------------------------------------

  /** Look for new corrections now and then; read any left half-read when premise last stopped. */
  start(intervalMs = 1000): void {
    this.recover();
    this.catchUp();
    if (!this.timer) {
      this.timer = setInterval(() => {
        try {
          this.catchUp();
        } catch (error) {
          recordEvent(this.db, {
            module: "learning",
            kind: "failed",
            detail: { message: (error as Error).message },
          });
        }
      }, intervalMs);
      this.timer.unref();
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Corrections whose reading was cut off (its job ended, or premise stopped): rules decide. */
  recover(): void {
    const reading = this.db
      .prepare("SELECT * FROM corrections WHERE status = 'reading'")
      .all() as unknown as CorrectionRow[];
    for (const row of reading) {
      const job = row.job_id ? this.deps.queue.get(row.job_id) : undefined;
      if (!job || FINISHED.has(job.status)) this.decideByRule(row, "no-reading");
    }
  }

  /** Read every event since the last one looked at, and take in the corrections among them. */
  catchUp(): number {
    let taken = 0;
    for (;;) {
      const cursor = (
        this.db.prepare("SELECT last_event FROM learning_cursor WHERE id = 1").get() as
          { last_event: number } | undefined
      )?.last_event;
      if (cursor === undefined) return taken;
      const rows = this.db
        .prepare(
          `SELECT id, software_id, module, kind, reference, detail FROM events
           WHERE id > ? AND module IN ('asks', 'softwares', 'intake', 'line') ORDER BY id LIMIT 200`,
        )
        .all(cursor) as unknown as EventRow[];
      const last = (
        this.db.prepare("SELECT MAX(id) AS id FROM events").get() as { id: number | null }
      ).id;
      if (rows.length === 0) {
        if (last !== null && last > cursor) {
          this.db.prepare("UPDATE learning_cursor SET last_event = ? WHERE id = 1").run(last);
        }
        return taken;
      }
      for (const row of rows) {
        for (const found of this.correctionsIn(row)) {
          if (this.takeIn(found)) taken += 1;
        }
        this.db.prepare("UPDATE learning_cursor SET last_event = ? WHERE id = 1").run(row.id);
      }
    }
  }

  // ---- Finding corrections --------------------------------------------------------------------

  private correctionsIn(row: EventRow): Found[] {
    if (!row.software_id) return [];
    if (row.module === "line" && row.kind === "overruled") {
      // The person chose against premise's recommendation and said why (decision 0300): premise's
      // recommendation was wrong for them, which is a correction like a rejected draft.
      const detail = parse<{ recommended?: string; chosen?: string; why?: string; item?: string }>(
        row.detail,
      );
      return [
        {
          softwareId: row.software_id,
          kind: "reject-draft",
          source: `event:${row.id}`,
          what: `You chose “${detail.chosen ?? "another answer"}” over premise's recommendation “${detail.recommended ?? ""}”`,
          said: detail.why?.trim() || null,
          touches: detail.item ? [detail.item] : [],
          subject: detail.recommended ?? null,
          replacement: detail.chosen ?? null,
          stage: "exists",
        },
      ];
    }
    if (row.module === "line") return [];
    if (row.module === "asks" && row.kind === "ask-answered" && row.reference) {
      const ask = getAsk(this.db, Number(row.reference));
      return ask ? this.fromAsk(ask) : [];
    }
    if (row.module === "softwares" && row.kind === "stage-entered") {
      const detail = parse<{ stage?: string; why?: string }>(row.detail);
      const why = detail.why ?? "";
      if (why === "sent back" || why === "operator went back to Why") {
        const stage = detail.stage ?? "why";
        return [
          {
            softwareId: row.software_id,
            kind: "send-back",
            source: `event:${row.id}`,
            what: `You sent the work back to ${stageName(stage)}`,
            said: null,
            touches: [],
            subject: null,
            replacement: null,
            stage,
          },
        ];
      }
      if (why === "split undone") {
        const piece = this.db
          .prepare(
            `SELECT w.title FROM stage_runs r JOIN work_items w ON w.id = r.work_item_id
             WHERE r.software_id = ? ORDER BY r.id DESC LIMIT 1`,
          )
          .get(row.software_id) as { title: string | null } | undefined;
        return [
          {
            softwareId: row.software_id,
            kind: "undo-split",
            source: `event:${row.id}`,
            what: `You undid the split of ${piece?.title ? `“${piece.title}”` : "a piece of work"}`,
            said: null,
            touches: [],
            subject: piece?.title ?? null,
            replacement: null,
            stage: null,
          },
        ];
      }
      return [];
    }
    if (row.module === "intake" && row.kind === "triaged" && row.reference) {
      if (parse<{ kind?: string }>(row.detail).kind !== "bug") return [];
      const miss = (this.deps.checkerMisses?.() ?? []).find(
        (m) => m.softwareId === row.software_id && m.intake === row.reference,
      );
      if (!miss) return [];
      return [
        {
          softwareId: row.software_id,
          kind: "bug-after-met",
          source: `intake:${row.software_id}:${row.reference}`,
          what: `${miss.intake} reported a bug in ${miss.item}, which premise's check had said was met`,
          said: miss.text,
          touches: [miss.item, miss.intake],
          subject: miss.item,
          replacement: null,
          stage: "check",
        },
      ];
    }
    return [];
  }

  private fromAsk(ask: Ask): Found[] {
    const answer = ask.answer;
    if (!answer) return [];
    const at = ask.stage ? ` at ${stageName(ask.stage)}` : "";
    const base = { softwareId: ask.softwareId, stage: ask.stage };
    if (answer.kind === "items") {
      const found: Found[] = [];
      for (const said of answer.items) {
        const item = ask.items.find((i) => i.key === said.key);
        // What a person wrote themselves is not premise's to be corrected on.
        if (!item || item.mark === "from-role") continue;
        const words = item.text.replace(/^(must|should|could):\s*/i, "");
        if (said.decision === "strike") {
          found.push({
            ...base,
            kind: "strike",
            source: `ask:${ask.id}:${said.key}`,
            what: `You struck “${words}”${at}`,
            said: said.reason?.trim() || null,
            touches: item.refs ?? [],
            subject: words,
            replacement: null,
          });
        } else if (said.decision === "edit" && said.text.trim() && said.text.trim() !== item.text) {
          found.push({
            ...base,
            kind: "edit",
            source: `ask:${ask.id}:${said.key}`,
            what: `You changed “${words}” to “${said.text.trim()}”${at}`,
            said: null,
            touches: item.refs ?? [],
            subject: words,
            replacement: said.text.trim(),
          });
        }
      }
      return found;
    }
    if (
      answer.kind === "proposal" &&
      answer.decision === "change" &&
      ask.extra.meta?.purpose === "taste-proposal"
    ) {
      // A claimer correcting a proposal for their area: what they want is taste (decision 0196).
      const area = String(ask.extra.meta.area ?? ask.title);
      return [
        {
          ...base,
          kind: "reject-draft",
          source: `ask:${ask.id}`,
          what: `${TASTE_CORRECTION} “${area}”`,
          said: answer.text?.trim() || null,
          touches: [],
          subject: area,
          replacement: answer.text?.trim() || null,
        },
      ];
    }
    if (answer.kind === "proposal" && answer.decision === "change") {
      return [
        {
          ...base,
          kind: "reject-draft",
          source: `ask:${ask.id}`,
          what: `You asked for changes to “${ask.title}”`,
          said: answer.text?.trim() || null,
          touches: [],
          subject: ask.title,
          replacement: null,
        },
      ];
    }
    if (answer.kind === "approval" && answer.decision === "refuse") {
      const action = ask.extra.approval?.action ?? ask.title;
      return [
        {
          ...base,
          kind: "decline-gate",
          source: `ask:${ask.id}`,
          what: `You declined: ${action}`,
          said: answer.reason?.trim() || null,
          touches: [],
          subject: action,
          replacement: null,
        },
      ];
    }
    return [];
  }

  /** Store a correction and start reading it. False when it was taken in before. */
  private takeIn(found: Found): boolean {
    const exists = this.db.prepare("SELECT 1 FROM corrections WHERE source = ?").get(found.source);
    if (exists) return false;
    const id = Number(
      this.db
        .prepare(
          `INSERT INTO corrections (software_id, kind, source, what, said, touches, status, created)
           VALUES (?, ?, ?, ?, ?, ?, 'reading', ?)`,
        )
        .run(
          found.softwareId,
          found.kind,
          found.source,
          found.what,
          found.said,
          JSON.stringify(found.touches),
          now(),
        ).lastInsertRowid,
    );
    recordEvent(this.db, {
      softwareId: found.softwareId,
      module: "learning",
      kind: "correction-noted",
      reference: String(id),
      detail: { kind: found.kind },
    });
    const row = this.correction(id)!;
    const byAgent =
      this.config.learning.read_with_agent &&
      !RULE_ONLY.includes(found.kind) &&
      (this.deps.agentsReady?.() ?? true);
    if (!byAgent) {
      this.decideByRule(row, "rule", found);
      return true;
    }
    const jobId = this.deps.queue.enqueue({
      softwareId: found.softwareId,
      kind: "triage",
      items: found.touches,
      payload: {
        purpose: "learn",
        correction: id,
        brief: this.brief(row, found),
        context: {
          stage: "learn",
          purpose: "learn",
          correction: id,
          kind: found.kind,
          what: found.what,
          said: found.said,
          subject: found.subject,
          replacement: found.replacement,
        },
      },
    });
    this.db.prepare("UPDATE corrections SET job_id = ? WHERE id = ?").run(jobId, id);
    this.deps.queue.tick();
    return true;
  }

  private brief(row: CorrectionRow, found: Found): string {
    const name = this.softwareName(row.software_id);
    const lines = (list: LessonRow[]) => list.map((l) => `- ${label(l.id)}: ${l.text}`).join("\n");
    return this.deps.briefs.make("learning brief", {
      software_name: name,
      correction_kind: found.kind,
      what: found.what,
      said: found.said ?? "",
      stage: found.stage ? stageName(found.stage) : "",
      software_lessons: lines(this.live("software", row.software_id)),
      taste_lessons: lines(this.live("taste")),
      improvements: [
        ...new Set([
          ...this.live("premise").map((l) => l.topic ?? ""),
          ...this.refusedAnswers().map((r) => r.topic),
        ]),
      ]
        .filter(Boolean)
        .join(", "),
      line_max_chars: String(this.config.learning.line_max_chars),
    });
  }

  /** A learning job ended: if the triager gave no reading, premise's rules decide. */
  jobChanged(job: Job): void {
    if (job.payload.purpose !== "learn" || !FINISHED.has(job.status)) return;
    const row = this.correction(Number(job.payload.correction));
    if (row && row.status === "reading") this.decideByRule(row, "no-reading");
  }

  /** lesson_submit: the triager's reading of one correction. Applied at once. */
  lessonSubmit(binding: ToolBinding, args: Record<string, unknown>): ToolEnvelope {
    const job = this.deps.queue.get(binding.jobId);
    if (!job || job.softwareId !== binding.softwareId || job.payload.purpose !== "learn") {
      return toolFail("NOT_ALLOWED", "lesson_submit is only for reading a correction. Stop.");
    }
    if (FINISHED.has(job.status)) return toolFail("TASK_CLOSED", "This task has ended. Stop.");
    const row = this.correction(Number(job.payload.correction));
    if (!row) return toolFail("TASK_CLOSED", "That correction is not in premise any more. Stop.");
    if (row.status !== "reading") {
      return toolFail("CONFLICT", "This correction was already read. Stop.");
    }
    const problems: string[] = [];
    const destination = String(args.destination ?? "") as LearningDestination;
    if (!DESTINATIONS.includes(destination)) {
      problems.push(`destination must be one of ${DESTINATIONS.join(", ")}.`);
    }
    const mistake = typeof args.mistake === "string" ? args.mistake.trim() : "";
    if (!mistake) problems.push("Say what kind of mistake it was, in mistake.");
    const reason = typeof args.reason === "string" ? args.reason.trim() : "";
    if (!reason) problems.push("Say why it goes where it goes, in reason.");
    const rawLine = typeof args.line === "string" ? args.line.trim() : "";
    if (destination !== "none" && !rawLine) {
      problems.push("Give the one short line to learn, in line, or choose destination none.");
    }
    if (problems.length > 0) return toolFail("MALFORMED", problems.join(" "));
    // A lesson for this software reaches every later brief, so it must not quietly contradict a
    // must item, and it keeps the person's doubt where they had one (decision 0300).
    if (destination === "software" && !this.readTheRecord(job.id)) {
      return toolFail(
        "MALFORMED",
        'Read the record first with record_read, then submit again: a lesson for this software reaches every later brief, and it must not contradict a must item. If it does, say so in the line, for example "keep per-session figures (W-2); do not add a ranked list of sessions".',
      );
    }
    const said = `${row.said ?? ""}`;
    if (rawLine && isUnsure(said) && !keepsHedge(rawLine)) {
      return toolFail(
        "MALFORMED",
        `The person was not sure ("${said.slice(0, 160)}"), and the line says it as settled. Keep their doubt in the line, for example "the operator is unsure whether ...; do not ... without asking", and submit again.`,
      );
    }
    const line = rawLine ? cut(rawLine, this.config.learning.line_max_chars) : null;
    const topic =
      destination === "premise"
        ? topicOf(typeof args.topic === "string" && args.topic.trim() ? args.topic : mistake)
        : null;
    const lessonId = this.apply(row, { mistake, destination, reason, line, topic }, "agent");
    return toolOk({
      destination,
      ...(lessonId !== null && { lesson: label(lessonId) }),
      note: "Taken. End your session.",
    });
  }

  /** Whether the job read the software's record with record_read, as the tool calls show. */
  private readTheRecord(jobId: number): boolean {
    const rows = this.db
      .prepare(
        "SELECT detail FROM events WHERE module = 'agent-tools' AND kind = 'tool-call' AND reference = ?",
      )
      .all(String(jobId)) as { detail: string | null }[];
    return rows.some((r) => {
      const d = JSON.parse(r.detail ?? "{}") as { tool?: string; ok?: boolean };
      return d.tool === "record_read" && d.ok === true;
    });
  }

  // ---- Deciding -------------------------------------------------------------------------------

  private facts(row: CorrectionRow, found?: Found): CorrectionFacts {
    if (found) {
      return {
        kind: found.kind,
        what: found.what,
        said: found.said,
        subject: found.subject,
        replacement: found.replacement,
        stage: found.stage,
      };
    }
    const quoted = [...row.what.matchAll(/“([^”]*)”/g)].map((m) => m[1] ?? "");
    return {
      kind: row.kind,
      what: row.what,
      said: row.said,
      subject:
        row.kind === "decline-gate"
          ? row.what.replace(/^You declined:\s*/, "")
          : row.kind === "bug-after-met"
            ? (/in ([A-Z]-\d+)/.exec(row.what)?.[1] ?? null)
            : (quoted[0] ?? null),
      replacement: row.kind === "edit" ? (quoted[1] ?? null) : null,
      stage: null,
    };
  }

  private decideByRule(row: CorrectionRow, why: "rule" | "no-reading", found?: Found): void {
    const reading = ruleReading(this.facts(row, found));
    if (why === "no-reading") {
      reading.reason = `No agent gave a reading, so premise's fixed rule decided. ${reading.reason}`;
    }
    if (reading.line) reading.line = cut(reading.line, this.config.learning.line_max_chars);
    this.apply(row, reading, "rule");
  }

  /** Record a reading and make its line. Returns the line's id, or null when there is none. */
  private apply(
    row: CorrectionRow,
    reading: Reading,
    by: "agent" | "rule" | "operator",
  ): number | null {
    return transaction(this.db, () => {
      this.db
        .prepare(
          `UPDATE corrections SET status = 'read', mistake = ?, destination = ?, reason = ?, line = ?,
             topic = ?, decided_by = ?, read = ? WHERE id = ?`,
        )
        .run(
          reading.mistake,
          reading.destination,
          reading.reason,
          reading.line,
          reading.topic,
          by,
          now(),
          row.id,
        );
      recordEvent(this.db, {
        softwareId: row.software_id,
        module: "learning",
        kind: "correction-read",
        reference: String(row.id),
        detail: { destination: reading.destination, by },
      });
      if (reading.destination === "none" || !reading.line) return null;
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO lessons (correction_id, software_id, destination, topic, text, state, created)
             VALUES (?, ?, ?, ?, ?, 'live', ?)`,
          )
          .run(row.id, row.software_id, reading.destination, reading.topic, reading.line, now())
          .lastInsertRowid,
      );
      recordEvent(this.db, {
        softwareId: row.software_id,
        module: "learning",
        kind: "lesson-added",
        reference: label(id),
        detail: { destination: reading.destination },
      });
      this.say(row.software_id, this.proposedWords(id, reading));
      this.keepShort(reading.destination, row.software_id, id);
      return id;
    });
  }

  private proposedWords(id: number, reading: Reading): string {
    const line = `${label(id)}: ${reading.line}`;
    switch (reading.destination) {
      case "software":
        return `Learned from your correction, for this software. ${line} Its agents follow it from now on; to change or remove it, open the Learned tab.`;
      case "taste":
        return `Noted as your taste, for every software. ${line} Agents follow it from now on; to change or remove it, open the Learned tab.`;
      default:
        return `Noted as something premise itself could do better. ${line} This does not change how premise works; it is kept under Improvements for premise on the Learned tab.`;
    }
  }

  /** Over the cap, the least-used line goes, with a note (docs/specs/learning.md 6). */
  private keepShort(destination: LearningDestination, softwareId: string, keep: number): void {
    if (destination !== "software" && destination !== "taste") return;
    const max =
      destination === "software"
        ? this.config.learning.software_lines_max
        : this.config.learning.taste_lines_max;
    const live = this.live(destination, destination === "software" ? softwareId : undefined);
    let over = live.length - max;
    if (over <= 0) return;
    const candidates = live
      .filter((l) => l.id !== keep)
      .sort(
        (a, b) =>
          a.uses - b.uses ||
          (a.last_used ?? "").localeCompare(b.last_used ?? "") ||
          a.created.localeCompare(b.created) ||
          a.id - b.id,
      );
    for (const lesson of candidates) {
      if (over <= 0) break;
      const note = `Dropped to keep the list at ${max} lines: it was the least used (used ${lesson.uses === 1 ? "once" : `${lesson.uses} times`}).`;
      this.end(lesson, "dropped", note);
      this.say(
        lesson.software_id,
        `To keep the list short, premise dropped its least-used line. ${label(lesson.id)}: ${lesson.text}`,
      );
      over -= 1;
    }
  }

  private end(lesson: LessonRow, state: "deleted" | "dropped", note: string): void {
    this.db
      .prepare("UPDATE lessons SET state = ?, ended = ?, end_note = ? WHERE id = ?")
      .run(state, now(), note, lesson.id);
    recordEvent(this.db, {
      softwareId: lesson.software_id,
      module: "learning",
      kind: state === "dropped" ? "lesson-dropped" : "lesson-deleted",
      reference: label(lesson.id),
    });
  }

  private say(softwareId: string, text: string): void {
    addChatMessage(this.db, { softwareId, author: "premise", text, routedTo: "learning" });
  }

  // ---- What the person can do -----------------------------------------------------------------

  private requireLesson(id: number): LessonRow {
    const lesson = this.lesson(id);
    if (!lesson || lesson.state !== "live") {
      throw new ServiceError(
        "NOT_FOUND",
        "That line is not on the list any more; it may have been deleted or dropped. Reload the page.",
      );
    }
    return lesson;
  }

  editLesson(id: number, text: string): void {
    const lesson = this.requireLesson(id);
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) {
      throw new ServiceError("INVALID", "A line cannot be empty. To remove it, delete it instead.");
    }
    if (clean.length > this.config.learning.line_max_chars) {
      throw new ServiceError(
        "INVALID",
        `Keep it to ${this.config.learning.line_max_chars} characters; this one has ${clean.length}.`,
      );
    }
    this.db.prepare("UPDATE lessons SET text = ?, edited = ? WHERE id = ?").run(clean, now(), id);
    recordEvent(this.db, {
      softwareId: lesson.software_id,
      module: "learning",
      kind: "lesson-edited",
      reference: label(id),
    });
  }

  deleteLesson(id: number): void {
    const lesson = this.requireLesson(id);
    this.end(lesson, "deleted", "Deleted by you.");
  }

  /** Move what a correction teaches to another destination, in one click. */
  move(correctionId: number, destination: LearningDestination): void {
    if (!DESTINATIONS.includes(destination)) {
      throw new ServiceError(
        "INVALID",
        `"${String(destination)}" is not a place a lesson can go. Choose this software, your taste, premise itself, or nothing to learn.`,
      );
    }
    const row = this.correction(correctionId);
    if (!row)
      throw new ServiceError("NOT_FOUND", "That correction is not in premise. Reload the page.");
    if (row.status !== "read") {
      throw new ServiceError(
        "INVALID",
        "premise is still reading that correction. Try again in a moment.",
      );
    }
    if (row.destination === destination) return;
    transaction(this.db, () => {
      const lesson = this.db
        .prepare("SELECT * FROM lessons WHERE correction_id = ?")
        .get(correctionId) as unknown as LessonRow | undefined;
      const topic =
        destination === "premise" ? (row.topic ?? topicOf(row.mistake ?? row.kind)) : row.topic;
      this.db
        .prepare(
          "UPDATE corrections SET destination = ?, topic = ?, decided_by = 'operator', reason = ? WHERE id = ?",
        )
        .run(
          destination,
          topic,
          `You moved it here${row.destination ? ` from ${placeName(row.destination)}` : ""}.`,
          row.id,
        );
      recordEvent(this.db, {
        softwareId: row.software_id,
        module: "learning",
        kind: "correction-moved",
        reference: String(row.id),
        detail: { from: row.destination, to: destination },
      });
      if (destination === "none") {
        if (lesson?.state === "live")
          this.end(lesson, "deleted", "You said there is nothing to learn from it.");
        return;
      }
      if (lesson) {
        this.db
          .prepare(
            "UPDATE lessons SET destination = ?, topic = ?, state = 'live', ended = NULL, end_note = NULL WHERE id = ?",
          )
          .run(destination, topic, lesson.id);
        this.keepShort(destination, row.software_id, lesson.id);
        return;
      }
      const text =
        row.line ??
        cut(
          ruleReading(this.facts(row)).line ?? `${row.what}${row.said ? `: ${row.said}` : ""}.`,
          this.config.learning.line_max_chars,
        );
      const id = Number(
        this.db
          .prepare(
            `INSERT INTO lessons (correction_id, software_id, destination, topic, text, state, created)
             VALUES (?, ?, ?, ?, ?, 'live', ?)`,
          )
          .run(row.id, row.software_id, destination, topic, text, now()).lastInsertRowid,
      );
      recordEvent(this.db, {
        softwareId: row.software_id,
        module: "learning",
        kind: "lesson-added",
        reference: label(id),
        detail: { destination },
      });
      this.keepShort(destination, row.software_id, id);
    });
  }

  /** Remove one improvement for premise (every line grouped under it). */
  deleteImprovement(topic: string): void {
    const lines = this.live("premise").filter((l) => l.topic === topic);
    const refused = this.refusedAnswers(topic);
    if (lines.length === 0 && refused.length === 0) {
      throw new ServiceError(
        "NOT_FOUND",
        "That improvement is not on the list any more. Reload the page.",
      );
    }
    transaction(this.db, () => {
      for (const l of lines) this.end(l, "deleted", "Deleted by you.");
      this.db.prepare("DELETE FROM refused_answers WHERE topic = ?").run(topic);
    });
  }

  /** The improvements for premise as a plain text file the operator can keep or pass on. */
  exportImprovements(): string {
    const improvements = this.improvements();
    const lines = [
      "Improvements for premise",
      `Written by premise on ${now().slice(0, 10)}. Each comes from corrections people made; none of these has changed how premise works.`,
      "",
    ];
    if (improvements.length === 0) lines.push("None yet.");
    improvements.forEach((imp, i) => {
      lines.push(`${i + 1}. ${imp.text}`);
      lines.push(
        `   Seen ${imp.seen === 1 ? "once" : `${imp.seen} times`}, in ${imp.softwares.join(", ")}. Last seen ${imp.lastSeen.slice(0, 10)}.`,
      );
      for (const l of imp.lessons) lines.push(`   - ${l.label}: ${l.text} (from: ${l.source})`);
      lines.push("");
    });
    return `${lines.join("\n").trimEnd()}\n`;
  }

  // ---- Briefs (LessonSource) ------------------------------------------------------------------

  /**
   * The lines an agent's brief carries: this software's lessons, then the operator's taste. Never
   * the improvements for premise, which do not change how premise works. Each line given is
   * counted as used.
   */
  section(role: AgentRole, softwareId: string): string | null {
    if (!LESSON_ROLES.includes(role)) return null;
    const mine = this.live("software", softwareId);
    const taste = this.live("taste");
    if (mine.length === 0 && taste.length === 0) return null;
    const at = now();
    const use = this.db.prepare("UPDATE lessons SET uses = uses + 1, last_used = ? WHERE id = ?");
    for (const l of [...mine, ...taste]) use.run(at, l.id);
    const parts = [
      "Lessons from people's corrections. Follow them; each comes from something a person corrected.",
    ];
    if (mine.length > 0) {
      parts.push("For this software:", ...mine.map((l) => `- ${label(l.id)}: ${l.text}`));
    }
    if (taste.length > 0) {
      parts.push(
        "The operator's taste, for every software:",
        ...taste.map((l) => `- ${label(l.id)}: ${l.text}`),
      );
    }
    parts.push(
      role === "drafter" || role === "planner"
        ? 'When a draft item follows one of these lessons, give it "follows": "L-n" with the lesson\'s label, so the person can see they were heard.'
        : "When you follow one of these lessons, name its label (such as L-3) in your summary.",
    );
    return parts.join("\n");
  }

  /** A live lesson's words by its label, for a draft item that follows it. */
  text(labelText: string): string | null {
    const m = /^L-(\d+)$/.exec(labelText.trim());
    if (!m) return null;
    const lesson = this.lesson(Number(m[1]));
    return lesson && lesson.state === "live" && lesson.destination !== "premise"
      ? lesson.text
      : null;
  }

  // ---- Reading for the page -------------------------------------------------------------------

  private correction(id: number): CorrectionRow | undefined {
    return this.db.prepare("SELECT * FROM corrections WHERE id = ?").get(id) as
      CorrectionRow | undefined;
  }

  private lesson(id: number): LessonRow | undefined {
    return this.db.prepare("SELECT * FROM lessons WHERE id = ?").get(id) as LessonRow | undefined;
  }

  private live(destination: ListDestination, softwareId?: string): LessonRow[] {
    const rows = this.db
      .prepare("SELECT * FROM lessons WHERE destination = ? AND state = 'live' ORDER BY id")
      .all(destination) as unknown as LessonRow[];
    return softwareId === undefined ? rows : rows.filter((r) => r.software_id === softwareId);
  }

  private softwareName(id: string): string {
    return (
      (
        this.db.prepare("SELECT name FROM softwares WHERE id = ?").get(id) as
          { name: string } | undefined
      )?.name ?? "a removed software"
    );
  }

  private lessonView(row: LessonRow): LessonView {
    const correction = this.correction(row.correction_id);
    return {
      id: row.id,
      label: label(row.id),
      destination: row.destination,
      softwareId: row.software_id,
      softwareName: this.softwareName(row.software_id),
      text: row.text,
      source: correction
        ? `${correction.what}${correction.said ? ` (“${correction.said}”)` : ""}, ${correction.created.slice(0, 10)}`
        : "a correction since removed",
      correctionId: row.correction_id,
      uses: row.uses,
      lastUsed: row.last_used,
      created: row.created,
      edited: row.edited,
    };
  }

  private refusedAnswers(topic?: string): RefusedAnswerRow[] {
    const rows = this.db
      .prepare("SELECT * FROM refused_answers ORDER BY id")
      .all() as unknown as RefusedAnswerRow[];
    return topic === undefined ? rows : rows.filter((r) => r.topic === topic);
  }

  /** A refused answer, shown as the line it adds to an improvement (decision 0285). */
  private refusedView(row: RefusedAnswerRow): LessonView {
    return {
      id: -row.id,
      label: `R-${row.id}`,
      destination: "premise",
      softwareId: row.software_id,
      softwareName: this.softwareName(row.software_id),
      text: row.text,
      source: `a ${row.role} ended without its answer, ${row.created.slice(0, 10)}`,
      correctionId: 0,
      uses: 0,
      lastUsed: null,
      created: row.created,
      edited: null,
    };
  }

  private improvements(): ImprovementView[] {
    const groups = new Map<string, (LessonRow | RefusedAnswerRow)[]>();
    for (const l of [...this.live("premise"), ...this.refusedAnswers()]) {
      const key = l.topic ?? "other";
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    return [...groups.entries()]
      .map(([topic, rows]) => {
        const views = rows.map((r) => ("job_id" in r ? this.refusedView(r) : this.lessonView(r)));
        return {
          topic,
          text: rows[rows.length - 1]!.text,
          seen: rows.length,
          softwares: [...new Set(views.map((v) => v.softwareName))],
          lessons: views,
          lastSeen: rows
            .map((r) => r.created)
            .sort()
            .at(-1)!,
        };
      })
      .sort((a, b) => b.seen - a.seen || b.lastSeen.localeCompare(a.lastSeen));
  }

  view(softwareId: string | null): LearningView {
    if (softwareId !== null) {
      const known = this.db.prepare("SELECT 1 FROM softwares WHERE id = ?").get(softwareId);
      if (!known) throw new ServiceError("NOT_FOUND", "There is no software with that id.");
    }
    const corrections = (softwareId === null
      ? this.db.prepare("SELECT * FROM corrections ORDER BY id DESC LIMIT 30").all()
      : this.db
          .prepare("SELECT * FROM corrections WHERE software_id = ? ORDER BY id DESC LIMIT 30")
          .all(softwareId)) as unknown as CorrectionRow[];
    const lessonOf = new Map(
      (
        this.db.prepare("SELECT id, correction_id FROM lessons WHERE state = 'live'").all() as {
          id: number;
          correction_id: number;
        }[]
      ).map((r) => [r.correction_id, r.id]),
    );
    // A correction whose lesson was deleted or dropped says so, rather than look still in force.
    const endedOf = new Map(
      (
        this.db
          .prepare(
            "SELECT id, correction_id, state, end_note FROM lessons WHERE state != 'live' ORDER BY id",
          )
          .all() as { id: number; correction_id: number; state: string; end_note: string | null }[]
      ).map((r) => [r.correction_id, { label: label(r.id), note: r.end_note ?? "" }]),
    );
    const ended = (softwareId === null
      ? this.db
          .prepare(
            "SELECT * FROM lessons WHERE state != 'live' ORDER BY ended DESC, id DESC LIMIT 10",
          )
          .all()
      : this.db
          .prepare(
            "SELECT * FROM lessons WHERE state != 'live' AND (software_id = ? OR destination = 'taste') ORDER BY ended DESC, id DESC LIMIT 10",
          )
          .all(softwareId)) as unknown as LessonRow[];
    const endedViews = ended.map((l): EndedLessonView => ({
      label: label(l.id),
      text: l.text,
      destination: l.destination,
      note: l.end_note ?? "",
      ended: l.ended ?? l.created,
    }));
    return {
      softwareId,
      explain: {
        adapting:
          "When you strike, edit or turn down something premise made, it writes down one short lesson; its agents follow these lessons from then on, either for this software or, for your taste, for every software.",
        improving:
          "When a correction shows premise's own way of working could be better, it is kept here as an improvement for premise; these never change how premise works on their own, and you can export them as a text file.",
      },
      software:
        softwareId === null
          ? null
          : {
              lines: this.live("software", softwareId).map((l) => this.lessonView(l)),
              max: this.config.learning.software_lines_max,
            },
      taste: {
        lines: this.live("taste").map((l) => this.lessonView(l)),
        max: this.config.learning.taste_lines_max,
      },
      improvements: this.improvements(),
      corrections: corrections.map((c): CorrectionView => ({
        id: c.id,
        softwareId: c.software_id,
        softwareName: this.softwareName(c.software_id),
        kind: c.kind,
        what: c.what,
        said: c.said,
        status: c.status,
        mistake: c.mistake,
        destination: c.destination,
        reason: c.reason,
        decidedBy: c.decided_by,
        lessonId: lessonOf.get(c.id) ?? null,
        ...(!lessonOf.has(c.id) && endedOf.has(c.id) && { lessonEnded: endedOf.get(c.id)! }),
        created: c.created,
      })),
      ended: endedViews,
    };
  }
}

function placeName(destination: LearningDestination): string {
  switch (destination) {
    case "software":
      return "this software";
    case "taste":
      return "your taste";
    case "premise":
      return "premise itself";
    default:
      return "nothing to learn";
  }
}

function parse<T>(text: string | null): Partial<T> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Partial<T>;
  } catch {
    return {};
  }
}
