import { describe, expect, it, vi } from "vitest";
import type { AskView } from "../src/shared/api-types.js";
import { testApp } from "./helpers.js";

/**
 * The page stays fast on a large database (decision 0340). The page asks for the overview and the
 * activity on every burst of live events; they once read each job's record words through git, one
 * git program per job, which held up every request for seconds. These run on a database seeded
 * with thousands of jobs and tens of thousands of events.
 */

const JOBS = 3000;
const LIVE_JOBS = 40;
const EVENTS = 60_000;

async function seeded() {
  const app = await testApp();
  const { call, settle, db } = app;
  const started = await call("POST", "/api/softwares", {
    idea: "I want a small app that keeps my reading list",
  });
  const id = started.body.id as string;
  await settle();
  // Keep the Why draft, so the record has items for jobs to name.
  const asks = (await call("GET", `/api/asks?software=${id}&status=open`)).body as AskView[];
  const draft = asks.find((a) => a.kind === "draft")!;
  await call("POST", `/api/asks/${draft.id}/answer`, {
    answer: { kind: "items", items: draft.items.map((i) => ({ key: i.key, decision: "keep" })) },
  });
  await settle();
  // Hold the queue, so the seeded live jobs stay as they are while the page reads them.
  await call("POST", "/api/pause", { reason: "seeding" }).catch(() => undefined);

  const time = "2026-11-22T10:00:00.000Z";
  db.exec("BEGIN");
  const job = db.prepare(
    `INSERT INTO jobs (software_id, kind, stage, items, payload, status, created, started, finished, result, note)
     VALUES (?, 'build', 'build', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < JOBS; i++) {
    const live = i >= JOBS - LIVE_JOBS;
    const status = live ? (i % 2 ? "queued" : "waiting") : "done";
    job.run(
      id,
      JSON.stringify(["Y-1", "Y-2"]),
      JSON.stringify({ brief: "x".repeat(400), items: ["Y-1"] }),
      status,
      time,
      time,
      live ? null : time,
      live ? null : "Built it.",
      live ? "Waiting for a free agent." : null,
    );
  }
  const event = db.prepare(
    "INSERT INTO events (time, software_id, module, kind, reference, detail) VALUES (?, ?, 'agent', 'progress', ?, ?)",
  );
  for (let i = 0; i < EVENTS; i++) {
    event.run(time, id, String(1 + (i % JOBS)), JSON.stringify({ text: `step ${i}` }));
  }
  db.exec("COMMIT");
  return { ...app, id };
}

describe("the page on a large database", () => {
  it("answers the overview, the activity and the software list without running git while the record is unchanged", async () => {
    const { call, record, id } = await seeded();
    // The first reading fills what is kept; after it, nothing changed in the record.
    for (const url of [
      "/api/overview",
      "/api/activity",
      "/api/softwares",
      `/api/softwares/${id}`,
    ]) {
      expect((await call("GET", url)).status).toBe(200);
    }
    const git = vi.spyOn(record.git, "run");
    const slowest: Record<string, number> = {};
    for (let round = 0; round < 3; round++) {
      for (const url of ["/api/overview", "/api/activity", "/api/summary", "/api/softwares"]) {
        const begun = performance.now();
        const response = await call("GET", url);
        expect(response.status).toBe(200);
        slowest[url] = Math.max(slowest[url] ?? 0, performance.now() - begun);
      }
    }
    expect(git).not.toHaveBeenCalled();
    // Generous for a busy test machine; these took seconds each before.
    for (const [url, ms] of Object.entries(slowest)) {
      expect(ms, `${url} took ${Math.round(ms)} ms`).toBeLessThan(1000);
    }
    const activity = (await call("GET", "/api/activity")).body;
    expect(activity.queued.length + activity.waiting.length).toBeGreaterThanOrEqual(LIVE_JOBS);
    expect(activity.recent.length).toBe(10);
    // Record words still reach each job.
    expect(activity.queued[0].items[0]).toMatchObject({ id: "Y-1" });
    expect(activity.queued[0].items[0].text.length).toBeGreaterThan(0);
  }, 60_000);

  it("reads the record again once it changes", async () => {
    const { call, record, id, settle } = await seeded();
    const before = (await call("GET", `/api/softwares/${id}/record`)).body;
    const git = vi.spyOn(record.git, "run");
    await call("GET", `/api/softwares/${id}/record`);
    expect(git).not.toHaveBeenCalled();
    // A new commit on the software's repository: what was kept no longer stands.
    const repo = record.repositoryPath(id);
    record.git.run(repo, ["commit", "--allow-empty", "-m", "elsewhere"]);
    git.mockClear();
    const after = (await call("GET", `/api/softwares/${id}/record`)).body;
    expect(git).toHaveBeenCalled();
    expect(after).toEqual(before);
    await settle();
  }, 60_000);
});
