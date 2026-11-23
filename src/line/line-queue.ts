import type { PremiseConfig } from "../config/settings.js";
import { intakeItemByNumber, listIntakeItems, setIntakeItem } from "../intake/items.js";
import { ServiceError } from "../server/services.js";
import type { QueuePriority, TimelineEstimate } from "../shared/api-types.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import { getSoftware } from "../storage/softwares.js";
import {
  type History,
  type MeasuredPiece,
  type QueuePiece,
  QUEUE_PRIORITIES,
  durationWords,
  estimatePiece,
  moveInQueue,
  orderQueue,
  proposeGroups,
  sumEstimates,
} from "./queue-order.js";
import {
  type WorkItem,
  getWorkItem,
  itemState,
  listWorkItems,
  rootItem,
  setItemState,
  setWorkItem,
} from "./work-items.js";

/**
 * A software's queue of changes (decision 0321): its order, the person's moves and priorities,
 * changes made one because they touch the same parts, premise's rough estimates from its own
 * measured history, and the one notice when the queue grows long.
 */

/** What a queued change keeps about its place in the queue, in its work item's notes. */
export interface QueueNotes {
  priority?: QueuePriority;
  rank?: number;
  /** The person's word on going before or after the milestones not started yet. */
  placement?: "before" | "after";
  /** Changes done together with this one: what each was, so a split gives them back. */
  together?: { workItemId: number; ref: string; title: string; words: string }[];
  /** This change's own title and words before others joined it. */
  own?: { title: string; words: string };
}

/** What the software's root keeps about its queue. */
interface RootQueueNotes {
  /** Groups the person kept apart, by work item. */
  apart?: number[][];
  /** A milestone and a change the person kept apart: [milestone item, change item]. */
  overlapsApart?: [number, number][];
  /** The long-queue notice: when it was given, and the person's answer once given. */
  notice?: { given: string; answered?: string };
}

export type NoticeAnswer = "hold" | "budget" | "agents" | "leave";

/**
 * A queued change with the work item it is, and why it is before or after the milestones that
 * have not started: feedback on what landed, something new, or the person's word.
 */
export type QueuedChange = QueuePiece & {
  item: WorkItem;
  origin: string;
  placedBy: "feedback" | "new" | "person" | "no-milestones";
};

export interface LineQueueOptions {
  db: Database;
  config: () => PremiseConfig;
  /** premise says something in the software's conversation. */
  say: (softwareId: string, text: string) => void;
  /** Hold an intake item's waiting work: it is read later with the other held items. */
  hold: (workItemId: number, reason: string) => boolean;
  /** Record items served by what has landed: the tasks of milestones reached. */
  landedItems?: (softwareId: string) => Set<string>;
}

/** The kinds of change that may be made one: never a change of purpose, which goes through Why. */
const GROUPABLE = new Set(["intake", "bug", "change"]);

export class LineQueue {
  constructor(private readonly options: LineQueueOptions) {}

  private get db(): Database {
    return this.options.db;
  }

  private notes(item: WorkItem): QueueNotes {
    return itemState<{ queue?: QueueNotes }>(this.db, item.id).queue ?? {};
  }

  private setNotes(item: WorkItem, change: Partial<QueueNotes>): void {
    const state = itemState<Record<string, unknown>>(this.db, item.id);
    const queue: Record<string, unknown> = { ...(state.queue as object), ...change };
    for (const key of Object.keys(queue)) if (queue[key] === undefined) delete queue[key];
    setItemState(this.db, item.id, { ...state, queue });
  }

  private rootNotes(softwareId: string): RootQueueNotes {
    return (
      itemState<{ queueRoot?: RootQueueNotes }>(this.db, rootItem(this.db, softwareId).id)
        .queueRoot ?? {}
    );
  }

  private setRootNotes(softwareId: string, change: Partial<RootQueueNotes>): void {
    const root = rootItem(this.db, softwareId);
    const state = itemState<Record<string, unknown>>(this.db, root.id);
    const next: Record<string, unknown> = { ...(state.queueRoot as object), ...change };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    setItemState(this.db, root.id, { ...state, queueRoot: next });
  }

