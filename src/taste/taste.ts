import type { ToolBinding, ToolEnvelope } from "../agents/tool-server.js";
import { toolFail, toolOk } from "../agents/tool-server.js";
import type { PremiseConfig } from "../config/settings.js";
import type { Operation } from "../record/change.js";
import { ServiceError } from "../server/services.js";
import type { AskAnswer, AskItem, ClaimView } from "../shared/api-types.js";
import { type Ask, closeAsk, createAsk, getAsk } from "../storage/asks.js";
import { type Database, now, recordEvent } from "../storage/database.js";
import { roleLabel, roleWords } from "../shared/roles.js";

/**
 * Taste claims (decisions 0022, 0102, 0196; docs/specs/line-engine.md 5.6).
 *
 * By default premise decides every area of a software. A person claims an area under a role, in
 * plain words ("the look of the main screen"); before building that area premise shows the role a
 * proposal of one or two described options, and builds it only after the role keeps one or says
 * what to change. What the role decides becomes a `T` item in the record. A claim can be released;
 * premise then decides the area itself again.
 *
 * This module keeps the claims and makes and settles the proposals. Build (src/build) decides when a
 * proposal is needed and holds the tasks that wait on it; the line engine routes the answers.
 */

export const OPERATOR = "operator";
const MAX_AREA = 200;
const MAX_OPTION = 600;

export { roleLabel, roleWords } from "../shared/roles.js";

interface ClaimRow {
  id: number;
  software_id: string;
  role: string;
  area: string;
  status: "open" | "released";
  proposal_ask: number | null;
  decided: string | null;
  decision: string | null;
  created: string;
  released: string | null;
}

export interface Claim {
  id: number;
  softwareId: string;
  role: string;
  area: string;
  status: "open" | "released";
  proposalAsk: number | null;
  decided: string | null;
  decision: string | null;
  created: string;
  released: string | null;
}

function fromRow(row: ClaimRow): Claim {
  return {
    id: row.id,
    softwareId: row.software_id,
    role: row.role,
    area: row.area,
    status: row.status,
    proposalAsk: row.proposal_ask,
    decided: row.decided,
    decision: row.decision,
    created: row.created,
    released: row.released,
  };
}

/** One option of a proposal, as an agent submits it. */
export interface ProposalOption {
  title: string;
  description: string;
}

/** What a proposal's answer decided, for the record and for the tasks that waited on it. */
export interface TasteDecision {
  claim: Claim;
  /** What the role decided, in their terms: the option kept, or what they said to change. */
  words: string;
  corrected: boolean;
}

export interface TasteDeps {
  db: Database;
  config: PremiseConfig;
  /** Land record operations at once; throws a ServiceError the page can show when refused. */
  land: (softwareId: string, operations: Operation[], reason: string) => void;
}

export class Taste {
  constructor(private readonly deps: TasteDeps) {}

  private get db(): Database {
    return this.deps.db;
  }

