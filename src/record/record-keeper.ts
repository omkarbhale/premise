import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PremiseConfig } from "../config/settings.js";
import { type CommitInfo, Git, GitError } from "../git/git.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import { getSoftware, setSoftwareRepository } from "../storage/softwares.js";
import {
  type AppliedChange,
  type ApplyResult,
  type Operation,
  type Proposer,
  applyOperations,
} from "./change.js";
import { type Diagnostic, formatDiagnostics } from "./diagnostics.js";
import { type ItemKind, RECORD_FILES, type RecordItem } from "./format.js";
import { parseRecord } from "./parse.js";
import {
  type TrailerFailure,
  checkTrailers,
  formatTrailerFailures,
  readTrailer,
  recordIdsAt,
} from "./trace.js";

/** The record's free-text files: how to run it, and best-guess links from old code. */
export const TEXT_FILES = ["run.md", "recovered-trace.md"] as const;
let textCounter = 0;

export type ChangeStatus = "rejected" | "reviewing" | "at-say-back" | "accepted" | "committed";

export class RecordError extends Error {
  constructor(
    readonly code: Diagnostic["code"],
    message: string,
    readonly diagnostics: Diagnostic[] = [],
  ) {
    super(message);
    this.name = "RecordError";
  }
}

export interface ChangeResult {
  changeId: number;
  status: ChangeStatus;
  diagnostics: Diagnostic[];
  /** The IDs given to added and replacing items, in operation order. */
  assigned: (string | undefined)[];
  /** Items whose replacement goes to the say-back. */
  sayBackFor: string[];
}

export interface ProposeOptions {
  proposer?: Proposer;
  /** Who the change is attributed to, for the events: a session or stage name. */
  proposedBy?: string;
  /** Read the record from this working copy (including changes not yet committed), not from the repository. */
  workingCopy?: string;
}

export interface Review {
  verdict: "consistent" | "conflicting";
  /** The live item the change conflicts with, when conflicting. */
  conflictingItem?: string;
  reasons?: string;
}

export interface WriteOptions {
  workingCopy: string;
  /** Items the work serves, besides those the change itself adds or replaces. */
  serves?: string[];
  /** Intake items the work came from, as `I-n`. */
  intake?: string[];
  /** The change goes in the same commit as the other changes in the working copy (its code). */
  withCode?: boolean;
  /** First line of the commit message. */
  subject?: string;
}

export interface ItemHistory {
  item: RecordItem;
  /** Items this one replaced, newest first, and the item that replaced it. */
  replaces: string[];
  replacedBy: string | undefined;
  /** Every commit whose trailer names the item, newest first. */
  commits: { sha: string; date: string; subject: string; items: string[] }[];
}

export interface RecordKeeperDeps {
  db: Database;
  config: PremiseConfig;
  git?: Git;
  /** Today as YYYY-MM-DD; replaced in tests. */
  today?: () => string;
}

function hash(content: string | undefined): string {
  return content === undefined ? "missing" : createHash("sha256").update(content).digest("hex");
}

interface ChangeRow {
  id: number;
  software_id: string;
  reason: string;
  operations: string;
  status: ChangeStatus;
  diagnostics: string;
  base_hashes: string;
  new_files: string;
  assigned: string;
  touched: string;
  say_back_for: string;
  review: string | null;
  commit_sha: string | null;
}

/**
 * The only writer of each software's lasting record (docs/specs/record-keeper.md).
 * Agents propose through it, a reviewer's verdict and the say-back move a change along, and an
 * accepted change is written into the working copy's record folder and committed with its trace trailer.
 */
export class RecordKeeper {
  readonly git: Git;
  private readonly db: Database;
  private readonly config: PremiseConfig;
  private readonly today: () => string;

  constructor(deps: RecordKeeperDeps) {
    this.db = deps.db;
    this.config = deps.config;
    this.git =
      deps.git ??
      new Git(
        {
          name: deps.config.record.commit_author_name,
          email: deps.config.record.commit_author_email,
        },
        deps.config.record.default_branch,
      );
    this.today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  }

