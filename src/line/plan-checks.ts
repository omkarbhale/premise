import type { ScopeChoice } from "./scope.js";

/**
 * The checks premise holds a submitted plan to, so effort stays in proportion to what was asked
 * (decisions 0191, 0192). Each problem is said so the planner can fix it and submit again:
 * - no task serves an item the operator left out;
 * - the first milestone holds only what the operator asked for; premise's additions come later;
 * - every task has an outcome of its own that a checker can check: it serves at least one W, T or
 *   I item, and not only items another task of the same milestone already serves.
 */

export interface PlannedTask {
  title: string;
  items: string[];
  milestone?: number;
}

const OUTCOME = /^[WTI]-[1-9]\d*$/;

export function planProblems(
  tasks: readonly PlannedTask[],
  milestones: number,
  scope: ScopeChoice | undefined,
  options: { hasOutcomeItems: boolean },
): string[] {
  const problems: string[] = [];
  const out = new Set(scope?.out ?? []);
  const later = new Set(scope?.later ?? []);
  tasks.forEach((task, i) => {
    const n = i + 1;
    const milestone = task.milestone ?? 1;
    if (milestone > milestones) {
      problems.push(
        `Task ${n} names milestone ${milestone}, but the plan has ${milestones === 1 ? "one milestone" : `${milestones} milestones`}.`,
      );
    }
    const leftOut = task.items.filter((id) => out.has(id));
    if (leftOut.length > 0) {
      problems.push(
        `Task ${n} serves ${leftOut.join(", ")}, which the operator left out of what is built. Take ${leftOut.length === 1 ? "it" : "them"} off the plan.`,
      );
    }
    const early = task.items.filter((id) => later.has(id));
    if (milestone === 1 && early.length > 0 && milestones >= 1) {
      problems.push(
        `Task ${n} is in milestone 1 but serves ${early.join(", ")}, premise's own addition${early.length === 1 ? "" : "s"} that the operator kept for later. Milestone 1 is only what the operator asked for: put this task in a later milestone.`,
      );
    }
    const outcomes = task.items.filter((id) => OUTCOME.test(id));
    if (options.hasOutcomeItems && outcomes.length === 0) {
      problems.push(
        `Task ${n} ("${task.title}") serves no W item, so it has no outcome a checker can check on its own. Fold it into the task whose outcome it supports.`,
      );
      return;
    }
    const covered = tasks.find(
      (other, j) =>
        j !== i &&
        (other.milestone ?? 1) === milestone &&
        outcomes.length > 0 &&
        outcomes.every((id) => other.items.includes(id)) &&
        // Two tasks with the same outcomes: only the later one is folded into the earlier.
        (j < i || other.items.filter((id) => OUTCOME.test(id)).length > outcomes.length),
    );
    if (covered) {
      problems.push(
        `Task ${n} ("${task.title}") serves only ${outcomes.join(", ")}, which task ${tasks.indexOf(covered) + 1} also serves, so building that task already delivers it. Fold task ${n} into task ${tasks.indexOf(covered) + 1}.`,
      );
    }
  });
  return problems;
}

/**
 * Whether premise stops after the first milestone by default (decision 0191): when later milestones
 * hold only premise's own additions, the operator tries what they asked for before more is built.
 */
export function waitAfterFirst(
  tasks: readonly PlannedTask[],
  milestones: number,
  scope: ScopeChoice | undefined,
): boolean {
  if (milestones < 2 || !scope || scope.later.length === 0) return false;
  const asked = new Set(scope.first);
  return tasks
    .filter((t) => (t.milestone ?? 1) > 1)
    .every((t) => !t.items.some((id) => asked.has(id)));
}
