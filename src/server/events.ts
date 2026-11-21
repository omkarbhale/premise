import type { ServerResponse } from "node:http";
import type { StreamEvent } from "../shared/api-types.js";
import type { Database } from "../storage/database.js";

/**
 * The live event stream (decision 0070): one server-sent event stream per open page, fed from the
 * `events` table. Every module already writes its events there, so the stream reads new rows and
 * sends them on; nothing else has to remember to publish. Each event carries its row id, so a page
 * that reconnects with Last-Event-ID gets what it missed (docs/specs/page-server.md 5.4).
 *
 * Only the event's id, time, software, module and kind are sent; the page fetches what changed.
 */

interface EventRow {
  id: number;
  time: string;
  software_id: string | null;
  module: string;
  kind: string;
}

export interface EventHubOptions {
  /** How often to look for new events while a page is open. */
  pollMs?: number;
  /** How often to send a comment line, so idle connections are not dropped. */
  heartbeatMs?: number;
  /** At most this many missed events are replayed to a reconnecting page. */
  replayLimit?: number;
}

export class EventHub {
  private readonly clients = new Set<ServerResponse>();
  private lastId: number;
  private poller: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly replayLimit: number;

  constructor(
    private readonly db: Database,
    options: EventHubOptions = {},
  ) {
    this.pollMs = options.pollMs ?? 200;
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.replayLimit = options.replayLimit ?? 500;
    this.lastId = this.latestId();
  }

  private latestId(): number {
    const row = this.db.prepare("SELECT MAX(id) AS id FROM events").get() as { id: number | null };
    return row.id ?? 0;
  }

  private rowsAfter(id: number, limit: number): EventRow[] {
    return this.db
      .prepare(
        "SELECT id, time, software_id, module, kind FROM events WHERE id > ? ORDER BY id LIMIT ?",
      )
      .all(id, limit) as unknown as EventRow[];
  }

  private static frame(row: EventRow): string {
    const event: StreamEvent = {
      id: row.id,
      time: row.time,
      softwareId: row.software_id,
      module: row.module,
      kind: row.kind,
    };
    return `id: ${row.id}\nevent: premise\ndata: ${JSON.stringify(event)}\n\n`;
  }

  /** Attach an open page's response. `since` is the Last-Event-ID it reconnected with, if any. */
  attach(response: ServerResponse, since: number | null): void {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    // Tell the browser how long to wait before reconnecting, then say hello.
    response.write(`retry: 2000\n: premise event stream\n\n`);
    const latest = this.latestId();
    if (since !== null && since < latest) {
      const missed = this.rowsAfter(since, this.replayLimit).filter((r) => r.id <= latest);
      for (const row of missed) response.write(EventHub.frame(row));
    }
    // With no other page open the poller was idle: start from now, not from where it stopped.
    if (this.clients.size === 0) this.lastId = latest;
    this.clients.add(response);
    response.on("close", () => {
      this.clients.delete(response);
      if (this.clients.size === 0) this.stopTimers();
    });
    this.startTimers();
  }

  /** Send any new events to every open page now. */
  flush(): void {
    if (this.clients.size === 0) {
      this.lastId = this.latestId();
      return;
    }
    for (;;) {
      const rows = this.rowsAfter(this.lastId, 500);
      if (rows.length === 0) return;
      this.lastId = rows[rows.length - 1]!.id;
      const text = rows.map(EventHub.frame).join("");
      for (const client of this.clients) client.write(text);
    }
  }

  get openPages(): number {
    return this.clients.size;
  }

  private startTimers(): void {
    if (!this.poller) {
      this.poller = setInterval(() => this.flush(), this.pollMs);
      this.poller.unref();
    }
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        for (const client of this.clients) client.write(": still here\n\n");
      }, this.heartbeatMs);
      this.heartbeat.unref();
    }
  }

  private stopTimers(): void {
    if (this.poller) clearInterval(this.poller);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.poller = null;
    this.heartbeat = null;
  }

  /** End every stream, for shutdown. */
  close(): void {
    this.stopTimers();
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
