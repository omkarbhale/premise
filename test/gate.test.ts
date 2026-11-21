import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load.js";
import { Gate, GateError } from "../src/gate/gate.js";
import { getAsk } from "../src/storage/asks.js";
import { type Database, openDatabase, transaction } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

let db: Database;
let gate: Gate;
let softwareId: string;

beforeEach(() => {
  const folder = tempFolder();
  const config = testConfig(folder);
  db = openDatabase(folder).db;
  softwareId = createSoftware(db, { name: "Notes" }, config.softwares).id;
  gate = new Gate({ db, config });
});

const events = (kind: string) =>
  (db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = ?").get(kind) as { n: number }).n;

describe("gate", () => {
  it("refuses a request it cannot recognise, saying what is missing", () => {
    expect(() =>
      gate.request({
        softwareId,
        kind: "nuke" as never,
        action: "",
        why: "",
        requestedBy: "test",
      }),
    ).toThrowError(GateError);
  });

  it("asks in the session with the fixed card, filled from the request, under the operator", () => {
    const request = gate.request({
      softwareId,
      kind: "delete-data",
      action: "Delete the branch old-ideas, which has 3 commits not merged.",
      why: "It is no longer used.",
      requestedBy: "builder, job 4",
      waiting: "the builder's clean-up task",
    });
    expect(request.status).toBe("asked");
    const ask = getAsk(db, request.askId!)!;
    expect(ask).toMatchObject({ kind: "approval", role: "operator" });
    expect(ask.title).toBe("Allow premise to delete something?");
    expect(ask.instruction).toContain("Notes waits on this: the builder's clean-up task");
    expect(ask.extra.approval).toMatchObject({
      action: "Delete the branch old-ideas, which has 3 commits not merged.",
      why: "It is no longer used.",
    });
    expect(ask.extra.approval!.kindLabel).toBeUndefined();
    expect(() => gate.decide(request.id, "approve-kind")).toThrowError(/one action at a time/);
  });

  it("performs an approved action with its performer and records the outcome; a failure is recorded, not retried", async () => {
    let calls = 0;
    gate.registerPerformer("act", async () => {
      calls++;
      return calls === 1 ? { ok: true, outcome: "Did it." } : { ok: false, outcome: "Broke." };
    });
    const told: string[] = [];
    gate.onDecided((r) => told.push(r.status));
    for (const expected of ["done", "failed"]) {
      const request = gate.request({
        softwareId,
        kind: "expose",
        action: "Open port 8080 to the local network.",
        why: "So a phone can reach it.",
        requestedBy: "runner",
        perform: "act",
      });
      gate.answerCard(request.askId!, "approve-once", "Approved once.");
      await gate.idle();
      expect(gate.get(request.id)!.status).toBe(expected);
    }
    expect(calls).toBe(2);
    expect(told).toEqual(["done", "failed"]);
    expect(events("gate-requested")).toBe(2);
    expect(events("approval-given")).toBe(2);
    expect(events("gate-failed")).toBe(1);
  });

  it("lets a kind approval cover later requests of that kind for that software only, until withdrawn", async () => {
    const other = createSoftware(db, { name: "Other" }, testConfig(tempFolder()).softwares).id;
    const first = gate.request({
      softwareId,
      kind: "post",
      action: "Post a.",
      why: "x",
      requestedBy: "t",
    });
    gate.answerCard(first.askId!, "approve-kind", "Approved posting.");
    const second = gate.request({
      softwareId,
      kind: "post",
      action: "Post b.",
      why: "x",
      requestedBy: "t",
    });
    expect(second.status).toBe("approved");
    expect(second.askId).toBeNull();
    const elsewhere = gate.request({
      softwareId: other,
      kind: "post",
      action: "Post c.",
      why: "x",
      requestedBy: "t",
    });
    expect(elsewhere.status).toBe("asked");
    const [standing] = gate.standing(softwareId);
    gate.withdraw(standing!.id);
    expect(gate.standing(softwareId)).toEqual([]);
    const third = gate.request({
      softwareId,
      kind: "post",
      action: "Post d.",
      why: "x",
      requestedBy: "t",
    });
    expect(third.status).toBe("asked");
    await gate.idle();
    expect(gate.get(second.id)!.status).toBe("done");
  });

  it("marks a request left approved as failed on recovery, asks the person, and never performs it", async () => {
    let calls = 0;
    gate.registerPerformer("act", async () => {
      calls++;
      return { ok: true, outcome: "Did it." };
    });
    const request = gate.request({
      softwareId,
      kind: "expose",
      action: "Open port 8080.",
      why: "x",
      requestedBy: "t",
      perform: "act",
    });
    gate.decide(request.id, "approve-once");
    const recovered = gate.recoverInterrupted();
    await gate.idle();
    expect(recovered.map((r) => r.id)).toEqual([request.id]);
    expect(gate.get(request.id)).toMatchObject({ status: "failed" });
    expect(gate.get(request.id)!.outcome).toMatch(/may be partly done/);
    const needed = db.prepare("SELECT kind, status FROM asks WHERE kind = 'needed'").all();
    expect(needed).toEqual([{ kind: "needed", status: "open" }]);
    expect(gate.recoverInterrupted()).toEqual([]);
    expect(calls).toBe(0);
  });

  it("does not perform a covered request made inside a transaction that rolls back", async () => {
    let calls = 0;
    gate.registerPerformer("act", async () => {
      calls++;
      return { ok: true, outcome: "Did it." };
    });
    const first = gate.request({ softwareId, kind: "post", action: "Post a.", why: "x", requestedBy: "t" });
    gate.answerCard(first.askId!, "approve-kind", "ok");
    expect(() =>
      transaction(db, () => {
        const covered = gate.request({
          softwareId,
          kind: "post",
          action: "Post b.",
          why: "x",
          requestedBy: "t",
          perform: "act",
        });
        expect(covered.status).toBe("approved");
        expect(calls).toBe(0);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    await gate.idle();
    expect(calls).toBe(0);

    const committed = transaction(db, () =>
      gate.request({ softwareId, kind: "post", action: "Post c.", why: "x", requestedBy: "t", perform: "act" }),
    );
    expect(calls).toBe(0);
    await gate.idle();
    expect(calls).toBe(1);
    expect(gate.get(committed.id)!.status).toBe("done");
  });

  it("refuses a decision twice", () => {
    const request = gate.request({
      softwareId,
      kind: "spend",
      action: "Pay 5 dollars.",
      why: "x",
      requestedBy: "t",
    });
    gate.answerCard(request.askId!, "refuse", "Declined.", "Too much");
    expect(gate.get(request.id)).toMatchObject({
      status: "refused",
      outcome: "Declined: Too much",
    });
    expect(() => gate.answerCard(request.askId!, "approve-once", "Approved once.")).toThrowError(
      /already/,
    );
  });

  it("will not let spending money or deleting data be configured as approvable kinds", () => {
    expect(() =>
      loadConfig({
        dataFolder: tempFolder(),
        env: { PREMISE_GATE__KIND_APPROVALS_ALLOWED: '["post", "spend"]' },
      }),
    ).toThrowError(/always asked one action at a time/);
  });
});
