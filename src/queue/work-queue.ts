import { outsideLanes } from "../shared/lane-context.js";
import type { AgentOutcome, AgentRunner, AgentSession } from "../agents/agent-runner.js";
import { AGENT_TASK_KINDS, type AgentTaskKind, type PremiseConfig } from "../config/settings.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import { recordSessionFigures } from "../storage/session-figures.js";

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

/** Who paused all agent work: the person, the "start paused" setting, or the usage limit. */
export type PauseCause = "person" | "setting" | "usage-limit";

/** How a person's pause treats sessions that are running: let them finish, or stop them now. */
export type PauseMode = "finish" | "stop-now";

export interface QueueState {
  paused: boolean;
  reason: string | null;
  resumeAt: string | null;
  /** Who paused; null when not paused. Stored states from before this existed read as the usage limit when they had a resume time, else the person. */
  cause?: PauseCause | null;
  /** For a person's pause: what was chosen for sessions that were running. */
  mode?: PauseMode | null;
  pausedAt?: string | null;
}

/** What the page and the terminal say about stopping and pausing, in one place. */
export interface PauseStatus {
  paused: boolean;
  cause: PauseCause | null;
  mode: PauseMode | null;
  reason: string | null;
  resumeAt: string | null;
  pausedAt: string | null;
  /** premise is stopping (Ctrl+C or `premise stop`): nothing new starts and it ends when the running work has. */
  stopping: boolean;
  /** Jobs still running (agent sessions, and the server's own jobs, such as starting a software). */
  stillRunning: Job[];
  /** True when nothing is running, so closing premise now loses no work. */
  safeToClose: boolean;
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
  /** Called after the pause state or the stopping state changes; the page server streams it. */
  onPauseChange?: () => void;
  /** For tests: the current time. */
  clock?: () => Date;
  /**
   * Budgets (src/usage). hold: a software's budget is being looked at, so nothing starts for it
   * yet. allows: a software paused for its budget may still start this job, because the operator
   * chose to let that change finish.
   */
  budgets?: { hold(softwareId: string): boolean; allows(job: Job): boolean };
}

const QUEUE_STATE_KEY = "queue.state";

export class WorkQueue {
  private readonly db: Database;
  private readonly running = new Map<number, AgentSession | null>();
  private readonly settled = new Map<number, Promise<void>>();
  /**
   * Jobs whose sessions were stopped because all work paused, premise stopped or the computer slept;
   * they go back to the queue, with the note to give the next attempt (or none).
   */
  private readonly stoppedForPause = new Map<number, string | null>();
  /** For a running job, ends its wait on the session (a session that died without saying so). */
  private readonly abandon = new Map<number, () => void>();
  /** premise is stopping: nothing new starts. Not stored, so a clean stop is not a pause. */
  private stopping = false;
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
    const stored = row
      ? (JSON.parse(row.value) as QueueState)
      : { paused: false, reason: null, resumeAt: null };
    if (!stored.paused) {
      return {
        paused: false,
        reason: null,
        resumeAt: null,
        cause: null,
        mode: null,
        pausedAt: null,
      };
    }
    return {
      ...stored,
      cause: stored.cause ?? (stored.resumeAt ? "usage-limit" : "person"),
      mode: stored.mode ?? null,
      pausedAt: stored.pausedAt ?? null,
    };
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

