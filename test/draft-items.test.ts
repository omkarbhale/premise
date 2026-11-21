import { describe, expect, it } from "vitest";
import { readDraftItems, toAskItem } from "../src/line/draft-items.js";

describe("draft items", () => {
  it("show 'Suggestion:' once, as the mark, not also in the sentence", () => {
    const [item] = readDraftItems(["Suggestion: show a count of books read."], {
      defaultKind: "W",
      allowed: ["W"],
    });
    const shown = toAskItem(item!);
    expect(shown.mark).toBe("suggestion");
    expect(shown.text).toBe("should: show a count of books read.");
    expect(shown.text).not.toMatch(/suggestion/i);
  });
});