  get(id: number): Claim | undefined {
    const row = this.db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as
      ClaimRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** A software's claims, open ones first, then released ones, each oldest first. */
  list(softwareId: string): Claim[] {
    return (
      this.db
        .prepare("SELECT * FROM claims WHERE software_id = ? ORDER BY status = 'released', id")
        .all(softwareId) as unknown as ClaimRow[]
    ).map(fromRow);
  }

  /** Open claims of a software that have no decision yet and no proposal waiting on the role. */
  undecided(softwareId: string): Claim[] {
    return this.list(softwareId).filter(
      (c) => c.status === "open" && c.decided === null && !this.openProposal(c),
    );
  }

  /** The claim's proposal while it waits on the role's answer. */
  openProposal(claim: Claim): Ask | undefined {
    if (claim.proposalAsk === null) return undefined;
    const ask = getAsk(this.db, claim.proposalAsk);
    return ask?.status === "open" ? ask : undefined;
  }

  /** The role labels of every open claim, across softwares. */
  rolesClaiming(): string[] {
    return (
      this.db.prepare("SELECT DISTINCT role FROM claims WHERE status = 'open'").all() as {
        role: string;
      }[]
    ).map((r) => r.role);
  }

  claim(softwareId: string, input: { role?: unknown; area?: unknown }): Claim {
    const area = typeof input.area === "string" ? input.area.replace(/\s+/g, " ").trim() : "";
    const given = typeof input.role === "string" ? input.role : "";
    const role = given.trim() ? roleLabel(given) : OPERATOR;
    if (area.length < 3) {
      throw new ServiceError(
        "INVALID",
        'Say which part of the software, in your own words: for example "the look of the main screen" or "the wording of error messages".',
      );
    }
    if (area.length > MAX_AREA) {
      throw new ServiceError(
        "INVALID",
        `Keep the area under ${MAX_AREA} characters; it is a name for a part, not a description. Say what you want in it when premise shows you the proposal.`,
      );
    }
    if (given.trim() && !role) {
      throw new ServiceError(
        "INVALID",
        'Give the role in a word or two, starting with a letter: for example "designer". Leave it empty to claim it as the operator.',
      );
    }
    const open = this.list(softwareId).filter((c) => c.status === "open");
    const same = open.find((c) => c.area.toLowerCase() === area.toLowerCase());
    if (same) {
      throw new ServiceError(
        "INVALID",
        `"${same.area}" is already claimed by the ${roleWords(same.role)}. Release that claim first to claim it under another role.`,
      );
    }
    const max = this.deps.config.taste.claims_max;
    if (open.length >= max) {
      throw new ServiceError(
        "INVALID",
        `${open.length} areas are claimed already, the most premise takes at once for one software. Release one you no longer need to see first.`,
      );
    }
    const result = this.db
      .prepare(
        "INSERT INTO claims (software_id, role, area, status, created) VALUES (?, ?, ?, 'open', ?)",
      )
      .run(softwareId, role, area, now());
    const id = Number(result.lastInsertRowid);
    recordEvent(this.db, {
      softwareId,
      module: "taste",
      kind: "claimed",
      reference: String(id),
      detail: { role },
    });
    return this.get(id)!;
  }

  /**
   * Release a claim: premise decides the area itself again. A proposal still waiting on the role is
   * withdrawn. Returns the claim and the withdrawn proposal, if there was one.
   */
  release(id: number): { claim: Claim; withdrawn: Ask | null } {
    const claim = this.get(id);
    if (!claim) {
      throw new ServiceError(
        "NOT_FOUND",
        "That claim is not in premise any more. Reload the page.",
      );
    }
    if (claim.status === "released") {
      throw new ServiceError("INVALID", "That claim was already released. Nothing was changed.");
    }
    const open = this.openProposal(claim);
    if (open) {
      closeAsk(
        this.db,
        open.id,
        "withdrawn",
        null,
        `the ${roleWords(claim.role)} released the claim, so premise decides this area itself`,
      );
    }
    this.db
      .prepare("UPDATE claims SET status = 'released', released = ? WHERE id = ?")
      .run(now(), id);
    recordEvent(this.db, {
      softwareId: claim.softwareId,
      module: "taste",
      kind: "released",
      reference: String(id),
      detail: { role: claim.role, proposal: open?.id ?? null },
    });
    return { claim: this.get(id)!, withdrawn: open ?? null };
  }

  /** How a claim stands, for the page. `proposing` is true while a proposal is being made. */
  view(claim: Claim, proposing = false): ClaimView {
    const state: ClaimView["state"] =
      claim.status === "released"
        ? "released"
        : claim.decided !== null
          ? "decided"
          : this.openProposal(claim)
            ? "proposal-open"
            : proposing
              ? "proposing"
              : "waiting";
    return {
      id: claim.id,
      softwareId: claim.softwareId,
      role: roleWords(claim.role),
      area: claim.area,
      state,
      ...(claim.decision !== null && { decision: claim.decision }),
      created: claim.created,
    };
  }

  /** The claimed areas, for the planner's and the builder's briefs. */
  briefText(softwareId: string): string {
    const open = this.list(softwareId).filter((c) => c.status === "open");
    if (open.length === 0) return "none";
    return open
      .map(
        (c) =>
          `- ${c.area}, claimed by the ${roleWords(c.role)}: ${c.decision ? `decided: ${c.decision}` : "premise shows the role a proposal before building it"}`,
      )
      .join("\n");
  }

  // ---- Proposals ------------------------------------------------------------------------------

  /**
   * proposal_submit: the agent's proposal for one claimed area, put to the claiming role. `tasks`
   * names the tasks of the plan that build the area; only they wait on the answer.
   */
  proposalSubmit(
    binding: ToolBinding,
    args: Record<string, unknown>,
    job: { id: number; softwareId: string; payload: Record<string, unknown> },
  ): ToolEnvelope {
    const claim = this.get(Number(job.payload.claim));
    if (!claim || claim.softwareId !== job.softwareId) {
      return toolFail("NOT_ALLOWED", "This task is not for a claimed area. Stop.");
    }
    if (claim.status === "released") {
      return toolFail(
        "TASK_CLOSED",
        "The claim was released while you worked: premise decides this area itself now. End your session.",
      );
    }
    if (claim.decided !== null || this.openProposal(claim)) {
      return toolFail("CONFLICT", "A proposal for this area was already put to the role. Stop.");
    }
    const max = this.deps.config.taste.options_max;
    const raw = Array.isArray(args.options) ? args.options : [];
    const problems: string[] = [];
    const options: ProposalOption[] = [];
    raw.forEach((o, i) => {
      const option = (o ?? {}) as Record<string, unknown>;
      const title = typeof option.title === "string" ? option.title.trim() : "";
      const description = typeof option.description === "string" ? option.description.trim() : "";
      if (!title) problems.push(`Option ${i + 1} needs a "title" of a few words.`);
      if (!description)
        problems.push(`Option ${i + 1} needs a "description": what the role would see.`);
      if (description.length > MAX_OPTION)
        problems.push(`Keep option ${i + 1}'s description under ${MAX_OPTION} characters.`);
      options.push({ title, description });
    });
    if (raw.length === 0) problems.push(`Give "options": one, or at most ${max}.`);
    if (raw.length > max) problems.push(`Give at most ${max} options; you gave ${raw.length}.`);
    const tasks = Array.isArray(args.tasks)
      ? args.tasks.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null;
    if (problems.length)
      return toolFail("MALFORMED", "The proposal cannot be shown as it is.", problems);
    const ask = this.ask(
      claim,
      options,
      tasks,
      job.id,
      typeof args.note === "string" ? args.note : null,
    );
    return toolOk({
      ask_id: ask.id,
      status: "asked",
      note: `The ${roleWords(claim.role)} sees it now. End your session with task_finish; the build of this area waits for the answer, the rest goes on.`,
    });
  }

  /** When no proposal could be made: the role is asked in plain words instead. */
  noProposal(claim: Claim, why: string, jobId: number | null): Ask {
    return this.ask(claim, [], null, jobId, why);
  }

  private ask(
    claim: Claim,
    options: ProposalOption[],
    tasks: number[] | null,
    jobId: number | null,
    note: string | null,
  ): Ask {
    const who = roleWords(claim.role);
    const items: AskItem[] = options.map((o, i) => ({
      key: `o${i + 1}`,
      text: `${o.title.replace(/[.:\s]+$/, "")}: ${o.description}`,
      mark: "suggestion",
    }));
    const instruction =
      options.length === 0
        ? `You claimed ${claim.area}, but premise could not prepare a proposal (${(note ?? "no reason was given").replace(/[.\s]+$/, "")}). Say how you want it, or keep premise's own judgement; it is built after you answer.`
        : options.length === 1
          ? `You claimed ${claim.area}, so premise shows you how it would do it before building it. Keep it, or say what to change. Only the work on this area waits; the rest goes on.`
          : `You claimed ${claim.area}, so premise shows you ${options.length} ways it could do it before building it. Keep one, or say what to change. Only the work on this area waits; the rest goes on.`;
    const ask = createAsk(this.db, {
      softwareId: claim.softwareId,
      role: claim.role,
      kind: "proposal",
      stage: "build",
      title: `How ${claim.area} should be`,
      instruction,
      items,
      waitingJob: null,
      extra: {
        meta: {
          purpose: "taste-proposal",
          claim: claim.id,
          area: claim.area,
          ...(tasks && tasks.length > 0 && { tasks }),
          ...(jobId !== null && { job: jobId }),
          ...(note && options.length > 0 && { note }),
        },
      },
    });
    this.db.prepare("UPDATE claims SET proposal_ask = ? WHERE id = ?").run(ask.id, claim.id);
    recordEvent(this.db, {
      softwareId: claim.softwareId,
      module: "taste",
      kind: "proposed",
      reference: String(claim.id),
      detail: { ask: ask.id, options: options.length, who },
    });
    return ask;
  }

  /**
   * The role answered a proposal: what they kept or said becomes a T item in the record, now,
   * before the ask closes (a refusal by the record leaves the ask open). Returns what was decided,
   * and the work to do once the ask is closed.
   */
  decide(ask: Ask, answer: AskAnswer): { decision: TasteDecision; after: () => void } {
    const claim = this.get(Number(ask.extra.meta?.claim));
    if (!claim) {
      throw new ServiceError(
        "NOT_FOUND",
        "The claim this proposal was for is gone. Reload the page.",
      );
    }
    if (answer.kind !== "proposal") {
      throw new ServiceError("INVALID", "Keep an option, or say what to change.");
    }
    let words: string;
    const corrected = answer.decision === "change";
    if (corrected) {
      words = (answer.text ?? "").trim();
    } else {
      const chosen =
        ask.items.find((i) => i.key === answer.choice) ??
        (ask.items.length === 1 ? ask.items[0] : undefined);
      if (!chosen && ask.items.length > 1) {
        throw new ServiceError("INVALID", "Pick the option to keep, or say what to change.");
      }
      words = chosen?.text ?? "premise's own judgement, as no option was proposed";
    }
    const text = `${claim.area}: ${words}`
      .replace(/[()]/g, (c) => (c === "(" ? "[" : "]"))
      .replace(/\s+/g, " ")
      .trim();
    this.deps.land(
      claim.softwareId,
      [{ op: "add", kind: "T", text, from: claim.role }],
      corrected
        ? `The ${roleWords(claim.role)} said how ${claim.area} should be instead of the proposal.`
        : `The ${roleWords(claim.role)} kept the proposal for ${claim.area}.`,
    );
    const decision: TasteDecision = { claim, words, corrected };
    return {
      decision,
      after: () => {
        this.db
          .prepare("UPDATE claims SET decided = ?, decision = ? WHERE id = ?")
          .run(now(), words, claim.id);
        recordEvent(this.db, {
          softwareId: claim.softwareId,
          module: "taste",
          kind: "decided",
          reference: String(claim.id),
          detail: { ask: ask.id, corrected },
        });
      },
    };
  }
}
