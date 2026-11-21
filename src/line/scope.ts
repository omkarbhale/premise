import type { RecordItem } from "../record/format.js";
import type { ScopeCut, ScopePlace, ScopeTier } from "../shared/api-types.js";
import type { SoftwareEffort } from "../shared/stages.js";

/**
 * The scope check (decision 0191): once What is confirmed, premise sorts what the software must do
 * into three tiers (what the operator asked for, what premise recommends adding, what it could also
 * add), shows a rough cost for each cut, and the operator picks how much to build. The first
 * milestone is what was asked for; premise's additions come in later milestones; what is left out
 * stays in the record, marked, and is not built.
 */

/** A What item with the tier premise put it in, and why when it is not the plain one. */
export interface TieredItem {
  item: RecordItem;
  tier: ScopeTier;
  /** Why premise put it in a lower tier than its priority says, in plain words. */
  note?: string;
}

/** Where each item went, by record ID. Kept on the software's line state. */
export interface ScopeChoice {
  first: string[];
  later: string[];
  out: string[];
}

/** Roles that are not a person's words: premise's guesses and what it read from existing code. */
const NOT_SAID = new Set(["assumed", "recovered"]);

/**
 * Whether a user item stands for the operator: named by a person, or an assumed line about the
 * operator (the drafter often writes the operator as the first, assumed user).
 */
function isOperatorsUser(user: RecordItem): boolean {
  return !NOT_SAID.has(user.marks.from) || /\boperator\b/i.test(user.text);
}

/**
 * Sort the live What items into tiers. A person's own item is what they asked for. A must is what
 * they asked for, unless it is there only for users premise assumed (decision 0191 point d): those
 * needs are premise's recommendation, never "what you asked for".
 */
export function scopeTiers(items: readonly RecordItem[]): TieredItem[] {
  const users = new Map(items.filter((i) => i.kind === "U").map((u) => [u.id, u]));
  const out: TieredItem[] = [];
  for (const item of items) {
    if (item.kind !== "W" || item.struck || item.replacedBy) continue;
    if (!NOT_SAID.has(item.marks.from)) {
      out.push({ item, tier: "asked" });
      continue;
    }
    const named = [...item.text.matchAll(/\bU-([1-9]\d*)\b/g)]
      .map((m) => users.get(`U-${m[1]}`))
      .filter((u): u is RecordItem => Boolean(u));
    const onlyAssumedUsers = named.length > 0 && named.every((u) => !isOperatorsUser(u));
    const priority = item.marks.priority ?? "should";
    if (priority === "must" && !onlyAssumedUsers) out.push({ item, tier: "asked" });
    else if (priority === "could") out.push({ item, tier: "could" });
    else {
      out.push({
        item,
        tier: "recommended",
        ...(priority === "must" && {
          note: `It is there for ${named.map((u) => u.id).join(", ")}, a user premise assumed, so it is premise's recommendation, not what you asked for.`,
        }),
      });
    }
  }
  return out;
}

/** The cut the operator's effort level starts the scope check on. */
export function cutForEffort(effort: SoftwareEffort): ScopeCut["id"] {
  return effort === "low" ? "asked" : effort === "medium" ? "recommended" : "everything";
}

/** Where each tier goes under a cut. */
export function placeFor(tier: ScopeTier, cut: ScopeCut["id"]): ScopePlace {
  if (tier === "asked") return "first";
  if (tier === "recommended") return cut === "asked" ? "out" : "later";
  return cut === "everything" ? "later" : "out";
}

export interface EstimateBasis {
  /** Minutes one agent session takes: measured by premise, or the configured guess. */
  minutesPerSession: number;
  /** What items one builder session is taken to cover. */
  itemsPerBuild: number;
}

/**
 * A rough estimate of the agent sessions and minutes from here to running software for a number of
 * items in the first version and in later milestones. Deliberately simple: the say-back, the plan
 * and its review, the checker's scenarios, then per milestone a sizing, the builds and a check.
 */
export function estimate(
  first: number,
  later: number,
  basis: EstimateBasis,
): { sessions: number; minutes: number } {
  const builds = (n: number) => Math.max(1, Math.ceil(n / Math.max(1, basis.itemsPerBuild)));
  const milestone = (n: number) => 2 + builds(n);
  const sessions = 4 + milestone(first) + (later > 0 ? milestone(later) : 0);
  return { sessions, minutes: Math.max(1, Math.round(sessions * basis.minutesPerSession)) };
}

const CUT_LABELS: Record<ScopeCut["id"], string> = {
  asked: "Only what I asked for",
  recommended: "Plus what premise recommends",
  everything: "Everything premise could add",
};

/**
 * The three cuts with their rough cost. When a cut costs the same as the one before it, it says why,
 * so the choice does not look pointless: either it adds nothing, or what it adds fits in the same
 * builds (the estimate counts builds, and one build covers a few items).
 */
export function scopeCuts(tiers: readonly TieredItem[], basis: EstimateBasis): ScopeCut[] {
  const count = (t: ScopeTier) => tiers.filter((i) => i.tier === t).length;
  const asked = count("asked");
  const recommended = count("recommended");
  const could = count("could");
  const laterFor = (id: ScopeCut["id"]) =>
    id === "asked" ? 0 : id === "recommended" ? recommended : recommended + could;
  const cuts: ScopeCut[] = [];
  for (const id of ["asked", "recommended", "everything"] as const) {
    const cut: ScopeCut = { id, label: CUT_LABELS[id], ...estimate(asked, laterFor(id), basis) };
    const before = cuts.at(-1);
    if (before && before.sessions === cut.sessions) {
      cut.sameCost =
        laterFor(id) === laterFor(before.id)
          ? "Same as the choice above: premise has nothing more to add here."
          : "Same rough cost as the choice above: what it adds fits in the same builds.";
    }
    cuts.push(cut);
  }
  return cuts;
}

/** Read the operator's answer into where each record item goes. Unknown keys are ignored. */
export function choiceFrom(
  tiers: readonly TieredItem[],
  places: ReadonlyMap<string, ScopePlace>,
): ScopeChoice {
  const choice: ScopeChoice = { first: [], later: [], out: [] };
  for (const { item } of tiers) {
    const place = places.get(item.id) ?? "first";
    choice[place].push(item.id);
  }
  return choice;
}

/** The scope, in words for the planner's brief. */
export function scopeWords(choice: ScopeChoice | undefined): string {
  if (!choice) {
    return "Everything on the What list is in scope. The first milestone is the smallest version that runs.";
  }
  const list = (ids: string[]) => (ids.length ? ids.join(", ") : "none");
  return [
    `First milestone, what the operator asked for, the smallest version that runs: ${list(choice.first)}.`,
    `Later milestones, premise's additions the operator chose to keep: ${list(choice.later)}. Do not put them in the first milestone.`,
    `Left out by the operator, not planned or built: ${list(choice.out)}. No task may serve them.`,
  ].join("\n");
}
