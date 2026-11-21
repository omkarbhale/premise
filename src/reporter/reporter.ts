import type { AgentOutcome } from "../agents/agent-runner.js";
import type { Job } from "../queue/work-queue.js";
import type { ReportView } from "../shared/api-types.js";
import { type ReportService, ServiceError } from "../server/services.js";
import { type Database, now, recordEvent } from "../storage/database.js";
import { buildReport, draftReleaseNotes } from "./build.js";
import { type FactSources, gatherFacts } from "./facts.js";
import type { PremiseConfig } from "../config/settings.js";

/**
 * The reporter (docs/specs/reporter.md). It writes a report each time a change reaches running and
 * each milestone report, always from recorded facts, and serves the report view, which is always
 * current. The wording is the facts' own; no agent rewrites them (decision 0164).
 */

export type ReportTrigger =
  "change-running" | "milestone" | "do-not-build" | "work-stopped" | "paused";

export interface WrittenReport {
  id: number;
  trigger: ReportTrigger;
  written: string;
  view: ReportView;
  releaseNotes: string | null;
}

export class Reporter implements ReportService {
  constructor(
    private readonly sources: FactSources,
    private readonly config: Pick<PremiseConfig, "reports">,
  ) {}

  private get db(): Database {
    return this.sources.db;
  }

  private lastWritten(softwareId: string): string | null {
    return (
      (
        this.db
          .prepare(
            "SELECT time AS written FROM events WHERE software_id = ? AND module IN ('reporter') AND kind = 'report-written' ORDER BY id DESC LIMIT 1",
          )
          .get(softwareId) as { written: string } | undefined
      )?.written ?? null
    );
  }

  private require(softwareId: string): void {
    const found = this.db.prepare("SELECT 1 FROM softwares WHERE id = ?").get(softwareId);
    if (!found) throw new ServiceError("NOT_FOUND", "There is no software with that id.");
  }

  /** The report view: built now from the facts as they are now. */
  async view(softwareId: string, options: { detail?: boolean } = {}): Promise<ReportView> {
    this.require(softwareId);
    const facts = await gatherFacts(this.sources, softwareId);
    return buildReport(facts, {
      detail: options.detail === true,
      maxLines: this.config.reports.max_lines,
      written: this.lastWritten(softwareId),
    });
  }

  /**
   * Write and keep a report. The full report is kept (the short form is a view of it), together
   * with the release notes for the change when it reached running. Records the event the page
   * and the event stream pick up.
   */
  async write(
    softwareId: string,
    trigger: ReportTrigger,
    reference?: string,
  ): Promise<WrittenReport> {
    this.require(softwareId);
    const facts = await gatherFacts(
      this.sources,
      softwareId,
      trigger === "milestone" && reference ? { milestone: reference } : {},
    );
    const written = now();
    const view = buildReport(facts, {
      detail: true,
      maxLines: this.config.reports.max_lines,
      written,
    });
    const commit = trigger === "change-running" ? (reference ?? facts.runs[0]?.commit) : undefined;
    const releaseNotes = commit ? draftReleaseNotes(facts, commit) : null;
    const id = Number(
      this.db
        .prepare(
          "INSERT INTO reports (software_id, trigger, reference, written, view, release_notes) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          softwareId,
          trigger,
          reference ?? commit ?? null,
          written,
          JSON.stringify(view),
          releaseNotes,
        ).lastInsertRowid,
    );
    const eventId = recordEvent(this.db, {
      softwareId,
      module: "reporter",
      kind: "report-written",
      reference: String(id),
      detail: { trigger },
    });
    // One time for the report and its event, so the page's "written" matches the stored report.
    const time = (
      this.db.prepare("SELECT time FROM events WHERE id = ?").get(eventId) as { time: string }
    ).time;
    this.db.prepare("UPDATE reports SET written = ? WHERE id = ?").run(time, id);
    return { id, trigger, written: time, view: { ...view, written: time }, releaseNotes };
  }

  /** Reports written for a software, newest first. */
  history(softwareId: string, limit = 20): WrittenReport[] {
    const rows = this.db
      .prepare(
        "SELECT id, trigger, written, view, release_notes FROM reports WHERE software_id = ? ORDER BY id DESC LIMIT ?",
      )
      .all(softwareId, limit) as unknown as {
      id: number;
      trigger: ReportTrigger;
      written: string;
      view: string;
      release_notes: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      written: r.written,
      view: JSON.parse(r.view) as ReportView,
      releaseNotes: r.release_notes,
    }));
  }

  /**
   * The handler for a "report" job, for a line engine that does this part on the server rather
   * than by an agent. The job's payload may carry { trigger, reference }.
   */
  async handleReportJob(job: Job): Promise<AgentOutcome> {
    const trigger = (job.payload.trigger as ReportTrigger | undefined) ?? "change-running";
    const reference = typeof job.payload.reference === "string" ? job.payload.reference : undefined;
    try {
      const report = await this.write(job.softwareId, trigger, reference);
      return { kind: "done", summary: `Report ${report.id} written.` };
    } catch (error) {
      const message = (error as Error).message;
      return {
        kind: "failed",
        summary: message,
        failureSignature: `report:${message.slice(0, 120)}`,
      };
    }
  }
}
