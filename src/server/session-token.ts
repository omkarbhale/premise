import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/** Where the link's token is kept when server.keep_link is on (readable only by its owner). */
export function keptLinkFile(dataFolder: string): string {
  return join(dataFolder, "kept-link");
}

function writeKept(dataFolder: string, token: string): void {
  const file = keptLinkFile(dataFolder);
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  // writeFileSync's mode only applies to a new file.
  chmodSync(file, 0o600);
}

/**
 * Issue a token and keep it for later starts, when the setting says so; otherwise forget any kept
 * one. For `premise new-link`, and for starting when nothing valid was kept.
 */
export function issueLinkToken(
  db: Database,
  options: { bytes: number; keep: boolean; dataFolder: string },
): string {
  const token = issueSessionToken(db, options.bytes);
  if (options.keep) writeKept(options.dataFolder, token);
  else rmSync(keptLinkFile(options.dataFolder), { force: true });
  return token;
}

/**
 * The token for a start of premise (decision 0290). By default a new one, so the link changes with
 * each start. With server.keep_link, the one kept from last time when it still works, so the same
 * link opens premise again. Returns whether it was kept.
 */
export function startupToken(
  db: Database,
  options: { bytes: number; keep: boolean; dataFolder: string },
): { token: string; kept: boolean } {
  if (options.keep) {
    const file = keptLinkFile(options.dataFolder);
    if (existsSync(file)) {
      const token = readFileSync(file, "utf8").trim();
      if (isValidSessionToken(db, token)) {
        recordEvent(db, { module: "page-server", kind: "session-link-kept" });
        return { token, kept: true };
      }
    }
  }
  return { token: issueLinkToken(db, options), kept: false };
}
