import type { OwnFigures } from "./api-types.js";

/**
 * premise's own count of what real sessions used, in plain words (decision 0270). Used by the page
 * and by reports, so both say it the same way. Never labelled mocked: it is read from each
 * session's own result. A session with no figures is said to have none, never counted as zero.
 */

const tokens = (n: number): string =>
  n >= 1_000_000
    ? `${Math.round(n / 100_000) / 10}M`
    : n >= 1000
      ? `${Math.round(n / 100) / 10}k`
      : String(n);

const sessions = (n: number): string => `${n} session${n === 1 ? "" : "s"}`;

/** "$0.42 at list prices, 12.3k tokens, 9 turns (from 2 sessions); no figures for 1 session: ...". */
export function ownFiguresWords(f: OwnFigures): string {
  const parts: string[] = [];
  if (f.counted > 0) {
    parts.push(
      `$${f.costUsd.toFixed(2)} at list prices, ${tokens(f.inputTokens + f.outputTokens + f.cacheTokens)} tokens, ${f.turns} turn${f.turns === 1 ? "" : "s"} (from ${sessions(f.counted)})`,
    );
  }
  if (f.missing > 0) {
    parts.push(
      `${f.counted > 0 ? "no" : "No"} figures for ${sessions(f.missing)}${f.missingWhy ? `: ${f.missingWhy}` : ""}`,
    );
  }
  return parts.length > 0 ? `${parts.join("; ")}.` : "No sessions yet.";
}

/** How old a reading is, in plain words. */
export function ageWords(readAt: string, at: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((at.getTime() - Date.parse(readAt)) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}
