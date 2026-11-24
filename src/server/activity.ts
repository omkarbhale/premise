import type { Job, WorkQueue } from "../queue/work-queue.js";
import type { ActivityView, JobView } from "../shared/api-types.js";
import { type ItemText, jobAnswers, jobDoing, jobItems } from "../line/working-on.js";
import { type Ask, listAsks } from "../storage/asks.js";
import type { Database } from "../storage/database.js";
import { type ActivityService, ServiceError } from "./services.js";

const RECENT_JOBS = 10;

/** What agents are doing now, read from the work queue (docs/specs/work-queue.md). */
export class QueueActivity implements ActivityService {
  constructor(
    private readonly db: Database,
    private readonly queue: WorkQueue,
    private readonly maxAgentSessions: () => number,
    /** Record item words, so each job says what it serves (decision 0310). */
    private readonly itemText: ItemText = () => undefined,
    /** One line per software with work: what runs now and what is next (decision 0320). */
    private readonly lines?: () => Promise<NonNullable<ActivityView["lines"]>>,
  ) {}

  private names(): Map<string, string> {
    const rows = this.db.prepare("SELECT id, name FROM softwares").all() as {
      id: string;
      name: string;
    }[];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Each live job's latest progress line, read in one query rather than one per job. */
  private lastProgress(jobIds: number[]): Map<number, string> {
    const lines = new Map<number, string>();
    if (jobIds.length === 0) return lines;
    const rows = this.db
      .prepare(
        `SELECT e.reference AS reference, e.detail AS detail FROM events e
           JOIN (SELECT reference, MAX(id) AS id FROM events
                  WHERE module = 'agent' AND kind = 'progress' AND reference IN (${jobIds.map(() => "?").join(", ")})
                  GROUP BY reference) latest ON latest.id = e.id`,
      )
      .all(...jobIds.map(String)) as { reference: string; detail: string | null }[];
    for (const row of rows) {
      if (!row.detail) continue;
      try {
        const detail = JSON.parse(row.detail) as { text?: unknown };
        if (typeof detail.text === "string") lines.set(Number(row.reference), detail.text);
      } catch {
        // A progress line that cannot be read is left out; the job's note stands in.
      }
    }
    return lines;
  }

  /**
   * Jobs as the page shows them. What every job needs (names, asks, progress lines, record words)
   * is read once for the whole list, not once per job (decision 0340).
   */
  jobViews(jobs: Job[]): JobView[] {
    const names = this.names();
    const finished = (job: Job) => ["done", "stuck", "failed", "stopped"].includes(job.status);
    const progress = this.lastProgress(jobs.filter((j) => !finished(j)).map((j) => j.id));
    const asks = new Map<string, Ask[]>();
    const asksOf = (softwareId: string) => {
      let list = asks.get(softwareId);
      if (!list) asks.set(softwareId, (list = listAsks(this.db, { softwareId })));
      return list;
    };
    const words = new Map<string, string | undefined>();
    const itemText: ItemText = (softwareId, item) => {
      const key = `${softwareId}\u0000${item}`;
      if (!words.has(key)) words.set(key, this.itemText(softwareId, item));
      return words.get(key);
    };
    return jobs.map((job) => ({
      id: job.id,
      softwareId: job.softwareId,
      softwareName: names.get(job.softwareId) ?? "a removed software",
      kind: job.kind,
      stage: job.stage,
      status: job.status,
      line: finished(job) ? job.result : (progress.get(job.id) ?? job.note),
      doing: jobDoing(job),
      items: jobItems(job, itemText),
      answers: jobAnswers(job, asksOf(job.softwareId)),
      waitingOn: job.waitingOn,
      attempts: job.attempts,
      started: job.started,
      finished: job.finished,
    }));
  }

  async view(): Promise<ActivityView> {
    const state = this.queue.state();
    const finished = (
      this.db
        .prepare(
          "SELECT id FROM jobs WHERE status IN ('done', 'stuck', 'failed', 'stopped') ORDER BY finished DESC, id DESC LIMIT ?",
        )
        .all(RECENT_JOBS) as { id: number }[]
    ).map((r) => this.queue.get(r.id)!);
    const running = this.queue.list("running");
    const waiting = [...this.queue.list("waiting"), ...this.queue.list("paused")];
    const queued = this.queue.list("queued");
    const views = this.jobViews([...running, ...waiting, ...queued, ...finished]);
    let at = 0;
    const take = (n: number) => views.slice(at, (at += n));
    return {
      maxAgentSessions: this.maxAgentSessions(),
      runningAgentSessions: this.queue.runningAgentSessions(),
      paused: state.paused,
      pausedReason: state.reason,
      resumeAt: state.resumeAt,
      running: take(running.length),
      waiting: take(waiting.length),
      queued: take(queued.length),
      recent: take(finished.length),
      ...(this.lines && { lines: await this.lines() }),
    };
  }

  async stopJob(id: number): Promise<void> {
    const job = this.queue.get(id);
    if (!job)
      throw new ServiceError("NOT_FOUND", `There is no job ${id}. It may have been removed.`);
    if (["done", "stuck", "failed", "stopped"].includes(job.status)) {
      throw new ServiceError("INVALID", `Job ${id} has already ended (${job.status}).`);
    }
    this.queue.stop(id);
  }
}
