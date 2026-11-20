# 0088. Turn and time limits; the same failure three times stops the task

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P22 (section 5, "Build").

## Context
- Agents run unattended on the owner's subscription ([0046](0046-claude-through-the-owners-subscription.md)).

## Decision
- Each session has a turn limit and a time limit.
- The same failure three times stops the task, and the task is reported.

## Reason
A stuck agent otherwise loops through the subscription's limits.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Letting a session run until it says it is done | A stuck agent loops through the subscription's limits. |

## Consequences
- Until usage-ledger is usable, these limits still stop runaway sessions; they are not cost tracking ([models and cost](../architecture/models-and-cost.md)).
- Carried in [build, check and run](../architecture/build-check-run.md); implemented by the [agent runner](../specs/agent-runner.md) and [work queue](../specs/work-queue.md) specs.

## Related
[0074](0074-two-agent-sessions-at-once.md), [0085](0085-stage-effort-budgets.md).
