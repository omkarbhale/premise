import type { WorkQueue } from "../queue/work-queue.js";
import { ServiceError } from "../server/services.js";
import type { AskView, SoftwareDetail, SoftwareSummary } from "../shared/api-types.js";
import type { Database } from "../storage/database.js";
import {
  type Software,
  getSoftware,
  setSoftwareArchived,
  setSoftwarePaused,
} from "../storage/softwares.js";

/**
 * Looking after several softwares at once (decision 0197): pausing and resuming a software,
 * archiving a finished or abandoned one and restoring it, and the order the software list is shown
 * in. The line engine owns each software's line; this part owns only what is across softwares.
 * Nothing here deletes a software: archiving keeps everything.
 */

export interface PortfolioOptions {
  db: Database;
  queue: WorkQueue;
  /** Stop a software's running copy, when one is running (archiving does this). */
  stopRunning?: (softwareId: string) => Promise<unknown>;
}

const PAUSED_STATUS =
  "Paused by you. Nothing new starts for it until you resume it; anything it asked stays answerable.";

/**
 * Where a software goes in the list: what needs you first, then what is working, then what is
 * paused, then what is finished or ended. Lower comes first.
 */
function rank(s: SoftwareSummary, finished: ReadonlySet<string>): number {
  if (s.openAsks > 0 || s.state === "waiting-milestone") return 0;
  if (s.paused) return 2;
  if (s.state === "ended" || finished.has(s.id)) return 3;
  return 1;
}

/** Needs you, working, paused, finished; then the most important first, then the oldest. */
export function orderSoftwares(
  list: SoftwareSummary[],
  finished: ReadonlySet<string> = new Set(),
): SoftwareSummary[] {
  return [...list].sort(
    (a, b) =>
      rank(a, finished) - rank(b, finished) ||
      a.priority - b.priority ||
      a.created.localeCompare(b.created),
  );
}

export class Portfolio {
  private readonly db: Database;

  constructor(private readonly options: PortfolioOptions) {
    this.db = options.db;
  }

  private require(id: string): Software {
    const software = getSoftware(this.db, id);
    if (!software) throw new ServiceError("NOT_FOUND", "There is no software with that id.");
    return software;
  }

  /** Jobs of a software that are not finished: queued, running or waiting. */
  private openJobs(id: string): number {
    return (
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM jobs WHERE software_id = ? AND status IN ('queued', 'running', 'waiting')",
        )
        .get(id) as { n: number }
    ).n;
  }

  /** At the end of the line with nothing left to do. */
  private finished(software: Software): boolean {
    return software.currentStage === "intake" && this.openJobs(software.id) === 0;
  }

  /**
   * Whether a software can be archived now: when it is finished (nothing left to do), ended, or
   * paused by you (abandoned). Otherwise the reason, with what to do.
   */
  archivable(software: Software): { ok: boolean; why: string } {
    if (software.archivedAt) return { ok: false, why: "It is archived already." };
    if (software.state === "ended") return { ok: true, why: "It was ended." };
    if (software.pausedAt) return { ok: true, why: "It is paused." };
    if (this.finished(software)) {
      return { ok: true, why: "It reached the end of the line." };
    }
    return {
      ok: false,
      why: "It is still being worked on. Pause it first if you want to stop it, then archive it.",
    };
  }

  /** The software list: archived ones only when asked, each marked, in the order to show. */
  decorate(list: SoftwareSummary[], options: { archived?: boolean } = {}): SoftwareSummary[] {
    const shown: SoftwareSummary[] = [];
    const finished = new Set<string>();
    for (const summary of list) {
      const software = getSoftware(this.db, summary.id);
      if (!software) continue;
      const archived = software.archivedAt !== null;
      if (archived !== (options.archived === true)) continue;
      if (this.finished(software)) finished.add(software.id);
      shown.push(this.mark(summary, software));
    }
    return orderSoftwares(shown, finished);
  }

  /** One software's summary or detail, marked paused, archived and archivable. */
  mark<T extends SoftwareSummary | SoftwareDetail>(summary: T, given?: Software): T {
    const software = given ?? this.require(summary.id);
    const paused = software.pausedAt !== null;
    return {
      ...summary,
      ...(paused && summary.openAsks === 0 && { status: PAUSED_STATUS }),
      paused,
      archived: software.archivedAt !== null,
      archivable: this.archivable(software),
    };
  }

  /** Open asks of archived softwares stay kept but do not show as waiting on you. */
  shownAsks(asks: AskView[]): AskView[] {
    const archived = new Set(
      (
        this.db.prepare("SELECT id FROM softwares WHERE archived_at IS NOT NULL").all() as {
          id: string;
        }[]
      ).map((r) => r.id),
    );
    return archived.size === 0 ? asks : asks.filter((a) => !archived.has(a.softwareId));
  }

  /** Pause a software: its running agent sessions stop and give their slots to others. */
  pause(id: string): void {
    const software = this.require(id);
    if (software.archivedAt) {
      throw new ServiceError("INVALID", "It is archived. Restore it first.");
    }
    if (software.pausedAt) return;
    setSoftwarePaused(this.db, id, "paused by the operator");
    this.options.queue.releaseSoftware(id);
    this.options.queue.tick();
  }

  resume(id: string): void {
    const software = this.require(id);
    if (software.archivedAt) {
      throw new ServiceError("INVALID", "It is archived. Restore it first.");
    }
    if (!software.pausedAt) return;
    setSoftwarePaused(this.db, id, null);
    this.options.queue.tick();
  }

  /**
   * Archive a finished or abandoned software: kept, hidden from the main list, restorable. Its
   * running copy stops. Nothing is deleted.
   */
  async archive(id: string): Promise<void> {
    const software = this.require(id);
    const can = this.archivable(software);
    if (!can.ok) throw new ServiceError("INVALID", `It cannot be archived now. ${can.why}`);
    this.options.queue.releaseSoftware(id);
    setSoftwareArchived(this.db, id, true);
    await this.options.stopRunning?.(id);
    this.options.queue.tick();
  }

  /** Restore an archived software to the main list, as it was when archived. */
  restore(id: string): void {
    const software = this.require(id);
    if (!software.archivedAt) return;
    setSoftwareArchived(this.db, id, false);
    this.options.queue.tick();
  }
}
