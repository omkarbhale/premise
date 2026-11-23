import { describe, expect, it } from "vitest";
import { addIntakeItem, getIntakeItem, setIntakeItem } from "../src/intake/items.js";
import { LineQueue } from "../src/line/line-queue.js";
import { splitWaitMarker } from "../src/line/milestone-wait.js";
import {
  type QueuePiece,
  estimatePiece,
  moveInQueue,
  orderQueue,
  proposeGroups,
} from "../src/line/queue-order.js";
import { createWorkItem, getWorkItem, rootItem, setWorkItem } from "../src/line/work-items.js";
import { listChatMessages } from "../src/storage/chat.js";
import { addChatMessage } from "../src/storage/chat.js";
import { openDatabase } from "../src/storage/database.js";
import { createSoftware } from "../src/storage/softwares.js";
import { tempFolder, testConfig } from "./helpers.js";

/** The queue of changes (decision 0321): order, moves, groups, estimates and the long-queue notice. */

function piece(id: number, change: Partial<QueuePiece> = {}): QueuePiece {
  return {
    workItemId: id,
    arrival: id,
    size: "medium",
    priority: "normal",
    rank: null,
    touches: [],
    ...change,
  };
}

const ids = (pieces: QueuePiece[]) => pieces.map((p) => p.workItemId);

describe("the order of queued changes", () => {
  it("follows priority, then size (small first), then arrival", () => {
    const order = orderQueue([
      piece(1, { size: "large" }),
      piece(2, { size: "small" }),
      piece(3, { size: "medium", priority: "first" }),
      piece(4, { size: "small", priority: "later" }),
      piece(5, { size: "small" }),
    ]);
    expect(ids(order)).toEqual([3, 2, 5, 1, 4]);
  });

  it("never puts a small change ahead of earlier work on the same parts", () => {
    const order = orderQueue([
      piece(1, { size: "large", touches: ["M-3"] }),
      piece(2, { size: "small", touches: ["M-3"] }),
      piece(3, { size: "small", touches: ["M-9"] }),
    ]);
    // 3 touches nothing earlier, so it goes first; 2 waits behind 1, which it may depend on.
    expect(ids(order)).toEqual([3, 1, 2]);
  });

  it("keeps the person's placing within a priority, and newer pieces after it", () => {
    const order = orderQueue([
      piece(1, { rank: 1 }),
      piece(2, { rank: 0 }),
      piece(3, { size: "small" }),
    ]);
    expect(ids(order)).toEqual([2, 1, 3]);
  });

  it("moves a piece up and down, taking on a neighbour's priority when it passes one", () => {
    const pieces = [piece(1), piece(2), piece(3)];
    const moved = moveInQueue(pieces, 3, "up");
    const after = pieces.map((p) => {
      const m = moved.find((x) => x.workItemId === p.workItemId);
      return m ? { ...p, rank: m.rank, priority: m.priority } : p;
    });
    expect(ids(orderQueue(after))).toEqual([1, 3, 2]);
    expect(moveInQueue(pieces, 1, "up")).toEqual([]);

    const mixed = [piece(1, { priority: "first" }), piece(2)];
    const past = moveInQueue(mixed, 2, "up");
    expect(past.find((m) => m.workItemId === 2)?.priority).toBe("first");
    const result = mixed.map((p) => {
      const m = past.find((x) => x.workItemId === p.workItemId);
      return m ? { ...p, rank: m.rank, priority: m.priority } : p;
    });
    expect(ids(orderQueue(result))).toEqual([2, 1]);
  });
});

describe("before or after the milestones", () => {
  it("puts pieces marked before ahead of the rest, and a move across takes on the other side", () => {
    const pieces = [
      piece(1, { size: "small" }),
      piece(2, { before: true, size: "large" }),
      piece(3),
    ];
    expect(ids(orderQueue(pieces))).toEqual([2, 1, 3]);
    const moved = moveInQueue(pieces, 1, "up");
    expect(moved.find((m) => m.workItemId === 1)).toMatchObject({ before: true });
  });
});

describe("a milestone's wait", () => {
  it("is a flag: a marker in the text is taken out and becomes the flag", () => {
    expect(splitWaitMarker("It counts lines. (wait)")).toEqual({
      text: "It counts lines.",
      marked: true,
    });
    expect(splitWaitMarker("[wait] Bots peek corners")).toEqual({
      text: "Bots peek corners",
      marked: true,
    });
    expect(splitWaitMarker("Waiting rooms work")).toEqual({
      text: "Waiting rooms work",
      marked: false,
    });
  });
});

describe("groups of related changes", () => {
  it("proposes changes that touch the same parts as one, and not again once kept apart", () => {
    const pieces = [
      piece(1, { touches: ["M-4"] }),
      piece(2, { touches: ["M-4", "M-5"] }),
      piece(3, { touches: ["M-5"] }),
      piece(4, { touches: ["W-1"] }),
    ];
    const groups = proposeGroups(pieces, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pieces.map((p) => p.workItemId)).toEqual([1, 2, 3]);
    expect(groups[0]!.shared).toEqual(["M-4", "M-5"]);
    expect(proposeGroups(pieces, [[1, 2, 3]])).toEqual([]);
    // A new related piece makes it a new proposal.
    expect(proposeGroups([...pieces, piece(5, { touches: ["M-4"] })], [[1, 2, 3]])).toHaveLength(1);
  });
});