  queueNotes(item: WorkItem): QueueNotes {
    return this.notes(item);
  }

  /** The changes waiting their turn, in the order the line takes them. */
  queued(softwareId: string): QueuedChange[] {
    const root = rootItem(this.db, softwareId);
    const siblings = listWorkItems(this.db, softwareId).filter((i) => i.parentId === root.id);
    const items = siblings.filter((i) => i.kind === "intake" && i.state === "ahead");
    // Milestones not started yet, and whether anything has landed that feedback could be about.
    const milestonesAhead = siblings.some((i) => i.kind !== "intake" && i.state === "ahead");
    const landed =
      siblings.some((i) => i.kind !== "intake" && i.state === "done") ||
      this.db
        .prepare(
          "SELECT 1 FROM events WHERE software_id = ? AND module = 'line' AND kind = 'milestone-reached' LIMIT 1",
        )
        .get(softwareId) !== undefined;
    const built = landed ? (this.options.landedItems?.(softwareId) ?? null) : new Set<string>();
    const intake = listIntakeItems(this.db, { softwareId });
    const pieces = items.map((item): QueuedChange => {
      const notes = this.notes(item);
      const of = intake.filter((i) => i.workItemId === item.id);
      const touches = [...new Set(of.flatMap((i) => i.touches.map((t) => t.id)))];
      // Feedback on what landed: a bug, or a change to something a landed milestone built (any
      // record item, when premise cannot tell what was built).
      const feedback =
        landed &&
        item.origin !== "purpose" &&
        (item.origin === "bug" ||
          (built === null ? touches.length > 0 : touches.some((t) => built.has(t))));
      const placedBy: QueuedChange["placedBy"] = !milestonesAhead
        ? "no-milestones"
        : notes.placement
          ? "person"
          : feedback
            ? "feedback"
            : "new";
      const before = milestonesAhead && (notes.placement ? notes.placement === "before" : feedback);
      return {
        workItemId: item.id,
        arrival: item.id,
        size: of.find((i) => i.size)?.size ?? item.sizeClass,
        priority: notes.priority ?? "normal",
        rank: notes.rank ?? null,
        touches,
        before,
        item,
        origin: item.origin,
        placedBy,
      };
    });
    return orderQueue(pieces);
  }

  /** The next change that goes before the milestones not started yet, if any. */
  nextBeforeMilestones(softwareId: string): WorkItem | undefined {
    return this.queued(softwareId).find((q) => q.before)?.item;
  }

  /** The person puts a queued change before or after the milestones not started yet. */
  setPlacement(workItemId: number, before: boolean): void {
    transaction(this.db, () => {
      const { item } = this.requireQueued(workItemId);
      this.setNotes(item, { placement: before ? "before" : "after", rank: undefined });
      this.changed(item.softwareId, "placement", { workItemId, before });
    });
  }

  /** The next change the line takes, if any. */
  next(softwareId: string): WorkItem | undefined {
    return this.queued(softwareId)[0]?.item;
  }

  private requireQueued(workItemId: number): { item: WorkItem; queued: QueuedChange[] } {
    const item = getWorkItem(this.db, workItemId);
    if (!item || item.kind !== "intake") {
      throw new ServiceError(
        "NOT_FOUND",
        "That change is not in premise any more. Reload the page.",
      );
    }
    const queued = this.queued(item.softwareId);
    if (!queued.some((q) => q.workItemId === item.id)) {
      throw new ServiceError(
        "INVALID",
        "That change has started or finished, so its place in the queue cannot change now.",
      );
    }
    return { item, queued };
  }

  private changed(softwareId: string, what: string, detail: Record<string, unknown> = {}): void {
    recordEvent(this.db, {
      softwareId,
      module: "line",
      kind: "queue-changed",
      reference: what,
      detail,
    });
  }

