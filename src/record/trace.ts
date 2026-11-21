import type { CommitInfo, Git } from "../git/git.js";
import { RECORD_FILES } from "./format.js";
import { parseRecord } from "./parse.js";

const TRACE_ID = /^[YUREWTDMI]-[1-9]\d*$/;

/**
 * The IDs a commit message names in its trace trailer, or a reason it has none.
 * The trailer is a line `Premise-Trace: W-7, D-3` in the last paragraph of the message.
 */
export function readTrailer(
  message: string,
  trailerName: string,
): { ids: string[] } | { problem: string } {
  const paragraphs = message.trim().split(/\n\s*\n/);
  const last = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1]! : "";
  const wanted = trailerName.toLowerCase();
  const line = last.split("\n").find((l) => l.toLowerCase().startsWith(`${wanted}:`));
  if (line === undefined) {
    return {
      problem: `it has no ${trailerName} trailer. Every commit names the record items it serves, for example "${trailerName}: W-7, D-3", in the last paragraph of its message`,
    };
  }
  const ids = line
    .slice(line.indexOf(":") + 1)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) return { problem: `its ${trailerName} trailer names no item` };
  const wrong = ids.find((id) => !TRACE_ID.test(id));
  if (wrong !== undefined) {
    return {
      problem: `its ${trailerName} trailer has "${wrong}", which is not an item ID such as W-7`,
    };
  }
  return { ids };
}

export interface TrailerFailure {
  sha: string;
  subject: string;
  reason: string;
}

/** The IDs in the record as it stood at a commit (struck items included: they are still there). */
export function recordIdsAt(git: Git, repo: string, revision: string, folder: string): Set<string> {
  const files = new Map<string, string>();
  for (const spec of RECORD_FILES) {
    const content = git.readFileAt(repo, revision, `${folder}/${spec.file}`);
    if (content !== undefined) files.set(spec.file, content);
  }
  return new Set(parseRecord(files).items.map((i) => i.id));
}

/**
 * Check commits before they are pushed: each must carry the trailer, and every ID in it
 * (apart from intake's `I-n`, kept in premise's database) must exist in the record at that commit.
 */
export function checkTrailers(
  git: Git,
  repo: string,
  commits: readonly CommitInfo[],
  options: { trailer: string; folder: string },
): TrailerFailure[] {
  const failures: TrailerFailure[] = [];
  for (const commit of commits) {
    const fail = (reason: string) =>
      failures.push({ sha: commit.sha, subject: commit.subject, reason });
    const trailer = readTrailer(commit.message, options.trailer);
    if ("problem" in trailer) {
      fail(trailer.problem);
      continue;
    }
    const known = recordIdsAt(git, repo, commit.sha, options.folder);
    const missing = trailer.ids.filter((id) => !id.startsWith("I-") && !known.has(id));
    if (missing.length > 0) {
      fail(
        `its ${options.trailer} trailer names ${missing.join(", ")}, which ${missing.length === 1 ? "is" : "are"} not in the record at that commit`,
      );
    }
  }
  return failures;
}

export function formatTrailerFailures(failures: readonly TrailerFailure[]): string {
  return failures.map((f) => `- ${f.sha.slice(0, 8)} "${f.subject}": ${f.reason}.`).join("\n");
}