describe("estimates", () => {
  it("says not enough history until enough of a kind has finished", () => {
    const none = estimatePiece({ pieces: [], minPieces: 3 }, "change", "small");
    expect(none.enough).toBe(false);
    expect(none.words).toBe("not enough history yet");
    const history = {
      minPieces: 3,
      pieces: [10, 20, 30].map((minutes) => ({
        group: "change" as const,
        size: "small",
        minutes,
        sessions: 2,
      })),
    };
    const small = estimatePiece(history, "change", "small");
    expect(small).toMatchObject({ enough: true, minutes: 20, sessions: 2 });
    expect(small.words).toBe("about 20 minutes, 2 agent sessions");
    // Too few large ones: the kind at any size is used instead.
    expect(estimatePiece(history, "change", "large").minutes).toBe(20);
    expect(estimatePiece(history, "milestone", "small").enough).toBe(false);
  });
});

/** A software with queued changes from intake, without agents. */
function setUp(options: { items?: number; env?: NodeJS.ProcessEnv } = {}) {
  const folder = tempFolder();
  const config = testConfig(folder, options.env);
  const { db } = openDatabase(folder);
  const software = createSoftware(db, { name: "Arena", idea: "A small shooter" }, config.softwares);
  const root = rootItem(db, software.id);
  setWorkItem(db, root.id, { currentStage: "build" });
  const held: number[] = [];
  const queue = new LineQueue({
    db,
    config: () => config,
    say: (softwareId, text) => {
      addChatMessage(db, { softwareId, author: "premise", text, routedTo: null });
    },
    hold: (workItemId) => {
      held.push(workItemId);
      setWorkItem(db, workItemId, { state: "withdrawn" });
      return true;
    },
  });
  const add = (text: string, touches: string[] = [], size = "small") => {
    const intake = addIntakeItem(db, {
      softwareId: software.id,
      source: "session",
      sender: "operator",
      text,
    });
    const work = createWorkItem(db, {
      softwareId: software.id,
      parentId: root.id,
      kind: "intake",
      origin: "intake",
      title: `I-${intake.number}: ${text}`,
      words: text,
      ref: `I-${intake.number}`,
      state: "ahead",
      stages: ["plan", "build", "check", "run", "report"],
    });
    setIntakeItem(db, intake.id, {
      workItemId: work.id,
      status: "waiting",
      size,
      touches: touches.map((id) => ({ id, reason: "it changes it" })),
    });
    return { intake, work };
  };
  return { db, config, software, queue, add, held };
}

/** A finished change with jobs that took `minutes` and `sessions`. */
function finished(
  db: ReturnType<typeof setUp>["db"],
  softwareId: string,
  size: string,
  minutes: number,
  sessions: number,
) {
  const root = rootItem(db, softwareId);
  const item = createWorkItem(db, {
    softwareId,
    parentId: root.id,
    kind: "intake",
    origin: "intake",
    state: "done",
    sizeClass: size,
  });
  const start = Date.parse("2026-11-01T10:00:00Z");
  for (let i = 0; i < sessions; i++) {
    db.prepare(
      "INSERT INTO jobs (software_id, kind, stage, payload, status, created, started, finished) VALUES (?, 'build', 'build', ?, 'done', ?, ?, ?)",
    ).run(
      softwareId,
      JSON.stringify({ item: item.id }),
      new Date(start).toISOString(),
      new Date(start).toISOString(),
      new Date(start + minutes * 60_000).toISOString(),
    );
  }
}

