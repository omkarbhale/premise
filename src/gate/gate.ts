import {
  FLOOR_KINDS,
  type FloorKind,
  NEVER_AS_KIND,
  type PremiseConfig,
} from "../config/settings.js";
import { closeAsk, createAsk, getAsk } from "../storage/asks.js";
import { addChatMessage } from "../storage/chat.js";
import { type Database, now, recordEvent, transaction } from "../storage/database.js";
import { getSoftware } from "../storage/softwares.js";

/**
 * The gate (docs/specs/gate.md): every action on the floor passes it. It asks in the session under
 * the role whose call it is, or lets the action through when a standing approval covers it. The
 * server, never an agent, performs an approved action; every request, decision, approval and
 * outcome is stored and is an event.
 */

/**
 * "unavailable": approved, but premise cannot carry this kind of action out yet, so nothing was done.
 * It is stored as "done" with the unavailable flag, and read back as its own status.
 */
export type GateStatus = "asked" | "approved" | "refused" | "done" | "failed" | "unavailable";

/** What each floor kind is, in the words the gate card uses (docs/prompts/fixed-wording.md). */
export const FLOOR_WORDS: Record<FloorKind, string> = {
  "delete-data": "losing data",
  credentials: "security: handling credentials",
  expose: "security: making something reachable beyond this machine",
  access: "security: changing who can get in",
  spend: "spending money",
  "make-public": "acting publicly in your name: making something public",
  publish: "acting publicly in your name: creating or publishing something on an outside service",
  post: "acting publicly in your name: posting a comment or message",
  "write-repository": "changing a repository of yours: premise writes to it only with your say",
};

/** The kind of action, as a button label: "Approve {label} for {software}". */
export const KIND_LABELS: Record<FloorKind, string> = {
  "delete-data": "deleting data",
  credentials: "handling credentials",
  expose: "exposing it beyond this machine",
  access: "changes to who can get in",
  spend: "spending money",
  "make-public": "making things public",
  publish: "creating and publishing on outside services",
  post: "posting comments and messages",
  "write-repository": "writing to your repository",
};

/**
 * How a card reads for one kind of action. Every kind of action has its own title, its own
 * standing-approval wording, and a plain line on what really happens, so a card never says nothing
 * real happens when something does (and the other way round).
 */
export interface GateCard {
  title: string;
  /** The standing approval, as "Approve {standingLabel} for {software}"; only this kind of action. */
  standingLabel: string;
  /** The rule behind asking, as a sentence. */
  floor: string;
  /** What really happens if approved: real, or nothing (and why). Shown on the card in every mode. */
  reality: { real: boolean; text: string };
  /** Why premise asks at this moment; a default is used when absent. */
  whyNow?: string;
}

export interface GateRequestInput {
  softwareId: string;
  kind: FloorKind;
  /** Exactly what will happen: the command, the target, the amount. */
  action: string;
  why: string;
  /** Record items the action serves. */
  items?: string[];
  /** Who asks: a server module ("line engine") or an agent role and job ("planner, job 12"). */
  requestedBy: string;
  jobId?: number | null;
  /** The work that waits on the answer, in a few words. */
  waiting?: string;
  /** Name of the server act that carries it out once approved; none for an act premise cannot do yet. */
  perform?: string | null;
  /** The role whose call it is; the operator unless the record names another. */
  role?: string;
  /** The stage the ask belongs to on the page. */
  stage?: string | null;
  /**
   * The kind of action, such as "add-record" or "create-repository". A standing approval covers
   * only this kind of action. Defaults to {@link perform}; none for an agent's request, which is
   * covered by approvals of its floor kind given to other agent requests.
   */
  act?: string | null;
  /** The card's own words for this kind of action; the floor kind's words when absent. */
  card?: Partial<GateCard>;
}

export interface GateRequest {
  id: number;
  softwareId: string;
  kind: FloorKind;
  action: string;
  why: string;
  items: string[];
  requestedBy: string;
  jobId: number | null;
  perform: string | null;
  act: string | null;
  card: GateCard;
  role: string;
  askId: number | null;
  status: GateStatus;
  approvalUsed: number | null;
  outcome: string | null;
  created: string;
  decided: string | null;
}

