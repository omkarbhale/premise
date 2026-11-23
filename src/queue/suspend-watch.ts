/**
 * Notices that the computer was asleep (decision 0290). A timer ticks every few seconds; when the
 * clock has jumped far more than the tick, the computer was suspended, and premise looks at the
 * sessions that were running. The clock is injectable, so a test can make a night pass in no time.
 */
export class SuspendWatch {
  private timer: NodeJS.Timeout | null = null;
  private last: number;

  constructor(
    private readonly options: {
      /** How far the clock may jump beyond one tick before it counts as asleep. */
      gapMs: number;
      intervalMs?: number;
      clock?: () => number;
      /** Called with how long the computer was away. */
      onSuspend: (asleepMs: number) => void;
    },
  ) {
    this.last = this.now();
  }

  private now(): number {
    return (this.options.clock ?? Date.now)();
  }

  start(): void {
    this.last = this.now();
    this.timer = setInterval(() => this.tick(), this.options.intervalMs ?? 5000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One look at the clock; the timer calls it, and a test may too. */
  tick(): void {
    const now = this.now();
    const elapsed = now - this.last;
    this.last = now;
    const expected = this.options.intervalMs ?? 5000;
    if (elapsed - expected >= this.options.gapMs) this.options.onSuspend(elapsed);
  }
}