  /** The person moves a queued change one place up or down. */
  move(workItemId: number, direction: "up" | "down"): void {
    transaction(this.db, () => {
      const { item, queued } = this.requireQueued(workItemId);
      for (const change of moveInQueue(queued, workItemId, direction)) {
        const piece = getWorkItem(this.db, change.workItemId)!;
        const was = queued.find((q) => q.workItemId === change.workItemId);
        this.setNotes(piece, {
          priority: change.priority,
          rank: change.rank,
          // Only a move across the milestones is the person's word on placement.
          ...(was &&
            Boolean(was.before) !== change.before && {
              placement: change.before ? ("before" as const) : ("after" as const),
            }),
        });
      }
      this.changed(item.softwareId, "moved", { workItemId, direction });
    });
  }

  /** The person sets how important a queued change is; it is placed again within its priority. */
  setPriority(workItemId: number, priority: QueuePriority): void {
    if (!QUEUE_PRIORITIES.includes(priority)) {
      throw new ServiceError("INVALID", "The priority must be first, normal or later.");
    }
    transaction(this.db, () => {
      const { item } = this.requireQueued(workItemId);
      this.setNotes(item, { priority, rank: undefined });
      this.changed(item.softwareId, "priority", { workItemId, priority });
    });
  }

  /** Queued changes premise proposes to make one, because they touch the same parts. */
  groups(softwareId: string): { pieces: QueuedChange[]; shared: string[] }[] {
    const queued = this.queued(softwareId).filter((q) => GROUPABLE.has(q.origin));
    const apart = this.rootNotes(softwareId).apart ?? [];
    return proposeGroups(queued, apart).map((g) => ({
      // In queue order, so the first is the one the others join.
      pieces: queued.filter((q) => g.pieces.includes(q)),
      shared: g.shared,
    }));
  }

  private requireGroup(softwareId: string, ids: number[]): QueuedChange[] {
    const group = this.groups(softwareId).find(
      (g) => g.pieces.length === ids.length && g.pieces.every((p) => ids.includes(p.workItemId)),
    );
    if (!group) {
      throw new ServiceError(
        "INVALID",
        "Those changes are not proposed together any more: one may have started. Reload the page.",
      );
    }
    return group.pieces;
  }

  /** The person accepts a proposed group: the changes become one, planned and built as one. */
  acceptGroup(softwareId: string, ids: number[], about: string): void {
    transaction(this.db, () => {
      const pieces = this.requireGroup(softwareId, ids);
      const [keep, ...others] = pieces.map((p) => p.item);
      const own = this.notes(keep!).own ?? { title: keep!.title ?? "", words: keep!.words ?? "" };
      const together = [...(this.notes(keep!).together ?? [])];
      for (const other of others) {
        together.push({
          workItemId: other.id,
          ref: other.ref ?? "",
          title: other.title ?? "",
          words: other.words ?? "",
        });
        // Its own earlier companions join the kept one too.
        together.push(...(this.notes(other).together ?? []));
        setWorkItem(this.db, other.id, { state: "withdrawn", finished: now() });
        for (const intake of listIntakeItems(this.db, { softwareId })) {
          if (intake.workItemId === other.id) {
            setIntakeItem(this.db, intake.id, { workItemId: keep!.id });
          }
        }
      }
      const refs = [keep!.ref ?? "", ...together.map((t) => t.ref)].filter(Boolean);
      const title = `${refs.join(", ")}: one change about ${about}`;
      const words = [
        own.words,
        ...together.map((t) => `Done together with it, ${t.ref}:\n${t.words}`),
      ].join("\n\n");
      setWorkItem(this.db, keep!.id, { title, words });
      this.setNotes(keep!, { own, together });
      this.options.say(
        softwareId,
        `${refs.join(", ")} are now one change about ${about}: planned, built and checked together. You can split them again on the timeline until it starts.`,
      );
      this.changed(softwareId, "grouped", { workItemIds: ids });
    });
  }

  /** The person keeps a proposed group apart; it is not proposed again. */
  keepApart(softwareId: string, ids: number[]): void {
    transaction(this.db, () => {
      this.requireGroup(softwareId, ids);
      const apart = [...(this.rootNotes(softwareId).apart ?? []), [...ids].sort((a, b) => a - b)];
      this.setRootNotes(softwareId, { apart });
      this.changed(softwareId, "kept-apart", { workItemIds: ids });
    });
  }

