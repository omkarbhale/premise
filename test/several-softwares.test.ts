import { describe, expect, it } from "vitest";
import type { AskView, SoftwareSummary, SummaryView } from "../src/shared/api-types.js";
import { testApp } from "./helpers.js";

/**
 * Looking after several softwares at once through the page's API (decision 0197), with scripted
 * agents and this file as the operator: three softwares with different priorities and a session
 * limit of two, one waiting on a person while the others move, the summary across softwares,
 * pausing, resuming, archiving and restoring, and a restart with all three mid-way.
 */

type App = Awaited<ReturnType<typeof testApp>>;

const LIMIT = { PREMISE_QUEUE__MAX_AGENT_SESSIONS: "2" };

async function start(app: App, idea: string, priority: number): Promise<string> {
  const res = await app.call("POST", "/api/softwares", { idea });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = res.body.id as string;
  const set = await app.call("POST", `/api/softwares/${id}/priority`, { priority });
  expect(set.status).toBe(200);
  return id;
}

async function list(app: App, archived = false): Promise<SoftwareSummary[]> {
  return (await app.call("GET", `/api/softwares${archived ? "?archived=1" : ""}`))
    .body as SoftwareSummary[];
}

async function openAsks(app: App, softwareId?: string): Promise<AskView[]> {
  const query = softwareId ? `software=${softwareId}&status=open` : "status=open";
  return (await app.call("GET", `/api/asks?${query}`)).body as AskView[];
}

