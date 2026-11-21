import type { ChatMessage } from "../shared/api-types.js";
import { type Database, now, recordEvent } from "./database.js";

/** The `chat_messages` table: what was said in the session, by a person or by premise. */

interface ChatRow {
  id: number;
  software_id: string | null;
  author: "person" | "premise";
  text: string;
  routed_to: string | null;
  time: string;
}

function fromRow(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    softwareId: row.software_id,
    author: row.author,
    text: row.text,
    time: row.time,
    routedTo: row.routed_to,
  };
}

export interface NewChatMessage {
  softwareId: string | null;
  author: "person" | "premise";
  text: string;
  routedTo?: string | null;
  askId?: number | null;
}

export function addChatMessage(db: Database, input: NewChatMessage): ChatMessage {
  const result = db
    .prepare(
      "INSERT INTO chat_messages (software_id, author, text, routed_to, ask_id, time) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.softwareId,
      input.author,
      input.text,
      input.routedTo ?? null,
      input.askId ?? null,
      now(),
    );
  const id = Number(result.lastInsertRowid);
  recordEvent(db, {
    softwareId: input.softwareId,
    module: "chat",
    kind: input.author === "person" ? "chat-said" : "chat-answered",
    reference: String(id),
  });
  return fromRow(
    db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as unknown as ChatRow,
  );
}

export function listChatMessages(db: Database, softwareId: string, limit = 500): ChatMessage[] {
  const rows = db
    .prepare(
      "SELECT * FROM (SELECT * FROM chat_messages WHERE software_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id",
    )
    .all(softwareId, limit) as unknown as ChatRow[];
  return rows.map(fromRow);
}