  private get folder(): string {
    return this.config.record.folder;
  }
  private get trailer(): string {
    return this.config.record.trailer;
  }

  // ---- Repositories -------------------------------------------------------------------------

  /** Where a software's own repository is, on this machine. */
  repositoryPath(softwareId: string): string {
    return join(this.config.data.folder, "repos", softwareId);
  }

  /**
   * Create a software's own repository on this machine, with no commits yet. The first commit is the
   * first accepted record change, so every commit has a trailer naming something that exists.
   */
  createRepository(softwareId: string): string {
    this.requireSoftware(softwareId);
    const path = this.repositoryPath(softwareId);
    if (existsSync(join(path, ".git"))) return path;
    this.git.init(path);
    recordEvent(this.db, { softwareId, module: "record-keeper", kind: "repository-created" });
    return path;
  }

  /** A working copy for one job, on its own branch (decision 0086). */
  createWorkingCopy(softwareId: string, jobKey: string, branch: string): string {
    const source = this.createRepository(softwareId);
    const destination = join(this.config.data.folder, "work", softwareId, jobKey);
    if (existsSync(destination)) {
      throw new RecordError("NOT_ALLOWED", `The working copy for ${jobKey} already exists.`);
    }
    this.git.clone(source, destination);
    this.git.createBranch(destination, branch);
    return destination;
  }

  /** Commit a job's work (code, and any record change already written) with the trace trailer. */
  commitWork(
    workingCopy: string,
    options: { subject: string; serves: string[]; intake?: string[] },
  ): string {
    const ids = [...new Set([...options.serves, ...(options.intake ?? [])])];
    if (ids.length === 0) {
      throw new RecordError(
        "NOT_ALLOWED",
        `Every commit names the items it serves. Give at least one item, such as W-7.`,
      );
    }
    const known = recordIdsAt(this.git, workingCopy, "HEAD", this.folder);
    const onDisk = parseRecord(this.readWorkingCopyFiles(workingCopy)).items.map((i) => i.id);
    const everything = new Set([...known, ...onDisk]);
    const missing = ids.filter((id) => !id.startsWith("I-") && !everything.has(id));
    if (missing.length > 0) {
      throw new RecordError(
        "UNKNOWN_ITEM",
        `This commit names ${missing.join(", ")}, which ${missing.length === 1 ? "is" : "are"} not in the record.`,
      );
    }
    return this.git.commit(workingCopy, {
      subject: options.subject,
      trailers: [[this.trailer, ids.join(", ")]],
    });
  }

  /** Bring a job's branch into the software's repository, as a merge commit that carries its trace. */
  mergeJob(softwareId: string, workingCopy: string, branch: string): string {
    this.createRepository(softwareId);
    this.git.push(workingCopy, "origin", branch);
    return this.mergeBranch(softwareId, branch);
  }

  /**
   * Merge a branch already in the software's repository into its default branch, as a merge commit
   * that carries the trace of every commit it brings in. The server lands a checked change this way
   * (docs/architecture/build-check-run.md, Run); no agent merges.
   */
  mergeBranch(softwareId: string, branch: string): string {
    const repo = this.createRepository(softwareId);
    const commits = this.git.headCommit(repo)
      ? this.git.log(repo, [branch, "--not", this.git.currentBranch(repo)])
      : this.git.log(repo, [branch]);
    const ids = new Set<string>();
    for (const commit of commits) {
      const trailer = readTrailer(commit.message, this.trailer);
      if ("ids" in trailer) trailer.ids.forEach((id) => ids.add(id));
    }
    if (ids.size === 0) {
      throw new RecordError(
        "NOT_ALLOWED",
        `The branch ${branch} has no commit with a ${this.trailer} trailer, so it cannot be merged.`,
      );
    }
    const sha = this.git.headCommit(repo)
      ? this.git.merge(repo, branch, {
          subject: `Merge ${branch}`,
          trailers: [[this.trailer, [...ids].join(", ")]],
        })
      : this.fastForwardEmpty(repo, branch);
    recordEvent(this.db, {
      softwareId,
      module: "record-keeper",
      kind: "job-merged",
      reference: sha,
    });
    return sha;
  }

