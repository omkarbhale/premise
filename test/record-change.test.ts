import { describe, expect, it } from "vitest";
import { type Operation, applyOperations } from "../src/record/change.js";
import { parseRecord } from "../src/record/parse.js";

const today = "2026-11-22";

function files(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

const BASE = files({
  "why.md": "# Why\n- [Y-1] People lose track of tasks. (from: operator; 2026-11-01)\n",
  "what.md":
    "# What it must do\n- [W-1] Add a task. (must; from: operator; 2026-11-01)\n- [W-2] Tag a task. (could; from: operator; 2026-11-01)\n",
  "decisions.md":
    "# Decisions\n- [D-1] Use SQLite. Reason: one file. Rejected: a server. (from: assumed; foundation; 2026-11-01)\n",
});

function apply(operations: Operation[], proposer = {}) {
  return applyOperations(BASE, operations, { today, proposer });
}

describe("proposed changes", () => {
  it("gives new items the next free ID in their file, and never reuses one", () => {
    const result = apply([
      { op: "add", kind: "W", text: "Search tasks.", from: "operator", priority: "should" },
      { op: "add", kind: "W", text: "Share tasks.", from: "operator", priority: "could" },
    ]);
    expect(result).toMatchObject({ ok: true, change: { assigned: ["W-3", "W-4"] } });
    if (!result.ok) return;
    expect(result.change.files.get("what.md")).toContain(
      "- [W-4] Share tasks. (could; from: operator; 2026-11-22)",
    );
    expect(result.change.changedFiles).toEqual(["what.md"]);
  });

  it("does not reuse the ID of a struck item", () => {
    const struck = apply([{ op: "strike", id: "W-2", reason: "not needed" }]);
    if (!struck.ok) throw new Error("expected ok");
    const next = applyOperations(
      struck.change.files,
      [{ op: "add", kind: "W", text: "New.", from: "operator", priority: "must" }],
      { today },
    );
    expect(next).toMatchObject({ ok: true, change: { assigned: ["W-3"] } });
  });

  it("creates a file that does not exist yet", () => {
    const result = apply([{ op: "add", kind: "T", text: "Calm colours.", from: "designer" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.files.get("taste.md")).toBe(
      "# Taste\n- [T-1] Calm colours. (from: designer; 2026-11-22)\n",
    );
  });

  it("replaces an item: new ID, replaces: mark, old line struck with the reason, and keeps the priority", () => {
    const result = apply([
      {
        op: "replace",
        id: "W-1",
        text: "Add a task by typing.",
        from: "operator",
        reason: "clearer",
      },
    ]);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const text = result.change.files.get("what.md")!;
    expect(text).toContain(
      "- ~~[W-1] Add a task. (must; from: operator; 2026-11-01)~~ struck 2026-11-22: clearer (replaced by W-3)",
    );
    expect(text).toContain(
      "- [W-3] Add a task by typing. (must; from: operator; replaces: W-1; 2026-11-22)",
    );
    expect(result.change.touched).toEqual(["W-3", "W-1"]);
    expect(parseRecord(result.change.files).diagnostics).toEqual([]);
  });

  it("sends a replaced purpose, user, must or foundation decision to the say-back, and nothing else", () => {
    const sayBack = (op: Operation) => {
      const r = apply([op]);
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.change.sayBackFor;
    };
    expect(
      sayBack({ op: "replace", id: "Y-1", text: "Other.", from: "operator", reason: "r" }),
    ).toEqual(["Y-1"]);
    expect(
      sayBack({ op: "replace", id: "W-1", text: "Other.", from: "operator", reason: "r" }),
    ).toEqual(["W-1"]);
    expect(sayBack({ op: "strike", id: "D-1", reason: "r" })).toEqual(["D-1"]);
    expect(
      sayBack({ op: "replace", id: "W-2", text: "Other.", from: "operator", reason: "r" }),
    ).toEqual([]);
  });

  it("strikes with a reason, and keeps the line", () => {
    const result = apply([{ op: "strike", id: "W-2", reason: "out of scope" }]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.change.files.get("what.md")).toContain(
      "- ~~[W-2] Tag a task. (could; from: operator; 2026-11-01)~~ struck 2026-11-22: out of scope",
    );
  });

  it("refuses unknown items, with UNKNOWN_ITEM", () => {
    const result = apply([{ op: "strike", id: "W-9", reason: "x" }]);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "UNKNOWN_ITEM" }] });
  });

  it("refuses to replace or strike an item already struck", () => {
    const first = apply([{ op: "strike", id: "W-2", reason: "x" }]);
    if (!first.ok) throw new Error("expected ok");
    const again = applyOperations(first.change.files, [{ op: "strike", id: "W-2", reason: "y" }], {
      today,
    });
    expect(again).toMatchObject({ ok: false, diagnostics: [{ code: "NOT_ALLOWED" }] });
  });

  it("refuses malformed changes: no operations, no reason, no text, many lines, bad priority use", () => {
    expect(apply([])).toMatchObject({ ok: false, diagnostics: [{ code: "MALFORMED" }] });
    expect(apply([{ op: "strike", id: "W-1", reason: " " }])).toMatchObject({
      ok: false,
      diagnostics: [{ code: "MALFORMED" }],
    });
    expect(
      apply([{ op: "add", kind: "W", text: "", from: "operator", priority: "must" }]),
    ).toMatchObject({ ok: false });
    expect(
      apply([{ op: "add", kind: "W", text: "a\nb", from: "operator", priority: "must" }]),
    ).toMatchObject({ ok: false });
    expect(apply([{ op: "add", kind: "W", text: "No priority.", from: "operator" }])).toMatchObject(
      { ok: false },
    );
    expect(
      apply([{ op: "add", kind: "Y", text: "Has priority.", from: "operator", priority: "must" }]),
    ).toMatchObject({ ok: false });
  });

  it("refuses an added item that mentions an ID that does not exist", () => {
    const result = apply([{ op: "add", kind: "Y", text: "Because of W-99.", from: "operator" }]);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "UNKNOWN_ITEM" }] });
  });

  it("refuses to add to a record that is already invalid", () => {
    const broken = files({ "what.md": "not a list\n" });
    const result = applyOperations(
      broken,
      [{ op: "add", kind: "Y", text: "x", from: "operator" }],
      { today },
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.diagnostics[0]!.message).toContain("not valid");
  });

  it("lets a builder add decisions only", () => {
    const decision: Operation = {
      op: "add",
      kind: "D",
      text: "Use CSV. Reason: simple. Rejected: JSON.",
      from: "assumed",
    };
    expect(apply([decision], { agentRole: "builder" }).ok).toBe(true);
    expect(
      apply([{ op: "add", kind: "W", text: "x", from: "operator", priority: "must" }], {
        agentRole: "builder",
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: "NOT_ALLOWED" }] });
    expect(
      apply([{ op: "strike", id: "W-1", reason: "x" }], { agentRole: "builder" }),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: "NOT_ALLOWED" }],
    });
  });

  it("sets and clears a milestone's wait mark without changing its ID", () => {
    const added = apply([
      { op: "add", kind: "M", text: "First running version.", from: "assumed" },
    ]);
    if (!added.ok) throw new Error("expected ok");
    const waiting = applyOperations(added.change.files, [{ op: "mark", id: "M-1", wait: true }], {
      today,
    });
    if (!waiting.ok) throw new Error("expected ok");
    expect(waiting.change.files.get("milestones.md")).toContain(
      "(from: assumed; wait; 2026-11-22)",
    );
    const cleared = applyOperations(
      waiting.change.files,
      [{ op: "mark", id: "M-1", wait: false }],
      { today },
    );
    if (!cleared.ok) throw new Error("expected ok");
    expect(cleared.change.files.get("milestones.md")).not.toContain("wait");
    expect(apply([{ op: "mark", id: "W-1", wait: true }])).toMatchObject({ ok: false });
  });

  it("marks an item confirmed with the date", () => {
    const result = apply([{ op: "mark", id: "Y-1", confirmed: true }]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.change.files.get("why.md")).toContain(
      "(from: operator; confirmed: 2026-11-22; 2026-11-01)",
    );
  });
});
