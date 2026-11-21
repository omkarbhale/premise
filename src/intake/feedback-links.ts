import { randomBytes } from "node:crypto";
import { type Database, now, recordEvent } from "../storage/database.js";

/**
 * The feedback links (docs/specs/intake.md 5.1, decision 0119): each software has one link of its
 * own, with its own long random token. The link can only send feedback for that software and read
 * where one's own item stands; it opens nothing else. The token is kept so the session can show
 * the link again (decision 0241); a new link replaces the old one, which then stops working.
 */

export interface FeedbackLink {
  softwareId: string;
  token: string;
  created: string;
}

interface Row {
  software_id: string;
  token: string;
  created: string;
}

/** The software's current link, or none yet. */
export function currentFeedbackLink(db: Database, softwareId: string): FeedbackLink | null {
  const row = db
    .prepare(
      "SELECT software_id, token, created FROM feedback_links WHERE software_id = ? AND revoked IS NULL ORDER BY id DESC LIMIT 1",
    )
    .get(softwareId) as Row | undefined;
  return row ? { softwareId: row.software_id, token: row.token, created: row.created } : null;
}

/** Make a software's link; any earlier one stops working. */
export function issueFeedbackLink(db: Database, softwareId: string): FeedbackLink {
  const token = randomBytes(24).toString("base64url");
  db.prepare("UPDATE feedback_links SET revoked = ? WHERE software_id = ? AND revoked IS NULL").run(
    now(),
    softwareId,
  );
  db.prepare("INSERT INTO feedback_links (software_id, token, created) VALUES (?, ?, ?)").run(
    softwareId,
    token,
    now(),
  );
  recordEvent(db, { softwareId, module: "intake", kind: "feedback-link-issued" });
  return currentFeedbackLink(db, softwareId)!;
}

/** Which software a link belongs to, while it works. */
export function softwareOfFeedbackToken(db: Database, token: string): string | null {
  if (!token || token.length > 200) return null;
  const row = db
    .prepare("SELECT software_id FROM feedback_links WHERE token = ? AND revoked IS NULL")
    .get(token) as { software_id: string } | undefined;
  return row?.software_id ?? null;
}

/** A receipt for one piece of feedback: it opens that item's standing and nothing else. */
export function newReceipt(): string {
  return randomBytes(12).toString("base64url");
}
