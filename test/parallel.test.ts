import { describe, expect, it } from "vitest";
import {
  type Footprint,
  type InFlight,
  cleanTouches,
  decideFlight,
  partsOverlap,
  sharedParts,
} from "../src/line/parallel.js";
import { readSizing } from "../src/line/sizing.js";
import { testConfig, tempFolder } from "./helpers.js";

/** Whether two pieces of one software may be built at once (decision 0313). */

const piece = (item: number, touches: string[], foundation = false): Footprint => ({
  item,
  label: `I-${item}`,
  touches,
  foundation,
});
const flying = (
  item: number,
  touches: string[],
  building = true,
  foundation = false,
): InFlight => ({
  ...piece(item, touches, foundation),
  building,
});

describe("what two pieces touch", () => {
  it("overlaps on the same folder, a file inside it, a module named on its own, or the whole software", () => {
    expect(partsOverlap("src/combat/", "src/combat")).toBe(true);
    expect(partsOverlap("./src/combat/**", "src/combat/shield.ts")).toBe(true);
    expect(partsOverlap("combat", "src/combat/shield.ts")).toBe(true);
    expect(partsOverlap("shield", "src/combat/shield.ts")).toBe(true);
    expect(partsOverlap("W-4", "w-4")).toBe(true);
    expect(partsOverlap("everything", "src/sound")).toBe(true);
    expect(partsOverlap("src/combat", "src/combatant")).toBe(false);
    expect(partsOverlap("src/sound/", "src/combat/")).toBe(false);
    expect(partsOverlap("W-4", "W-40")).toBe(false);
  });

  it("names what both touch by the more general name, once", () => {
    expect(sharedParts(["src/combat/shield.ts", "W-2"], ["src/combat/", "W-2"])).toEqual([
      "src/combat/",
      "W-2",
    ]);
    expect(cleanTouches([" src/a ", "src/a/", 3, "", "W-1"])).toEqual(["src/a", "W-1"]);
  });
});

describe("deciding whether a piece is built now or waits", () => {
  it("starts at once when nothing else is in flight", () => {
    expect(decideFlight(piece(2, ["src/sound"]), [], 2)).toMatchObject({ go: true });
  });

  it("builds alongside a piece that touches other parts, and says so", () => {
    const decision = decideFlight(piece(2, ["src/sound"]), [flying(1, ["src/combat"])], 2);
    expect(decision).toEqual({
      go: true,
      reason:
        "Built alongside I-1: they change different parts (this one: src/sound; I-1: src/combat).",
    });
  });

  it("waits for a piece that touches the same part, naming it", () => {
    const decision = decideFlight(
      piece(2, ["src/combat/armour.ts"]),
      [flying(1, ["src/combat"])],
      2,
    );
    expect(decision).toEqual({
      go: false,
      waitsFor: [1],
      reason: "Waits for I-1: both change src/combat.",
    });
  });

  it("goes one after another when premise does not know what either touches", () => {
    expect(decideFlight(piece(2, []), [flying(1, ["src/combat"])], 2)).toMatchObject({
      go: false,
      waitsFor: [1],
    });
    expect(decideFlight(piece(2, ["src/sound"]), [flying(1, [])], 2)).toMatchObject({
      go: false,
      waitsFor: [1],
    });
  });

  it("lets a piece that changes a foundation decision go alone, both ways", () => {
    expect(decideFlight(piece(2, ["src/db"], true), [flying(1, ["src/ui"])], 2)).toMatchObject({
      go: false,
      reason: expect.stringContaining("foundation decision everything else builds on"),
    });
    expect(
      decideFlight(piece(2, ["src/ui"]), [flying(1, ["src/db"], true, true)], 2),
    ).toMatchObject({ go: false, reason: expect.stringContaining("foundation decision") });
  });

  it("keeps to the most pieces a software may build at once", () => {
    const decision = decideFlight(
      piece(3, ["src/c"]),
      [flying(1, ["src/a"]), flying(2, ["src/b"])],
      2,
    );
    expect(decision).toMatchObject({ go: false, waitsFor: [1, 2] });
    expect(decision.reason).toContain("the most this software builds at once");
    expect(
      decideFlight(piece(3, ["src/c"]), [flying(1, ["src/a"]), flying(2, ["src/b"])], 3),
    ).toMatchObject({ go: true });
  });

  it("lets a waiting piece keep its turn: a later one that overlaps it waits too", () => {
    const decision = decideFlight(
      piece(3, ["src/combat/armour.ts"]),
      [flying(1, ["src/sound"]), flying(2, ["src/combat"], false)],
      3,
    );
    expect(decision).toMatchObject({ go: false, waitsFor: [2] });
  });
});

describe("the sizer says what a piece touches", () => {
  const config = testConfig(tempFolder());
  const intake = { kind: "intake" as const, origin: "bug" as const, parentId: 1 };
  const base = {
    size: "small",
    size_reason: "Small.",
    stages: ["build", "check", "run", "report"],
    stages_reason: "A bug.",
    split: [],
    split_reason: "Whole.",
  };

  it("keeps the parts it names and whether it changes a foundation decision", () => {
    const read = readSizing(
      intake,
      { ...base, touches: ["src/combat/", " src/combat ", "W-2"], changes_foundation: "yes" },
      config,
    );
    expect(read).toMatchObject({
      proposal: { touches: ["src/combat/", "W-2"], foundation: true },
    });
  });

  it("takes none as not known, and refuses touches that are not a list", () => {
    expect(readSizing(intake, base, config)).toMatchObject({
      proposal: { touches: [], foundation: false },
    });
    expect(readSizing(intake, { ...base, touches: "src/combat" }, config)).toMatchObject({
      problems: [expect.stringContaining('"touches" as a list')],
    });
  });
});
