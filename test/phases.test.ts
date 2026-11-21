import { describe, expect, it } from "vitest";
import { PHASES, STAGE_IDS, phaseOf, whereNow } from "../src/shared/stages.js";

describe("phases", () => {
  it("cover every stage exactly once, in line order", () => {
    expect(PHASES.flatMap((p: { stages: readonly string[] }) => p.stages)).toEqual([...STAGE_IDS]);
  });

  it("map stages to phases", () => {
    expect(phaseOf("who")).toBe("understand");
    expect(phaseOf("plan")).toBe("understand");
    expect(phaseOf("check")).toBe("build");
    expect(phaseOf("intake")).toBe("running");
  });

  it("says where a software is in plain words", () => {
    expect(whereNow("who")).toBe("Understanding what you want: drafting who it is for");
    expect(whereNow("nonsense")).toBe("Understanding what you want");
  });
});
