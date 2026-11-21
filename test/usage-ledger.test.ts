import { describe, expect, it } from "vitest";
import { MockUsageLedger, createUsageLedger } from "../src/usage-ledger/mock-usage-ledger.js";

const clock = () => new Date("2026-11-21T10:00:00Z"); // a Saturday

describe("usage-ledger mock", () => {
  it("gives the same figures every time in mock-fixed mode, each marked mocked", async () => {
    const ledger = new MockUsageLedger("mock-fixed", 1, clock);
    const a = await ledger.softwareUsage("x");
    const b = await new MockUsageLedger("mock-fixed", 2, clock).softwareUsage("x");
    expect(a).toEqual(b);
    expect(a.mocked).toBe(true);
    expect(await ledger.weeklyUsage()).toEqual({
      mocked: true,
      utilization: 0.42,
      windowStart: "2026-11-16T00:00:00.000Z",
      resetsAt: "2026-11-23T00:00:00.000Z",
    });
  });

  it("gives seeded random figures: the same seed gives the same figures", async () => {
    const one = await new MockUsageLedger("mock-random", 42, clock).softwareUsage("x");
    const again = await new MockUsageLedger("mock-random", 42, clock).softwareUsage("x");
    const other = await new MockUsageLedger("mock-random", 43, clock).softwareUsage("x");
    expect(one).toEqual(again);
    expect(one).not.toEqual(other);
    expect(one.mocked).toBe(true);
    expect(one.weeklyShare).toBeGreaterThanOrEqual(0);
    expect(one.weeklyShare).toBeLessThanOrEqual(1);
  });

  it("records each session against its task", async () => {
    const ledger = new MockUsageLedger("mock-fixed", 1, clock);
    await ledger.recordSession({
      sessionId: "s1",
      softwareId: "x",
      jobId: 1,
      taskKind: "build",
      stage: null,
      items: [],
    });
    expect(ledger.sessions).toHaveLength(1);
  });

  it("refuses the real usage-ledger, which is not built yet", () => {
    expect(() => createUsageLedger({ mode: "real", seed: null })).toThrow("not built yet");
    expect(createUsageLedger({ mode: "mock-random", seed: null }).mocked).toBe(true);
  });
});