export interface Approval {
  id: number;
  softwareId: string;
  scope: "once" | "kind";
  kind: FloorKind;
  requestId: number | null;
  act: string | null;
  /** The kind of action in plain words, from the card it was given on. */
  label: string;
  role: string;
  given: string;
  withdrawn: string | null;
}

export type GateDecision = "approve-once" | "approve-kind" | "refuse";

export class GateError extends Error {
  constructor(
    readonly code: "MALFORMED" | "NOT_APPROVABLE_AS_KIND" | "NOT_FOUND" | "DECIDED",
    message: string,
  ) {
    super(message);
    this.name = "GateError";
  }
}

/** What performing an approved action gave. */
export type PerformResult =
  { ok: true; outcome: string } | { ok: false; outcome: string; unavailable?: boolean };

/** A server act the gate can carry out once approved. */
export type Performer = (request: GateRequest) => Promise<PerformResult>;

/** Told when a request is decided and, when approved, after it was performed. */
export type GateListener = (request: GateRequest) => void;

interface RequestRow {
  id: number;
  software_id: string;
  floor_kind: FloorKind;
  action: string;
  why: string;
  items: string;
  requested_by: string;
  job_id: number | null;
  perform: string | null;
  act: string | null;
  card: string | null;
  unavailable: number;
  role_asked: string;
  ask_id: number | null;
  status: GateStatus;
  approval_used: number | null;
  outcome: string | null;
  created: string;
  decided: string | null;
}

interface ApprovalRow {
  id: number;
  software_id: string;
  scope: "once" | "kind";
  floor_kind: FloorKind;
  request_id: number | null;
  act: string | null;
  role: string;
  given: string;
  withdrawn: string | null;
  label?: string | null;
}

function fromRequestRow(row: RequestRow): GateRequest {
  return {
    id: row.id,
    softwareId: row.software_id,
    kind: row.floor_kind,
    action: row.action,
    why: row.why,
    items: JSON.parse(row.items) as string[],
    requestedBy: row.requested_by,
    jobId: row.job_id,
    perform: row.perform,
    act: row.act,
    card: row.card ? (JSON.parse(row.card) as GateCard) : defaultCard(row.floor_kind, row.perform),
    role: row.role_asked,
    askId: row.ask_id,
    status: row.status === "done" && row.unavailable ? "unavailable" : row.status,
    approvalUsed: row.approval_used,
    outcome: row.outcome,
    created: row.created,
    decided: row.decided,
  };
}

function fromApprovalRow(row: ApprovalRow): Approval {
  return {
    id: row.id,
    softwareId: row.software_id,
    scope: row.scope,
    kind: row.floor_kind,
    requestId: row.request_id,
    act: row.act,
    label: row.label || KIND_LABELS[row.floor_kind],
    role: row.role,
    given: row.given,
    withdrawn: row.withdrawn,
  };
}

export function isFloorKind(value: unknown): value is FloorKind {
  return typeof value === "string" && (FLOOR_KINDS as readonly string[]).includes(value);
}

export interface GateOptions {
  db: Database;
  config: Pick<PremiseConfig, "gate">;
}

export class Gate {
  private readonly db: Database;
  private readonly performers = new Map<string, Performer>();
  private readonly listeners: GateListener[] = [];
  private readonly performing = new Set<Promise<void>>();

  constructor(private readonly options: GateOptions) {
    this.db = options.db;
  }

  /** Register a server act by name, such as "create-repository". */
  registerPerformer(name: string, performer: Performer): void {
    this.performers.set(name, performer);
  }

  onDecided(listener: GateListener): void {
    this.listeners.push(listener);
  }

