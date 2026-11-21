import { createHash, randomBytes } from "node:crypto";
import { type Database, now, recordEvent } from "../storage/database.js";

/**
 * The session link's token (decision 0078). Only its hash is stored. Issuing a new token revokes
 * every earlier one, so the newest link printed is the only one that works.
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueSessionToken(db: Database, bytes: number): string {
  const token = randomBytes(bytes).toString("base64url");
  db.prepare("UPDATE page_tokens SET revoked = ? WHERE revoked IS NULL").run(now());
  db.prepare("INSERT INTO page_tokens (token_hash, created) VALUES (?, ?)").run(
    hashToken(token),
    now(),
  );
  recordEvent(db, { module: "page-server", kind: "session-link-issued" });
  return token;
}

export function isValidSessionToken(db: Database, token: string | undefined): boolean {
  if (!token) return false;
  const row = db
    .prepare("SELECT 1 AS ok FROM page_tokens WHERE token_hash = ? AND revoked IS NULL")
    .get(hashToken(token));
  return row !== undefined;
}
