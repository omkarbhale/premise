import type { AgentOutcome, AgentRunner, AgentSession } from "../agents/agent-runner.js";
import { AGENT_TASK_KINDS, type AgentTaskKind, type PremiseConfig } from "../config/settings.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";

/**
 * The work queue (docs/specs/work-queue.md): jobs stored so a restart resumes them, at most
 * queue.max_agent_sessions agent sessions at once, the most important software first, the
 * same-failure rule, and the pause for the subscription's usage limit.
 */

export const JOB_KINDS = [...AGENT_TASK_KINDS, "run"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobStatus =
  "queued" | "running" | "waiting" | "paused" | "done" | "stuck" | "failed" | "stopped";

export interface Job {
  id: number;
  softwareId: string;
  kind: JobKind;
  stage: string | null;
  items: string[];
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  failureSignature: string | null;
  sameFailureCount: number;
  waitingOn: string | null;
  note: string | null;
  result: string | null;
  created: string;
  started: string | null;
  finished: string | null;
}

interface JobRow {
  id: number;
  software_id: string;
  kind: JobKind;
  stage: string | null;
  items: string;
  payload: string;
  status: JobStatus;
  attempts: number;
  failure_signature: string | null;
  same_failure_count: number;
  waiting_on: string | null;
  note: string | null;
  result: string | null;
  created: string;
  started: string | null;
  finished: string | null;
}

function fromRow(row: JobRow): Job {
  return {
    id: row.id,
    softwareId: row.software_id,
    kind: row.kind,
    stage: row.stage,
    items: JSON.parse(row.items) as string[],
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status,
    attempts: row.attempts,
    failureSignature: row.failure_signature,
    sameFailureCount: row.same_failure_count,
    waitingOn: row.waiting_on,
    note: row.note,
    result: row.result,
    created: row.created,
    started: row.started,
    finished: row.finished,
  };
}

/**
 * Within one software, jobs that unblock a person's view come first, then checks, then builds,
 * then triage and readings (work-queue spec 5.1). Lower runs first.
 */
const KIND_RANK: Record<JobKind, number> = {
  size: 0,
  draft: 0,
  recover: 1,
  report: 0,
  review: 1,
  research: 1,
  plan: 1,
  check: 2,
  build: 3,
  prototype: 3,
  run: 3,
  triage: 4,
  reading: 4,
};

const KIND_ORDER_SQL = `CASE j.kind ${Object.entries(KIND_RANK)
  .map(([kind, rank]) => `WHEN '${kind}' THEN ${rank}`)
  .join(" ")} ELSE 9 END`;

export interface EnqueueInput {
  softwareId: string;
  kind: JobKind;
  stage?: string;
  items?: string[];
  payload?: Record<string, unknown>;
}

export interface QueueState {
  paused: boolean;
  reason: string | null;
  resumeAt: string | null;
}

/** Server-side jobs (kind "run") are done by the server, not an agent, and take no slot. */
export type ServerJobHandler = (job: Job) => Promise<AgentOutcome>;

export interface WorkQueueOptions {
  db: Database;
  config: Pick<PremiseConfig, "queue" | "agents">;
  runner: AgentRunner;
  serverJobs?: ServerJobHandler;
  /** Called after any job changes state; the page server streams it. */
  onChange?: (job: Job) => void;
  /** For tests: the current time. */
  clock?: () => Date;
}

const QUEUE_STATE_KEY = "queue.state";

export class WorkQueue {
  private readonly db: Database;
  private readonly running = new Map<number, AgentSession | null>();
  private readonly settled = new Map<number, Promise<void>>();
  /** Jobs whose sessions were stopped because all work paused; they go back to the queue. */
  private readonly stoppedForPause = new Set<number>();
  private readonly clock: () => Date;
  private resumeTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly options: WorkQueueOptions) {
    this.db = options.db;
    this.clock = options.clock ?? (() => new Date());
  }

  enqueue(input: EnqueueInput): number {
    const result = transaction(this.db, () => {
      const inserted = this.db
        .prepare(
          `INSERT INTO jobs (software_id, kind, stage, items, payload, created) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.softwareId,
          input.kind,
          input.stage ?? null,
          JSON.stringify(input.items ?? []),
          JSON.stringify(input.payload ?? {}),
          now(),
        );
      const id = Number(inserted.lastInsertRowid);
      recordEvent(this.db, {
        softwareId: input.softwareId,
        module: "queue",
        kind: "job-queued",
        reference: String(id),
        detail: { kind: input.kind },
      });
      return id;
    });
    this.notify(result);
    return result;
  }

  get(id: number): Job | undefined {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(status?: JobStatus): Job[] {
    const rows = status
      ? this.db.prepare("SELECT * FROM jobs WHERE status = ? ORDER BY id").all(status)
      : this.db.prepare("SELECT * FROM jobs ORDER BY id").all();
    return (rows as unknown as JobRow[]).map(fromRow);
  }

  state(): QueueState {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(QUEUE_STATE_KEY) as
      { value: string } | undefined;
    return row
      ? (JSON.parse(row.value) as QueueState)
      : { paused: false, reason: null, resumeAt: null };
  }

  private setState(state: QueueState): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, changed) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, changed = excluded.changed`,
      )
      .run(QUEUE_STATE_KEY, JSON.stringify(state), now());
  }

  /** How many agent sessions are running now. */
  runningAgentSessions(): number {
    return [...this.running.values()].filter((s) => s !== null).length;
  }

  /**
   * After a restart: every job found running lost its session. It goes back to the queue, and the
   * next attempt is told that a previous one was cut off (work-queue spec 5.2).
   */
  recover(): Job[] {
    const cut = this.list("running");
    transaction(this.db, () => {
      for (const job of cut) {
        this.db
          .prepare("UPDATE jobs SET status = 'queued', note = ?, started = NULL WHERE id = ?")
          .run("A previous attempt was cut off when premise stopped.", job.id);
        this.db
          .prepare(
            "UPDATE agent_sessions SET ended = ?, end_reason = 'premise-stopped' WHERE job_id = ? AND ended IS NULL",
          )
          .run(now(), job.id);
        recordEvent(this.db, {
          softwareId: job.softwareId,
          module: "queue",
          kind: "job-recovered",
          reference: String(job.id),
        });
      }
    });
    return cut.map((j) => this.get(j.id)!);
  }

  /**
   * The startable jobs: queued, of a software that is active, not paused by the operator and not
   * archived. Within one software, in the order they should start (work-queue spec 5.1).
   */
  private startable(): Job[] {
    const rows = this.db
      .prepare(
        `SELECT j.* FROM jobs j JOIN softwares s ON s.id = j.software_id
         WHERE j.status = 'queued' AND s.state = 'active'
           AND s.paused_at IS NULL AND s.archived_at IS NULL
         ORDER BY ${KIND_ORDER_SQL}, j.created, j.id`,
      )
      .all() as unknown as JobRow[];
    return rows.map(fromRow);
  }

  /** When each software last had a job start, from the events (so it survives a restart). */
  private lastStarts(): Map<string, number> {
    const rows = this.db
      .prepare(
        "SELECT software_id, MAX(time) AS last FROM events WHERE module = 'queue' AND kind = 'job-started' AND software_id IS NOT NULL GROUP BY software_id",
      )
      .all() as { software_id: string; last: string }[];
    return new Map(rows.map((r) => [r.software_id, Date.parse(r.last)]));
  }

  /**
   * How the softwares with startable work share the agent slots (work-queue spec 5.1; decision
   * 0197): a software that has waited queue.fair_wait_minutes without a start goes first, the
   * longest waiting first; then the most important; among equally important ones, the one with
   * fewer sessions running, then the one whose turn was longest ago. Returns the softwares in the
   * order to give the next slot to, for the running sessions counted now.
   */
  private shareOrder(
    jobs: Job[],
    runningBySoftware: Map<string, number>,
  ): { softwareId: string; waitedMs: number; starving: boolean }[] {
    const nowMs = this.clock().getTime();
    const limitMs = this.options.config.queue.fair_wait_minutes * 60_000;
    const lastStart = this.lastStarts();
    const priorities = new Map(
      (
        this.db.prepare("SELECT id, priority FROM softwares").all() as {
          id: string;
          priority: number;
        }[]
      ).map((r) => [r.id, r.priority]),
    );
    const oldest = new Map<string, number>();
    for (const job of jobs) {
      const created = Date.parse(job.created);
      oldest.set(job.softwareId, Math.min(oldest.get(job.softwareId) ?? created, created));
    }
    const rows = [...oldest.entries()].map(([softwareId, since]) => {
      const turn = lastStart.get(softwareId) ?? 0;
      const waitedMs = Math.max(0, nowMs - Math.max(since, turn));
      return {
        softwareId,
        waitedMs,
        // A software with a session running is getting its turn; it is not left waiting.
        starving: waitedMs >= limitMs && (runningBySoftware.get(softwareId) ?? 0) === 0,
        priority: priorities.get(softwareId) ?? 3,
        running: runningBySoftware.get(softwareId) ?? 0,
        turn,
      };
    });
    rows.sort(
      (a, b) =>
        Number(b.starving) - Number(a.starving) ||
        (a.starving && b.starving ? b.waitedMs - a.waitedMs : 0) ||
        a.priority - b.priority ||
        a.running - b.running ||
        a.turn - b.turn ||
        a.softwareId.localeCompare(b.softwareId),
    );
    return rows.map(({ softwareId, waitedMs, starving }) => ({ softwareId, waitedMs, starving }));
  }

  /** Agent sessions running now, per software. */
  private runningBySoftware(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [id, session] of this.running) {
      if (!session) continue;
      const job = this.get(id);
      if (job) counts.set(job.softwareId, (counts.get(job.softwareId) ?? 0) + 1);
    }
    return counts;
  }

  /** Start every job that can start now. Returns the ids started. */
  tick(): number[] {
    if (this.closed) return [];
    const state = this.state();
    if (state.paused) {
      if (state.resumeAt && this.clock().getTime() >= Date.parse(state.resumeAt)) {
        this.resumeAll();
      } else {
        this.armResumeTimer(state);
        return [];
      }
    }
    const started: number[] = [];
    const ready = this.startable().filter((job) => !this.running.has(job.id));
    // Server jobs take no slot: each starts at once.
    if (this.options.serverJobs) {
      for (const job of ready.filter((j) => j.kind === "run")) {
        this.startJob(job);
        started.push(job.id);
      }
    }
    if (this.options.runner.ready && !this.options.runner.ready()) return started;
    const waiting = ready.filter((j) => j.kind !== "run");
    const counts = this.runningBySoftware();
    while (
      waiting.length > 0 &&
      this.runningAgentSessions() < this.options.config.queue.max_agent_sessions
    ) {
      const next = this.shareOrder(waiting, counts)[0]!;
      const index = waiting.findIndex((j) => j.softwareId === next.softwareId);
      const job = waiting.splice(index, 1)[0]!;
      if (next.starving) {
        recordEvent(this.db, {
          softwareId: job.softwareId,
          module: "queue",
          kind: "fair-turn",
          reference: String(job.id),
          detail: { waitedMinutes: Math.round(next.waitedMs / 60_000) },
        });
      }
      this.startJob(job);
      counts.set(job.softwareId, (counts.get(job.softwareId) ?? 0) + 1);
      started.push(job.id);
    }
    return started;
  }

  /**
   * A software was paused or archived: its running agent sessions stop and their jobs go back to
   * the queue, so the slots go to other softwares. Its asks stay answerable.
   */
  releaseSoftware(softwareId: string): number {
    let stopped = 0;
    for (const [id, session] of this.running) {
      if (!session) continue;
      if (this.get(id)?.softwareId !== softwareId) continue;
      this.stoppedForPause.add(id);
      session.stop();
      stopped++;
    }
    return stopped;
  }

  private startJob(job: Job): void {
    const attempt = job.attempts + 1;
    this.db
      .prepare("UPDATE jobs SET status = 'running', attempts = ?, started = ? WHERE id = ?")
      .run(attempt, now(), job.id);
    recordEvent(this.db, {
      softwareId: job.softwareId,
      module: "queue",
      kind: "job-started",
      reference: String(job.id),
      detail: { attempt },
    });

    let outcome: Promise<AgentOutcome>;
    if (job.kind === "run") {
      this.running.set(job.id, null);
      outcome = this.options.serverJobs!(this.get(job.id)!);
    } else {
      const task = this.options.config.agents.tasks[job.kind as AgentTaskKind];
      const brief = [job.note, typeof job.payload.brief === "string" ? job.payload.brief : ""]
        .filter(Boolean)
        .join("\n");
      const software = this.db
        .prepare("SELECT repository FROM softwares WHERE id = ?")
        .get(job.softwareId) as { repository: string | null } | undefined;
      const ref = typeof job.payload.ref === "string" ? job.payload.ref : undefined;
      // A job may name the repository to clone (the software's own, on this machine), so it can
      // work from a commit that is not pushed anywhere else yet.
      const repository =
        typeof job.payload.repository === "string"
          ? job.payload.repository
          : (software?.repository ?? undefined);
      const trace = typeof job.payload.trace === "string" ? job.payload.trace : undefined;
      const resumeSessionId = this.cutOffSession(job.id);
      // A stage's effort budget can be smaller than the task's own limits (decision 0085).
      const limits = (job.payload.limits ?? {}) as { turns?: unknown; minutes?: unknown };
      const maxTurns =
        typeof limits.turns === "number" ? Math.min(task.max_turns, limits.turns) : task.max_turns;
      const maxMinutes =
        typeof limits.minutes === "number"
          ? Math.min(task.max_minutes, limits.minutes)
          : task.max_minutes;
      const context =
        job.payload.context && typeof job.payload.context === "object"
          ? (job.payload.context as Record<string, unknown>)
          : undefined;
      const session = this.options.runner.start(
        {
          jobId: job.id,
          softwareId: job.softwareId,
          taskKind: job.kind as AgentTaskKind,
          attempt,
          model: task.model,
          effort: task.effort,
          maxTurns,
          maxMinutes,
          brief,
          ...(repository ? { repository } : {}),
          ...(ref ? { ref } : {}),
          ...(trace ? { trace } : {}),
          ...(resumeSessionId ? { resumeSessionId } : {}),
          ...(context ? { context } : {}),
        },
        (progress) =>
          recordEvent(this.db, {
            softwareId: job.softwareId,
            module: "agent",
            kind: "progress",
            reference: String(job.id),
            detail: progress,
          }),
      );
      this.running.set(job.id, session);
      this.db
        .prepare(
          `INSERT INTO agent_sessions (runtime_session_id, job_id, agent_role, runtime, model, effort, started)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.confirmed ? "" : session.sessionId,
          job.id,
          job.kind,
          session.runtime,
          task.model,
          task.effort,
          now(),
        );
      session.confirmed?.then((id) => {
        this.db
          .prepare(
            "UPDATE agent_sessions SET runtime_session_id = ? WHERE job_id = ? AND ended IS NULL",
          )
          .run(id, job.id);
      });
      outcome = session.outcome;
    }
    this.notify(job.id);

    const settled = outcome
      .catch((error: unknown): AgentOutcome => ({
        kind: "failed",
        summary: `The session broke: ${(error as Error).message}`,
        failureSignature: "session-error",
      }))
      .then((result) => {
        this.running.delete(job.id);
        this.settled.delete(job.id);
        this.finish(job.id, result);
        this.tick();
      });
    this.settled.set(job.id, settled);
  }

  /**
   * The session to carry on, when the job's last session was cut off rather than finished: paused
   * for the usage limit, stopped for a pause, or cut off when premise stopped. Only a session of
   * the same runtime can be carried on.
   */
  private cutOffSession(jobId: number): string | undefined {
    const last = this.db
      .prepare(
        "SELECT runtime_session_id, runtime, end_reason FROM agent_sessions WHERE job_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(jobId) as
      { runtime_session_id: string; runtime: string; end_reason: string | null } | undefined;
    if (!last || !last.runtime_session_id || last.runtime !== this.options.runner.runtime) {
      return undefined;
    }
    return ["usage-limit", "stopped", "premise-stopped"].includes(last.end_reason ?? "")
      ? last.runtime_session_id
      : undefined;
  }

  /** A pause with a resume time ends by itself: a timer ticks the queue when the time comes. */
  private armResumeTimer(state: QueueState): void {
    this.clearResumeTimer();
    if (this.closed || !state.paused || !state.resumeAt) return;
    const delay = Math.max(0, Date.parse(state.resumeAt) - this.clock().getTime());
    this.resumeTimer = setTimeout(
      () => {
        this.resumeTimer = null;
        this.tick();
      },
      Math.min(delay, 2 ** 31 - 1),
    );
    this.resumeTimer.unref();
  }

  private clearResumeTimer(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
  }

  /** Shutdown: no more starts, running sessions stop and go back to the queue, then wait for them. */
  async close(): Promise<void> {
    this.closed = true;
    this.clearResumeTimer();
    for (const [id, session] of this.running) {
      if (session) {
        this.stoppedForPause.add(id);
        session.stop();
      }
    }
    await this.idle();
  }

  /** Wait until every running job has ended. For tests and shutdown. */
  async idle(): Promise<void> {
    while (this.settled.size > 0) {
      await Promise.all([...this.settled.values()]);
    }
  }

  private finish(id: number, outcome: AgentOutcome): void {
    const job = this.get(id);
    if (!job || job.status !== "running") return;
    transaction(this.db, () => {
      this.db
        .prepare(
          "UPDATE agent_sessions SET ended = ?, end_reason = ? WHERE job_id = ? AND ended IS NULL",
        )
        .run(now(), outcome.kind, id);
      switch (outcome.kind) {
        case "done":
          this.closeJob(job, "done", outcome.summary);
          break;
        case "stuck":
          this.closeJob(job, "stuck", outcome.summary);
          break;
        case "stopped":
          if (this.stoppedForPause.delete(id)) {
            this.requeue(job, null);
          } else {
            this.closeJob(job, "stopped", "Stopped by a person.");
          }
          break;
        case "failed": {
          const same =
            job.failureSignature === outcome.failureSignature ? job.sameFailureCount + 1 : 1;
          this.db
            .prepare("UPDATE jobs SET failure_signature = ?, same_failure_count = ? WHERE id = ?")
            .run(outcome.failureSignature, same, id);
          if (same >= this.options.config.queue.same_failure_limit) {
            this.closeJob(
              job,
              "stuck",
              `The same failure happened ${same} times: ${outcome.summary}`,
            );
          } else {
            this.requeue(job, `The previous attempt failed: ${outcome.summary}`);
          }
          break;
        }
        case "usage-limit": {
          this.requeue(job, null);
          this.pauseAllInside("The subscription's usage limit was reached.", outcome.resetAt);
          break;
        }
      }
    });
    this.notify(id);
  }

  private closeJob(job: Job, status: JobStatus, result: string): void {
    this.db
      .prepare("UPDATE jobs SET status = ?, result = ?, finished = ? WHERE id = ?")
      .run(status, result, now(), job.id);
    recordEvent(this.db, {
      softwareId: job.softwareId,
      module: "queue",
      kind: `job-${status}`,
      reference: String(job.id),
      detail: { result },
    });
  }

  /** Back to the queue. Every session started counts as an attempt; the same-failure rule counts failures. */
  private requeue(job: Job, note: string | null): void {
    this.db
      .prepare(
        "UPDATE jobs SET status = 'queued', started = NULL, note = COALESCE(?, note) WHERE id = ?",
      )
      .run(note, job.id);
    recordEvent(this.db, {
      softwareId: job.softwareId,
      module: "queue",
      kind: "job-requeued",
      reference: String(job.id),
      detail: { note },
    });
  }

  /** Stop a job: its session ends and the job is stopped. */
  stop(id: number): void {
    const session = this.running.get(id);
    if (session) {
      session.stop();
      return;
    }
    const job = this.get(id);
    if (job && ["queued", "waiting", "paused", "running"].includes(job.status)) {
      this.closeJob(job, "stopped", "Stopped by a person.");
      this.notify(id);
    }
  }

  /** A job waits on a person's answer or an approval; it takes no slot meanwhile. */
  wait(id: number, on: string): void {
    this.db.prepare("UPDATE jobs SET status = 'waiting', waiting_on = ? WHERE id = ?").run(on, id);
    this.notify(id);
  }

  /** The answer arrived: the job goes back to the queue. */
  resume(id: number): void {
    this.db
      .prepare(
        "UPDATE jobs SET status = 'queued', waiting_on = NULL WHERE id = ? AND status = 'waiting'",
      )
      .run(id);
    this.notify(id);
    this.tick();
  }

  private pauseAllInside(reason: string, resetAt: string | null): void {
    const fallback = this.options.config.queue.usage_pause_fallback_minutes;
    const nowMs = this.clock().getTime();
    const given = resetAt === null ? Number.NaN : Date.parse(resetAt);
    const resumeAt = given > nowMs ? resetAt! : new Date(nowMs + fallback * 60_000).toISOString();
    const state = { paused: true, reason, resumeAt };
    this.setState(state);
    this.armResumeTimer(state);
    recordEvent(this.db, { module: "queue", kind: "queue-paused", detail: { reason, resumeAt } });
    for (const [id, session] of this.running) {
      if (session) {
        this.stoppedForPause.add(id);
        session.stop();
      }
    }
  }

  /** Pause all agent work, for example on a usage-limit event. Running sessions stop cleanly. */
  pauseAll(reason: string, resetAt: string | null = null): void {
    this.pauseAllInside(reason, resetAt);
  }

  resumeAll(): void {
    this.clearResumeTimer();
    this.setState({ paused: false, reason: null, resumeAt: null });
    recordEvent(this.db, { module: "queue", kind: "queue-resumed" });
  }

  private notify(id: number): void {
    const job = this.get(id);
    if (job) this.options.onChange?.(job);
  }
}
