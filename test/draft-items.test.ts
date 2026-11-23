import { describe, expect, it } from "vitest";
import {
  checkOperatorQuotes,
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

describe("provenance: from operator only with a quote the operator said", () => {
  const sources = [
    "A small page where I keep my reading list, with the books I want to read next.",
    "Make it say Welcome back at the top",
  ];
  it("keeps the mark on a true quote, from any source, however it is spaced or cased", () => {
    const { items, downgraded } = checkOperatorQuotes(
      [
        { text: "Keep a reading list.", from: "operator", quote: "where I keep my  reading LIST" },
        { text: "A greeting.", from: "operator", quote: "say Welcome back at the top" },
      ],
      sources,
    );
    expect(items.map((i) => i.from)).toEqual(["operator", "operator"]);
    expect(downgraded).toBe(0);
  });

  it("marks a paraphrase with no quote, or a quote that is not there, as assumed", () => {
    const { items, downgraded } = checkOperatorQuotes(
      [
        { text: "Keep my reading list on a small page.", from: "operator" },
        { text: "Share the list with friends.", from: "operator", quote: "share it with friends" },
        { text: "Export to a spreadsheet.", from: "assumed" },
      ],
      sources,
    );
    expect(items.map((i) => i.from)).toEqual(["assumed", "assumed", "assumed"]);
    expect(items.some((i) => i.quote)).toBe(false);
    expect(downgraded).toBe(2);
  });

  it("needs a quote of three words, or the whole of a source shorter than that", () => {
    const { items, downgraded } = checkOperatorQuotes(
      [
        { text: "A list.", from: "operator", quote: "list" },
        { text: "A reading list.", from: "operator", quote: "reading list" },
        { text: "Greeting.", from: "operator", quote: "Welcome back" },
        { text: "Hi.", from: "operator", quote: "Welcome" },
      ],
      [...sources, "Welcome back"],
    );
    expect(items.map((i) => i.from)).toEqual(["assumed", "assumed", "operator", "assumed"]);
    expect(downgraded).toBe(3);
  });

  it("drops a quote from an item that is not the operator's, and from a list not checked for quotes", () => {
    const { items } = checkOperatorQuotes(
      [{ text: "A.", from: "researcher", quote: "where I keep my reading list" }],
      sources,
    );
    expect(items[0]!.quote).toBeUndefined();
    const [read] = readDraftItems(
      [{ text: "A.", from: "operator", quote: "where I keep my reading list" }],
      { defaultKind: "W", allowed: ["W"] },
    );
    expect(toAskItem(read!).quote).toBeUndefined();
  });

  it("shows the quote under the item", () => {
    const [item] = readDraftItems(
      [{ text: "Keep a list.", from: "operator", quote: "I keep my reading list" }],
      { defaultKind: "W", allowed: ["W"], quotes: true },
    );
    expect(toAskItem(item!).quote).toContain("I keep my reading list");
  });
});

describe("the same item, compared loosely", () => {
  it("ignores case, spacing, a suggestion lead and closing punctuation", () => {
    expect(sameWords("Suggestion: Use  SQLite.")).toBe(sameWords("use sqlite"));
    expect(sameWords("Use SQLite.")).not.toBe(sameWords("Use Postgres."));
  });
});