describe("the line's queue", () => {
  it("takes changes in its order, and the person can reorder them and set priorities", () => {
    const { queue, add, software } = setUp();
    const a = add("Make the HUD bigger", [], "large");
    const b = add("Fix the crosshair colour", [], "small");
    const c = add("Louder footsteps", [], "medium");
    const order = () => queue.queued(software.id).map((q) => q.item.ref);
    expect(order()).toEqual(["I-2", "I-3", "I-1"]);
    expect(queue.next(software.id)?.id).toBe(b.work.id);

    queue.move(a.work.id, "up");
    expect(order()).toEqual(["I-2", "I-1", "I-3"]);
    queue.move(a.work.id, "up");
    expect(order()).toEqual(["I-1", "I-2", "I-3"]);

    queue.setPriority(c.work.id, "first");
    expect(order()).toEqual(["I-3", "I-1", "I-2"]);
    queue.setPriority(b.work.id, "later");
    expect(order()).toEqual(["I-3", "I-1", "I-2"]);
    expect(() => queue.move(c.work.id, "up")).not.toThrow();
  });

  it("makes related changes one when accepted, and splits them again", () => {
    const { db, queue, add, software } = setUp();
    const a = add("The HUD hides the ammo count", ["M-4"]);
    const b = add("HUD text is too small", ["M-4"]);
    add("Add a map", ["W-9"]);
    const groups = queue.groups(software.id);
    expect(groups).toHaveLength(1);
    const pair = groups[0]!.pieces.map((p) => p.workItemId);
    expect(pair).toEqual([a.work.id, b.work.id]);

    queue.acceptGroup(software.id, pair, "the HUD");
    const kept = getWorkItem(db, a.work.id)!;
    expect(kept.title).toBe("I-1, I-2: one change about the HUD");
    expect(kept.words).toContain("HUD text is too small");
    expect(getWorkItem(db, b.work.id)!.state).toBe("withdrawn");
    expect(getIntakeItem(db, b.intake.id)!.workItemId).toBe(a.work.id);
    expect(queue.queued(software.id)).toHaveLength(2);
    expect(queue.groups(software.id)).toEqual([]);

    queue.split(a.work.id);
    expect(getWorkItem(db, a.work.id)!.title).toBe("I-1: The HUD hides the ammo count");
    expect(getWorkItem(db, b.work.id)!.state).toBe("ahead");
    expect(getIntakeItem(db, b.intake.id)!.workItemId).toBe(b.work.id);
    // Split by the person: not proposed again.
    expect(queue.groups(software.id)).toEqual([]);
  });

  it("keeps a group apart when the person says so", () => {
    const { queue, add, software } = setUp();
    const a = add("Shields too strong", ["M-2"]);
    const b = add("Shield sound missing", ["M-2"]);
    queue.keepApart(software.id, [a.work.id, b.work.id]);
    expect(queue.groups(software.id)).toEqual([]);
    expect(queue.queued(software.id)).toHaveLength(2);
  });

  it("estimates the queue from finished changes, or says there is not enough history", () => {
    const { db, queue, add, software } = setUp();
    add("One");
    add("Two");
    expect(queue.total(software.id).words).toBe("not enough history yet");
    for (const minutes of [20, 30, 40]) finished(db, software.id, "small", minutes, 2);
    const total = queue.total(software.id);
    expect(total).toMatchObject({ enough: true, minutes: 60, sessions: 4 });
  });

  it("says once, plainly, when the queue grows long, and holds the lowest-value ones", () => {
    const { db, queue, add, software, held } = setUp({
      env: { PREMISE_LINE__QUEUE_NOTICE_ITEMS: "3" },
    });
    const said = () =>
      listChatMessages(db, software.id).filter((m) => m.text.includes("changes are waiting"));
    for (let i = 1; i <= 3; i++) {
      add(`Change ${i}`);
      queue.afterTaken(software.id);
    }
    expect(said()).toHaveLength(0);
    expect(queue.notice(software.id)).toBeNull();
    const fourth = add("Change 4", [], "large");
    queue.afterTaken(software.id);
    expect(said()).toHaveLength(1);
    expect(said()[0]!.text).toContain("4 changes are waiting for Arena");
    expect(said()[0]!.text).toContain("not finished enough changes yet");
    expect(queue.notice(software.id)).not.toBeNull();
    add("Change 5");
    queue.afterTaken(software.id);
    expect(said()).toHaveLength(1);

    queue.answerNotice(software.id, "hold");
    // Five queued, three allowed: the two at the end are held, the large one last of all.
    expect(held).toHaveLength(2);
    expect(held).toContain(fourth.work.id);
    expect(queue.notice(software.id)).toBeNull();
    expect(() => queue.answerNotice(software.id, "leave")).toThrow(/already answered/);
  });

  it("never holds the only waiting change, even when its estimate is over the limit", () => {
    const { db, queue, add, software, held } = setUp({
      env: { PREMISE_LINE__QUEUE_NOTICE_DAYS: "1" },
    });
    for (const minutes of [3000, 3000, 3000]) finished(db, software.id, "small", minutes, 3);
    add("Only one");
    queue.afterTaken(software.id);
    expect(queue.longQueue(software.id)).toMatchObject({ long: true, holdCount: 0 });
    const words = listChatMessages(db, software.id).find((m) => m.text.includes("waiting for"))!;
    expect(words.text).not.toContain("hold the");
    queue.answerNotice(software.id, "hold");
    expect(held).toHaveLength(0);
  });

  it("tells about a long queue by its estimated time too", () => {
    const { db, queue, add, software } = setUp({ env: { PREMISE_LINE__QUEUE_NOTICE_DAYS: "1" } });
    for (const minutes of [600, 600, 600]) finished(db, software.id, "small", minutes, 3);
    add("One");
    queue.afterTaken(software.id);
    expect(queue.notice(software.id)).toBeNull();
    add("Two");
    add("Three");
    queue.afterTaken(software.id);
    const notice = queue.longQueue(software.id);
    expect(notice.long).toBe(true);
    expect(notice.total.minutes).toBe(1800);
    expect(queue.notice(software.id)).not.toBeNull();
    const text = listChatMessages(db, software.id).at(-1)!.text;
    expect(text).toContain("about 30 hours of work");
  });
});