  private fastForwardEmpty(repo: string, branch: string): string {
    this.git.run(repo, ["merge", "--quiet", "--ff-only", branch]);
    return this.git.headCommit(repo)!;
  }

  /** Remember a remote for the software's repository (a URL or a local path). */
  setRemote(softwareId: string, url: string, name = "origin"): void {
    const repo = this.createRepository(softwareId);
    if (this.git.remoteUrl(repo, name) === undefined) this.git.addRemote(repo, name, url);
    setSoftwareRepository(this.db, softwareId, url);
  }

  /**
   * Check every commit that would be pushed, and push only when all pass (spec 5.4).
   * Returns the commits that failed, with the reason; an empty list means the push was made.
   */
  pushChecked(repo: string, remote: string, branch: string): TrailerFailure[] {
    const commits = this.git.commitsToPush(repo, remote, branch);
    const failures = checkTrailers(this.git, repo, commits, {
      trailer: this.trailer,
      folder: this.folder,
    });
    if (failures.length > 0) return failures;
    if (commits.length > 0) this.git.push(repo, remote, branch);
    return [];
  }

  /** Check commits without pushing: the trailer check on its own. */
  checkCommits(repo: string, commits: readonly CommitInfo[]): TrailerFailure[] {
    return checkTrailers(this.git, repo, commits, { trailer: this.trailer, folder: this.folder });
  }

  // ---- Proposing ----------------------------------------------------------------------------