  /** Milestone and change pairs the person kept apart. */
  overlapsApart(softwareId: string): [number, number][] {
    return this.rootNotes(softwareId).overlapsApart ?? [];
  }

  /** The person keeps a queued milestone and a change apart; the pair is not proposed again. */
  keepOverlapApart(softwareId: string, milestoneItemId: number, workItemId: number): void {
    transaction(this.db, () => {
      this.setRootNotes(softwareId, {
        overlapsApart: [...this.overlapsApart(softwareId), [milestoneItemId, workItemId]],
      });
      this.changed(softwareId, "overlap-kept-apart", { milestoneItemId, workItemId });
    });
  }

  /** The person splits a change made of several again, before it starts. */
  split(workItemId: number): void {
    transaction(this.db, () => {
      const { item } = this.requireQueued(workItemId);
      const notes = this.notes(item);
      if (!notes.together?.length || !notes.own) {
        throw new ServiceError(
          "INVALID",
          "That change was not made from several, so there is nothing to split.",
        );
      }
      for (const part of notes.together) {
        setWorkItem(this.db, part.workItemId, { state: "ahead", finished: null });
        const number = Number(/^I-(\d+)$/.exec(part.ref)?.[1]);
        const intake = Number.isFinite(number)
          ? intakeItemByNumber(this.db, item.softwareId, number)
          : undefined;
        if (intake) setIntakeItem(this.db, intake.id, { workItemId: part.workItemId });
        const back = getWorkItem(this.db, part.workItemId)!;
        this.setNotes(back, { together: undefined, own: undefined });
      }
      setWorkItem(this.db, item.id, { title: notes.own.title, words: notes.own.words });
      const ids = [item.id, ...notes.together.map((t) => t.workItemId)].sort((a, b) => a - b);
      this.setNotes(item, { together: undefined, own: undefined });
      const apart = [...(this.rootNotes(item.softwareId).apart ?? []), ids];
      this.setRootNotes(item.softwareId, { apart });
      this.options.say(
        item.softwareId,
        `${[item.ref, ...notes.together.map((t) => t.ref)].join(", ")} are separate changes again, each in its own place in the queue.`,
      );
      this.changed(item.softwareId, "split", { workItemId });
    });
  }

  // ---- Estimates ---------------------------------------------------------------------------------

  /** What finished changes and milestones took, from the jobs premise ran for them. */
  history(): History {
    const items = this.db
      .prepare("SELECT id, parent_id, kind, size_class, state FROM work_items")
      .all() as {
      id: number;
      parent_id: number | null;
      kind: string;
      size_class: string;
      state: string;
    }[];
    const jobs = this.db
      .prepare(
        `SELECT json_extract(payload, '$.item') AS item, MIN(started) AS first, MAX(finished) AS last,
           COUNT(*) AS n
         FROM jobs WHERE started IS NOT NULL AND kind != 'run' GROUP BY item`,
      )
      .all() as { item: number | null; first: string; last: string | null; n: number }[];
    const byItem = new Map(jobs.filter((j) => j.item !== null).map((j) => [Number(j.item), j]));
    const children = new Map<number, number[]>();
    for (const i of items) {
      if (i.parent_id !== null)
        children.set(i.parent_id, [...(children.get(i.parent_id) ?? []), i.id]);
    }
    const subtree = (id: number): number[] => [id, ...(children.get(id) ?? []).flatMap(subtree)];
    const pieces: MeasuredPiece[] = [];
    for (const item of items) {
      if (item.state !== "done" || (item.kind !== "intake" && item.kind !== "milestone")) continue;
      const own = subtree(item.id)
        .map((id) => byItem.get(id))
        .filter((j): j is NonNullable<typeof j> => Boolean(j));
      if (own.length === 0) continue;
      const first = Math.min(...own.map((j) => Date.parse(j.first)));
      const last = Math.max(...own.map((j) => Date.parse(j.last ?? j.first)));
      pieces.push({
        group: item.kind === "intake" ? "change" : "milestone",
        size: item.size_class,
        minutes: Math.max(1, (last - first) / 60_000),
        sessions: own.reduce((n, j) => n + j.n, 0),
      });
    }
    return { pieces, minPieces: this.options.config().line.estimate_min_history };
  }

