import type { Job, WorkQueue } from "../queue/work-queue.js";
import type { ActivityView, JobView } from "../shared/api-types.js";
import type { Database } from "../storage/database.js";
import { type ActivityService, ServiceError } from "./services.js";

const RECENT_JOBS = 10;

/** What agents are doing now, read from the work queue (docs/specs/work-queue.md). */
export class QueueActivity implements ActivityService {
  constructor(
    private readonly db: Database,
    private readonly queue: WorkQueue,
    private readonly maxAgentSessions: () => number,
  ) {}

  private names(): Map<string, string> {
    const rows = this.db.prepare("SELECT id, name FROM softwares").all() as {
      id: string;
      name: string;
    }[];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private lastProgress(jobId: number): string | null {
    const row = this.db
      .prepare(
        "SELECT detail FROM events WHERE module = 'agent' AND kind = 'progress' AND reference = ? ORDER BY id DESC LIMIT 1",
      )
      .get(String(jobId)) as { detail: string | null } | undefined;
    if (!row?.detail) return null;
    try {
      const detail = JSON.parse(row.detail) as { text?: unknown };
      return typeof detail.text === "string" ? detail.text : null;
    } catch {
      return null;
    }
  }

  private jobView(job: Job, names: Map<string, string>): JobView {
    const finished = ["done", "stuck", "failed", "stopped"].includes(job.status);
    return {
      id: job.id,
      softwareId: job.softwareId,
      softwareName: names.get(job.softwareId) ?? "a removed software",
      kind: job.kind,
      stage: job.stage,
      status: job.status,
      line: finished ? job.result : (this.lastProgress(job.id) ?? job.note),
      waitingOn: job.waitingOn,
      attempts: job.attempts,
      started: job.started,
      finished: job.finished,
    };
  }

  async view(): Promise<ActivityView> {
    const names = this.names();
    const toView = (jobs: Job[]) => jobs.map((j) => this.jobView(j, names));
    const state = this.queue.state();
    const finished = (
      this.db
        .prepare(
          "SELECT id FROM jobs WHERE status IN ('done', 'stuck', 'failed', 'stopped') ORDER BY finished DESC, id DESC LIMIT ?",
        )
        .all(RECENT_JOBS) as { id: number }[]
    ).map((r) => this.queue.get(r.id)!);
    return {
      maxAgentSessions: this.maxAgentSessions(),
      runningAgentSessions: this.queue.runningAgentSessions(),
      paused: state.paused,
      pausedReason: state.reason,
      resumeAt: state.resumeAt,
      running: toView(this.queue.list("running")),
      waiting: toView([...this.queue.list("waiting"), ...this.queue.list("paused")]),
      queued: toView(this.queue.list("queued")),
      recent: toView(finished),
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
