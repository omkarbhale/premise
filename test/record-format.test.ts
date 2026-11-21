import { describe, expect, it } from "vitest";
import { formatItemLine } from "../src/record/format.js";
import { parseRecord } from "../src/record/parse.js";

function record(files: Record<string, string>) {
  return parseRecord(new Map(Object.entries(files)));
}

const GOOD_W =
  "- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)";

describe("record format", () => {
  it("reads an item with its marks", () => {
    const { items, diagnostics } = record({ "what.md": `# What\n\n${GOOD_W}\n` });
    expect(diagnostics).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "W-7",
      kind: "W",
      number: 7,
      file: "what.md",
      line: 3,
      text: "People can export their list as a CSV file.",
      marks: { priority: "must", from: "operator", date: "2026-11-21" },
    });
  });

  it("writes an item back exactly as it reads it", () => {
    const { items } = record({ "what.md": `${GOOD_W}\n` });
    expect(formatItemLine(items[0]!)).toBe(GOOD_W);
  });

  it("reads a struck item with its reason, and links a replacement to it", () => {
    const { items, diagnostics } = record({
      "what.md": [
        "- ~~[W-1] Old. (must; from: operator; 2026-11-01)~~ struck 2026-11-02: changed (replaced by W-2)",
        "- [W-2] New. (must; from: operator; replaces: W-1; 2026-11-02)",
        "",
      ].join("\n"),
    });
    expect(diagnostics).toEqual([]);
    expect(items[0]!.struck).toEqual({ date: "2026-11-02", reason: "changed (replaced by W-2)" });
    expect(items[0]!.replacedBy).toBe("W-2");
  });

  it("refuses a line that is not in the format, naming the file and line", () => {
    const { diagnostics } = record({ "what.md": `# What\n- W-7 People can export.\n` });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "MALFORMED", file: "what.md", line: 2 });
    expect(diagnostics[0]!.message).toContain("An item looks like");
  });

  it("refuses prose that is not a list item", () => {
    const { diagnostics } = record({ "why.md": "People lose track of their tasks.\n" });
    expect(diagnostics[0]!.message).toContain("one item per list line");
  });

  it("refuses duplicate IDs", () => {
    const { diagnostics } = record({ "what.md": `${GOOD_W}\n${GOOD_W}\n` });
    expect(diagnostics.some((d) => d.message.includes("W-7 appears twice"))).toBe(true);
  });

  it("refuses an ID in the wrong file", () => {
    const { diagnostics } = record({
      "why.md": "- [W-1] Wrong place. (must; from: operator; 2026-11-21)\n",
    });
    expect(diagnostics[0]!.message).toContain("belong in what.md");
  });

  it("refuses references to IDs that are not in the record", () => {
    const { diagnostics } = record({
      "decisions.md":
        "- [D-1] Use SQLite. Reason: see W-9. Rejected: files. (from: assumed; 2026-11-21)\n",
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "UNKNOWN_ITEM", file: "decisions.md" });
    expect(diagnostics[0]!.message).toContain("W-9");
  });

  it("lets items mention intake items, which live in premise's database", () => {
    const { diagnostics } = record({
      "why.md": "- [Y-1] People asked for this in I-12. (from: operator; 2026-11-21)\n",
    });
    expect(diagnostics).toEqual([]);
  });

  it("refuses a replaces: that names a missing item, or one not struck through", () => {
    const missing = record({
      "what.md": "- [W-2] New. (must; from: operator; replaces: W-1; 2026-11-21)\n",
    });
    expect(missing.diagnostics[0]!.code).toBe("UNKNOWN_ITEM");
    const notStruck = record({
      "what.md": [
        "- [W-1] Old. (must; from: operator; 2026-11-01)",
        "- [W-2] New. (must; from: operator; replaces: W-1; 2026-11-02)",
        "",
      ].join("\n"),
    });
    expect(notStruck.diagnostics[0]!.message).toContain("not struck through");
  });

  it("needs a priority on W items and only on W items", () => {
    expect(
      record({ "what.md": "- [W-1] No priority. (from: operator; 2026-11-21)\n" }).diagnostics[0]!
        .message,
    ).toContain("needs a priority");
    expect(
      record({ "why.md": "- [Y-1] Has one. (must; from: operator; 2026-11-21)\n" }).diagnostics[0]!
        .message,
    ).toContain("only a W item has a priority");
  });

  it("needs from: and a date, and refuses names written like people", () => {
    expect(
      record({ "why.md": "- [Y-1] No source. (2026-11-21)\n" }).diagnostics[0]!.message,
    ).toContain("needs `from:");
    expect(
      record({ "why.md": "- [Y-1] A person. (from: Jane Doe; 2026-11-21)\n" }).diagnostics[0]!
        .message,
    ).toContain("names roles, never people");
    expect(
      record({ "why.md": "- [Y-1] Bad date. (from: operator; 21/11/2026)\n" }).diagnostics[0]!
        .message,
    ).toContain("YYYY-MM-DD");
  });

  it("refuses an email address anywhere in an item", () => {
    const { diagnostics } = record({
      "why.md": "- [Y-1] Ask jane@example.com first. (from: operator; 2026-11-21)\n",
    });
    expect(diagnostics.some((d) => d.message.includes("email address"))).toBe(true);
  });

  it("needs a decision to give its reason and the alternative rejected", () => {
    const { diagnostics } = record({
      "decisions.md": "- [D-1] Use SQLite. (from: assumed; 2026-11-21)\n",
    });
    expect(diagnostics[0]!.message).toContain("Reason:");
    const ok = record({
      "decisions.md":
        "- [D-1] Use SQLite. Reason: one file. Rejected: a server. (from: assumed; foundation; 2026-11-21)\n",
    });
    expect(ok.diagnostics).toEqual([]);
    expect(ok.items[0]!.marks.foundation).toBe(true);
  });

  it("limits foundation to decisions and wait to milestones", () => {
    expect(
      record({ "why.md": "- [Y-1] X. (from: operator; foundation; 2026-11-21)\n" }).diagnostics[0]!
        .message,
    ).toContain("only a decision");
    expect(
      record({ "milestones.md": "- [M-1] First. (from: assumed; wait; 2026-11-21)\n" }).diagnostics,
    ).toEqual([]);
    expect(
      record({ "what.md": "- [W-1] X. (should; from: operator; wait; 2026-11-21)\n" })
        .diagnostics[0]!.message,
    ).toContain("only a milestone");
  });

  it("does not look inside run.md, which is free text", () => {
    expect(record({ "run.md": "Run `npm start`.\n\nOpen the link.\n" }).diagnostics).toEqual([]);
  });

  it("treats a missing file as empty", () => {
    expect(record({}).items).toEqual([]);
  });
});

describe("record check command", () => {
  it("says a good folder is in order, and a bad one what is wrong and where", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { checkRecordFolder } = await import("../src/record/check-folder.js");
    const { tempFolder } = await import("./helpers.js");
    const folder = tempFolder();
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "what.md"), `${GOOD_W}\n`);
    expect(checkRecordFolder(folder)).toMatchObject({ ok: true });
    writeFileSync(join(folder, "why.md"), "- nonsense\n");
    const bad = checkRecordFolder(folder);
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("why.md line 1");
    expect(checkRecordFolder(join(folder, "missing")).message).toContain("There is no folder");
    expect(checkRecordFolder(tempFolder()).message).toContain("holds none of the record's files");
  });
});