  /** Every job running now, agent sessions and the server's own jobs. */
  runningJobs(): Job[] {
    return [...this.running.keys()].map((id) => this.get(id)).filter((j): j is Job => !!j);
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
         WHERE j.status = 'queued' AND s.state IN ('active', 'paused-budget')
           AND s.paused_at IS NULL AND s.archived_at IS NULL
         ORDER BY ${KIND_ORDER_SQL}, j.created, j.id`,
      )
      .all() as unknown as JobRow[];
    const budgets = this.options.budgets;
    const paused = new Set(
      (
        this.db.prepare("SELECT id FROM softwares WHERE state = 'paused-budget'").all() as {
          id: string;
        }[]
      ).map((r) => r.id),
    );
    return rows
      .map(fromRow)
      .filter(
        (job) =>
          !budgets?.hold(job.softwareId) && (!paused.has(job.softwareId) || budgets?.allows(job)),
      );
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
    if (this.stopping) return [];
    const state = this.state();
    if (state.paused) {
      if (
        state.cause === "usage-limit" &&
        state.resumeAt &&
        this.clock().getTime() >= Date.parse(state.resumeAt)
      ) {
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
      this.stoppedForPause.set(id, null);
      session.stop();
      stopped++;
    }
    return stopped;
  }

  /**
   * Start a job outside any piece's lane (decision 0313): a job is started by whatever ticked the
   * queue, and must not take that caller's lane with it into its session's callbacks.
   */
  private startJob(job: Job): void {
    outsideLanes(() => this.startJobNow(job));
  }

  private startJobNow(job: Job): void {
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
      outcome = Promise.race([
        session.outcome,
        new Promise<AgentOutcome>((resolve) =>
          this.abandon.set(job.id, () => resolve({ kind: "stopped" })),
        ),
      ]);
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
        this.abandon.delete(job.id);
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
    return ["usage-limit", "stopped", "premise-stopped", "suspended"].includes(
      last.end_reason ?? "",
    )
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
        this.stoppedForPause.set(
          id,
          "An earlier attempt was cut off when premise stopped, so its unfinished work is redone.",
        );
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
      recordSessionFigures(this.db, id, outcome);
      switch (outcome.kind) {
        case "done":
          this.closeJob(job, "done", outcome.summary);
          break;
        case "stuck":
          this.closeJob(job, "stuck", outcome.summary);
          break;
        case "stopped":
          if (this.stoppedForPause.has(id)) {
            const note = this.stoppedForPause.get(id) ?? null;
            this.stoppedForPause.delete(id);
            this.requeue(job, note);
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
    const existing = this.state();
    if (existing.paused && existing.cause !== "usage-limit") {
      // The person (or the setting) paused everything already: a usage limit never turns that into
      // a pause that ends by itself. The job goes back to the queue, and the pause stays theirs.
      recordEvent(this.db, {
        module: "queue",
        kind: "usage-limit-during-pause",
        detail: { reason },
      });
      return;
    }
    const fallback = this.options.config.queue.usage_pause_fallback_minutes;
    const nowMs = this.clock().getTime();
    const given = resetAt === null ? Number.NaN : Date.parse(resetAt);
    const resumeAt = given > nowMs ? resetAt! : new Date(nowMs + fallback * 60_000).toISOString();
    const state: QueueState = {
      paused: true,
      reason,
      resumeAt,
      cause: "usage-limit",
      mode: null,
      pausedAt: this.clock().toISOString(),
    };
    this.setState(state);
    this.armResumeTimer(state);
    recordEvent(this.db, { module: "queue", kind: "queue-paused", detail: { reason, resumeAt } });
    for (const [id, session] of this.running) {
      if (session) {
        this.stoppedForPause.set(id, null);
        session.stop();
      }
    }
  }

  /** Pause all agent work, for example on a usage-limit event. Running sessions stop cleanly. */
  pauseAll(reason: string, resetAt: string | null = null): void {
    this.pauseAllInside(reason, resetAt);
  }

  /**
   * "Pause everything", from a person (or the "start paused" setting). Nothing new starts, in any
   * software, until resume. "finish" lets running sessions end by themselves; "stop-now" stops them,
   * and their jobs go back to the queue to be redone later. The pause is stored, so it survives a
   * restart. Pausing again changes the mode (finish to stop-now stops the sessions still running).
   */
  pauseEverything(mode: PauseMode, cause: "person" | "setting" = "person"): QueueState {
    const before = this.state();
    this.clearResumeTimer();
    const reason =
      cause === "setting"
        ? "premise is set to start paused (the queue.start_paused setting)."
        : "You paused everything.";
    const state: QueueState = {
      paused: true,
      reason,
      resumeAt: null,
      cause,
      mode: cause === "setting" ? null : mode,
      pausedAt:
        before.paused && before.cause !== "usage-limit"
          ? (before.pausedAt ?? this.clock().toISOString())
          : this.clock().toISOString(),
    };
    this.setState(state);
    recordEvent(this.db, {
      module: "queue",
      kind: "queue-paused",
      detail: { reason, mode, cause },
    });
    if (mode === "stop-now" && cause === "person") this.stopRunningSessions();
    this.notifyChanged();
    return state;
  }

  /** Stop every running agent session now and put its job back; their unfinished work is redone later. */
  private stopRunningSessions(): number {
    let stopped = 0;
    for (const [id, session] of this.running) {
      if (!session) continue;
      this.stoppedForPause.set(
        id,
        "An earlier attempt was stopped when everything was paused, so its unfinished work is redone.",
      );
      session.stop();
      stopped++;
    }
    return stopped;
  }

  /** Start the work again after a pause, whoever paused (resuming over a usage limit may pause again at once). */
  resumeEverything(): QueueState {
    this.resumeAll();
    this.notifyChanged();
    this.tick();
    return this.state();
  }

  resumeAll(): void {
    this.clearResumeTimer();
    this.setState({
      paused: false,
      reason: null,
      resumeAt: null,
      cause: null,
      mode: null,
      pausedAt: null,
    });
    recordEvent(this.db, { module: "queue", kind: "queue-resumed" });
  }

  /**
   * When premise starts: honour the stored pause (it stays), and the "start paused" setting (which
   * pauses when nothing did). Returns what the start found.
   */
  applyStartPolicy(startPaused: boolean): QueueState {
    const state = this.state();
    if (!state.paused && startPaused) return this.pauseEverything("finish", "setting");
    return state;
  }

  /** premise is stopping: nothing new starts; the running work is left to end. Not stored. */
  beginStopping(): void {
    this.stopping = true;
    this.clearResumeTimer();
    this.notifyChanged();
  }

  isStopping(): boolean {
    return this.stopping;
  }

  /** Stop every running agent session now (the second Ctrl+C, or `premise stop --now`). */
  stopRunningNow(): number {
    return this.stopRunningSessions();
  }

  /** What is paused, what is still finishing, and whether it is safe to close. */
  pauseStatus(): PauseStatus {
    const state = this.state();
    const stillRunning = this.runningJobs();
    return {
      paused: state.paused,
      cause: state.cause ?? null,
      mode: state.mode ?? null,
      reason: state.reason,
      resumeAt: state.resumeAt,
      pausedAt: state.pausedAt ?? null,
      stopping: this.stopping,
      stillRunning,
      safeToClose: stillRunning.length === 0,
    };
  }

  /**
   * The computer was asleep for gapMs. Sessions that were running are looked at: one that is no
   * longer alive is ended and its job goes back to the queue, to carry on where the runtime can.
   * Returns the jobs restarted and how many sessions were checked.
   */
  checkAfterSuspend(gapMs: number): { checked: number; restarted: Job[] } {
    const restarted: Job[] = [];
    let checked = 0;
    for (const [id, session] of this.running) {
      if (!session) continue;
      checked++;
      if (session.alive?.() !== false) continue;
      this.stoppedForPause.set(
        id,
        "An earlier attempt died while the computer was asleep, so it is started again.",
      );
      session.stop();
      // A dead session may never report: end it here, so the job does not look busy for ever.
      this.abandon.get(id)?.();
      const job = this.get(id);
      if (job) restarted.push(job);
    }
    recordEvent(this.db, {
      module: "queue",
      kind: "suspend-noticed",
      detail: {
        gapSeconds: Math.round(gapMs / 1000),
        checked,
        restarted: restarted.map((j) => j.id),
      },
    });
    return { checked, restarted };
  }

  private notifyChanged(): void {
    this.options.onPauseChange?.();
  }

  private notify(id: number): void {
    const job = this.get(id);
    // Whoever is told decides which piece's lane the change belongs to (decision 0313).
    if (job) outsideLanes(() => this.options.onChange?.(job));
  }
}
