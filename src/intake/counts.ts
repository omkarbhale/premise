import type { IntakeRouteCounts } from "../shared/api-types.js";
import type { Database } from "../storage/database.js";
import { type IntakeItem, listIntakeItems } from "./items.js";

/** How each route and source is said in plain words, for reports and measures. */
export const ROUTE_WORDS: Record<string, string> = {
  "in-normally": "in normally",
  "asked-at-once": "asked of you",
  held: "held for a reading",
  "merged-or-closed": "merged or closed",
  "not-routed": "not routed yet",
};

export const SOURCE_NAMES: Record<string, string> = {
  session: "the session",
  page: "the report box",
  premise: "premise itself",
  github: "GitHub issues",
  feedback: "the feedback page",
};

/** How many items went each way, and from which source: the counts reports and measures show. */
export function routeCounts(items: Pick<IntakeItem, "route" | "source">[]): IntakeRouteCounts {
  const byRoute: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const item of items) {
    const route = item.route ?? "not-routed";
    byRoute[route] = (byRoute[route] ?? 0) + 1;
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }
  const counts = { byRoute, bySource, total: items.length };
  return {
    ...counts,
    words: countsWords(counts),
    sources: Object.entries(bySource)
      .map(([source, count]) => ({ source, name: SOURCE_NAMES[source] ?? source, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** The counts for one software, or for every software together (null). */
export function intakeCounts(db: Database, softwareId: string | null): IntakeRouteCounts {
  return routeCounts(listIntakeItems(db, softwareId ? { softwareId } : {}));
}

/** The counts in a plain sentence, such as "7 items came in. Where they went: in normally 4, held 2…". */
export function countsWords(counts: Pick<IntakeRouteCounts, "byRoute" | "total">): string {
  if (counts.total === 0) return "No item has come in through intake yet.";
  const parts = Object.keys(ROUTE_WORDS)
    .filter((route) => (counts.byRoute[route] ?? 0) > 0)
    .map((route) => `${ROUTE_WORDS[route]} ${counts.byRoute[route]}`);
  return `${counts.total} ${counts.total === 1 ? "item" : "items"} came in through intake. Where they went: ${parts.join(", ")}.`;
}
