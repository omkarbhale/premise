import { describe, expect, it } from "vitest";
import {
  checkOperatorWords,
  inOwnWords,
  readDraftItems,
  sameWords,
  toAskItem,
} from "../src/line/draft-items.js";

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

describe("provenance: from operator only for the operator's own words", () => {
  const said = "A small page where I keep my reading list, with the books I want to read next.";
  it("keeps the operator's mark on their own words, and marks what was added as assumed", () => {
    const items = checkOperatorWords(
      [
        { text: "Keep my reading list on a small page.", from: "operator" },
        { text: "Books I want to read next.", from: "operator" },
        { text: "Share the list with friends by email link.", from: "operator" },
        { text: "Export to a spreadsheet.", from: "assumed" },
      ],
      said,
    );
    expect(items.map((i) => i.from)).toEqual(["operator", "operator", "assumed", "assumed"]);
  });

  it("keeps a plain paraphrase of the operator's words as theirs", () => {
    const idea =
      "A small command-line tool that counts the lines, words and characters of a text file.";
    expect(inOwnWords("It prints the number of lines and characters in a text file.", idea)).toBe(
      true,
    );
  });

  it("treats a line with a clause the drafter added as not the operator's own", () => {
    expect(
      inOwnWords("Keep my reading list, synced across devices through a cloud account.", said),
    ).toBe(false);
  });
});

describe("the same item, compared loosely", () => {
  it("ignores case, spacing, a suggestion lead and closing punctuation", () => {
    expect(sameWords("Suggestion: Use  SQLite.")).toBe(sameWords("use sqlite"));
    expect(sameWords("Use SQLite.")).not.toBe(sameWords("Use Postgres."));
  });
});