/** Keep every item of the software's open draft, and let the line move on. */
async function answer(app: App, softwareId: string) {
  const ask = (await openAsks(app, softwareId)).find((a) => a.kind !== "approval")!;
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, {
    answer: { kind: "items", items: ask.items.map((i) => ({ key: i.key, decision: "keep" })) },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  await app.settle();
}

async function summary(app: App): Promise<SummaryView> {
  const res = await app.call("GET", "/api/summary");
  expect(res.status).toBe(200);
  return res.body as SummaryView;
}

async function threeAtOnce(app: App) {
  const ids = {
    tracker: await start(app, "A tracker for the books I lend to friends.", 1),
    planner: await start(app, "A planner for the family's weekly meals.", 3),
    notes: await start(app, "A place to keep notes from the reading group.", 5),
  };
  await app.settle();
  return ids;
}

describe("several softwares at once", () => {
  it("moves three softwares with a session limit of two, one waiting on a person while the others move", async () => {
    const app = await testApp(LIMIT);
    const ids = await threeAtOnce(app);
    // Each drafted its first step and now waits on you; the list puts what needs you first, the
    // most important first.
    const first = await list(app);
    expect(first.map((s) => s.id)).toEqual([ids.tracker, ids.planner, ids.notes]);
    expect(first.every((s) => s.openAsks > 0)).toBe(true);
    // "Waiting on you" spans every software.
    const asks = await openAsks(app);
    expect(new Set(asks.map((a) => a.softwareId))).toEqual(
      new Set([ids.tracker, ids.planner, ids.notes]),
    );

    // Answer the least important two; the most important keeps waiting on you, and the others
    // move on regardless.
    const before = (await list(app)).find((s) => s.id === ids.notes)!.stage;
    await answer(app, ids.notes);
    await answer(app, ids.planner);
    const after = await list(app);
    const notes = after.find((s) => s.id === ids.notes)!;
    expect(notes.stage).not.toBe(before);
    expect(after.find((s) => s.id === ids.tracker)!.openAsks).toBeGreaterThan(0);
    // Never more than two agent sessions at once.
    const sessions = app.db
      .prepare("SELECT started, ended FROM agent_sessions ORDER BY id")
      .all() as { started: string; ended: string | null }[];
    for (const s of sessions) {
      const overlapping = sessions.filter(
        (o) => o.started <= s.started && (o.ended === null || o.ended > s.started),
      );
      expect(overlapping.length).toBeLessThanOrEqual(2);
    }
  }, 30_000);

  it("writes one short summary across softwares, from recorded facts, with what changed since you last looked", async () => {
    const app = await testApp(LIMIT);
    const ids = await threeAtOnce(app);
    const first = await summary(app);
    expect(first.headline).toBe("3 softwares, 3 waiting on you, 0 working or running.");
    expect(first.needsYou.map((s) => s.id)).toEqual([ids.tracker, ids.planner, ids.notes]);
    expect(first.needsYou[0]!.needsYou).toMatch(/to answer/);
    expect(first.since).toBeNull();
    expect(first.changes.map((c) => c.softwareId).sort()).toEqual(
      [ids.tracker, ids.planner, ids.notes].sort(),
    );
    expect(first.changes[0]!.lines).toContain("Started.");
    expect(first.sessions.max).toBe(2);

    // Looked at: the next summary says only what changed since.
    await app.call("POST", "/api/summary/seen", { upTo: first.upTo });
    const quiet = await summary(app);
    expect(quiet.changes).toEqual([]);
    expect(quiet.since).not.toBeNull();

    await answer(app, ids.planner);
    const next = await summary(app);
    expect(next.changes.map((c) => c.softwareId)).toEqual([ids.planner]);
    expect(next.changes[0]!.lines.some((l) => /Moved on to/.test(l))).toBe(true);
    // Each software still has its own report as before.
    const report = await app.call("GET", `/api/softwares/${ids.planner}/report`);
    expect(report.status).toBe(200);
  }, 30_000);

  it("pauses, resumes, archives and restores a software, and never deletes one", async () => {
    const app = await testApp(LIMIT);
    const ids = await threeAtOnce(app);

    // Paused: nothing new starts for it; its question stays answerable.
    const paused = await app.call("POST", `/api/softwares/${ids.planner}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.paused).toBe(true);
    await answer(app, ids.planner);
    const queued = app.session.queue.list("queued").filter((j) => j.softwareId === ids.planner);
    expect(queued.length).toBeGreaterThan(0);
    const shown = (await list(app)).find((s) => s.id === ids.planner)!;
    expect(shown.status).toMatch(/^Paused by you/);
    // Paused softwares come after the ones working or waiting on you.
    expect((await list(app)).map((s) => s.id).at(-1)).toBe(ids.planner);

    const resumed = await app.call("POST", `/api/softwares/${ids.planner}/resume`);
    expect(resumed.body.paused).toBe(false);
    await app.settle();
    expect(
      app.session.queue.list("queued").filter((j) => j.softwareId === ids.planner),
    ).toHaveLength(0);

    // Archiving needs it finished or abandoned: a working software is refused, plainly.
    const refused = await app.call("POST", `/api/softwares/${ids.notes}/archive`);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatch(/Pause it first/);

    await app.call("POST", `/api/softwares/${ids.notes}/pause`);
    const archived = await app.call("POST", `/api/softwares/${ids.notes}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);
    // Hidden from the main list and from "Waiting on you", kept in the archived list.
    expect((await list(app)).map((s) => s.id)).not.toContain(ids.notes);
    expect((await list(app, true)).map((s) => s.id)).toEqual([ids.notes]);
    expect((await openAsks(app)).some((a) => a.softwareId === ids.notes)).toBe(false);
    const overview = (await app.call("GET", "/api/overview")).body;
    expect(overview.archivedSoftwares).toBe(1);
    expect((await summary(app)).archived).toBe(1);

    const restored = await app.call("POST", `/api/softwares/${ids.notes}/restore`);
    expect(restored.body.archived).toBe(false);
    expect((await list(app)).map((s) => s.id)).toContain(ids.notes);
    expect((await openAsks(app)).some((a) => a.softwareId === ids.notes)).toBe(true);
    // Nothing was deleted along the way.
    expect((app.db.prepare("SELECT COUNT(*) AS n FROM softwares").get() as { n: number }).n).toBe(
      3,
    );
  }, 30_000);

  it("picks all three up again after a restart mid-way, keeping a pause", async () => {
    const first = await testApp(LIMIT);
    const ids = await threeAtOnce(first);
    await answer(first, ids.planner);
    await first.call("POST", `/api/softwares/${ids.notes}/pause`);
    const stages = new Map((await list(first)).map((s) => [s.id, s.stage]));

    const second = await testApp(LIMIT, { folder: first.folder });
    second.session.queue.recover();
    await second.settle();
    const again = await list(second);
    expect(new Set(again.map((s) => s.id))).toEqual(new Set([ids.tracker, ids.planner, ids.notes]));
    for (const s of again) expect(s.stage).toBe(stages.get(s.id));
    expect(again.find((s) => s.id === ids.notes)!.paused).toBe(true);
    // The line goes on for each after the restart.
    await answer(second, ids.tracker);
    expect((await list(second)).find((s) => s.id === ids.tracker)!.stage).not.toBe(
      stages.get(ids.tracker),
    );
  }, 30_000);
});
