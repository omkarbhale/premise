# 0117. Three size classes set the stage budgets

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- Each stage has an effort budget sized to the software; a small software gets short stages ([0085](0085-stage-effort-budgets.md)). The plan gives no measure of size.
- The product decides and shows its assumptions whenever being wrong is cheap ([0027](0027-spend-least-of-peoples-attention.md)).

## Decision
- At Why, the drafter proposes a size class for the software (small, medium, large) as an assumption the operator can strike.
- The class sets each stage's effort budget (turns and time) from a table premise ships.
- The operator can change the class at any time.

## Reason
- P19 sizes stage budgets to the software but gives no measure.
- The size is known roughly from the first answer.
- Showing it as an assumption costs no question ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A budget the operator sets as a number | Asks for attention and a judgement the operator may not have. |
| One budget for all softwares | Rejected by P19 ([0085](0085-stage-effort-budgets.md)). |

## Consequences
- Implemented by the [line engine](../specs/line-engine.md) and [agent runner](../specs/agent-runner.md) specs.

## Related
[0006](0006-llm-does-what-it-can.md), [0088](0088-turn-and-time-limits.md).