  /** Check a proposed change (spec 5.1). It is rejected with diagnostics, or goes to the reviewer. */
  propose(
    softwareId: string,
    operations: readonly Operation[],
    reason: string,
    options: ProposeOptions = {},
  ): ChangeResult {
    this.requireSoftware(softwareId);
    const files = this.currentFiles(softwareId, options.workingCopy);
    const result: ApplyResult =
      reason.trim().length === 0
        ? {
            ok: false,
            diagnostics: [{ code: "MALFORMED", message: "Give one reason for the whole change." }],
          }
        : applyOperations(files, operations, {
            today: this.today(),
            proposer: options.proposer ?? {},
          });
    const created = now();
    const insert = this.db.prepare(
      `INSERT INTO record_changes (software_id, proposed_by, reason, operations, status, diagnostics,
         base_hashes, new_files, assigned, touched, say_back_for, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    if (!result.ok) {
      const row = insert.run(
        softwareId,
        options.proposedBy ?? null,
        reason,
        JSON.stringify(operations),
        "rejected",
        JSON.stringify(result.diagnostics),
        "{}",
        "{}",
        "[]",
        "[]",
        "[]",
        created,
        created,
      );
      const changeId = Number(row.lastInsertRowid);
      recordEvent(this.db, {
        softwareId,
        module: "record-keeper",
        kind: "change-rejected",
        reference: String(changeId),
        detail: { diagnostics: result.diagnostics },
      });
      return {
        changeId,
        status: "rejected",
        diagnostics: result.diagnostics,
        assigned: [],
        sayBackFor: [],
      };
    }
    const change = result.change;
    const base: Record<string, string> = {};
    for (const spec of RECORD_FILES) base[spec.file] = hash(files.get(spec.file));
    const row = insert.run(
      softwareId,
      options.proposedBy ?? null,
      reason,
      JSON.stringify(operations),
      "reviewing",
      "[]",
      JSON.stringify(base),
      JSON.stringify(Object.fromEntries(change.files)),
      JSON.stringify(change.assigned),
      JSON.stringify(change.touched),
      JSON.stringify(change.sayBackFor),
      created,
      created,
    );
    const changeId = Number(row.lastInsertRowid);
    recordEvent(this.db, {
      softwareId,
      module: "record-keeper",
      kind: "change-proposed",
      reference: String(changeId),
      detail: { touched: change.touched },
    });
    return {
      changeId,
      status: "reviewing",
      diagnostics: [],
      assigned: change.assigned,
      sayBackFor: change.sayBackFor,
    };
  }

  /** The reviewer's verdict arrived (spec 5.2). */
  applyReview(changeId: number, review: Review): ChangeResult {
    const row = this.requireChange(changeId, "reviewing");
    let status: ChangeStatus;
    let diagnostics: Diagnostic[] = [];
    if (review.verdict === "conflicting") {
      status = "rejected";
      const live = review.conflictingItem
        ? ` the live item ${review.conflictingItem}`
        : " a live item";
      diagnostics = [
        {
          code: "CONFLICT",
          message: `This change disagrees with${live}${review.reasons ? `: ${review.reasons}` : ""}. Name the item it replaces, and propose the change again.`,
        },
      ];
    } else {
      status = (JSON.parse(row.say_back_for) as string[]).length > 0 ? "at-say-back" : "accepted";
    }
    this.setStatus(row, status, { diagnostics, review });
    return this.resultOf(row.id);
  }

  /** The say-back's outcome arrived for a change at the say-back. */
  applySayBack(changeId: number, passed: boolean): ChangeResult {
    const row = this.requireChange(changeId, "at-say-back");
    this.setStatus(row, passed ? "accepted" : "rejected", {
      diagnostics: passed
        ? []
        : [{ code: "CONFLICT", message: "The say-back did not pass, so the record is unchanged." }],
    });
    return this.resultOf(row.id);
  }

  // ---- Writing ------------------------------------------------------------------------------

  /** Write an accepted change into the working copy's record folder and commit it, with its trailer (spec 5.3). */
  write(changeId: number, options: WriteOptions): string {
    const row = this.requireChange(changeId, "accepted");
    const base = JSON.parse(row.base_hashes) as Record<string, string>;
    const current = this.readWorkingCopyFiles(options.workingCopy);
    const moved = RECORD_FILES.filter(
      (spec) => hash(current.get(spec.file)) !== base[spec.file],
    ).map((s) => s.file);
    if (moved.length > 0) {
      throw new RecordError(
        "MALFORMED",
        `${moved.join(", ")} changed since this change was checked, so it was not written. Propose it again against the current record.`,
      );
    }
    const files = JSON.parse(row.new_files) as Record<string, string>;
    const touched = JSON.parse(row.touched) as string[];
    mkdirSync(join(options.workingCopy, this.folder), { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(options.workingCopy, this.folder, file), content);
    }
    const ids = [...new Set([...touched, ...(options.serves ?? []), ...(options.intake ?? [])])];
    const subject =
      options.subject ?? `Record: ${summary(JSON.parse(row.operations) as Operation[])}`;
    if (!options.withCode) this.git.run(options.workingCopy, ["add", "--", this.folder]);
    const sha = this.git.commit(options.workingCopy, {
      subject,
      body: row.reason,
      trailers: [[this.trailer, ids.join(", ")]],
      addAll: options.withCode === true,
    });
    this.setStatus(row, "committed", { commit: sha });
    return sha;
  }

  /**
   * Write the record's free-text files (run.md, and recovered-trace.md for existing software,
   * decision 0121) in one commit that names the items it serves, and merge it. Nothing else may be
   * written this way: items only ever change through proposed changes.
   */
  writeTextFiles(
    softwareId: string,
    files: Record<string, string>,
    options: { subject: string; serves: string[]; body?: string },
  ): string {
    const allowed = new Set<string>(TEXT_FILES);
    const wrong = Object.keys(files).filter((f) => !allowed.has(f));
    if (wrong.length > 0) {
      throw new RecordError(
        "NOT_ALLOWED",
        `${wrong.join(", ")} cannot be written as free text; only ${TEXT_FILES.join(" and ")} can.`,
      );
    }
    const key = `text-${Date.now().toString(36)}-${(textCounter++).toString(36)}`;
    const branch = `record/${key}`;
    const copy = this.createWorkingCopy(softwareId, key, branch);
    try {
      mkdirSync(join(copy, this.folder), { recursive: true });
      for (const [file, content] of Object.entries(files)) {
        writeFileSync(join(copy, this.folder, file), content);
      }
      this.git.run(copy, ["add", "--", this.folder]);
      this.commitWork(copy, { subject: options.subject, serves: options.serves });
      return this.mergeJob(softwareId, copy, branch);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }

  /** A free-text record file as it stands (run.md, recovered-trace.md), or undefined. */
  readTextFile(softwareId: string, file: string): string | undefined {
    const repo = this.repositoryPath(softwareId);
    if (!existsSync(join(repo, ".git")) || !this.git.headCommit(repo)) return undefined;
    return this.git.readFileAt(repo, "HEAD", `${this.folder}/${file}`);
  }

  // ---- Reading ------------------------------------------------------------------------------

  /** The record's files as stored on a commit of the software's repository (default: the latest). */
  readFiles(softwareId: string, revision = "HEAD"): Map<string, string> {
    const repo = this.repositoryPath(softwareId);
    const files = new Map<string, string>();
    if (!existsSync(join(repo, ".git")) || !this.git.headCommit(repo)) return files;
    try {
      this.git.run(repo, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
    } catch {
      return files;
    }
    for (const spec of RECORD_FILES) {
      const content = this.git.readFileAt(repo, revision, `${this.folder}/${spec.file}`);
      if (content !== undefined) files.set(spec.file, content);
    }
    return files;
  }

  /** List a software's record items, live ones unless asked for struck ones too. */
  list(
    softwareId: string,
    filter: { file?: string; kind?: ItemKind; includeStruck?: boolean; revision?: string } = {},
  ): RecordItem[] {
    this.requireSoftware(softwareId);
    const { items } = parseRecord(this.readFiles(softwareId, filter.revision));
    return items.filter(
      (i) =>
        (filter.includeStruck || !i.struck) &&
        (filter.file === undefined || i.file === filter.file) &&
        (filter.kind === undefined || i.kind === filter.kind),
    );
  }

  /** One item by ID, struck or not. */
  get(softwareId: string, id: string, revision?: string): RecordItem {
    this.requireSoftware(softwareId);
    const { items } = parseRecord(this.readFiles(softwareId, revision));
    const item = items.find((i) => i.id === id);
    if (!item) {
      throw new RecordError(
        "UNKNOWN_ITEM",
        `${id} is not in this software's record. Use a list to see the IDs there are.`,
      );
    }
    return item;
  }

  /** What happened to an item: what it replaced, what replaced it, and every commit that names it. */
  history(softwareId: string, id: string): ItemHistory {
    const item = this.get(softwareId, id);
    const { items } = parseRecord(this.readFiles(softwareId));
    const replaces: string[] = [];
    for (let cursor = item.marks.replaces; cursor;) {
      replaces.push(cursor);
      cursor = items.find((i) => i.id === cursor)?.marks.replaces;
    }
    return {
      item,
      replaces,
      replacedBy: item.replacedBy,
      commits: this.commitsNaming(softwareId, id),
    };
  }

  /** Every commit whose trailer names an item, newest first: from an item to the work that serves it. */
  commitsNaming(softwareId: string, id: string): ItemHistory["commits"] {
    const repo = this.repositoryPath(softwareId);
    if (!existsSync(join(repo, ".git"))) return [];
    const result: ItemHistory["commits"] = [];
    for (const commit of this.git.log(repo)) {
      const trailer = readTrailer(commit.message, this.trailer);
      if ("ids" in trailer && trailer.ids.includes(id)) {
        result.push({
          sha: commit.sha,
          date: commit.date,
          subject: commit.subject,
          items: trailer.ids,
        });
      }
    }
    return result;
  }

  /** From a line of code to the record items behind it: git blame, then the commit's trailer. */
  itemsForLine(
    softwareId: string,
    path: string,
    line: number,
  ): { commit: string; items: string[] } | undefined {
    const repo = this.repositoryPath(softwareId);
    const sha = this.git.blameLine(repo, path, line);
    if (!sha) return undefined;
    const commit = this.git.log(repo, ["-1", sha])[0];
    if (!commit) return undefined;
    const trailer = readTrailer(commit.message, this.trailer);
    return { commit: sha, items: "ids" in trailer ? trailer.ids : [] };
  }

  /**
   * What a software's effort plan holds: its priority (kept in premise's database, decision 0138),
   * and its milestones, which are record items, each with its wait flag (decision 0159).
   */
  effortPlan(softwareId: string): {
    priority: number;
    weeklySharePercent: number | null;
    milestones: { id: string; text: string; wait: boolean; date: string }[];
  } {
    const software = this.requireSoftware(softwareId);
    return {
      priority: software.priority,
      weeklySharePercent: software.weeklySharePercent,
      milestones: this.list(softwareId, { kind: "M" })
        .sort((a, b) => a.number - b.number)
        .map((m) => ({ id: m.id, text: m.text, wait: m.marks.wait === true, date: m.marks.date })),
    };
  }

  // ---- Internals ----------------------------------------------------------------------------

  private requireSoftware(softwareId: string) {
    const software = getSoftware(this.db, softwareId);
    if (!software) {
      throw new RecordError("UNKNOWN_ITEM", `premise has no software with the id ${softwareId}.`);
    }
    return software;
  }

  private currentFiles(softwareId: string, workingCopy?: string): Map<string, string> {
    return workingCopy ? this.readWorkingCopyFiles(workingCopy) : this.readFiles(softwareId);
  }

  private readWorkingCopyFiles(workingCopy: string): Map<string, string> {
    const files = new Map<string, string>();
    for (const spec of RECORD_FILES) {
      const path = join(workingCopy, this.folder, spec.file);
      if (existsSync(path)) files.set(spec.file, readFileSync(path, "utf8"));
    }
    return files;
  }

  private requireChange(changeId: number, status: ChangeStatus): ChangeRow {
    const row = this.db.prepare("SELECT * FROM record_changes WHERE id = ?").get(changeId) as
      ChangeRow | undefined;
    if (!row) throw new RecordError("UNKNOWN_ITEM", `There is no record change ${changeId}.`);
    if (row.status !== status) {
      throw new RecordError(
        "NOT_ALLOWED",
        `Change ${changeId} is ${row.status}, not ${status}, so this step does not apply to it.`,
      );
    }
    return row;
  }

  private setStatus(
    row: ChangeRow,
    status: ChangeStatus,
    extra: { diagnostics?: Diagnostic[]; review?: Review; commit?: string },
  ): void {
    transaction(this.db, () => {
      this.db
        .prepare(
          `UPDATE record_changes SET status = ?, diagnostics = ?, review = COALESCE(?, review),
             commit_sha = COALESCE(?, commit_sha), updated = ? WHERE id = ?`,
        )
        .run(
          status,
          JSON.stringify(extra.diagnostics ?? []),
          extra.review ? JSON.stringify(extra.review) : null,
          extra.commit ?? null,
          now(),
          row.id,
        );
      recordEvent(this.db, {
        softwareId: row.software_id,
        module: "record-keeper",
        kind: `change-${status}`,
        reference: String(row.id),
        detail: extra.diagnostics?.length ? { diagnostics: extra.diagnostics } : undefined,
      });
    });
  }

  private resultOf(changeId: number): ChangeResult {
    const row = this.db
      .prepare("SELECT * FROM record_changes WHERE id = ?")
      .get(changeId) as unknown as ChangeRow;
    return {
      changeId,
      status: row.status,
      diagnostics: JSON.parse(row.diagnostics) as Diagnostic[],
      assigned: JSON.parse(row.assigned) as (string | undefined)[],
      sayBackFor: JSON.parse(row.say_back_for) as string[],
    };
  }
}

function summary(operations: readonly Operation[]): string {
  return operations
    .map((o) => (o.op === "add" ? `add ${o.kind} item` : `${o.op} ${o.id}`))
    .join(", ");
}

export type { AppliedChange, TrailerFailure };
export { GitError, formatDiagnostics, formatTrailerFailures };
