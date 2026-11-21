import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { StreamEvent } from "../src/shared/api-types.js";
import { recordEvent } from "../src/storage/database.js";
import { testApp } from "./helpers.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** Open the event stream and collect its events until `count` have arrived. */
function stream(
  port: number,
  token: string,
  options: { lastEventId?: number } = {},
): {
  events: StreamEvent[];
  next: (count: number) => Promise<StreamEvent[]>;
  close: () => void;
  status: Promise<number>;
} {
  const events: StreamEvent[] = [];
  const waiters: { count: number; resolve: (e: StreamEvent[]) => void }[] = [];
  let resolveStatus: (code: number) => void = () => {};
  const status = new Promise<number>((r) => (resolveStatus = r));
  const req = request(
    {
      host: "127.0.0.1",
      port,
      path: `/api/events?token=${encodeURIComponent(token)}`,
      headers: {
        host: `localhost:${port}`,
        ...(options.lastEventId !== undefined && { "last-event-id": String(options.lastEventId) }),
      },
    },
    (res) => {
      resolveStatus(res.statusCode ?? 0);
      let buffer = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (data) events.push(JSON.parse(data.slice(6)) as StreamEvent);
        }
        for (const w of waiters.splice(0)) {
          if (events.length >= w.count) w.resolve(events);
          else waiters.push(w);
        }
      });
    },
  );
  req.end();
  return {
    events,
    status,
    next: (count) =>
      events.length >= count
        ? Promise.resolve(events)
        : new Promise((resolve) => waiters.push({ count, resolve })),
    close: () => req.destroy(),
  };
}

async function listening() {
  const t = await testApp();
  await t.app.listen({ host: "127.0.0.1", port: 0 });
  closers.push(() => t.app.close());
  const port = (t.app.server.address() as AddressInfo).port;
  return { ...t, port };
}

describe("the event stream", () => {
  it("sends each new event to an open page, with its id", async () => {
    const { port, token, db } = await listening();
    const s = stream(port, token);
    expect(await s.status).toBe(200);
    recordEvent(db, { module: "test", kind: "first" });
    recordEvent(db, { module: "test", kind: "second" });
    const got = await s.next(2);
    expect(got.map((e) => e.kind)).toEqual(["first", "second"]);
    expect(got[1]!.id).toBeGreaterThan(got[0]!.id);
    s.close();
  });

  it("streams what the line does, such as a new ask, without the event's details", async () => {
    const { port, token, call } = await listening();
    const s = stream(port, token);
    await s.status;
    await call("POST", "/api/softwares", { idea: "Track plant watering" });
    const got = await s.next(1);
    await new Promise((r) => setTimeout(r, 400));
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["software-added", "ask-opened", "chat-said"]));
    expect(Object.keys(got[0]!).sort()).toEqual(["id", "kind", "module", "softwareId", "time"]);
    s.close();
  });

  it("gives a reconnecting page what it missed since its last event id", async () => {
    const { port, token, db } = await listening();
    const since = recordEvent(db, { module: "test", kind: "seen" });
    recordEvent(db, { module: "test", kind: "missed-1" });
    recordEvent(db, { module: "test", kind: "missed-2" });
    const s = stream(port, token, { lastEventId: since });
    const got = await s.next(2);
    expect(got.map((e) => e.kind)).toEqual(["missed-1", "missed-2"]);
    s.close();
  });

  it("refuses a stream without the current token", async () => {
    const { port } = await listening();
    const s = stream(port, "wrong");
    expect(await s.status).toBe(401);
    s.close();
  });
});
