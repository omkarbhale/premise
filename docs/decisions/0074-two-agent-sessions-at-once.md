# 0074. At most two agent sessions at once by default

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P8 (section 1, "The parts and how they talk").

## Context
- All agents run on the owner's Claude subscription ([0046](0046-claude-through-the-owners-subscription.md)).

## Decision
At most two agent sessions run at once by default.

## Reason
Every session draws on the same subscription limits; more sessions at once mostly reach the limit sooner.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Unbounded parallel agents | The plan gives no further reason beyond the one above. |

## Consequences
- Two sessions at once, a builder and a checker, is one of the points milestone 1 step 1 must show ([roadmap](../product/roadmap.md)).
- Carried in [architecture overview](../architecture/overview.md); implemented by the [work queue](../specs/work-queue.md) and [agent runner](../specs/agent-runner.md) specs.

## Related
[0088](0088-turn-and-time-limits.md), [0104](0104-model-tier-by-role.md).