  /** The rough total of the queue, from the history. */
  total(softwareId: string, history = this.history()): TimelineEstimate {
    return sumEstimates(
      this.queued(softwareId).map((q) => estimatePiece(history, "change", q.size)),
    );
  }

  // ---- The long-queue notice ---------------------------------------------------------------------

  /** Whether the queue is long now, and how many of its lowest-value changes holding would set aside. */
  longQueue(
    softwareId: string,
    history = this.history(),
  ): { long: boolean; items: number; total: TimelineEstimate; holdCount: number } {
    const config = this.options.config().line;
    const queued = this.queued(softwareId);
    const estimates = queued.map((q) => estimatePiece(history, "change", q.size));
    const total = sumEstimates(estimates);
    const limit = config.queue_notice_days * 24 * 60;
    const tooMany = queued.length > config.queue_notice_items;
    const tooLong = total.enough && (total.minutes ?? 0) > limit;
    let holdCount = Math.max(0, queued.length - config.queue_notice_items);
    if (tooLong) {
      // Hold from the end until what is left fits.
      let minutes = total.minutes ?? 0;
      let n = 0;
      for (let i = estimates.length - 1; i > 0 && minutes > limit; i--) {
        minutes -= estimates[i]!.minutes ?? 0;
        n++;
      }
      holdCount = Math.max(holdCount, n);
    }
    return {
      long: tooMany || tooLong,
      items: queued.length,
      total,
      holdCount: Math.max(1, holdCount),
    };
  }

  /** The notice to show, while it waits for the person's answer. */
  notice(softwareId: string): { given: string } | null {
    const notice = this.rootNotes(softwareId).notice;
    return notice && !notice.answered ? { given: notice.given } : null;
  }

  /**
   * After a change joins the queue: when the queue is long, say so once, plainly. Once it is
   * short again the notice can be given again.
   */
  afterTaken(softwareId: string): void {
    const state = this.longQueue(softwareId);
    const notice = this.rootNotes(softwareId).notice;
    if (!state.long) {
      if (notice) this.setRootNotes(softwareId, { notice: undefined });
      return;
    }
    if (notice) return;
    this.setRootNotes(softwareId, { notice: { given: now() } });
    const name = getSoftware(this.db, softwareId)?.name ?? "this software";
    this.options.say(softwareId, this.noticeWords(name, state.items, state.total, state.holdCount));
    this.changed(softwareId, "long-queue", { items: state.items });
  }

  noticeWords(name: string, items: number, total: TimelineEstimate, holdCount: number): string {
    const time = total.enough
      ? `By a rough estimate from premise's own history, that is about ${durationWords(total.minutes ?? 0)} of work before the last one starts.`
      : "premise has not finished enough changes yet to estimate how long that takes.";
    return `${items} changes are waiting for ${name}, one after another. ${time} You can hold the ${holdCount === 1 ? "lowest-value one" : `${holdCount} lowest-value ones`} (they are read together later, like other held items), raise its budget, or let more agents work at once. The timeline on its page has the buttons.`;
  }

  /** The person answers the long-queue notice. */
  answerNotice(softwareId: string, answer: NoticeAnswer): void {
    transaction(this.db, () => {
      const notice = this.rootNotes(softwareId).notice;
      if (!notice || notice.answered) {
        throw new ServiceError("INVALID", "That notice was already answered. Reload the page.");
      }
      if (answer === "hold") {
        const { holdCount } = this.longQueue(softwareId);
        const lowest = this.queued(softwareId).slice(-holdCount);
        const held: string[] = [];
        for (const q of lowest) {
          if (this.options.hold(q.workItemId, "You held it when the queue grew long.")) {
            held.push(q.item.ref ?? "a change");
          }
        }
        this.options.say(
          softwareId,
          held.length
            ? `Held ${held.join(", ")}: they are read together later with other held items. Take any of them in again on the Intake tab.`
            : "Nothing could be held: the changes at the end of the queue have started.",
        );
      }
      this.setRootNotes(softwareId, { notice: { given: notice.given, answered: answer } });
      this.changed(softwareId, "notice-answered", { answer });
    });
  }
}
