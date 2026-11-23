import type { Job, PauseStatus, WorkQueue } from "../queue/work-queue.js";
import type { PauseView, SleepView, StartupView } from "../shared/api-types.js";
import type { Database } from "../storage/database.js";
import type { PauseService } from "./services.js";

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/**
 * Pausing and resuming the whole of premise (decision 0290): the page's "Pause everything" and
 * "Resume", what the banner says, and what the last start and the last sleep found. The queue holds
 * the state; this says it in plain words.
 */
export class Pausing implements PauseService {
  private startup: StartupView | null = null;
  private sleep: SleepView | null = null;

  constructor(
    private readonly options: {
      db: Database;
      queue: WorkQueue;
      jobViews: (jobs: Job[]) => PauseView["stillFinishing"];
      /** The built softwares premise is running now. */
      runningSoftwares: () => string[];
    },
  ) {}

  private names(ids: string[]): { softwareId: string; name: string }[] {
    return ids.map((softwareId) => ({
      softwareId,
      name:
        (
          this.options.db.prepare("SELECT name FROM softwares WHERE id = ?").get(softwareId) as
            { name: string } | undefined
        )?.name ?? "a removed software",
    }));
  }

  /** Say where things stand, in one sentence a person can act on. */
  static headline(status: PauseStatus, resumeText: string | null): string {
    const running = status.stillRunning.length;
    const finishing = `${plural(running, "job")} still finishing`;
    if (status.stopping) {
      return running === 0
        ? "premise is stopping now."
        : `premise is stopping: nothing new starts, and it ends once ${plural(running, "running job")} finish${running === 1 ? "es" : ""}. It is safe to close it then.`;
    }
    if (!status.paused) return "Everything is running.";
    if (status.cause === "usage-limit") {
      return `All agent work is paused because the subscription's usage limit was reached${resumeText ? `; it starts again around ${resumeText}` : ""}. You can press Resume to try sooner.`;
    }
    const start =
      status.cause === "setting"
        ? "premise started paused. Nothing runs until you press Resume."
        : "Everything is paused. Nothing new starts in any software.";
    if (running > 0) {
      return `${start} ${finishing}; it is safe to close premise once they end. Questions can still be answered.`;
    }
    if (status.mode === "stop-now") {
      return `${start} The sessions that were running were stopped, and their unfinished work is redone after Resume. It is safe to close premise now: it will start paused next time. Questions can still be answered.`;
    }
    return `${start} It is safe to close premise now${status.cause === "setting" ? "" : "; it will start paused next time"}. Questions can still be answered.`;
  }

  async view(): Promise<PauseView> {
    const status = this.options.queue.pauseStatus();
    const resumeText = status.resumeAt
      ? new Date(status.resumeAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : null;
    return {
      paused: status.paused,
      cause: status.cause,
      mode: status.mode,
      reason: status.reason,
      resumeAt: status.resumeAt,
      pausedAt: status.pausedAt,
      stopping: status.stopping,
      stillFinishing: this.options.jobViews(status.stillRunning),
      safeToClose: status.safeToClose,
      runningSoftwares: this.names(this.options.runningSoftwares()),
      headline: Pausing.headline(status, resumeText),
    };
  }

  async pause(mode: "finish" | "stop-now"): Promise<PauseView> {
    this.options.queue.pauseEverything(mode, "person");
    return this.view();
  }

  async resume(): Promise<PauseView> {
    this.options.queue.resumeEverything();
    return this.view();
  }

  /** What the last start picked up (null on a first start, when there is nothing to say). */
  setStartup(startup: StartupView | null): void {
    this.startup = startup;
  }

  startupView(): StartupView | null {
    return this.startup;
  }

  setSleep(sleep: SleepView | null): void {
    this.sleep = sleep;
  }

  sleepView(): SleepView | null {
    return this.sleep;
  }
}