  /**
   * The card for a request: its own words where it gives them, the floor kind's otherwise. A
   * request whose act premise cannot carry out says so, whatever words it gave: a card never says
   * something real happens when nothing will.
   */
  private cardFor(input: GateRequestInput): GateCard {
    const performable = !!input.perform && this.performers.has(input.perform);
    const base = defaultCard(input.kind, input.perform ?? null, performable);
    const card = { ...base, ...input.card };
    if (!performable) card.reality = base.reality;
    return card;
  }

  /** Whether a kind may be approved as a whole kind for one software. */
  kindApprovable(kind: FloorKind): boolean {
    return (
      !NEVER_AS_KIND.includes(kind) &&
      this.options.config.gate.kind_approvals_allowed.includes(kind)
    );
  }

  /**
   * A floor action is requested. When a standing approval of its kind covers it, it is approved at
   * once and performed; otherwise an approval card is asked in the session.
   */
  request(input: GateRequestInput): GateRequest {
    const problems: string[] = [];
    if (!isFloorKind(input.kind)) {
      problems.push(
        `"${String(input.kind)}" is not a floor kind. Use one of ${FLOOR_KINDS.join(", ")}.`,
      );
    }
    if (typeof input.action !== "string" || !input.action.trim()) {
      problems.push("Say exactly what will happen (the action).");
    }
    if (typeof input.why !== "string" || !input.why.trim()) problems.push("Say why it is needed.");
    if (problems.length) throw new GateError("MALFORMED", problems.join(" "));
    const software = getSoftware(this.db, input.softwareId);
    if (!software) throw new GateError("NOT_FOUND", "That software is not in premise.");

    const role = input.role?.trim() || "operator";
    const act = input.act === undefined ? (input.perform ?? null) : input.act;
    const card = this.cardFor(input);
    const created = transaction(this.db, () => {
      const standing = this.coveringApproval(input.softwareId, input.kind, act);
      const row = this.db
        .prepare(
          `INSERT INTO gate_requests (software_id, floor_kind, action, why, items, requested_by, job_id,
             perform, act, card, role_asked, status, approval_used, created, decided)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.softwareId,
          input.kind,
          input.action.trim(),
          input.why.trim(),
          JSON.stringify(input.items ?? []),
          input.requestedBy,
          input.jobId ?? null,
          input.perform ?? null,
          act,
          JSON.stringify(card),
          role,
          standing ? "approved" : "asked",
          standing?.id ?? null,
          now(),
          standing ? now() : null,
        );
      const id = Number(row.lastInsertRowid);
      recordEvent(this.db, {
        softwareId: input.softwareId,
        module: "gate",
        kind: standing ? "gate-approved-by-rule" : "gate-requested",
        reference: String(id),
        detail: { floor: input.kind, requestedBy: input.requestedBy },
      });
      if (!standing) {
        const kindApprovable = this.kindApprovable(input.kind);
        const ask = createAsk(this.db, {
          softwareId: input.softwareId,
          role,
          kind: "approval",
          stage: input.stage ?? software.currentStage,
          title: card.title,
          instruction: `${software.name} waits on this: ${input.waiting ?? "the work that asked for it"}. Everything else goes on. Approve it once${kindApprovable ? `, approve ${card.standingLabel} for ${software.name} from now on,` : ""} or decline.`,
          waitingJob: input.jobId ?? null,
          extra: {
            approval: {
              action: input.action.trim(),
              why: input.why.trim(),
              ...(input.waiting && { waiting: input.waiting }),
              floor: card.floor,
              real: card.reality.real,
              reality: card.reality.text,
              ...(card.whyNow && { whyNow: card.whyNow }),
              ...(kindApprovable && { kindLabel: card.standingLabel }),
            },
            meta: { gateRequest: id },
          },
        });
        this.db.prepare("UPDATE gate_requests SET ask_id = ? WHERE id = ?").run(ask.id, id);
      } else {
        addChatMessage(this.db, {
          softwareId: input.softwareId,
          author: "premise",
          text: `Went ahead without asking, because you approved ${standing.label} for ${software.name}: ${input.action.trim()}`,
        });
      }
      return this.get(id)!;
    });
    if (created.status === "approved") this.carryOut(created);
    return created;
  }

  get(id: number): GateRequest | undefined {
    const row = this.db.prepare("SELECT * FROM gate_requests WHERE id = ?").get(id) as
      RequestRow | undefined;
    return row ? fromRequestRow(row) : undefined;
  }

  list(softwareId?: string): GateRequest[] {
    const rows = softwareId
      ? this.db
          .prepare("SELECT * FROM gate_requests WHERE software_id = ? ORDER BY id")
          .all(softwareId)
      : this.db.prepare("SELECT * FROM gate_requests ORDER BY id").all();
    return (rows as unknown as RequestRow[]).map(fromRequestRow);
  }

  /** The request an approval card belongs to. */
  forAsk(askId: number): GateRequest | undefined {
    const row = this.db.prepare("SELECT * FROM gate_requests WHERE ask_id = ?").get(askId) as
      RequestRow | undefined;
    return row ? fromRequestRow(row) : undefined;
  }

  /**
   * A person decided in the session. Call inside the transaction that closes the ask; the approved
   * action is carried out afterwards with {@link carryOut}.
   */
  decide(id: number, decision: GateDecision, reason?: string): GateRequest {
    const request = this.get(id);
    if (!request) throw new GateError("NOT_FOUND", "That request is not in premise any more.");
    if (request.status !== "asked") {
      throw new GateError("DECIDED", "That request was already decided. Nothing was changed.");
    }
    if (decision === "approve-kind" && !this.kindApprovable(request.kind)) {
      throw new GateError(
        "NOT_APPROVABLE_AS_KIND",
        `${request.card.standingLabel[0]!.toUpperCase()}${request.card.standingLabel.slice(1)} is always asked one action at a time. Approve this one once, or decline.`,
      );
    }
    return transaction(this.db, () => {
      let approvalId: number | null = null;
      if (decision !== "refuse") {
        const row = this.db
          .prepare(
            `INSERT INTO approvals (software_id, scope, floor_kind, request_id, act, role, given)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            request.softwareId,
            decision === "approve-kind" ? "kind" : "once",
            request.kind,
            request.id,
            request.act,
            request.role,
            now(),
          );
        approvalId = Number(row.lastInsertRowid);
        recordEvent(this.db, {
          softwareId: request.softwareId,
          module: "gate",
          kind: "approval-given",
          reference: String(approvalId),
          detail: { scope: decision === "approve-kind" ? "kind" : "once", floor: request.kind },
        });
      }
      this.db
        .prepare(
          "UPDATE gate_requests SET status = ?, approval_used = ?, decided = ?, outcome = ? WHERE id = ?",
        )
        .run(
          decision === "refuse" ? "refused" : "approved",
          approvalId,
          now(),
          decision === "refuse"
            ? reason?.trim()
              ? `Declined: ${reason.trim()}`
              : "Declined."
            : null,
          id,
        );
      recordEvent(this.db, {
        softwareId: request.softwareId,
        module: "gate",
        kind: decision === "refuse" ? "gate-refused" : "gate-approved",
        reference: String(id),
      });
      return this.get(id)!;
    });
  }

  /** Answer the card in the session through the gate: close the ask and decide. */
  answerCard(askId: number, decision: GateDecision, summary: string, reason?: string): GateRequest {
    const request = this.forAsk(askId);
    if (!request) throw new GateError("NOT_FOUND", "That card is not a gate request.");
    const decided = transaction(this.db, () => {
      const ask = getAsk(this.db, askId);
      if (!ask || ask.status !== "open") {
        throw new GateError("DECIDED", "This was already answered. Nothing was changed.");
      }
      const decidedNow = this.decide(request.id, decision, reason);
      closeAsk(
        this.db,
        askId,
        "answered",
        {
          kind: "approval",
          decision,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
        summary,
      );
      return decidedNow;
    });
    this.afterDecision(decided);
    return decided;
  }

  /** Tell listeners and carry out an approved request. */
  afterDecision(request: GateRequest): void {
    if (request.status === "approved") this.carryOut(request);
    else this.tell(request);
  }

  /** Carry out an approved request with its performer, and record the outcome. */
  private carryOut(request: GateRequest): void {
    if (this.db.isTransaction) {
      const deferred = new Promise<void>((resolve) => {
        setImmediate(() => {
          const current = this.get(request.id);
          if (current?.status === "approved") this.carryOut(current);
          resolve();
        });
      }).finally(() => this.performing.delete(deferred));
      this.performing.add(deferred);
      return;
    }
    const performer = request.perform ? this.performers.get(request.perform) : undefined;
    if (!performer) {
      this.finish(request.id, {
        ok: false,
        unavailable: true,
        outcome:
          "premise has no way to carry out this kind of action itself yet, so nothing was done. Your approval is recorded.",
      });
      return;
    }
    const done = performer(request)
      .catch((error: unknown): PerformResult => ({
        ok: false,
        outcome: `It failed: ${(error as Error).message}`,
      }))
      .then((result) => this.finish(request.id, result))
      .finally(() => this.performing.delete(done));
    this.performing.add(done);
  }

  /**
   * At start-up: a request left approved with no outcome was cut off before it was carried out. It
   * is marked failed and handed back to the person; premise never repeats a floor action itself.
   */
  recoverInterrupted(): GateRequest[] {
    const rows = this.db
      .prepare("SELECT * FROM gate_requests WHERE status = 'approved' ORDER BY id")
      .all() as unknown as RequestRow[];
    const recovered: GateRequest[] = [];
    for (const row of rows) {
      const request = fromRequestRow(row);
      const software = getSoftware(this.db, request.softwareId);
      const outcome =
        "premise stopped before this was carried out, so it may be partly done. Check whether it happened; if it did not, ask again to redo it.";
      transaction(this.db, () => {
        this.db
          .prepare("UPDATE gate_requests SET status = 'failed', outcome = ? WHERE id = ?")
          .run(outcome, request.id);
        recordEvent(this.db, {
          softwareId: request.softwareId,
          module: "gate",
          kind: "gate-failed",
          reference: String(request.id),
          detail: { outcome },
        });
        if (!software) return;
        createAsk(this.db, {
          softwareId: request.softwareId,
          role: request.role,
          kind: "needed",
          stage: software.currentStage,
          title: "An approved action was cut off",
          instruction: `You approved this, but ${outcome} The action was: ${request.action}`,
          extra: { meta: { gateRequest: request.id } },
        });
        addChatMessage(this.db, {
          softwareId: request.softwareId,
          author: "premise",
          text: `premise stopped before it carried out something you approved, so it may be partly done: ${request.action} Check it, and ask again if it needs redoing.`,
        });
      });
      recovered.push(this.get(request.id)!);
    }
    return recovered;
  }

  private finish(id: number, result: PerformResult): void {
    const request = this.get(id);
    if (!request) return;
    const unavailable = !result.ok && result.unavailable === true;
    transaction(this.db, () => {
      this.db
        .prepare("UPDATE gate_requests SET status = ?, unavailable = ?, outcome = ? WHERE id = ?")
        .run(result.ok || unavailable ? "done" : "failed", unavailable ? 1 : 0, result.outcome, id);
      recordEvent(this.db, {
        softwareId: request.softwareId,
        module: "gate",
        kind: result.ok ? "gate-done" : unavailable ? "gate-unavailable" : "gate-failed",
        reference: String(id),
        detail: { outcome: result.outcome },
      });
    });
    this.tell(this.get(id)!);
  }

  private tell(request: GateRequest): void {
    for (const listener of this.listeners) listener(request);
  }

  /** Wait for actions being carried out. For tests and shutdown. */
  async idle(): Promise<void> {
    while (this.performing.size > 0) await Promise.all([...this.performing]);
  }

  // ---- Approvals -----------------------------------------------------------------------------

  /** A standing approval covers only the same kind of action: same floor kind and same act. */
  private coveringApproval(
    softwareId: string,
    kind: FloorKind,
    act: string | null,
  ): Approval | undefined {
    if (!this.kindApprovable(kind)) return undefined;
    const row = this.db
      .prepare(
        `${APPROVAL_SELECT} WHERE a.software_id = ? AND a.floor_kind = ? AND a.act IS ? AND a.scope = 'kind'
           AND a.withdrawn IS NULL ORDER BY a.id DESC LIMIT 1`,
      )
      .get(softwareId, kind, act) as ApprovalRow | undefined;
    return row ? fromApprovalRow(row) : undefined;
  }

  /** Standing approvals for a kind of action, for one software (those not withdrawn). */
  standing(softwareId: string): Approval[] {
    return (
      this.db
        .prepare(
          `${APPROVAL_SELECT} WHERE a.software_id = ? AND a.scope = 'kind' AND a.withdrawn IS NULL ORDER BY a.id`,
        )
        .all(softwareId) as unknown as ApprovalRow[]
    ).map(fromApprovalRow);
  }

  getApproval(id: number): Approval | undefined {
    const row = this.db.prepare(`${APPROVAL_SELECT} WHERE a.id = ?`).get(id) as
      ApprovalRow | undefined;
    return row ? fromApprovalRow(row) : undefined;
  }

  /** Withdraw an approval: it stops covering new requests at once. Done actions stay done. */
  withdraw(id: number): Approval {
    const approval = this.getApproval(id);
    if (!approval) throw new GateError("NOT_FOUND", "That approval is not in premise any more.");
    if (approval.withdrawn) return approval;
    transaction(this.db, () => {
      this.db.prepare("UPDATE approvals SET withdrawn = ? WHERE id = ?").run(now(), id);
      recordEvent(this.db, {
        softwareId: approval.softwareId,
        module: "gate",
        kind: "approval-withdrawn",
        reference: String(id),
      });
    });
    return this.getApproval(id)!;
  }

  /**
   * The small seam other modules use (src/git/repository-host.ts): request, and say whether it went
   * through at once. "asked" means the answer comes later, in the session.
   */
  seam(requestedBy: string): {
    request: (r: { softwareId: string; kind: FloorKind; what: string; why: string }) => Promise<{
      status: "approved" | "asked" | "refused";
    }>;
  } {
    return {
      request: async (r) => {
        const made = this.request({
          softwareId: r.softwareId,
          kind: r.kind,
          action: r.what,
          why: r.why,
          requestedBy,
        });
        return { status: made.status === "asked" ? "asked" : "approved" };
      },
    };
  }
}

