# 0085. Each stage has an effort budget sized to the software

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P19 (section 4, "The line, stage by stage", rules for every stage).

## Context
- Return on effort decides, not perfection ([0006](0006-llm-does-what-it-can.md)); looking at what exists has depth that follows the same rule ([0023](0023-looking-at-what-exists.md)).
- The scope page's first risk: "The conversation turns into paperwork".

## Decision
Each stage has an effort budget sized to the software; a small software gets short stages.

## Reason
Depth follows return on effort ([0006](0006-llm-does-what-it-can.md)), and a long conversation up front is the scope page's first risk.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| The same full depth for every software | The plan gives no further reason beyond the one above. |

## Consequences
- The researcher works within its budget.
- How the size is set is [0117](0117-size-classes-set-stage-budgets.md).
- Carried in [the line](../architecture/the-line.md); implemented by the [line engine](../specs/line-engine.md) and [agent runner](../specs/agent-runner.md) specs.

## Related
[0088](0088-turn-and-time-limits.md), [0117](0117-size-classes-set-stage-budgets.md).