function gateTitle(kind: FloorKind): string {
  switch (kind) {
    case "delete-data":
      return "Allow premise to delete something?";
    case "spend":
      return "Allow premise to spend money?";
    case "credentials":
    case "expose":
    case "access":
      return "Allow a security-sensitive action?";
    case "make-public":
    case "publish":
    case "post":
      return "Allow premise to act in your name outside this machine?";
    case "write-repository":
      return "Allow premise to write to your repository?";
  }
}

/** The rule behind asking, as the card says it. */
export function floorSentence(kind: FloorKind): string {
  return `This is on the floor, the things premise never does without asking: ${FLOOR_WORDS[kind]}.`;
}

/** What is said when nothing will be carried out, whichever the answer. */
const NOTHING_CARRIED_OUT =
  "Nothing is done whichever you choose: premise cannot carry out this kind of action itself yet. Your answer is recorded, and the work that asked is told.";

/** The floor kind's own card, for a request that gives none of its own words. */
function defaultCard(kind: FloorKind, perform: string | null, performable = false): GateCard {
  return {
    title: gateTitle(kind),
    standingLabel: KIND_LABELS[kind],
    floor: floorSentence(kind),
    reality:
      perform && performable
        ? { real: true, text: "If you approve, premise carries it out." }
        : { real: false, text: NOTHING_CARRIED_OUT },
  };
}

/** Approvals with the plain words of the card each was given on. */
const APPROVAL_SELECT = `SELECT a.*, json_extract(g.card, '$.standingLabel') AS label
  FROM approvals a LEFT JOIN gate_requests g ON g.id = a.request_id`;
